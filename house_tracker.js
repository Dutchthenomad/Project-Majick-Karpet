// house_tracker.js
import blessed from 'blessed';
import { EventEmitter } from 'events';

const MAX_RECENT_TRADES = 5; // Max trades to show in the log
const PRICE_HISTORY_MAX_POINTS = 50; // Max points for price history graph
const HOUSE_HISTORY_MAX_POINTS = 100; // Max points for house position history (used by graph but not directly this var)
const CORRELATION_TRACKING_TICKS = 15; // How many ticks to watch for a predicted move
const SIGNIFICANT_PRICE_MOVE_PERCENT = 0.02; // 2% price move to consider a prediction successful

export class HouseTracker extends EventEmitter {
  constructor() {
    super();
    // Core State
    this.housePosition = 0;           // Negative = house losing, Positive = house winning
    this.playerPositions = new Map(); // playerId -> { amount, entryPrice, entryTime }
    
    // Game State
    this.currentGameId = null;
    this.currentPrice = 1.0;
    this.currentTick = 0;
    this.currentIndex = 0; // "Index" from game state
    this.gameStatus = 'PENDING'; // PENDING, ACTIVE, RUGGED
    this.gameStartTime = Date.now();  // Track when game started
    
    // History & Analytics
    this.priceHistory = Array(PRICE_HISTORY_MAX_POINTS).fill(1.0); // For price graph
    this.houseHistory = [];           // For house position trend calculation and graph
    this.recentTradesLog = [];        // For the recent trades UI box
    this.gameResults = [];            // To store summary of past games
    
    // Signals
    this.signals = { buySignal: null, sellSignal: null };

    // Correlation Tracking
    this.activePrediction = null; // { type: 'buy'/'sell', entryPrice: float, entryTick: int, housePosAtPrediction: float, targetPriceUp: float, targetPriceDown: float }
    this.correlationStats = { 
        buyAttempts: 0, buySuccess: 0, 
        sellAttempts: 0, sellSuccess: 0 
    };

    // Data Collection
    this.gameStats = []; // For collecting data across multiple games
    this.maxLiability = 0; // Track maximum potential liability in a game
    this.lastTickTime = null; // For tracking tick timing

    // Liquidity
    this.liquidity = {
        players: 0,
        totalValue: 0 // This might be tricky to calculate accurately without total SOL in play
    };

    // UI Elements - will be initialized in setupUI
    this.screen = null;
    this.gameStateBox = null;
    this.currentPriceDisplayBox = null;
    this.housePosDisplayBox = null;
    this.liquidityDisplayBox = null;
    this.recentTradesDisplayLog = null;
    this.priceHistoryLineGraph = null;
    this.signalsDisplayBox = null;
    this.mainLayout = null; // A full-screen box to act as a border/container

    this.setupUI();
    console.log("[HouseTracker] Initialized and ready for data collection.");
  }

  // --- Core Logic Methods ---

  processMessage(parsedData) {
    const start = performance.now(); // Track performance
    
    if (parsedData?.type === 'gameStateUpdate' && parsedData.data) {
      const data = parsedData.data;
      const now = Date.now();

      // Track tick intervals to identify lag
      if (this.lastTickTime) {
        const interval = now - this.lastTickTime;
        if (interval > 300) { // If significantly more than 250ms
          console.warn(`[HouseTracker] Delayed tick detected: ${interval}ms`);
        }
      }
      this.lastTickTime = now;

      // New Game Detection
      if (this.currentGameId !== data.gameId) {
        this.resetForNewGame(data.gameId);
      }

      // Update Game State
      this.currentGameId = data.gameId;
      this.currentPrice = parseFloat(data.price) || this.currentPrice;
      
      // Extract tick from tickCount property (UPDATED)
      if (data.tickCount !== undefined) {
        this.currentTick = parseInt(data.tickCount, 10);
      }
      
      // Extract index from currentCandle.index property (UPDATED)
      if (data.currentCandle && data.currentCandle.index !== undefined) {
        this.currentIndex = parseInt(data.currentCandle.index, 10);
      }
      
      this.gameStatus = data.active ? 'ACTIVE' : (data.price < 0.1 ? 'RUGGED' : 'ENDED'); // Simplified status

      // Update Price History (shift and add new price)
      this.priceHistory.shift();
      this.priceHistory.push(this.currentPrice);
      
      // Update Liquidity (simple version)
      this.liquidity.players = this.playerPositions.size;
      // totalValue is harder; for now, sum of active positions based on current price
      let currentPositionsValue = 0;
      for (const pos of this.playerPositions.values()) {
          currentPositionsValue += pos.amount * this.currentPrice;
      }
      this.liquidity.totalValue = currentPositionsValue;
      
      // Track maximum liability (for rug risk assessment)
      if (currentPositionsValue > this.maxLiability) {
        this.maxLiability = currentPositionsValue;
      }

      // Process trades if any in this update
      if (data.trades && data.trades.length > 0) {
        data.trades.forEach(trade => this.processTrade(trade));
      }
      
      // Process player data from leaderboard if available (NEW)
      if (Array.isArray(data.leaderboard) && data.leaderboard.length > 0) {
        this.updatePlayerDataFromLeaderboard(data.leaderboard);
      }

      // After all updates for this tick, generate signals and track correlation
      this.signals = this.generateSignal();
      this.trackCorrelation(); // Call correlation tracking

    } else if (parsedData?.type === 'tradeEvent' && parsedData.data) {
      this.processTrade(parsedData.data);
      // Also generate signals and track correlation after a standalone trade event
      this.signals = this.generateSignal();
      this.trackCorrelation();
    }

    // Performance measurement
    const processingTime = performance.now() - start;
    if (processingTime > 125) { // More than half a tick
      console.warn(`[HouseTracker] Slow message processing: ${processingTime.toFixed(1)}ms`);
    }

    this.updateUIDisplay(); // Update UI after processing
  }

