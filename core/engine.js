const EventBus = require('./events/event-bus');

/**
 * Core engine that orchestrates all components
 */
class BotEngine {
  constructor(config = {}) {
    this.config = config;
    this.modules = new Map();
    this.services = new Map();
    this.eventBus = new EventBus();
    this.state = {
      running: false,
      browser: null,
      page: null,
      gameState: null,
      currentStrategy: null
    };
  }
  
  /**
   * Register a module with the engine
   * @param {string} name - Module name
   * @param {Object} module - Module instance
   * @returns {BotEngine} - For chaining
   */
  registerModule(name, module) {
    if (this.modules.has(name)) {
      throw new Error(`Module ${name} already registered`);
    }
    this.modules.set(name, module);
    module.initialize(this);
    return this;
  }
  
  /**
   * Register a service with the engine
   * @param {string} name - Service name
   * @param {ServiceBase} service - Service instance
   * @returns {BotEngine} - For chaining
   */
  registerService(name, service) {
    if (this.services.has(name)) {
      throw new Error(`Service ${name} already registered`);
    }
    this.services.set(name, service);
    service.initialize(this);
    return this;
  }
  
  /**
   * Set the active trading strategy
   * @param {StrategyBase} strategy - Strategy instance
   * @returns {BotEngine} - For chaining
   */
  setStrategy(strategy) {
    // If we have a current strategy and it's running, stop it
    if (this.state.currentStrategy && this.state.currentStrategy.state.isActive) {
      this.state.currentStrategy.stop();
    }
    
    strategy.initialize(this);
    this.state.currentStrategy = strategy;
    return this;
  }
  
  /**
   * Start the bot engine
   */
  async start() {
    if (this.state.running) {
      console.warn('Engine already running');
      return;
    }
    
    // Set running state
    this.state.running = true;
    
    try {
      // 1. Initialize core modules
      console.log('Initializing browser module...');
      const browserManager = this.modules.get('browserManager');
      if (!browserManager) {
        throw new Error('Browser manager module not registered');
      }
      
      // 2. Connect to browser
      this.state.browser = await browserManager.connect();
      this.state.page = await browserManager.getPage();
      
      // 3. Start websocket handler
      console.log('Starting WebSocket handler...');
      const wsClient = this.modules.get('webSocketClient');
      if (!wsClient) {
        throw new Error('WebSocket client module not registered');
      }
      await wsClient.connect();
      
      // 4. Start all registered services
      console.log('Starting services...');
      for (const [name, service] of this.services.entries()) {
        console.log(`Starting service: ${name}`);
        await service.start();
      }
      
      // 5. Start strategy if one is set
      if (this.state.currentStrategy) {
        console.log('Starting strategy...');
        await this.state.currentStrategy.start();
      }
      
      console.log('Bot engine started successfully');
      this.eventBus.emit('engine:started', { timestamp: Date.now() });
    } catch (error) {
      console.error('Failed to start bot engine:', error);
      // Clean up whatever was started
      await this.stop();
      throw error;
    }
  }
  
  /**
   * Stop the bot engine
   */
  async stop() {
    if (!this.state.running) {
      console.warn('Engine not running');
      return;
    }
    
    this.state.running = false;
    console.log('Stopping bot engine...');
    
    try {
      // 1. Stop strategy
      if (this.state.currentStrategy) {
        await this.state.currentStrategy.stop();
      }
      
      // 2. Stop all services (in reverse order)
      const serviceEntries = [...this.services.entries()].reverse();
      for (const [name, service] of serviceEntries) {
        console.log(`Stopping service: ${name}`);
        await service.stop();
      }
      
      // 3. Disconnect WebSocket
      const wsClient = this.modules.get('webSocketClient');
      if (wsClient) {
        await wsClient.disconnect();
      }
      
      // 4. Close browser
      const browserManager = this.modules.get('browserManager');
      if (browserManager) {
        await browserManager.closeBrowser();
      }
      
      this.state.browser = null;
      this.state.page = null;
      
      console.log('Bot engine stopped successfully');
      this.eventBus.emit('engine:stopped', { timestamp: Date.now() });
    } catch (error) {
      console.error('Error stopping bot engine:', error);
      throw error;
    }
  }
}

module.exports = BotEngine; 