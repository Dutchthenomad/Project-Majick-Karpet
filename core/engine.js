const EventBus = require('./events/event-bus');
const logger = require('../utils/logger'); // Assuming logger is in utils

// Import Phase 1 Modules (Singletons)
const browserManager = require('./browser/browser');
const webSocketClient = require('./communication/websocket');
const protocolAdapter = require('./communication/protocol');
const dataCollectionService = require('./services/data-collection-service');
// Import Phase 2 Modules (Singletons)
const gameStateService = require('./services/game-state-service');
const playerStateService = require('./services/player-state-service.js'); // Import PlayerStateService
const gameAnalyticsService = require('./services/game-analytics-service'); // Import GameAnalyticsService
const TradeExecutionService = require('./services/trade-execution-service'); // Import TradeExecutionService
const RiskManagerService = require('./services/risk-manager-service'); // Import RiskManagerService
const DataPersistenceService = require('./services/data-persistence-service'); // Import DataPersistenceService
const StrategyManager = require('./strategy-manager'); // Import StrategyManager
const { getConfig } = require('../config/config-service'); // Import config-service

/**
 * Core engine that orchestrates all components
 */
class BotEngine {
  constructor(config = {}) {
    this.config = config;
    // We are using singleton imports directly for now, 
    // but a more robust system might involve explicit registration.
    this.eventBus = EventBus; // Use the imported singleton

    // Assign imported singleton services to the instance
    this.gameStateService = gameStateService;
    this.playerStateService = playerStateService;
    this.gameAnalyticsService = gameAnalyticsService;

    this.tradeExecutionService = new TradeExecutionService(); // Instantiate TradeExecutionService
    this.riskManagerService = new RiskManagerService({}, { 
        eventBus: this.eventBus, 
        logger: logger 
        // configService is used internally by RiskManager via getConfig
    });
    this.dataPersistenceService = new DataPersistenceService(this.config); // Instantiate DataPersistenceService
    this.state = {
      running: false,
      browserConnected: false,
      webSocketConnected: false,
      // We might add more detailed state from modules later
    };
    
    // --- StrategyManager Integration ---
    this.strategyManager = new StrategyManager({
      eventBus: this.eventBus,
      tradeExecutor: this.tradeExecutionService,
      gameStateService: this.gameStateService,
      playerStateService: this.playerStateService,
      riskManagerService: this.riskManagerService, // Add riskManagerService to context
      logger: logger
    });
    logger.info('BotEngine initialized.');
  }
  
  /**
   * Start the bot engine and its core components.
   */
  async start() {
    if (this.state.running) {
      logger.warn('Engine already running');
      return;
    }
    logger.info('Starting bot engine...');
    this.state.running = true;

    try {
      // 1. Connect to Browser
      logger.info('Engine: Connecting to browser...');
      const browser = await browserManager.connect();
      if (!browser) {
        logger.error('Engine: Browser connection failed. Stopping engine start.');
        this.state.running = false;
        return; // Halt startup
      }
      this.state.browserConnected = true;
      logger.info('Engine: Browser connected successfully.');

      // 2. Connect WebSocket Client (via CDP)
      logger.info('Engine: Connecting WebSocket client...');
      await webSocketClient.connect(); 
      // We can listen to 'websocket:connected' event for confirmation if needed
      // For now, we proceed assuming it will connect or retry.
      
      // 3. Start Protocol Adapter Listening
      logger.info('Engine: Starting protocol adapter...');
      protocolAdapter.startListening();

      // 4. Start Data Collection Service Listening
      logger.info('Engine: Starting data collection service...');
      dataCollectionService.startListening();
      
      // Start Data Persistence Service
      logger.info('Engine: Initializing data persistence service...');
      const persistenceInitialized = await this.dataPersistenceService.initialize();
      if (!persistenceInitialized) {
        logger.error('Engine: Data Persistence Service failed to initialize. Halting startup further dependent services or bot.');
        // Depending on strictness, you might want to fully stop the engine here
        // For now, we'll log the error and continue, but this service is critical for Phase 4.
        // Consider: await this.stop(); return;
      }
      logger.info('Engine: Data persistence service initialized.');

      // 5. Start Game State Service Listening
      logger.info('Engine: Starting game state service...');
      await this.gameStateService.initialize(); // Assuming services have an initialize method
      this.gameStateService.startListening();

      // 6. Start Player State Service Listening
      logger.info('Engine: Starting player state service...');
      await this.playerStateService.initialize();
      this.playerStateService.startListening();

      // 7. Start Game Analytics Service Listening
      logger.info('Engine: Starting game analytics service...');
      await this.gameAnalyticsService.initialize();
      this.gameAnalyticsService.startListening();

      // 8. Start Trade Execution Service
      logger.info('Engine: Starting trade execution service...');
      await this.tradeExecutionService.initialize();
      this.tradeExecutionService.startListening();

      // Start RiskManagerService (before StrategyManager)
      logger.info('Engine: Initializing risk manager service...');
      await this.riskManagerService.initialize();
      logger.info('Engine: Starting risk manager service...');
      await this.riskManagerService.start();

      // --- Phase 3: Start StrategyManager and Strategies ---
      logger.info('Engine: Loading strategy configurations from config...');
      const strategyConfigs = getConfig('strategies', []);
      await this.strategyManager.loadStrategies(strategyConfigs);
      await this.strategyManager.initializeAll();
      await this.strategyManager.startAll();
      logger.info('Engine: All strategies loaded, initialized, and started.');

      logger.info('Bot engine started successfully.');
      this.eventBus.emit('engine:started', {
        eventTime: Date.now(), // Specific time of this engine event
        status: 'started',
        category: 'system_lifecycle',
        priority: 'high'
      });

    } catch (error) {
      logger.error('Engine: Fatal error during startup sequence:', error);
      await this.stop(); // Attempt graceful shutdown on startup error
      throw error; // Re-throw for external handling if necessary
    }
  }
  