  processTrade(trade) {
    const { playerId, action, amount, price } = trade;
    const tradeAmount = parseFloat(amount);
    const tradePrice = parseFloat(price);
    const username = trade.username || playerId.substring(0, 8);

    if (isNaN(tradeAmount) || isNaN(tradePrice)) {
        console.warn("Invalid trade data:", trade);
        return;
    }
    
    // Log recent trade for UI with username
    const pnlText = (pnl) => pnl > 0 ? `{green-fg}+${pnl.toFixed(3)}{/}` : (pnl < 0 ? `{red-fg}${pnl.toFixed(3)}{/}` : `0.000`);

    if (action === 'buy') {
      const position = this.playerPositions.get(playerId) || { 
        amount: 0, 
        entryPrice: 0,
        entryTime: Date.now(),
        username: username
      };
      
      const newAmount = position.amount + tradeAmount;
      if (newAmount > 0) { // Avoid division by zero if tradeAmount is 0 for some reason
          position.entryPrice = ((position.amount * position.entryPrice) + (tradeAmount * tradePrice)) / newAmount;
      }
      position.amount = newAmount;
      
      this.playerPositions.set(playerId, position);
      this.addRecentTrade(`↑ {cyan-fg}${username}{/} BUY  ${tradeAmount.toFixed(5)} @ ${tradePrice.toFixed(3)}x`);

    } else if (action === 'sell') {
      const position = this.playerPositions.get(playerId);
      if (!position || position.amount <= 0) return;
      
      const sellAmount = Math.min(tradeAmount, position.amount);
      const playerPnL = sellAmount * (tradePrice - position.entryPrice);
      
      this.housePosition -= playerPnL; // House P&L is inverse of player P&L
      
      position.amount -= sellAmount;
      if (position.amount <= 0.000001) { // Check for effectively zero
        this.playerPositions.delete(playerId);
      } else {
        this.playerPositions.set(playerId, position);
      }
      
      this.houseHistory.push({
        timestamp: Date.now(),
        position: this.housePosition,
        price: tradePrice
      });
      if (this.houseHistory.length > HOUSE_HISTORY_MAX_POINTS * 2) { // Keep it from growing indefinitely
          this.houseHistory.splice(0, this.houseHistory.length - HOUSE_HISTORY_MAX_POINTS);
      }
      this.addRecentTrade(`↓ {cyan-fg}${username}{/} SELL ${sellAmount.toFixed(5)} @ ${tradePrice.toFixed(3)}x (${pnlText(playerPnL)})`);
    }
  }

  addRecentTrade(tradeString) {
    this.recentTradesLog.unshift(tradeString); // Add to the beginning
    if (this.recentTradesLog.length > MAX_RECENT_TRADES) {
      this.recentTradesLog.pop(); // Remove the oldest
    }
  }

