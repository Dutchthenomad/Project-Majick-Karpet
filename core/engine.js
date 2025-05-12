const EventBus = require('./events/event-bus');
const logger = require('../utils/logger'); // Assuming logger is in utils

// Import Phase 1 Modules (Singletons)
const browserManager = require('./browser/browser');
const webSocketClient = require('./communication/websocket');
const protocolAdapter = require('./communication/protocol');
const dataCollectionService = require('./services/data-collection-service');

/**
 * Core engine that orchestrates all components
 */
class BotEngine {
  constructor(config = {}) {
    this.config = config;
    // We are using singleton imports directly for now, 
    // but a more robust system might involve explicit registration.
    this.eventBus = EventBus; // Use the imported singleton
    this.state = {
      running: false,
      browserConnected: false,
      webSocketConnected: false,
      // We might add more detailed state from modules later
    };
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
      // WebSocketClient connect now handles its own retries if browser/page aren't ready
      await webSocketClient.connect(); 
      // We can listen to 'websocket:connected' event for confirmation if needed
      // For now, we proceed assuming it will connect or retry.
      
      // 3. Start Protocol Adapter Listening
      logger.info('Engine: Starting protocol adapter...');
      protocolAdapter.startListening();

      // 4. Start Data Collection Service Listening
      logger.info('Engine: Starting data collection service...');
      dataCollectionService.startListening();

      // 5. Start other services/strategies (Phase 2+)
      // Placeholder for future phases
      // logger.info('Engine: Starting other services...');
      // await this.startRegisteredServices();
      // logger.info('Engine: Starting strategy...');
      // await this.startStrategy();

      logger.info('Bot engine started successfully.');
      this.eventBus.emit('engine:started', { timestamp: Date.now() });

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
    
    // 1. Stop other services/strategies (Phase 2+) - Reverse order
    // Placeholder for future phases
    // logger.info('Engine: Stopping strategy...');
    // await this.stopStrategy();
    // logger.info('Engine: Stopping other services...');
    // await this.stopRegisteredServices();
    
    // 2. Stop Data Collection Service Listening
    logger.info('Engine: Stopping data collection service...');
    dataCollectionService.stopListening();

    // 3. Stop Protocol Adapter Listening
    logger.info('Engine: Stopping protocol adapter...');
    protocolAdapter.stopListening();
    
    // 4. Disconnect WebSocket Client (CDP)
    logger.info('Engine: Disconnecting WebSocket client...');
    await webSocketClient.disconnect();
    this.state.webSocketConnected = false; // Update state

    // 5. Disconnect from Browser (Puppeteer)
    logger.info('Engine: Disconnecting from browser...');
    await browserManager.disconnect();
    this.state.browserConnected = false; // Update state
    
    this.state.running = false;
    logger.info('Bot engine stopped successfully.');
    this.eventBus.emit('engine:stopped', { timestamp: Date.now() });
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