  /**
   * Stop the bot engine and its core components gracefully.
   */
  async stop() {
    if (!this.state.running && !this.state.browserConnected && !webSocketClient.isConnected) {
      logger.warn('Engine already stopped or was not fully started.');
      return;
    }
    logger.info('Stopping bot engine...');
    
    // Stop RiskManagerService (before StrategyManager if strategies depend on it during stop)
    // Or after strategies if RiskManager needs to process their final states.
    // For now, stopping it before strategies seems reasonable as strategies might make last calls to it.
    logger.info('Engine: Stopping risk manager service...');
    if (this.riskManagerService) { // Check if it was initialized
        await this.riskManagerService.stop(); 
    }

    // Stop and Shutdown Strategies
    logger.info('Engine: Stopping all strategies...');
    await this.strategyManager.stopAll();
    logger.info('Engine: Shutting down all strategies...');
    await this.strategyManager.shutdownAll();

    // Stop Data Persistence Service (before other data source services if it writes their final states)
    // Or after, if it needs to log their shutdown events. Let's stop it relatively late but before DB-dependent services are fully gone.
    if (this.dataPersistenceService) {
        logger.info('Engine: Shutting down data persistence service...');
        await this.dataPersistenceService.shutdown();
    }

    // 1. Stop other services/strategies (Phase 2+) - Reverse order
    // Placeholder for future phases
    // logger.info('Engine: Stopping strategy...');
    // await this.stopStrategy();
    // logger.info('Engine: Stopping other services...');
    // await this.stopRegisteredServices();
    
    // 2. Stop Trade Execution Service (before player/game state services if it depends on them for final actions)
    logger.info('Engine: Stopping trade execution service...');
    this.tradeExecutionService.stopListening();

    // 3. Stop Game Analytics Service Listening
    logger.info('Engine: Stopping game analytics service...');
    this.gameAnalyticsService.stopListening();
    
    // 4. Stop Player State Service Listening
    logger.info('Engine: Stopping player state service...');
    this.playerStateService.stopListening();

    // 5. Stop Game State Service Listening
    logger.info('Engine: Stopping game state service...');
    this.gameStateService.stopListening();
    
    // 6. Stop Data Collection Service Listening
    logger.info('Engine: Stopping data collection service...');
    dataCollectionService.stopListening();

    // 7. Stop Protocol Adapter Listening
    logger.info('Engine: Stopping protocol adapter...');
    protocolAdapter.stopListening();
    
    // 8. Disconnect WebSocket Client (CDP)
    logger.info('Engine: Disconnecting WebSocket client...');
    await webSocketClient.disconnect();
    this.state.webSocketConnected = false; // Update state

    // 9. Disconnect from Browser (Puppeteer)
    logger.info('Engine: Disconnecting from browser...');
    await browserManager.disconnect();
    this.state.browserConnected = false; // Update state
    
    this.state.running = false;
    logger.info('Bot engine stopped successfully.');
    this.eventBus.emit('engine:stopped', {
      eventTime: Date.now(), // Specific time of this engine event
      status: 'stopped',
      category: 'system_lifecycle',
      priority: 'high'
    });
  }
  
  // --- Placeholder methods for future phases ---
  // async startRegisteredServices() { /* ... */ }
  // async stopRegisteredServices() { /* ... */ }
  // async startStrategy() { /* ... */ }
  // async stopStrategy() { /* ... */ }
  // registerService(name, service) { /* ... */ }
  // registerModule(name, module) { /* ... */ } // Less likely needed with singletons
  // setStrategy(strategy) { /* ... */ }
  // --------------------------------------------
}

module.exports = BotEngine; 