  resetForNewGame(gameId) {
    if (this.currentGameId) {
      // Store previous game data
      const gameData = {
        gameId: this.currentGameId,
        duration: (Date.now() - this.gameStartTime) / 1000, // seconds
        finalPrice: this.currentPrice,
        finalHousePosition: this.housePosition,
        peakPrice: Math.max(...this.priceHistory),
        minPrice: Math.min(...this.priceHistory),
        maxLiability: this.maxLiability,
        status: this.gameStatus,
        rugPull: this.currentPrice < 0.1,
        predictions: {
          buyAttempts: this.correlationStats.buyAttempts,
          buySuccess: this.correlationStats.buySuccess,
          sellAttempts: this.correlationStats.sellAttempts,
          sellSuccess: this.correlationStats.sellSuccess
        },
        timestamp: new Date().toISOString()
      };
      
      this.gameResults.push({
        gameId: this.currentGameId,
        finalHousePosition: this.housePosition,
        finalPrice: this.currentPrice,
        status: this.gameStatus 
      });
      
      this.gameStats.push(gameData);
      console.log(`[HouseTracker] Game ended: ${this.currentGameId}. House position: ${this.housePosition.toFixed(6)} SOL`);
      
      if (this.gameStats.length % 5 === 0) {
        console.log(`[HouseTracker] Collected data for ${this.gameStats.length} games`);
        
        // Calculate theory success rate
        const buySuccessRate = this.correlationStats.buyAttempts > 0 ? 
          (this.correlationStats.buySuccess / this.correlationStats.buyAttempts * 100).toFixed(1) : '0.0';
        const sellSuccessRate = this.correlationStats.sellAttempts > 0 ? 
          (this.correlationStats.sellSuccess / this.correlationStats.sellAttempts * 100).toFixed(1) : '0.0';
          
        console.log(`[HouseTracker] Theory validation: Buy signals ${buySuccessRate}% accurate, Sell signals ${sellSuccessRate}% accurate`);
      }
    }
    
    this.currentGameId = gameId;
    this.playerPositions.clear();
    this.gameStatus = 'ACTIVE';
    this.currentPrice = 1.0;
    this.currentTick = 0;
    this.currentIndex = 0;
    this.gameStartTime = Date.now();
    this.maxLiability = 0;
    
    this.priceHistory = Array(PRICE_HISTORY_MAX_POINTS).fill(1.0);
    this.recentTradesLog = []; // Clear trades log for new game

    // CRITICAL: Do NOT reset housePosition, houseHistory, gameResults between games
    
    this.updateUIDisplay(); // Full UI update
    console.log(`[HouseTracker] New game started: ${gameId}`);
  }

  resetStats() {
    this.housePosition = 0;
    this.houseHistory = [];
    this.gameResults = [];
    this.playerPositions.clear(); // Also clear current player positions
    this.recentTradesLog = [];
    // this.priceHistory = Array(PRICE_HISTORY_MAX_POINTS).fill(1.0); // Optionally reset price history too
    this.signals = { buySignal: null, sellSignal: null };
    this.liquidity.players = 0;
    this.liquidity.totalValue = 0;
    
    // Reset correlation tracking
    this.activePrediction = null;
    this.correlationStats = { 
        buyAttempts: 0, buySuccess: 0, 
        sellAttempts: 0, sellSuccess: 0 
    };

    // Reset UI displays that show these stats
    if (this.screen) { // Check if UI is initialized
        this.updateUIDisplay();
        this.screen.render();
    }
    console.log("[HouseTracker] Statistics Reset.");
  }

  calculatePriceTrend() {
    if (this.priceHistory.length < 5) return 0; // Need some data
    // Compare current price to price N points ago
    const lookback = Math.min(5, this.priceHistory.length -1);
    const current = this.priceHistory[this.priceHistory.length - 1];
    const past = this.priceHistory[this.priceHistory.length - 1 - lookback];
    if (past === 0) return 0; // Avoid division by zero
    return (current - past) / past; // Percentage change
  }

