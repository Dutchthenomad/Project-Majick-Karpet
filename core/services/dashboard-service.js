const ServiceBase = require('./service-base');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

/**
 * Dashboard service that provides a real-time web UI
 */
class DashboardService extends ServiceBase {
  constructor(options = {}) {
    super(options);
    
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server);
    
    this.port = options.port || 3000;
    this.state = {
      currentGameId: null,
      gameState: null,
      currentTickCount: 0,
      currentPrice: null,
      housePosition: {
        totalBets: 0,
        totalAmount: 0,
        activeBets: 0,
        activeAmount: 0,
        settledBets: 0,
        payout: 0,
        profit: 0
      },
      recentTrades: [],
      recentGames: [],
      botStatus: {
        running: false,
        strategy: null,
        wins: 0,
        losses: 0,
        profit: 0
      }
    };
  }
  
  setupEventListeners() {
    // Listen for game state updates
    this.eventBus.on('game:stateUpdate', this.handleGameStateUpdate.bind(this));
    
    // Listen for price updates (which include tick counts)
    this.eventBus.on('game:priceUpdate', this.handlePriceUpdate.bind(this));
    
    // Listen for trades
    this.eventBus.on('game:trade', this.handleTradeEvent.bind(this));
    
    // Listen for phase changes
    this.eventBus.on('game:phaseChange', this.handlePhaseChange.bind(this));
    
    // Listen for rug events
    this.eventBus.on('game:rugged', this.handleRugEvent.bind(this));
    
    // Listen for bot status changes
    this.eventBus.on('engine:started', () => {
      this.state.botStatus.running = true;
      this.emitDashboardUpdate();
    });
    
    this.eventBus.on('engine:stopped', () => {
      this.state.botStatus.running = false;
      this.emitDashboardUpdate();
    });
    
    // Listen for strategy updates
    this.eventBus.on('strategy:stats', this.handleStrategyStats.bind(this));
  }
  
  /**
   * Configure the Express server
   */
  configureServer() {
    // Serve static files from 'public' directory
    this.app.use(express.static(path.join(process.cwd(), 'public')));
    
    // API routes
    this.app.get('/api/state', (req, res) => {
      res.json(this.state);
    });
    
    // Socket.IO connection handling
    this.io.on('connection', (socket) => {
      console.log('Client connected to dashboard');
      
      // Send initial state
      socket.emit('dashboard:state', this.state);
      
      // Handle client commands
      socket.on('command:toggleBot', () => {
        if (this.engine.state.running) {
          this.engine.stop();
        } else {
          this.engine.start();
        }
      });
      
      socket.on('disconnect', () => {
        console.log('Client disconnected from dashboard');
      });
    });
  }
  
  /**
   * Handle game state updates
   * @param {Object} gameState 
   */
  handleGameStateUpdate(gameState) {
    this.state.currentGameId = gameState.gameId;
    this.state.gameState = gameState;
    
    // Update house position calculations
    this.calculateHousePosition();
    
    // Emit update to all connected clients
    this.emitDashboardUpdate();
  }
  
  /**
   * Handle price updates, which include tick counts
   * @param {Object} priceUpdateData
   */
  handlePriceUpdate(priceUpdateData) {
    if (priceUpdateData && typeof priceUpdateData.tickCount !== 'undefined') {
      this.state.currentTickCount = priceUpdateData.tickCount;
      this.state.currentPrice = priceUpdateData.price;

      if (this.state.gameState && priceUpdateData.gameId === this.state.gameState.gameId) {
        this.state.gameState.price = priceUpdateData.price;
        this.state.gameState.tickCount = priceUpdateData.tickCount;
      }

      this.emitDashboardUpdate();
    }
  }
  
  /**
   * Handle trade events
   * @param {Object} trade 
   */
  handleTradeEvent(trade) {
    // Add to recent trades list
    this.state.recentTrades.unshift(trade);
    
    // Keep only the last 50 trades
    if (this.state.recentTrades.length > 50) {
      this.state.recentTrades.pop();
    }
    
    // Update house position based on trade
    this.updateHousePositionFromTrade(trade);
    
    // Emit update
    this.emitDashboardUpdate();
  }
  
  /**
   * Handle phase changes
   * @param {Object} phaseChange 
   */
  handlePhaseChange(phaseChange) {
    // Update game state phase
    if (this.state.gameState) {
      this.state.gameState.phase = phaseChange.currentPhase;
    }
    
    // If this is a new game, add the previous one to history
    if (phaseChange.currentPhase === 'presale' && this.state.gameState) {
      const previousGameId = this.state.currentGameId;
      if (previousGameId && previousGameId !== phaseChange.gameId) {
        // Save previous game data
        const gameData = {
          gameId: previousGameId,
          peakPrice: this.findPeakPrice(),
          rugged: this.state.gameState.rugged,
          timestamp: Date.now()
        };
        
        this.state.recentGames.unshift(gameData);
        
        // Keep only the last 20 games
        if (this.state.recentGames.length > 20) {
          this.state.recentGames.pop();
        }
      }
    }
    
    this.emitDashboardUpdate();
  }
  
  /**
   * Handle rug events
   * @param {Object} rugEvent 
   */
  handleRugEvent(rugEvent) {
    // Mark current game as rugged
    if (this.state.gameState) {
      this.state.gameState.rugged = true;
    }
    
    // Calculate final house position
    this.calculateHousePosition();
    
    this.emitDashboardUpdate();
  }
  
  /**
   * Handle strategy stats updates
   * @param {Object} stats 
   */
  handleStrategyStats(stats) {
    this.state.botStatus.wins = stats.wins;
    this.state.botStatus.losses = stats.losses;
    this.state.botStatus.profit = stats.totalProfit;
    this.state.botStatus.strategy = stats.strategyName;
    
    this.emitDashboardUpdate();
  }
  
  /**
   * Calculate the current house position
   */
  calculateHousePosition() {
    // This would be a complex calculation based on all trades and current price
    // For now, we'll use a simplified model
    
    // Actual implementation would analyze this.state.recentTrades and current game state
  }
  
  /**
   * Update house position based on a new trade
   * @param {Object} trade 
   */
  updateHousePositionFromTrade(trade) {
    const hp = this.state.housePosition;
    
    if (trade.type === 'buy') {
      hp.totalBets++;
      hp.totalAmount += trade.cost || 0;
      hp.activeBets++;
      hp.activeAmount += trade.cost || 0;
    } else if (trade.type === 'sell') {
      hp.activeBets--;
      hp.activeAmount -= (trade.cost || 0);
      hp.settledBets++;
      hp.payout += (trade.proceeds || 0);
      hp.profit = hp.totalAmount - hp.payout;
    }
  }
  
  /**
   * Find the peak price in the current game
   * @returns {number} Peak price
   */
  findPeakPrice() {
    if (!this.state.gameState || !this.state.gameState.candles) {
      return 1.0;
    }
    
    let peak = 1.0;
    
    // Check all candles
    for (const candle of this.state.gameState.candles) {
      if (candle.high > peak) {
        peak = candle.high;
      }
    }
    
    // Check current candle
    if (this.state.gameState.currentCandle && this.state.gameState.currentCandle.high > peak) {
      peak = this.state.gameState.currentCandle.high;
    }
    
    return peak;
  }
  
  /**
   * Emit a dashboard update to all connected clients
   */
  emitDashboardUpdate() {
    this.io.emit('dashboard:update', this.state);
  }
  
  /**
   * Start the dashboard service
   */
  async start() {
    if (this.server.listening) {
      console.log('Dashboard server already running');
      return;
    }
    
    // Configure the server
    this.configureServer();
    
    // Start the server
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (err) => {
        if (err) {
          console.error('Failed to start dashboard server:', err);
          reject(err);
          return;
        }
        
        console.log(`Dashboard server running on http://localhost:${this.port}`);
        resolve();
      });
    });
  }
  
  /**
   * Stop the dashboard service
   */
  async stop() {
    if (!this.server.listening) {
      return;
    }
    
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          console.error('Error closing dashboard server:', err);
          reject(err);
          return;
        }
        
        console.log('Dashboard server stopped');
        resolve();
      });
    });
  }
}

module.exports = DashboardService; 