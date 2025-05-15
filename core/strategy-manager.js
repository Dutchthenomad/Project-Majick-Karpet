const logger = require('../utils/logger');
const path = require('path');
// const { getConfig } = require('../config/config-service'); // Not directly needed here, BotEngine will pass configs

/**
 * @class StrategyManager
 * @description Manages the lifecycle of trading strategies, including loading,
 *              initializing, starting, stopping, and shutting them down.
 */
class StrategyManager {
    /**
     * Constructor for StrategyManager.
     * @param {object} context - Shared context/dependencies to be passed to strategies.
     * @param {object} context.eventBus - The application's event bus.
     * @param {object} context.tradeExecutor - The TradeExecutionService instance.
     * @param {object} context.gameStateService - The GameStateService instance.
     * @param {object} context.playerStateService - The PlayerStateService instance.
     * @param {object} [context.logger=logger] - Logger instance.
     */
    constructor(context = {}) {
        this.context = context; // eventBus, tradeExecutor, gameStateService, playerStateService, logger
        this.logger = context.logger || logger;
        this.strategies = new Map(); // Stores strategy instances by their ID (e.g., "simBotUser1FixedTrader")

        this.logger.info('StrategyManager initialized.');
    }

    /**
     * Loads strategies based on an array of configurations.
     * Each strategy configuration object should define:
     *  - id: {string} A unique identifier for this strategy instance.
     *  - name: {string} The class name of the strategy (for logging/reference).
     *  - modulePath: {string} Path to the strategy's JS file (e.g., "./strategies/simple-fixed-tick-trader-strategy.js").
     *  - enabled: {boolean} Whether this strategy instance should be loaded.
     *  - config: {object} The specific configuration object for this strategy instance.
     *
     * @param {Array<object>} strategyConfigs - Array of strategy configuration objects.
     */
    async loadStrategies(strategyConfigs = []) {
        this.logger.info(`Attempting to load ${strategyConfigs.length} strategy configurations...`);
        for (const sc of strategyConfigs) {
            if (!sc.enabled) {
                this.logger.info(`Strategy '${sc.id}' (Class: ${sc.name}) is disabled in config. Skipping.`);
                continue;
            }

            if (!sc.id || !sc.modulePath || !sc.name) {
                this.logger.error(`Strategy config is missing required fields (id, modulePath, name). Skipping: ${JSON.stringify(sc)}`);
                continue;
            }

            if (this.strategies.has(sc.id)) {
                this.logger.warn(`Strategy with ID '${sc.id}' already loaded. Skipping duplicate configuration.`);
                continue;
            }

            try {
                // modulePath is expected to be relative to the project root, e.g., "strategies/my-strategy.js"
                // __dirname here is core/strategy-manager.js, so we need to go up one level then to the path.
                const absoluteModulePath = path.resolve(__dirname, '..', sc.modulePath);
                
                const StrategyClass = require(absoluteModulePath);
                
                const strategyInstance = new StrategyClass(sc.id, sc.config || {}, this.context);

                // Register strategy's risk configuration with RiskManagerService
                if (this.context.riskManagerService && typeof this.context.riskManagerService.registerStrategyRiskConfig === 'function') {
                    this.context.riskManagerService.registerStrategyRiskConfig(sc.id, strategyInstance.config.riskConfig || {});
                } else {
                    this.logger.warn(`RiskManagerService not available in context or method missing. Cannot register risk config for ${sc.id}.`);
                }

                this.strategies.set(sc.id, strategyInstance);
                this.logger.info(`Successfully loaded and instantiated strategy '${sc.id}' (Class: ${sc.name}) from ${absoluteModulePath}`);

            } catch (error) {
                this.logger.error(`Failed to load strategy '${sc.id}' (Class: ${sc.name}) from module '${sc.modulePath}': ${error.message}`, error);
                this.logger.error(`Full error stack for strategy ${sc.id}: ${error.stack}`);
            }
        }
        this.logger.info(`Finished loading strategies. ${this.strategies.size} strategies are now managed.`);
    }

    /**
     * Initializes all loaded strategies.
     */
    async initializeAll() {
        this.logger.info('Initializing all loaded strategies...');
        let initializedCount = 0;
        const strategiesToInitialize = Array.from(this.strategies.entries()); // Create a copy to iterate over, allowing modification of this.strategies

        for (const [id, strategy] of strategiesToInitialize) {
            try {
                this.logger.debug(`Validating configuration for strategy: ${id}`);
                const isValidConfig = await strategy.validateConfiguration();

                if (isValidConfig) {
                    this.logger.debug(`Configuration valid for ${id}. Initializing strategy...`);
                    await strategy.initialize();
                    this.logger.info(`Strategy '${id}' initialized successfully.`);
                    initializedCount++;
                } else {
                    this.logger.error(`Strategy '${id}' configuration is invalid. Skipping initialization.`);
                    // Optionally, remove from active strategies or mark as failed
                    // this.strategies.delete(id); 
                    // Or add a status to the strategy instance: strategy.status = 'config_invalid';
                }
            } catch (error) {
                this.logger.error(`Error during validation or initialization of strategy '${id}': ${error.message}`, error);
                // Also consider removing or marking as failed here
                // this.strategies.delete(id); 
            }
        }
        this.logger.info(`${initializedCount}/${this.strategies.size} strategies initialized successfully.`); // Note: this.strategies.size might be smaller if we delete invalid ones
    }

    /**
     * Starts all loaded and successfully initialized strategies.
     */
    async startAll() {
        this.logger.info('Starting all initialized strategies...');
        let count = 0;
        for (const [id, strategy] of this.strategies) {
            // TODO: Add a check here if strategy.isInitialized (or similar flag set by initialize())
            try {
                this.logger.debug(`Starting strategy: ${id}`);
                await strategy.start();
                this.logger.info(`Strategy '${id}' started successfully.`);
                count++;
            } catch (error) {
                this.logger.error(`Error starting strategy '${id}': ${error.message}`, error);
            }
        }
        this.logger.info(`${count}/${this.strategies.size} strategies started successfully.`);
    }

    /**
     * Stops all active strategies.
     */
    async stopAll() {
        this.logger.info('Stopping all active strategies...');
        for (const [id, strategy] of this.strategies) {
            try {
                this.logger.debug(`Stopping strategy: ${id}`);
                await strategy.stop();
                this.logger.info(`Strategy '${id}' stopped successfully.`);
            } catch (error) {
                this.logger.error(`Error stopping strategy '${id}': ${error.message}`, error);
            }
        }
        this.logger.info('All strategies processed for stopping.');
    }

    /**
     * Shuts down all strategies, allowing them to clean up resources.
     */
    async shutdownAll() {
        this.logger.info('Shutting down all strategies...');
        for (const [id, strategy] of this.strategies) {
            try {
                this.logger.debug(`Shutting down strategy: ${id}`);
                await strategy.shutdown();
                this.logger.info(`Strategy '${id}' shutdown successfully.`);
            } catch (error) {
                this.logger.error(`Error shutting down strategy '${id}': ${error.message}`, error);
            }
        }
        this.strategies.clear(); // Clear the map after all are shutdown
        this.logger.info('All strategies shut down and cleared from manager.');
    }

    /**
     * Retrieves a specific strategy instance by its ID.
     * @param {string} strategyId - The ID of the strategy to retrieve.
     * @returns {StrategyBase | undefined} The strategy instance or undefined if not found.
     */
    getStrategy(strategyId) {
        return this.strategies.get(strategyId);
    }
}

module.exports = StrategyManager; 