  generateSignal() {
    const houseIsProfitable = this.housePosition > 0.0001; // Small threshold
    const houseIsLosing = this.housePosition < -0.0001;
    const priceTrend = this.calculatePriceTrend(); // Percentage
    const priceFallingFast = priceTrend < -0.01; // Reduced threshold from -0.02 to -0.01 (1%)
    const priceRisingFast = priceTrend > 0.01;  // Reduced threshold from +0.02 to +0.01 (1%)
    
    // Get current player count for additional signal context
    const playerCount = this.playerPositions.size;

    let buySignalStrength = 0;
    let sellSignalStrength = 0;
    let newPredictionMade = false;
    
    // Log current conditions for debugging
    console.log(`[HouseTracker] Signal conditions: HousePos=${this.housePosition.toFixed(6)}, PriceTrend=${(priceTrend*100).toFixed(2)}%, Players=${playerCount}`);

    // BUY Signal - When house is profitable (winning) and price is falling
    if (houseIsProfitable && priceFallingFast && this.gameStatus === 'ACTIVE') {
      // Calculate base signal strength
      buySignalStrength = Math.min(100, 
        30 + // Base value
        Math.min(50, (this.housePosition / 0.005) * 20) + // Scaled based on house position (more sensitive)
        Math.min(20, Math.abs(priceTrend) * 300)      // Scaled with price movement (more sensitive)
      );
      
      // Log the strength calculation components
      console.log(`[HouseTracker] Buy signal calculation: Base=30, HouseFactor=${Math.min(50, (this.housePosition / 0.005) * 20).toFixed(1)}, PriceFactor=${Math.min(20, Math.abs(priceTrend) * 300).toFixed(1)}`);
      
      // Create a buy prediction if signal is strong enough and no active prediction
      if (!this.activePrediction && buySignalStrength >= 55) { // Reduced threshold from 60 to 55
        this.activePrediction = {
          type: 'buy',
          entryPrice: this.currentPrice,
          entryTick: this.currentTick,
          housePosAtPrediction: this.housePosition,
          targetPriceUp: this.currentPrice * (1 + SIGNIFICANT_PRICE_MOVE_PERCENT) // Expect price to rise
        };
        this.correlationStats.buyAttempts++;
        newPredictionMade = true;
        console.log(`[HouseTracker] NEW BUY SIGNAL generated with strength ${buySignalStrength.toFixed(0)}%`);
      }
    }
    // SELL Signal - When house is losing and price is rising
    else if (houseIsLosing && priceRisingFast && this.gameStatus === 'ACTIVE') {
      sellSignalStrength = Math.min(100,
        30 + 
        Math.min(50, (Math.abs(this.housePosition) / 0.005) * 20) + // Scaled more sensitively
        Math.min(20, priceTrend * 300) // Scaled more sensitively
      );
      
      // Log the strength calculation components
      console.log(`[HouseTracker] Sell signal calculation: Base=30, HouseFactor=${Math.min(50, (Math.abs(this.housePosition) / 0.005) * 20).toFixed(1)}, PriceFactor=${Math.min(20, priceTrend * 300).toFixed(1)}`);
      
      if (!this.activePrediction && sellSignalStrength >= 55) { // Reduced threshold from 60 to 55
        this.activePrediction = {
          type: 'sell',
          entryPrice: this.currentPrice,
          entryTick: this.currentTick,
          housePosAtPrediction: this.housePosition,
          targetPriceDown: this.currentPrice * (1 - SIGNIFICANT_PRICE_MOVE_PERCENT) // Expect price to drop
        };
        this.correlationStats.sellAttempts++;
        newPredictionMade = true;
        console.log(`[HouseTracker] NEW SELL SIGNAL generated with strength ${sellSignalStrength.toFixed(0)}%`);
      }
    }
    
    // Log if a new prediction was made
    if (newPredictionMade) {
        console.log(`[HouseTracker] New prediction: ${JSON.stringify(this.activePrediction)}`);
    }

    return {
      buySignal: buySignalStrength >= 55 ? { // Reduced threshold from 60 to 55
        strength: buySignalStrength,
        message: `BUY OPPORTUNITY (${buySignalStrength.toFixed(0)}%)`
      } : null,
      sellSignal: sellSignalStrength >= 55 ? { // Reduced threshold from 60 to 55
        strength: sellSignalStrength,
        message: `SELL OPPORTUNITY (${sellSignalStrength.toFixed(0)}%)`
      } : null,
      housePositionPercent: this.houseHistory.length > 1 ? (this.housePosition / (Math.abs(this.houseHistory[0]?.position || 0.001))) * 100 : 0,
      priceTrendPercent: priceTrend * 100
    };
  }

