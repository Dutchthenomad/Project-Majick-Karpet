const ServiceBase = require('./service-base');
const fs = require('fs').promises;
const path = require('path');

/**
 * Service for collecting and storing game data
 */
class DataCollectionService extends ServiceBase {
  constructor(options = {}) {
    super(options);
    
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data');
    this.tournamentFile = options.tournamentFile || path.join(this.dataDir, 'tournament_data.json');
    this.gameHistoryFile = options.gameHistoryFile || path.join(this.dataDir, 'game_history.json');
    this.tradesFile = options.tradesFile || path.join(this.dataDir, 'trades_log.jsonl'); // Using JSONL for trades

    this.buffers = {
      games: [],
      trades: [],
      leaderboardUpdates: [] // Renamed for clarity
    };
    
    this.flushIntervalMs = options.flushIntervalMs || 60000; // 1 minute
    this.flushTimer = null;
  }
  
  setupEventListeners() {
    // Listen for game state updates (primarily for game end)
    this.eventBus.on('game:stateUpdate', this.handleGameStateUpdate.bind(this));
    
    // Listen for trades
    this.eventBus.on('game:trade', this.handleTradeEvent.bind(this));
    
    // Listen for leaderboard updates
    this.eventBus.on('game:leaderboardUpdate', this.handleLeaderboardUpdate.bind(this));
    
    // Listen for rug events (game end)
    this.eventBus.on('game:rugged', this.handleRugEvent.bind(this));

    // Listen for phase changes to detect new games
    this.eventBus.on('game:phaseChange', this.handlePhaseChange.bind(this));
  }

  handlePhaseChange(phaseData) {
    if (phaseData.currentPhase === 'presale') {
      // A new game is starting, log the end of the previous one if it wasn't rugged
      const lastGameInBuffer = this.buffers.games.length > 0 ? this.buffers.games[this.buffers.games.length - 1] : null;
      if (lastGameInBuffer && lastGameInBuffer.gameId === phaseData.previousGameId && !lastGameInBuffer.isGameEnd) {
        // This means the previous game ended normally (not rugged)
        this.buffers.games.push({
          gameId: phaseData.previousGameId,
          timestamp: Date.now(),
          finalPrice: this.engine.state.gameState?.price || null, // Get last known price
          rugged: false, // Game ended normally
          isGameEnd: true,
        });
      }
    }
  }
  
  /**
   * Handle game state updates - primarily to capture non-rugged game ends
   * @param {Object} gameState 
   */
  handleGameStateUpdate(gameState) {
    // We don't store every tick here, only specific events like game end
    // Game end is now primarily handled by handleRugEvent or handlePhaseChange
  }
  
  /**
   * Handle trade events
   * @param {Object} trade 
   */
  handleTradeEvent(trade) {
    this.buffers.trades.push({
      ...trade,
      loggedAt: new Date().toISOString() // Add a log timestamp
    });
  }
  
  /**
   * Handle leaderboard updates
   * @param {Object} data 
   */
  handleLeaderboardUpdate(data) {
    // Extract top players for tournament tracking
    const topPlayers = data.leaderboard
      .slice(0, 10) // Top 10 players
      .map(player => ({
        id: player.id,
        username: player.username,
        level: player.level,
        pnl: player.pnl,
        position: player.position
      }));
    
    this.buffers.leaderboardUpdates.push({
      timestamp: data.timestamp,
      gameId: data.gameId,
      topPlayers
    });
  }
  
  /**
   * Handle rug events (marks game end)
   * @param {Object} rugEvent 
   */
  handleRugEvent(rugEvent) {
    // Store final game outcome
    this.buffers.games.push({
      gameId: rugEvent.gameId,
      timestamp: rugEvent.timestamp,
      finalPrice: rugEvent.finalPrice,
      rugged: true,
      isGameEnd: true // Explicitly mark as game end
    });
    
    // Since this is an important event, consider an immediate flush or shorter interval
    // For now, relies on periodic flush or manual flush on stop
  }
  
  /**
   * Ensure data directory exists
   */
  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create data directory:', error);
      // Don't throw, allow service to continue, but log error
    }
  }
  
  /**
   * Flush buffered data to disk
   */
  async flushData() {
    console.log('[DataCollectionService] Flushing data...');
    await this.ensureDataDir(); // Ensure directory exists every flush
    
    try {
      // Process and save tournament data
      if (this.buffers.leaderboardUpdates.length > 0) {
        let tournamentData = {};
        try {
          const fileContent = await fs.readFile(this.tournamentFile, 'utf8');
          tournamentData = JSON.parse(fileContent);
        } catch (error) {
          // File might not exist yet or is invalid JSON
          console.log('[DataCollectionService] Tournament data file not found or invalid, creating new.');
        }
        
        for (const update of this.buffers.leaderboardUpdates) {
          const dateKey = new Date(update.timestamp).toISOString().split('T')[0];
          if (!tournamentData[dateKey]) {
            tournamentData[dateKey] = [];
          }
          tournamentData[dateKey].push(update);
        }
        
        await fs.writeFile(this.tournamentFile, JSON.stringify(tournamentData, null, 2), 'utf8');
        this.buffers.leaderboardUpdates = []; // Clear buffer
        console.log('[DataCollectionService] Tournament data flushed.');
      }
      
      // Process and save game history (game end events)
      if (this.buffers.games.length > 0) {
        let gameHistory = [];
        try {
          const fileContent = await fs.readFile(this.gameHistoryFile, 'utf8');
          gameHistory = JSON.parse(fileContent);
          if (!Array.isArray(gameHistory)) gameHistory = []; // Ensure it's an array
        } catch (error) {
          console.log('[DataCollectionService] Game history file not found or invalid, creating new.');
        }
        
        // Add only game end events
        const gameEndEvents = this.buffers.games.filter(g => g.isGameEnd);
        gameHistory.push(...gameEndEvents);
        
        // Sort by timestamp and keep unique by gameId (latest entry wins for a gameId)
        const uniqueGames = Array.from(new Map(gameHistory.map(item => [item.gameId, item])).values())
                               .sort((a, b) => b.timestamp - a.timestamp);

        await fs.writeFile(this.gameHistoryFile, JSON.stringify(uniqueGames, null, 2), 'utf8');
        // Clear only processed game end events, keep ongoing game ticks if any (though not stored by this version)
        this.buffers.games = this.buffers.games.filter(g => !g.isGameEnd); 
        console.log('[DataCollectionService] Game history flushed.');
      }

      // Process and save trades (append to JSONL file)
      if (this.buffers.trades.length > 0) {
        const tradesToAppend = this.buffers.trades.map(trade => JSON.stringify(trade)).join('\n') + '\n';
        await fs.appendFile(this.tradesFile, tradesToAppend, 'utf8');
        this.buffers.trades = []; // Clear buffer
        console.log('[DataCollectionService] Trades flushed.');
      }

    } catch (error) {
      console.error('[DataCollectionService] Error flushing data:', error);
    }
  }
  
  /**
   * Start the data collection service
   */
  async start() {
    if (this.flushTimer) {
      console.warn('[DataCollectionService] Already started.');
      return;
    }
    await this.ensureDataDir();
    this.flushTimer = setInterval(() => {
      this.flushData();
    }, this.flushIntervalMs);
    console.log(`[DataCollectionService] Started. Flushing data every ${this.flushIntervalMs / 1000} seconds.`);
  }
  
  /**
   * Stop the data collection service
   */
  async stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Perform a final flush on stop
    await this.flushData();
    console.log('[DataCollectionService] Stopped and performed final data flush.');
  }
}

module.exports = DataCollectionService; 