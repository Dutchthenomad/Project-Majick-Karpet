const logger = require('../utils/logger');
const eventBus = require('../core/events/event-bus');
// const { getConfig } = require('../config/config-service'); // Optional: if strategies need direct config

/**
 * @class StrategyBase
 * @description Base class for all trading strategies.
 *              Provides common functionality like logging, event bus access,
 *              and placeholders for strategy logic and lifecycle.
 */
class StrategyBase {
    /**
     * Constructor for StrategyBase.
     * @param {string} strategyName - The name of the strategy (for logging).
     * @param {object} options - Configuration options specific to this strategy instance.
     * @param {object} [dependencies={}] - Dependencies like logger and eventBus.
     * @param {object} [dependencies.logger=logger] - Logger instance.
     * @param {object} [dependencies.eventBus=eventBus] - EventBus instance.
     * @param {object} [dependencies.tradeExecutor=null] - Instance of TradeExecutionService (to be passed later).
     */
    constructor(strategyName, options = {}, dependencies = {}) {
        this.strategyName = strategyName || this.constructor.name;
        this.options = options; // Strategy-specific parameters (e.g., buy threshold)
        this.logger = dependencies.logger || logger;
        this.eventBus = dependencies.eventBus || eventBus;
        this.tradeExecutor = dependencies.tradeExecutor || null; // Will be injected by BotEngine

        this.isActive = false;

        this.logger.info(`Strategy initializing: ${this.strategyName}`);
        this.logger.debug(`${this.strategyName} options: ${JSON.stringify(options)}`);

        this.setupEventListeners();
    }

    /**
     * Set up listeners for relevant events from the EventBus.
     * Subclasses should override or extend this.
     */
    setupEventListeners() {
        this.logger.debug(`${this.strategyName}: Setting up event listeners.`);
        // Example: Listen for game state updates
        // this.eventBus.on('game:stateUpdate', this.onGameStateUpdate.bind(this));
        // this.eventBus.on('analytics:tradeSignal', this.onTradeSignal.bind(this));
    }

    /**
     * Logic to handle game state updates.
     * Subclasses implement this based on their needs.
     * @param {object} gameState - The current game state object.
     */
    onGameStateUpdate(gameState) {
        // Subclasses implement their logic here
        // this.logger.debug(`${this.strategyName} received game state: ${JSON.stringify(gameState)}`);
        if (!this.isActive) return;
        // ... decision logic ...
    }

    /**
     * Logic to handle signals from the analytics service.
     * Subclasses implement this based on their needs.
     * @param {object} signal - The trade signal object.
     */
     onTradeSignal(signal) {
        // Subclasses implement their logic here
        if (!this.isActive) return;
        // ... decision logic based on signal ...
     }

    /**
     * Starts the strategy.
     * Called by the BotEngine.
     */
    async start() {
        this.logger.info(`Strategy starting: ${this.strategyName}`);
        this.isActive = true;
        // Optional: Any logic needed when strategy becomes active
    }

    /**
     * Stops the strategy.
     * Called by the BotEngine.
     */
    async stop() {
        this.logger.info(`Strategy stopping: ${this.strategyName}`);
        this.isActive = false;
        // Optional: Clean up resources, cancel pending actions
        // this.removeAllListeners(); // Example cleanup
    }

    /**
     * Cleans up event listeners.
     * Helper method, might be called during stop().
     */
    removeAllListeners() {
        this.logger.debug(`${this.strategyName}: Removing event listeners.`);
        // Example: Remove specific listeners added in setupEventListeners
        // this.eventBus.off('game:stateUpdate', this.onGameStateUpdate.bind(this));
        // this.eventBus.off('analytics:tradeSignal', this.onTradeSignal.bind(this));
    }

    /**
     * Helper to request a buy order via the TradeExecutionService.
     * @param {number} amount - The amount to buy.
     * @param {string} [reason=''] - Optional reason for logging.
     */
    async executeBuy(amount, reason = '') {
        if (!this.tradeExecutor) {
            this.logger.error(`${this.strategyName}: TradeExecutor not available.`);
            return;
        }
        if (!this.isActive) {
            this.logger.warn(`${this.strategyName}: Attempted buy while inactive.`);
            return;
        }
        this.logger.info(`${this.strategyName}: Requesting BUY: ${amount}. Reason: ${reason}`);
        try {
            await this.tradeExecutor.executeBuy(amount, this.strategyName);
        } catch (error) {
            this.logger.error(`${this.strategyName}: Error executing buy: ${error.message}`, error);
        }
    }

    /**
     * Helper to request a sell order via the TradeExecutionService.
     * @param {number} percentage - The percentage of holdings to sell (0-100).
     * @param {string} [reason=''] - Optional reason for logging.
     */
    async executeSell(percentage, reason = '') {
        if (!this.tradeExecutor) {
            this.logger.error(`${this.strategyName}: TradeExecutor not available.`);
            return;
        }
        if (!this.isActive) {
            this.logger.warn(`${this.strategyName}: Attempted sell while inactive.`);
            return;
        }
        this.logger.info(`${this.strategyName}: Requesting SELL: ${percentage}%. Reason: ${reason}`);
        try {
            await this.tradeExecutor.executeSell(percentage, this.strategyName);
        } catch (error) {
            this.logger.error(`${this.strategyName}: Error executing sell: ${error.message}`, error);
        }
    }
}

module.exports = StrategyBase; 