  // --- UI Methods ---
  setupUI() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Rugs.fun House Edge Tracker',
      fullUnicode: true,
      autoPadding: true
    });

    // Main container box for border
    this.mainLayout = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      border: 'line',
      label: ' {bold}RUGS.FUN HOUSE EDGE TRACKER{/} ',
      tags: true,
      style: {
        border: { fg: 'cyan' }
      }
    });
    
    // Game State Box
    this.gameStateBox = blessed.box({
      parent: this.mainLayout,
      top: 1, left: 1, width: '29%', height: 5,
      label: ' {bold}GAME STATE{/} ', border: 'line', tags: true,
      style: { border: { fg: 'blue' } }
    });

    // Price Display Box
    this.currentPriceDisplayBox = blessed.box({
      parent: this.mainLayout,
      top: 1, left: '30%', width: '40%', height: 5,
      label: ' {bold}PRICE{/} ', border: 'line', tags: true,
      style: { border: { fg: 'yellow' } }
    });

    // House Position Display Box
    this.housePosDisplayBox = blessed.box({
      parent: this.mainLayout,
      top: 7, left: 1, width: '29%', height: 5,
      label: ' {bold}HOUSE POSITION{/} ', border: 'line', tags: true,
      style: { border: { fg: 'green' } }
    });

    // Liquidity Display Box
    this.liquidityDisplayBox = blessed.box({
      parent: this.mainLayout,
      top: 7, left: '30%', width: '40%', height: 5,
      label: ' {bold}LIQUIDITY{/} ', border: 'line', tags: true,
      style: { border: { fg: 'magenta' } }
    });

    // Recent Trades Log
    this.recentTradesDisplayLog = blessed.log({
      parent: this.mainLayout,
      top: 13, left: 1, width: '49%', height: 7, // Adjusted width for side-by-side
      label: ' {bold}RECENT TRADES{/} ', border: 'line', tags: true,
      scrollable: true, scrollbar: { style: { bg: 'blue' } },
      style: { border: { fg: 'white' } }
    });
    
    // NEW: Player Positions Box
    this.playerPositionsBox = blessed.log({
      parent: this.mainLayout,
      top: 13, left: '50%', width: '50%-2', height: 7, // Side-by-side with trades
      label: ' {bold}PLAYER POSITIONS{/} ', border: 'line', tags: true,
      scrollable: true, scrollbar: { style: { bg: 'blue' } },
      style: { border: { fg: 'cyan' } }
    });

    // Price History Box (simpler alternative to line graph)
    this.priceHistoryLineGraph = blessed.box({
      parent: this.mainLayout,
      top: 21, left: 1, width: 'calc(100% - 4)', height: 12,
      label: ' {bold}PRICE HISTORY{/} ', border: 'line', tags: true,
      style: { border: { fg: 'yellow' } },
      content: this.renderPriceHistoryChart()
    });

    // Signals Display Box
    this.signalsDisplayBox = blessed.box({
      parent: this.mainLayout,
      top: 34, left: 1, width: 'calc(100% - 4)', height: 7, // Adjusted width
      label: ' {bold}SIGNALS{/} ', border: 'line', tags: true,
      style: { border: { fg: 'red' } }
    });
    
    // Footer Hint
    blessed.text({
        parent: this.mainLayout,
        bottom: 0, left: 'center', width: 'shrink', height: 1,
        content: 'Press Q to exit | R to reset stats | D to view data summary',
        tags: true
    });

    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.emit('exit');
    });
    this.screen.key(['r', 'R'], () => {
      this.resetStats();
    });
    this.screen.key(['d', 'D'], () => {
      // Show a brief data summary in a popup
      const popup = blessed.box({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: '70%',
        height: '70%',
        content: this.getDataSummary(),
        tags: true,
        border: 'line',
        label: ' Data Collection Summary ',
        scrollable: true,
        keys: true,
        vi: true,
        alwaysScroll: true,
        scrollbar: {
          ch: ' ',
          style: { bg: 'blue' }
        },
        style: {
          border: { fg: 'cyan' },
          scrollbar: { bg: 'blue' },
          focus: { border: { fg: 'green' } }
        }
      });
      
      popup.key(['escape', 'q'], () => {
        popup.destroy();
        this.screen.render();
      });
      
      popup.focus();
      this.screen.render();
    });

    this.updateUIDisplay(); // Initial render
    this.screen.render();
  }

  updateUIDisplay() {
    if (!this.screen || this.screen.destroyed) return;

    // Game State
    let statusText = this.gameStatus;
    if (this.gameStatus === 'ACTIVE') statusText = `{green-fg}● ACTIVE{/}`;
    else if (this.gameStatus === 'RUGGED') statusText = `{red-fg}● RUGGED{/}`;
    else statusText = `{yellow-fg}● ${this.gameStatus}{/}`;
    
    // Flash new game started
    if (this.gameStatus === 'ACTIVE' && this.currentTick < 3) {
      statusText = `{green-fg}{bold}● NEW GAME{/bold}{/}`;
    }
    
    this.gameStateBox.setContent(
      `${statusText}\n` +
      `ID: ${this.currentGameId ? this.currentGameId.substring(0, 16) : 'N/A'}`
    );

    // Price Display
    // Highlight index changes
    const indexDisplay = this.currentTick % 5 === 0 ? 
      `{bold}Index: ${this.currentIndex}{/}` : 
      `Index: ${this.currentIndex}`;
    
    this.currentPriceDisplayBox.setContent(
      `{yellow-fg}${this.currentPrice.toFixed(4)}x{/}\n` +
      `Tick: ${this.currentTick}    ${indexDisplay}`
    );
    
    // House Position Display
    const housePosFormatted = (this.housePosition >= 0 ? `{green-fg}+` : `{red-fg}`)+`${this.housePosition.toFixed(6)}{/}`;
    const houseEdge = this.housePosition > 0.0001 ? '{green-fg}WINNING{/}' : (this.housePosition < -0.0001 ? '{red-fg}LOSING{/}' : '{white-fg}EVEN{/}');
    this.housePosDisplayBox.setContent(
        `SOL: ${housePosFormatted}\n`+
        `Edge: ${houseEdge}`
    );

    // Liquidity
    // Calculate estimated rug risk if we have data
    let rugRiskText = '';
    if (this.maxLiability > 0.05) {
      const rugRiskPercent = Math.min(100, (this.liquidity.totalValue / this.maxLiability) * 100);
      if (rugRiskPercent > 70) {
        rugRiskText = `\n{red-fg}Rug Risk: ${rugRiskPercent.toFixed(0)}%{/}`;
      } else if (rugRiskPercent > 40) {
        rugRiskText = `\n{yellow-fg}Rug Risk: ${rugRiskPercent.toFixed(0)}%{/}`;
      }
    }
    
    this.liquidityDisplayBox.setContent(
        `Players: ${this.liquidity.players}\n`+
        `Total Value: ${this.liquidity.totalValue.toFixed(3)} SOL` +
        rugRiskText
    );

    // Recent Trades Log - already updated by addRecentTrade, just need to re-log if cleared
    if (this.recentTradesDisplayLog.getLines().length === 0 && this.recentTradesLog.length > 0) {
        this.recentTradesLog.forEach(line => this.recentTradesDisplayLog.log(line));
    } else if (this.recentTradesDisplayLog.getLines().length > 0 && this.recentTradesLog.length === 0) {
        this.recentTradesDisplayLog.setContent(''); // Clear if log array is empty
    }
    
    // Update Player Positions Log
    if (this.playerPositionsBox) {
      this.playerPositionsBox.setContent('');
      
      // Sort players by position size (largest first)
      const sortedPlayers = Array.from(this.playerPositions.entries())
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 5); // Show top 5 players
      
      sortedPlayers.forEach(([id, position]) => {
        const username = position.username || id.substring(0, 8);
        const pnlColor = position.pnl > 0 ? '{green-fg}' : (position.pnl < 0 ? '{red-fg}' : '{white-fg}');
        const pnlText = `${pnlColor}${position.pnl?.toFixed(6) || '0.000000'}{/}`;
        
        this.playerPositionsBox.log(
          `{cyan-fg}${username}{/}: ${position.amount.toFixed(5)} @ ${position.entryPrice.toFixed(4)}x (${pnlText})`
        );
      });
    }

    // Update Price History Chart
    if (this.priceHistoryLineGraph) {
      this.priceHistoryLineGraph.setContent(this.renderPriceHistoryChart());
    }

    // Signals Display
    let signalContent = '';
    const housePosPerc = this.signals.housePositionPercent || 0;
    const priceTrendPerc = this.signals.priceTrendPercent || 0;

    const barLength = 20;
    const houseBarFill = Math.min(barLength, Math.max(0, Math.round(Math.abs(housePosPerc / 100) * barLength)));
    const priceBarFill = Math.min(barLength, Math.max(0, Math.round(Math.abs(priceTrendPerc / 100) * barLength)));
    
    const houseBar = (housePosPerc > 0 ? '{green-fg}' : '{red-fg}') + '█'.repeat(houseBarFill) + '{/}'+ ' '.repeat(barLength - houseBarFill);
    const priceBar = (priceTrendPerc < 0 ? '{red-fg}' : '{green-fg}') + '█'.repeat(priceBarFill) + '{/}'+ ' '.repeat(barLength - priceBarFill);

    signalContent += `HOUSE = ${(housePosPerc >=0 ? '+': '')}${housePosPerc.toFixed(1)}%  PRICE = ${(priceTrendPerc >=0 ? '+': '')}${priceTrendPerc.toFixed(1)}%\n`;
    signalContent += ` ${houseBar}  |  ${priceBar} \n`;

    // Add conviction level to signals
    let convictionPrefix = '';
    if (this.signals.buySignal && this.signals.buySignal.strength > 85) convictionPrefix = 'STRONG ';
    else if (this.signals.buySignal && this.signals.buySignal.strength > 70) convictionPrefix = 'MEDIUM ';
    
    if (this.signals.sellSignal && this.signals.sellSignal.strength > 85) convictionPrefix = 'STRONG ';
    else if (this.signals.sellSignal && this.signals.sellSignal.strength > 70) convictionPrefix = 'MEDIUM ';

    if (this.signals.buySignal) {
      signalContent += `{green-fg}${convictionPrefix}${this.signals.buySignal.message}{/}`;
    } else if (this.signals.sellSignal) {
      signalContent += `{red-fg}${convictionPrefix}${this.signals.sellSignal.message}{/}`;
    } else {
      signalContent += `{gray-fg}No strong signal.{/}`;
    }
    
    // Add Correlation Stats
    signalContent += '\n'; // Add a separating line
    const buySuccessRate = this.correlationStats.buyAttempts > 0 ? 
                           (this.correlationStats.buySuccess / this.correlationStats.buyAttempts) * 100 :
                           0;
    const sellSuccessRate = this.correlationStats.sellAttempts > 0 ? 
                            (this.correlationStats.sellSuccess / this.correlationStats.sellAttempts) * 100 :
                            0;

    signalContent += `Buy Preds: ${this.correlationStats.buySuccess}/${this.correlationStats.buyAttempts} (${buySuccessRate.toFixed(0)}%)\n`;
    signalContent += `Sell Preds: ${this.correlationStats.sellSuccess}/${this.correlationStats.sellAttempts} (${sellSuccessRate.toFixed(0)}%)`;

    // Display active prediction if any
    if (this.activePrediction) {
        signalContent += `\n{cyan-fg}Active Pred: ${this.activePrediction.type.toUpperCase()} @ ${this.activePrediction.entryPrice.toFixed(3)}x (Tick ${this.activePrediction.entryTick}){/}`;
        if (this.activePrediction.type === 'buy') {
            signalContent += ` {green-fg}Target: ≥${this.activePrediction.targetPriceUp.toFixed(3)}x{/}`;
        } else {
            signalContent += ` {red-fg}Target: ≤${this.activePrediction.targetPriceDown.toFixed(3)}x{/}`;
        }
    }

    this.signalsDisplayBox.setContent(signalContent);

    this.screen.render();
  }
  
  // Placeholder for correlation tracking
  trackCorrelation() {
    if (!this.activePrediction || this.gameStatus !== 'ACTIVE') {
      return; // No active prediction or game not active
    }

    const prediction = this.activePrediction;
    let predictionOutcome = null; // 'success', 'fail', or null if ongoing

    // Check for success
    if (prediction.type === 'buy' && this.currentPrice >= prediction.targetPriceUp) {
      predictionOutcome = 'success';
      this.correlationStats.buySuccess++;
    } else if (prediction.type === 'sell' && this.currentPrice <= prediction.targetPriceDown) {
      predictionOutcome = 'success';
      this.correlationStats.sellSuccess++;
    }

    // Check for expiration (failure due to timeout)
    if (!predictionOutcome && (this.currentTick > prediction.entryTick + CORRELATION_TRACKING_TICKS)) {
      predictionOutcome = 'fail'; // Failed to meet target within tick window
    }
    
    // If an outcome is determined, clear the active prediction
    if (predictionOutcome) {
      // console.log(`Prediction outcome: ${predictionOutcome}`, prediction);
      this.activePrediction = null;
    }
  }

  // New method to provide a data summary for theory validation
  getDataSummary() {
    let summary = `{bold}{cyan-fg}=== HOUSE EDGE TRACKER DATA SUMMARY ==={/}{/}\n\n`;
    
    summary += `{bold}Game Stats:{/}\n`;
    summary += `Total Games Tracked: ${this.gameStats.length}\n`;
    summary += `Games Ending in Rug Pull: ${this.gameStats.filter(g => g.rugPull).length}\n`;
    
    if (this.gameStats.length > 0) {
      const avgDuration = this.gameStats.reduce((sum, g) => sum + g.duration, 0) / this.gameStats.length;
      summary += `Average Game Duration: ${avgDuration.toFixed(1)} seconds\n\n`;
    }
    
    summary += `{bold}Theory Validation:{/}\n`;
    const buySuccessRate = this.correlationStats.buyAttempts > 0 ? 
      (this.correlationStats.buySuccess / this.correlationStats.buyAttempts * 100).toFixed(1) : '0.0';
    const sellSuccessRate = this.correlationStats.sellAttempts > 0 ? 
      (this.correlationStats.sellSuccess / this.correlationStats.sellAttempts * 100).toFixed(1) : '0.0';
      
    summary += `Buy Signal Accuracy: ${buySuccessRate}% (${this.correlationStats.buySuccess}/${this.correlationStats.buyAttempts})\n`;
    summary += `Sell Signal Accuracy: ${sellSuccessRate}% (${this.correlationStats.sellSuccess}/${this.correlationStats.sellAttempts})\n\n`;
    
    summary += `{bold}Current Session:{/}\n`;
    summary += `Current House Position: ${this.housePosition.toFixed(6)} SOL\n`;
    summary += `Games Since Reset: ${this.gameResults.length}\n\n`;
    
    summary += `{bold}Recent Game Results:{/}\n`;
    const recentGames = this.gameResults.slice(-5).reverse();
    if (recentGames.length > 0) {
      recentGames.forEach(g => {
        const result = g.finalHousePosition >= 0 ? '{green-fg}WIN' : '{red-fg}LOSS';
        summary += `Game ${g.gameId.substring(0,8)}: House ${result}{/} ${Math.abs(g.finalHousePosition).toFixed(6)} SOL - ${g.status}\n`;
      });
    } else {
      summary += "No games completed yet.\n";
    }
    
    summary += `\n{italic}Press Q to close this window{/}`;
    return summary;
  }

  // Add this new method for rendering the price chart as ASCII
  renderPriceHistoryChart() {
    const width = 60; // Chart width in characters
    const height = 8;  // Chart height in lines
    
    // Find min/max for scaling
    const min = Math.max(0, Math.min(...this.priceHistory) - 0.05);
    const max = Math.max(...this.priceHistory) + 0.05;
    
    // Create empty chart grid
    const chartLines = Array(height).fill().map(() => Array(width).fill(' '));
    
    // Plot each point
    this.priceHistory.forEach((price, i) => {
      if (i === 0) return; // Skip first point
      
      // Scale x position to chart width
      const x = Math.floor((i / (this.priceHistory.length - 1)) * (width - 1));
      
      // Scale y position to chart height (inverted since higher values should be at top)
      const normalizedPrice = (price - min) / (max - min);
      const y = height - 1 - Math.floor(normalizedPrice * (height - 1));
      
      // Ensure y is within bounds
      const safeY = Math.max(0, Math.min(height - 1, y));
      
      // Draw point
      if (chartLines[safeY] && chartLines[safeY][x]) {
        chartLines[safeY][x] = '•';
      }
    });
    
    // Connect points with lines (simplified)
    for (let i = 1; i < this.priceHistory.length; i++) {
      const prev = this.priceHistory[i-1];
      const curr = this.priceHistory[i];
      
      // Only if values differ enough to graph
      if (Math.abs(prev - curr) > 0.0001) {
        const prevX = Math.floor(((i-1) / (this.priceHistory.length - 1)) * (width - 1));
        const currX = Math.floor((i / (this.priceHistory.length - 1)) * (width - 1));
        
        const prevY = height - 1 - Math.floor(((prev - min) / (max - min)) * (height - 1));
        const currY = height - 1 - Math.floor(((curr - min) / (max - min)) * (height - 1));
        
        // Draw simple line (could be improved with Bresenham's algorithm)
        const safeY1 = Math.max(0, Math.min(height - 1, prevY)); 
        const safeY2 = Math.max(0, Math.min(height - 1, currY));
        
        if (currX > prevX && Math.abs(safeY2 - safeY1) <= 1) {
          chartLines[safeY2][currX] = curr > prev ? '/' : (curr < prev ? '\\' : '-');
        }
      }
    }
    
    // Add Y-axis labels
    let chartOutput = '';
    chartOutput += `{yellow-fg}${max.toFixed(2)}{/}\n`; 
    
    // Convert grid to string
    chartLines.forEach(line => {
      chartOutput += '│' + line.join('') + '│\n';
    });
    
    // Add X-axis
    chartOutput += `└${'─'.repeat(width)}┘\n`;
    chartOutput += `{yellow-fg}${min.toFixed(2)}{/}`;
    
    return chartOutput;
  }

  // New helper method to update player data from leaderboard
  updatePlayerDataFromLeaderboard(leaderboard) {
    if (!Array.isArray(leaderboard) || leaderboard.length === 0) return;
    
    // Track if house position changed (for display update)
    let housePositionChanged = false;
    let oldHousePosition = this.housePosition;
    
    // First pass: update player positions from leaderboard
    leaderboard.forEach(player => {
      if (player && player.id) {
        // Extract relevant player data
        const playerId = player.id;
        const username = player.username || 'Unknown';
        const positionQty = parseFloat(player.positionQty) || 0;
        const avgCost = parseFloat(player.avgCost) || 0;
        const pnl = parseFloat(player.pnl) || 0;
        
        // Track the player even with zero position for PnL calculations
        if (positionQty > 0 || pnl !== 0) {
          const existingPlayer = this.playerPositions.get(playerId);
          
          // Only update if data is different
          if (!existingPlayer || 
              existingPlayer.amount !== positionQty || 
              existingPlayer.entryPrice !== avgCost ||
              existingPlayer.pnl !== pnl) {
            
            this.playerPositions.set(playerId, {
              amount: positionQty,
              entryPrice: avgCost,
              entryTime: existingPlayer ? existingPlayer.entryTime : Date.now(),
              username: username,
              pnl: pnl
            });
            
            console.log(`[HouseTracker] Player position updated: ${username} (${playerId.substring(0,8)}), Qty: ${positionQty.toFixed(5)}, AvgCost: ${avgCost.toFixed(4)}, PnL: ${pnl.toFixed(6)}`);
          }
        }
      }
    });
    
    // Second pass: recalculate house position based on player PnL
    this.calculateHousePosition();
    
    // If house position changed significantly, log it
    if (Math.abs(this.housePosition - oldHousePosition) > 0.000001) {
      console.log(`[HouseTracker] House position updated: ${this.housePosition.toFixed(6)} SOL (was: ${oldHousePosition.toFixed(6)})`);
      
      // Add a history point when position changes
      this.houseHistory.push({
        timestamp: Date.now(),
        position: this.housePosition,
        price: this.currentPrice
      });
      
      // Keep history from growing too large
      if (this.houseHistory.length > HOUSE_HISTORY_MAX_POINTS * 2) {
        this.houseHistory.splice(0, this.houseHistory.length - HOUSE_HISTORY_MAX_POINTS);
      }
    }
  }
  
  // New method to calculate house position from player data
  calculateHousePosition() {
    let newHousePosition = 0;
    
    // Sum up negative PnLs (house wins when players lose)
    for (const [playerId, position] of this.playerPositions.entries()) {
      // If player has a stored PnL value, use it directly
      if (position.pnl !== undefined) {
        newHousePosition += -position.pnl; // House position is opposite of player PnL
      } 
      // Otherwise calculate based on position and price
      else if (position.amount > 0 && position.entryPrice > 0) {
        const playerPnL = position.amount * (this.currentPrice - position.entryPrice);
        newHousePosition -= playerPnL; // House wins when players lose
      }
    }
    
    this.housePosition = newHousePosition;
    return newHousePosition;
  }
}

// Helper to clear log content (blessed.log doesn't have a clear method)
// Not directly used if re-populating from array as done in updateUIDisplay
// blessed.Log.prototype.clear = function() {
//    this.content = '';
//    this.setScrollPerc(0);
// }; 