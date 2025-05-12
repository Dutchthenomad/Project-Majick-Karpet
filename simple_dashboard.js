/**
 * @file simple_dashboard.js
 * @description Simplified browser-based dashboard for the House Edge Tracker
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import logger from './logger.js';
import { URL } from './config.js';
import { connectToBrowser, wait } from './puppeteer_utils.js';
import { setupWebSocketListener } from './websocket_handler.js';
import { EventEmitter } from 'events';

// Get the directory name using ESM compatible approach
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create express app and HTTP server
const app = express();
const server = createServer(app);
const io = new Server(server);

// Create a minimalistic tracker (no UI)
class SimpleTracker extends EventEmitter {
  constructor(io) {
    super();
    this.io = io;
    this.housePosition = 0;
    this.playerPositions = new Map(); // playerId -> { amount, entryPrice, entryTime }
    this.currentGameId = null;
    this.currentPrice = 1.0;
    this.currentTick = 0;
    this.currentIndex = 0;
    this.gameStatus = 'PENDING';
    this.priceHistory = Array(50).fill(1.0);
    this.houseHistory = [];
    this.recentTradesLog = [];
    this.signals = { buySignal: null, sellSignal: null };
    this.liquidity = { players: 0, totalValue: 0 };
    this.correlationStats = { buyAttempts: 0, buySuccess: 0, sellAttempts: 0, sellSuccess: 0 };
    this.players = []; // List of active players with positions for display
    this.lastMessageTime = Date.now(); // For tracking message frequency
    this.messageCount = 0; // Count messages for debugging
    
    logger.info('[SimpleDashboard] Tracker initialized');
    
    // Set interval to emit state
    setInterval(() => this.emitState(), 250);
    
    // Debug timer - log stats every 10 seconds
    setInterval(() => this.logDebugStats(), 10000);
  }
  
  // Log debug statistics
  logDebugStats() {
    logger.info(`[SimpleDashboard] STATUS: GameID: ${this.currentGameId}, Tick: ${this.currentTick}, Price: ${this.currentPrice.toFixed(4)}`);
    logger.info(`[SimpleDashboard] HOUSE: Position: ${this.housePosition.toFixed(6)}, Players: ${this.playerPositions.size}, Value: ${this.liquidity.totalValue.toFixed(4)}`);
    logger.info(`[SimpleDashboard] MSG: Count last 10s: ${this.messageCount}, Types: gameState/trade`);
    this.messageCount = 0; // Reset count
  }
  
  // Process WebSocket messages
  processMessage(parsedData) {
    this.messageCount++;
    
    // Dump complete message structure for debug purposes
    if (parsedData?.type === 'gameStateUpdate' && this.messageCount % 20 === 0) {
      // Every 20th message, log complete structure
      console.log('=== WEBSOCKET MESSAGE STRUCTURE ===');
      console.log(JSON.stringify(parsedData, null, 2));
      console.log('=== END STRUCTURE ===');
    }
    
    // Handle game state updates
    if (parsedData?.type === 'gameStateUpdate' && parsedData.data) {
      const data = parsedData.data;
      
      // Extract game ID (this seems to be working correctly)
      const gameId = data.gameId || this.currentGameId;
      
      // Extract price (this seems to be working correctly)
      const price = parseFloat(data.price) || this.currentPrice;
      
      // Extract tick and index from the message - now using the correct properties!
      let tick = 0;
      let index = 0;
      
      // Log the raw values for debugging
      logger.info(`[SimpleDashboard] Raw tickCount value: '${data.tickCount}' (${typeof data.tickCount}), currentCandle.index: '${data.currentCandle?.index}' (${typeof data.currentCandle?.index})`);
      
      // Use tickCount for tick value - this is the number of 250ms ticks since the game started
      if (data.tickCount !== undefined) {
        tick = parseInt(data.tickCount, 10);
      }
      
      // Use currentCandle.index for index value - this is the candle index, which changes every 5 ticks
      if (data.currentCandle && data.currentCandle.index !== undefined) {
        index = parseInt(data.currentCandle.index, 10);
      }
      
      // Extract game status - use "rugged" property to determine if game is over
      const active = data.rugged !== true; // If rugged is false or undefined, the game is active
      
      // Log the extracted values for debugging
      logger.info(`[SimpleDashboard] Extracted values - GameID: ${gameId}, Price: ${price}, Tick: ${tick}, Index: ${index}, Active: ${active}`);
      
      // New Game Detection - only reset if we have a valid new game ID
      if (gameId && this.currentGameId !== gameId) {
        this.resetForNewGame(gameId);
      }

      // Update state values (only if they're valid)
      if (gameId) this.currentGameId = gameId;
      if (price && !isNaN(price)) this.currentPrice = price;
      if (!isNaN(tick)) this.currentTick = tick;
      if (!isNaN(index)) this.currentIndex = index;
      this.gameStatus = active ? 'ACTIVE' : (price < 0.1 ? 'RUGGED' : 'ENDED');

      // Update Price History
      this.priceHistory.shift();
      this.priceHistory.push(this.currentPrice);
      
      // Process player data to update house position
      if (Array.isArray(data.leaderboard) && data.leaderboard.length > 0) {
        // Clear existing positions if we're getting a full leaderboard update
        this.playerPositions.clear();
        
        // Process each player from the leaderboard
        data.leaderboard.forEach(player => {
          if (player && player.id) {
            // Extract relevant player data
            const playerId = player.id;
            const username = player.username || 'Unknown';
            const positionQty = parseFloat(player.positionQty) || 0;
            const avgCost = parseFloat(player.avgCost) || 0;
            const pnl = parseFloat(player.pnl) || 0;
            
            // Only store players with actual positions
            if (positionQty > 0 || pnl !== 0) {
              this.playerPositions.set(playerId, {
                amount: positionQty,
                entryPrice: avgCost,
                entryTime: Date.now(), // Assuming current time as we don't have entry time
                username: username,
                pnl: pnl
              });
              
              logger.debug(`[SimpleDashboard] Added player position: ${playerId.substring(0,8)} (${username}), Qty: ${positionQty}, AvgCost: ${avgCost}, PnL: ${pnl}`);
            }
          }
        });
        
        // Recalculate house position based on player data
        this.calculateHousePosition();
      }
      
      // Process trades if any are included in the update
      if (Array.isArray(data.trades) && data.trades.length > 0) {
        logger.info(`[SimpleDashboard] Processing ${data.trades.length} trades from game state update`);
        data.trades.forEach(trade => this.processTrade(trade));
      }
      
      // Update player list and liquidity
      this.updatePlayersList();
      this.updateLiquidityAndPlayers();
    }
    // Handle standalone trade events
    else if (parsedData?.type === 'tradeEvent' && parsedData.data) {
      logger.info(`[SimpleDashboard] Received trade event: ${JSON.stringify(parsedData.data)}`);
      this.processTrade(parsedData.data);
      this.updatePlayersList();
      this.updateLiquidityAndPlayers();
    }
    
    // Generate signals after all updates
    this.generateSignals();
  }
  
  // Calculate house position from all player positions
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
    
    if (this.housePosition !== newHousePosition) {
      logger.info(`[SimpleDashboard] House position recalculated: ${newHousePosition.toFixed(6)} (was: ${this.housePosition.toFixed(6)})`);
      this.housePosition = newHousePosition;
      
      // Add to house history when position changes
      this.houseHistory.push({
        timestamp: Date.now(),
        position: this.housePosition,
        price: this.currentPrice
      });
    }
  }
  
  // Process trades
  processTrade(trade) {
    // Safely extract trade data
    const playerId = trade.playerId || trade.id || 'unknown';
    const action = trade.action || '';
    const amount = parseFloat(trade.amount) || 0;
    const price = parseFloat(trade.price) || this.currentPrice;
    const username = trade.username || playerId.substring(0, 8);

    if (isNaN(amount) || amount <= 0) {
      logger.warn(`[SimpleDashboard] Invalid trade amount: ${JSON.stringify(trade)}`);
      return;
    }
    
    logger.info(`[SimpleDashboard] Processing trade: ${action} by ${username} (${playerId.substring(0,8)}) - ${amount.toFixed(5)} @ ${price.toFixed(4)}x`);
    
    if (action === 'buy') {
      const position = this.playerPositions.get(playerId) || { 
        amount: 0, 
        entryPrice: 0,
        entryTime: Date.now(),
        username: username
      };
      
      const newAmount = position.amount + amount;
      if (newAmount > 0) {
        position.entryPrice = ((position.amount * position.entryPrice) + (amount * price)) / newAmount;
      }
      position.amount = newAmount;
      
      this.playerPositions.set(playerId, position);
      this.addRecentTrade(`↑ ${username} BUY  ${amount.toFixed(5)} @ ${price.toFixed(3)}x`);
      logger.info(`[SimpleDashboard] BUY processed: ${username} now has ${newAmount.toFixed(5)} @ ${position.entryPrice.toFixed(4)}x`);

    } else if (action === 'sell') {
      const position = this.playerPositions.get(playerId);
      if (!position || position.amount <= 0) {
        logger.warn(`[SimpleDashboard] Sell with no position: ${username} (${playerId.substring(0,8)})`);
        return;
      }
      
      const sellAmount = Math.min(amount, position.amount);
      const playerPnL = sellAmount * (price - position.entryPrice);
      
      // Update player's PnL
      position.pnl = (position.pnl || 0) + playerPnL;
      
      // Update house position
      this.housePosition -= playerPnL; // House P&L is inverse of player P&L
      
      // Log the update with clear values
      logger.info(`[SimpleDashboard] House position updated to: ${this.housePosition.toFixed(6)} SOL`);
      logger.info(`[SimpleDashboard] Player P&L was: ${playerPnL.toFixed(6)} from selling ${sellAmount.toFixed(5)} @ ${price.toFixed(4)} (entry: ${position.entryPrice.toFixed(4)})`);
      
      // Update player position
      position.amount -= sellAmount;
      if (position.amount <= 0.000001) {
        this.playerPositions.delete(playerId);
        logger.info(`[SimpleDashboard] Player ${username} (${playerId.substring(0,8)}) position closed`);
      } else {
        this.playerPositions.set(playerId, position);
        logger.info(`[SimpleDashboard] Player ${username} (${playerId.substring(0,8)}) now has ${position.amount.toFixed(5)}`);
      }
      
      // Store house history point
      this.houseHistory.push({
        timestamp: Date.now(),
        position: this.housePosition,
        price: price
      });
      
      // Record the trade with P&L
      this.addRecentTrade(`↓ ${username} SELL ${sellAmount.toFixed(5)} @ ${price.toFixed(3)}x (${playerPnL >= 0 ? '+' : ''}${playerPnL.toFixed(5)})`);
    }
    
    // Update liquidity and player data after any trade
    this.updateLiquidityAndPlayers();
  }
  
  // Update liquidity and player data
  updateLiquidityAndPlayers() {
    // Count active players
    this.liquidity.players = this.playerPositions.size;
    
    // Calculate total position value at current price
    let currentPositionsValue = 0;
    for (const pos of this.playerPositions.values()) {
      currentPositionsValue += pos.amount * this.currentPrice;
    }
    this.liquidity.totalValue = currentPositionsValue;
    
    logger.debug(`[SimpleDashboard] Updated liquidity: ${this.liquidity.players} players, ${this.liquidity.totalValue.toFixed(6)} SOL total value`);
  }
  
  // Update players list for UI display
  updatePlayersList() {
    this.players = [];
    
    for (const [id, position] of this.playerPositions.entries()) {
      const currentValue = position.amount * this.currentPrice;
      // Calculate PnL either from stored value or from position data
      const pnl = position.pnl !== undefined ? 
        position.pnl : 
        position.amount * (this.currentPrice - position.entryPrice);
      
      this.players.push({
        id: id.substring(0, 8),
        username: position.username || id.substring(0, 8),
        amount: position.amount,
        entryPrice: position.entryPrice,
        currentValue: currentValue,
        pnl: pnl
      });
    }
    
    // Sort by position size (largest first)
    this.players.sort((a, b) => b.amount - a.amount);
    
    if (this.players.length > 0) {
      logger.debug(`[SimpleDashboard] Player list updated with ${this.players.length} players`);
    }
  }
  
  // Add to recent trades log
  addRecentTrade(tradeString) {
    this.recentTradesLog.unshift(tradeString);
    if (this.recentTradesLog.length > 5) {
      this.recentTradesLog.pop();
    }
  }
  
  // Reset for new game
  resetForNewGame(gameId) {
    // Do not reset house position between games!
    this.currentGameId = gameId;
    this.playerPositions.clear();
    this.gameStatus = 'ACTIVE';
    this.currentPrice = 1.0;
    this.currentTick = 0;
    this.currentIndex = 0;
    this.priceHistory = Array(50).fill(1.0);
    this.recentTradesLog = [];
    this.players = [];
    this.updateLiquidityAndPlayers();
    logger.info(`[SimpleDashboard] New game started: ${gameId}`);
  }
  
  // Generate signals
  generateSignals() {
    const priceTrend = this.calculatePriceTrend();
    
    // Calculate house position percentage based on history
    let housePosPercent = 0;
    if (this.houseHistory.length > 0) {
      // Take oldest history point as reference
      const oldestPoint = this.houseHistory[0];
      // Avoid division by zero
      if (Math.abs(oldestPoint.position) > 0.0001) {
        housePosPercent = (this.housePosition / Math.abs(oldestPoint.position)) * 100;
      } else if (Math.abs(this.housePosition) > 0.0001) {
        // If we have house position but no reference, use fixed 100%
        housePosPercent = this.housePosition > 0 ? 100 : -100;
      }
    }
    
    // Generate buy/sell signals based on house position and price trend
    const buySignal = this.housePosition > 0.0001 && priceTrend < -0.02 ? {
      strength: Math.min(100, 30 + Math.min(50, (this.housePosition / 0.01) * 20) + Math.min(20, Math.abs(priceTrend) * 200)),
      message: "BUY OPPORTUNITY"
    } : null;
    
    const sellSignal = this.housePosition < -0.0001 && priceTrend > 0.02 ? {
      strength: Math.min(100, 30 + Math.min(50, (Math.abs(this.housePosition) / 0.01) * 20) + Math.min(20, priceTrend * 200)),
      message: "SELL OPPORTUNITY"
    } : null;
    
    // Update signals with strength indicator
    if (buySignal) {
      buySignal.message = `${buySignal.message} (${buySignal.strength.toFixed(0)}%)`;
    }
    if (sellSignal) {
      sellSignal.message = `${sellSignal.message} (${sellSignal.strength.toFixed(0)}%)`;
    }
    
    this.signals = {
      buySignal,
      sellSignal,
      housePositionPercent: housePosPercent,
      priceTrendPercent: priceTrend * 100
    };
  }
  
  // Calculate price trend
  calculatePriceTrend() {
    const lookback = 5;
    const current = this.priceHistory[this.priceHistory.length - 1];
    const past = this.priceHistory[this.priceHistory.length - 1 - lookback];
    if (past === 0) return 0;
    return (current - past) / past;
  }
  
  // Emit state to connected clients
  emitState() {
    const state = {
      gameState: {
        currentGameId: this.currentGameId,
        currentPrice: this.currentPrice,
        currentTick: this.currentTick,
        currentIndex: this.currentIndex,
        gameStatus: this.gameStatus
      },
      housePosition: {
        position: this.housePosition,
        winning: this.housePosition > 0.0001,
        losing: this.housePosition < -0.0001
      },
      liquidity: this.liquidity,
      signals: this.signals,
      priceHistory: this.priceHistory,
      recentTrades: this.recentTradesLog,
      correlationStats: this.correlationStats,
      players: this.players
    };
    
    this.io.emit('tracker-update', state);
  }
  
  // Get stats summary
  getStatsSummary() {
    return {
      gameCount: 0,
      rugPullCount: 0,
      housePosition: this.housePosition,
      activePlayers: this.playerPositions.size,
      buySignals: {
        attempts: this.correlationStats.buyAttempts,
        success: this.correlationStats.buySuccess,
        rate: this.correlationStats.buyAttempts > 0 ? 
          (this.correlationStats.buySuccess / this.correlationStats.buyAttempts * 100).toFixed(1) : '0.0'
      },
      sellSignals: {
        attempts: this.correlationStats.sellAttempts,
        success: this.correlationStats.sellSuccess,
        rate: this.correlationStats.sellAttempts > 0 ? 
          (this.correlationStats.sellSuccess / this.correlationStats.sellAttempts * 100).toFixed(1) : '0.0'
      },
      recentGames: []
    };
  }
  
  // Reset stats
  resetStats() {
    this.housePosition = 0;
    this.houseHistory = [];
    this.correlationStats = { buyAttempts: 0, buySuccess: 0, sellAttempts: 0, sellSuccess: 0 };
    logger.info('[SimpleDashboard] Statistics Reset');
    this.io.emit('stats-reset');
  }
}

// Create dashboard HTML
function createDashboardHTML() {
  const dashboardDir = path.join(__dirname, 'dashboard');
  if (!fs.existsSync(dashboardDir)) {
    fs.mkdirSync(dashboardDir);
  }
  
  const htmlPath = path.join(dashboardDir, 'index.html');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rugs.fun House Edge Tracker</title>
  <script src="/socket.io/socket.io.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      color: #e0e0e0;
      background-color: #181818;
      margin: 0;
      padding: 0;
    }
    .dashboard {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto auto auto auto auto;
      gap: 10px;
      padding: 10px;
      height: 100vh;
    }
    .card {
      background-color: #222;
      border-radius: 4px;
      padding: 10px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }
    .game-state, .price {
      grid-column: span 1;
    }
    .house-position, .liquidity {
      grid-column: span 1;
    }
    .price-chart {
      grid-column: span 2;
    }
    .signals {
      grid-column: span 2;
    }
    .trades {
      grid-column: span 1;
      max-height: 200px;
      overflow-y: auto;
    }
    .players {
      grid-column: span 1;
      max-height: 200px;
      overflow-y: auto;
    }
    .status-active {
      color: #4CAF50;
      font-weight: bold;
    }
    .status-rugged {
      color: #F44336;
      font-weight: bold;
    }
    .status-pending, .status-ended {
      color: #FFC107;
      font-weight: bold;
    }
    .price-value {
      font-size: 1.5em;
      font-weight: bold;
      color: #FFC107;
    }
    .house-positive {
      color: #4CAF50;
      font-weight: bold;
    }
    .house-negative {
      color: #F44336;
      font-weight: bold;
    }
    .house-neutral {
      color: #9E9E9E;
    }
    h2 {
      margin-top: 0;
      font-size: 1em;
      text-transform: uppercase;
      color: #9E9E9E;
      border-bottom: 1px solid #333;
      padding-bottom: 5px;
    }
    .trade-item {
      padding: 3px 0;
      border-bottom: 1px solid #333;
    }
    .trade-buy {
      color: #4CAF50;
    }
    .trade-sell {
      color: #F44336;
    }
    .signal-buy {
      background-color: rgba(76, 175, 80, 0.2);
      border-left: 4px solid #4CAF50;
      padding: 10px;
    }
    .signal-sell {
      background-color: rgba(244, 67, 54, 0.2);
      border-left: 4px solid #F44336;
      padding: 10px;
    }
    .signal-none {
      background-color: rgba(158, 158, 158, 0.1);
      border-left: 4px solid #9E9E9E;
      padding: 10px;
    }
    .progress-bar {
      height: 8px;
      width: 100%;
      background-color: #333;
      border-radius: 4px;
      margin: 5px 0;
    }
    .progress-fill-positive {
      height: 100%;
      background-color: #4CAF50;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .progress-fill-negative {
      height: 100%;
      background-color: #F44336;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .stats-button {
      margin-top: 10px;
      background-color: #333;
      color: #e0e0e0;
      border: none;
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    .stats-button:hover {
      background-color: #444;
    }
    .modal {
      display: none;
      position: fixed;
      z-index: 1;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
    }
    .modal-content {
      background-color: #222;
      margin: 10% auto;
      padding: 20px;
      border-radius: 4px;
      width: 80%;
      max-width: 600px;
    }
    .close {
      color: #999;
      float: right;
      font-size: 28px;
      font-weight: bold;
      cursor: pointer;
    }
    .close:hover {
      color: #e0e0e0;
    }
    .player-item {
      padding: 5px 0;
      border-bottom: 1px solid #333;
      font-size: 0.9em;
    }
    .player-profit {
      color: #4CAF50;
    }
    .player-loss {
      color: #F44336;
    }
    .debug-info {
      font-family: monospace;
      font-size: 0.8em;
      color: #999;
      margin-top: 5px;
    }
    .username {
      font-weight: bold;
      color: #3f9eff;
    }
    
    /* New Player Table Styles */
    .player-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 5px;
    }
    .player-table th {
      text-align: left;
      padding: 4px;
      border-bottom: 1px solid #444;
      color: #9E9E9E;
      font-size: 0.9em;
    }
    .player-table td {
      padding: 4px;
      border-bottom: 1px solid #333;
      font-size: 0.9em;
    }
    .player-name {
      font-weight: bold;
      color: #3f9eff;
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .player-amount {
      text-align: right;
    }
    .player-price {
      text-align: right;
    }
    .player-pnl {
      text-align: right;
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <div class="card game-state">
      <h2>Game State</h2>
      <div id="game-status" class="status-pending">PENDING</div>
      <div id="game-id">ID: N/A</div>
      <div id="game-tick">Tick: 0</div>
      <div id="game-index">Index: 0</div>
      <button id="stats-button" class="stats-button">View Stats</button>
    </div>
    
    <div class="card price">
      <h2>Price</h2>
      <div id="current-price" class="price-value">1.0000x</div>
      <div>Index Changes: <span id="index-changes">5-tick groups</span></div>
    </div>
    
    <div class="card house-position">
      <h2>House Position</h2>
      <div>SOL: <span id="house-sol" class="house-neutral">0.000000</span></div>
      <div>Edge: <span id="house-edge" class="house-neutral">EVEN</span></div>
      <div class="debug-info" id="house-debug">No data</div>
    </div>
    
    <div class="card liquidity">
      <h2>Liquidity</h2>
      <div>Players: <span id="liquidity-players">0</span></div>
      <div>Total Value: <span id="liquidity-value">0.000</span> SOL</div>
    </div>
    
    <div class="card price-chart">
      <h2>Price History</h2>
      <canvas id="price-chart"></canvas>
    </div>
    
    <div class="card signals">
      <h2>Signals</h2>
      <div>Price Trend: <span id="price-trend-percent">0.0%</span></div>
      <div class="progress-bar">
        <div id="price-bar" class="progress-fill-positive" style="width: 0%"></div>
      </div>
      
      <div id="signal-container" class="signal-none">
        <div id="signal-text">No strong signal.</div>
      </div>
      
      <div class="correlation-stats">
        <div>
          <div>Buy Predictions</div>
          <div id="buy-stats">0/0 (0%)</div>
        </div>
        <div>
          <div>Sell Predictions</div>
          <div id="sell-stats">0/0 (0%)</div>
        </div>
      </div>
    </div>
    
    <div class="card trades">
      <h2>Recent Trades</h2>
      <div id="trades-container"></div>
    </div>
    
    <div class="card players">
      <h2>Player Positions</h2>
      <table class="player-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Position</th>
            <th>Avg Price</th>
            <th>PnL</th>
          </tr>
        </thead>
        <tbody id="players-container">
          <tr><td colspan="4">No active players</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  
  <div id="stats-modal" class="modal">
    <div class="modal-content">
      <span class="close">&times;</span>
      <h2>Data Collection Summary</h2>
      <div id="stats-content"></div>
      <button id="reset-stats" class="stats-button" style="margin-top: 20px;">Reset Stats</button>
    </div>
  </div>
  
  <script>
    const socket = io();
    let priceChart;
    let priceData = Array(50).fill(1.0);
    
    // Initialize Chart.js
    function initChart() {
      const ctx = document.getElementById('price-chart').getContext('2d');
      priceChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: Array(50).fill('').map((_, i) => i),
          datasets: [{
            label: 'Price',
            data: priceData,
            borderColor: '#FFC107',
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              display: false
            },
            y: {
              beginAtZero: false,
              grid: {
                color: '#333'
              },
              ticks: {
                color: '#999'
              }
            }
          },
          plugins: {
            legend: {
              display: false
            }
          }
        }
      });
    }
    
    // Update the dashboard with new state
    socket.on('tracker-update', (state) => {
      // Update Game State
      const gameStatus = document.getElementById('game-status');
      gameStatus.textContent = state.gameState.gameStatus;
      gameStatus.className = 'status-' + state.gameState.gameStatus.toLowerCase();
      
      document.getElementById('game-id').textContent = 'ID: ' + (state.gameState.currentGameId || 'N/A');
      document.getElementById('game-tick').textContent = 'Tick: ' + state.gameState.currentTick;
      document.getElementById('game-index').textContent = 'Index: ' + state.gameState.currentIndex;
      
      // Update Price
      document.getElementById('current-price').textContent = state.gameState.currentPrice.toFixed(4) + 'x';
      
      // Update House Position
      const houseSol = document.getElementById('house-sol');
      houseSol.textContent = (state.housePosition.position >= 0 ? '+' : '') + state.housePosition.position.toFixed(6);
      houseSol.className = state.housePosition.winning ? 'house-positive' : (state.housePosition.losing ? 'house-negative' : 'house-neutral');
      
      const houseEdge = document.getElementById('house-edge');
      houseEdge.textContent = state.housePosition.winning ? 'WINNING' : (state.housePosition.losing ? 'LOSING' : 'EVEN');
      houseEdge.className = state.housePosition.winning ? 'house-positive' : (state.housePosition.losing ? 'house-negative' : 'house-neutral');
      
      // Add debug info
      document.getElementById('house-debug').textContent = \`Players: \${state.players.length}\`;
      
      // Update Liquidity
      document.getElementById('liquidity-players').textContent = state.liquidity.players;
      document.getElementById('liquidity-value').textContent = state.liquidity.totalValue.toFixed(3);
      
      // Update Price Chart
      priceData = state.priceHistory;
      priceChart.data.datasets[0].data = priceData;
      priceChart.update();
      
      // Update Signals
      const priceTrendPerc = state.signals.priceTrendPercent || 0;
      
      document.getElementById('price-trend-percent').textContent = (priceTrendPerc >= 0 ? '+' : '') + priceTrendPerc.toFixed(1) + '%';
      
      const priceBar = document.getElementById('price-bar');
      priceBar.style.width = Math.min(100, Math.abs(priceTrendPerc)) + '%';
      priceBar.className = priceTrendPerc >= 0 ? 'progress-fill-positive' : 'progress-fill-negative';
      
      const signalContainer = document.getElementById('signal-container');
      const signalText = document.getElementById('signal-text');
      
      if (state.signals.buySignal) {
        signalContainer.className = 'signal-buy';
        signalText.textContent = state.signals.buySignal.message;
      } else if (state.signals.sellSignal) {
        signalContainer.className = 'signal-sell';
        signalText.textContent = state.signals.sellSignal.message;
      } else {
        signalContainer.className = 'signal-none';
        signalText.textContent = 'No strong signal.';
      }
      
      // Update Correlation Stats
      const buySuccessRate = state.correlationStats.buyAttempts > 0 ? 
        (state.correlationStats.buySuccess / state.correlationStats.buyAttempts * 100).toFixed(0) : '0';
      const sellSuccessRate = state.correlationStats.sellAttempts > 0 ? 
        (state.correlationStats.sellSuccess / state.correlationStats.sellAttempts * 100).toFixed(0) : '0';
      
      document.getElementById('buy-stats').textContent = state.correlationStats.buySuccess + '/' + state.correlationStats.buyAttempts + ' (' + buySuccessRate + '%)';
      document.getElementById('sell-stats').textContent = state.correlationStats.sellSuccess + '/' + state.correlationStats.sellAttempts + ' (' + sellSuccessRate + '%)';
      
      // Update Trades
      const tradesContainer = document.getElementById('trades-container');
      tradesContainer.innerHTML = '';
      state.recentTrades.forEach(trade => {
        const tradeEl = document.createElement('div');
        tradeEl.className = 'trade-item';
        
        if (trade.includes('BUY')) {
          tradeEl.classList.add('trade-buy');
        } else if (trade.includes('SELL')) {
          tradeEl.classList.add('trade-sell');
        }
        
        tradeEl.textContent = trade;
        tradesContainer.appendChild(tradeEl);
      });
      
      // Update Players - NEW TABLE FORMAT
      const playersContainer = document.getElementById('players-container');
      playersContainer.innerHTML = '';
      
      if (state.players && state.players.length > 0) {
        state.players.forEach(player => {
          const row = document.createElement('tr');
          
          const pnlClass = player.pnl > 0 ? 'player-profit' : (player.pnl < 0 ? 'player-loss' : '');
          const pnlStr = player.pnl > 0 ? '+' + player.pnl.toFixed(5) : player.pnl.toFixed(5);
          
          // Create name cell
          const nameCell = document.createElement('td');
          nameCell.className = 'player-name';
          nameCell.textContent = player.username || player.id;
          
          // Create position cell
          const posCell = document.createElement('td');
          posCell.className = 'player-amount';
          posCell.textContent = player.amount.toFixed(5);
          
          // Create price cell
          const priceCell = document.createElement('td');
          priceCell.className = 'player-price';
          priceCell.textContent = player.entryPrice.toFixed(4) + 'x';
          
          // Create PnL cell
          const pnlCell = document.createElement('td');
          pnlCell.className = 'player-pnl ' + pnlClass;
          pnlCell.textContent = pnlStr;
          
          // Add cells to row
          row.appendChild(nameCell);
          row.appendChild(posCell);
          row.appendChild(priceCell);
          row.appendChild(pnlCell);
          
          playersContainer.appendChild(row);
        });
      } else {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.setAttribute('colspan', '4');
        emptyCell.textContent = 'No active players';
        emptyRow.appendChild(emptyCell);
        playersContainer.appendChild(emptyRow);
      }
    });
    
    // Fetch and display statistics
    document.getElementById('stats-button').addEventListener('click', () => {
      socket.emit('get-stats', {}, (stats) => {
        const statsContent = document.getElementById('stats-content');
        statsContent.innerHTML = \`
          <p><strong>Theory Validation:</strong></p>
          <p>Buy Signal Accuracy: \${stats.buySignals.rate}% (\${stats.buySignals.success}/\${stats.buySignals.attempts})</p>
          <p>Sell Signal Accuracy: \${stats.sellSignals.rate}% (\${stats.sellSignals.success}/\${stats.sellSignals.attempts})</p>
          <p><strong>Current Session:</strong></p>
          <p>House Position: \${stats.housePosition?.toFixed(6) || '0.000000'} SOL</p>
          <p>Active Players: \${stats.activePlayers || 0}</p>
        \`;
        
        document.getElementById('stats-modal').style.display = 'block';
      });
    });
    
    // Close Modal
    document.querySelector('.close').addEventListener('click', () => {
      document.getElementById('stats-modal').style.display = 'none';
    });
    
    // Reset Stats
    document.getElementById('reset-stats').addEventListener('click', () => {
      socket.emit('reset-stats');
      document.getElementById('stats-modal').style.display = 'none';
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
      if (event.target === document.getElementById('stats-modal')) {
        document.getElementById('stats-modal').style.display = 'none';
      }
    });
    
    // Handle stats reset
    socket.on('stats-reset', () => {
      alert('Statistics have been reset.');
    });
    
    // Initialize on page load
    window.addEventListener('load', initChart);
  </script>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html);
  logger.info(`[SimpleDashboard] Created dashboard HTML at ${htmlPath}`);
  return htmlPath;
}

// Create a variable for the tracker
let tracker = null;

// Serve static files from the dashboard directory
app.use(express.static(path.join(__dirname, 'dashboard')));

// Handle socket connections
io.on('connection', (socket) => {
  logger.info('[SimpleDashboard] Client connected');
  
  // Handle requests for stats
  socket.on('get-stats', (_, callback) => {
    if (tracker) {
      callback(tracker.getStatsSummary());
    } else {
      callback({
        gameCount: 0,
        rugPullCount: 0,
        buySignals: { attempts: 0, success: 0, rate: '0.0' },
        sellSignals: { attempts: 0, success: 0, rate: '0.0' }
      });
    }
  });
  
  // Handle reset stats request
  socket.on('reset-stats', () => {
    if (tracker) {
      tracker.resetStats();
    }
  });
  
  socket.on('disconnect', () => {
    logger.info('[SimpleDashboard] Client disconnected');
  });
});

// Function to display stats and exit gracefully
function displayStatsAndExit(exitCode = 0) {
  try {
    logger.info('------------------------------------');
    logger.info('      SIMPLE DASHBOARD EXITING      ');
    logger.info('------------------------------------');
  } catch (error) {
    logger.error('Error displaying stats on exit:', error);
  }
  
  setTimeout(() => {
    process.exit(exitCode);
  }, 500);
}

// Handle SIGINT
process.on('SIGINT', () => {
  logger.info('Received interrupt signal (Ctrl+C).');
  displayStatsAndExit(0); 
});

// Main execution block
(async () => {
  try {
    // Create the dashboard HTML
    const htmlPath = createDashboardHTML();
    
    // Start the web server
    const PORT = 3001; // Changed from 3000 to 3001 to avoid conflicts
    server.listen(PORT, () => {
      logger.info(`[SimpleDashboard] Server running at http://localhost:${PORT}`);
      logger.info(`[SimpleDashboard] Open this URL in your browser to view the dashboard`);
    });
    
    logger.info('[SimpleDashboard] Starting browser connection...');
    const browser = await connectToBrowser();
    if (!browser) throw new Error('Failed to connect to or launch browser.');

    // Initialize tracker
    tracker = new SimpleTracker(io);
    logger.info('[SimpleDashboard] Tracker initialized.');

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    logger.info(`[SimpleDashboard] Navigating to: ${URL}`);
    
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(URL, { waitUntil: 'networkidle2' });
    logger.info('[SimpleDashboard] Page navigated successfully.');
    await wait(1000);

    const ws = await setupWebSocketListener(page);
    if (!ws) throw new Error('Failed to set up WebSocket listener.');
    logger.info('[SimpleDashboard] WebSocket listener attached.');
    
    ws.on('message', (parsedData) => {
      if (tracker) {
        tracker.processMessage(parsedData);
      }
    });

    ws.on('close', () => {
      logger.error('[SimpleDashboard] WebSocket connection closed unexpectedly.');
      displayStatsAndExit(1); 
    });

    logger.info('[SimpleDashboard] Dashboard is running.');
    logger.info('[SimpleDashboard] Press Ctrl+C to exit.');
    
    // Keep the process running
    await new Promise(() => {});

  } catch (error) {
    logger.error('--- FATAL ERROR in dashboard execution ---', error);
    displayStatsAndExit(1);
  }
})(); 