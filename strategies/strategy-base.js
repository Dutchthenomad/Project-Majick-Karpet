const logger = require('../utils/logger');
const eventBus = require('../core/events/event-bus');
// const { getConfig } = require('../config/config-service'); // Optional: if strategies need direct config

/**
 * @class StrategyBase
 * @description Base class for all trading strategies.
 *              Provides common functionality, event subscription management, 
 *              state isolation, and a defined lifecycle for strategy logic.
 */
class StrategyBase {
    /**
     * Constructor for StrategyBase.
     * @param {string} strategyId - A unique identifier for this strategy instance.
     * @param {object} config - Configuration options specific to this strategy instance.
     * @param {object} context - Context object providing access to shared services (e.g., logger, eventBus, tradeExecutor).
     * @param {object} context.logger - Logger instance.
     * @param {object} context.eventBus - EventBus instance.
     * @param {object} context.tradeExecutor - TradeExecutionService instance.
     * @param {object} [context.playerStateService] - PlayerStateService instance.
     * @param {object} [context.gameStateService] - GameStateService instance.
     */
    constructor(strategyId, config = {}, context = {}) {
        this.strategyId = strategyId || this.constructor.name;
        this.config = config;
        this.context = context; // Store the whole context object
        
        this.logger = context.logger || logger; // Use injected logger or global fallback
        this.eventBus = context.eventBus || eventBus; // Use injected eventBus or global fallback
        this.tradeExecutor = context.tradeExecutor || null; 
        // Optional services from context
        this.playerStateService = context.playerStateService || null;
        this.gameStateService = context.gameStateService || null;

        this._subscriptions = []; // For tracking event bus subscriptions
        this.gameStates = {};     // For game-specific state, indexed by gameId
        this.persistentState = {};// For state that persists across games for this strategy instance

        this.isActive = false; // Indicates if the strategy's main logic loop should run

        this.logger.info(`Strategy instance created: ${this.strategyId}`);
        this.logger.debug(`Strategy ${this.strategyId} initial config: ${JSON.stringify(config)}`);
    }

    /**
     * Initializes the strategy. Called once by the StrategyManager/BotEngine.
     * Subclasses should override this to perform setup tasks, load persistent state,
     * and subscribe to initial events.
     * @returns {Promise<void>}
     */
    async initialize() {
        this.logger.info(`Strategy initializing: ${this.strategyId}`);
        // Example: Load persistent state
        // this.persistentState = await this._loadPersistentState();
        
        // Subclasses will call this.subscribe() here for core game events.
        // Example:
        // this.subscribe('game:newGame', this.onNewGame);
        // this.subscribe('game:phaseChange', this.onPhaseChange);
        // ... etc.
    }

    /**
     * Starts the strategy's active operations.
     * Called by the StrategyManager/BotEngine after successful initialization.
     * @returns {Promise<void>}
     */
    async start() {
        this.logger.info(`Strategy starting: ${this.strategyId}`);
        this.isActive = true;
        // Optional: Logic when strategy becomes active (e.g., initial checks, etc.)
    }

    /**
     * Stops the strategy's active operations.
     * Called by the StrategyManager/BotEngine.
     * @returns {Promise<void>}
     */
    async stop() {
        this.logger.info(`Strategy stopping: ${this.strategyId}`);
        this.isActive = false;
        // Optional: Cancel pending actions, etc.
    }
    
    /**
     * Cleans up all resources used by the strategy, including event subscriptions.
     * Called by the StrategyManager/BotEngine during shutdown or when a strategy is unloaded.
     * @returns {Promise<void>}
     */
    async shutdown() {
        this.logger.info(`Strategy shutting down: ${this.strategyId}`);
        this.isActive = false; // Ensure it's marked inactive

        // Unsubscribe from all tracked event bus listeners
        this._subscriptions.forEach(sub => {
            this.eventBus.off(sub.eventName, sub.handler);
            this.logger.debug(`Strategy ${this.strategyId}: Unsubscribed from ${sub.eventName}`);
        });
        this._subscriptions = [];

        // Example: Save persistent state
        // await this._savePersistentState(this.persistentState);
        
        this.gameStates = {}; // Clear game-specific states
        this.logger.info(`Strategy shutdown complete: ${this.strategyId}`);
    }

    // --- Event Subscription Management ---

    /**
     * Helper method to subscribe to an event on the eventBus and track the subscription.
     * Ensures `this` context is correctly bound for the handler.
     * @param {string} eventName - The name of the event to subscribe to.
     * @param {Function} handler - The handler function.
     */
    subscribe(eventName, handler) {
        if (!this.eventBus) {
            this.logger.error(`Strategy ${this.strategyId}: EventBus not available, cannot subscribe to ${eventName}.`);
            return;
        }
        const boundHandler = handler.bind(this);
        this.eventBus.on(eventName, boundHandler);
        this._subscriptions.push({ eventName, handler: boundHandler });
        this.logger.debug(`Strategy ${this.strategyId}: Subscribed to ${eventName}`);
    }

    // --- State Management ---

    /**
     * Gets the state object for a specific game, creating it if it doesn't exist.
     * @param {string} gameId - The ID of the game.
     * @returns {object} The state object for the game.
     */
    getGameState(gameId) {
        if (!this.gameStates[gameId]) {
            this.logger.debug(`Strategy ${this.strategyId}: Initializing state for game ${gameId}.`);
            this.gameStates[gameId] = this._createInitialGameState(gameId);
        }
        return this.gameStates[gameId];
    }

    /**
     * Creates the initial state structure for a new game.
     * Subclasses MUST override this to define their game-specific state.
     * @param {string} gameId - The ID of the game for which to create state.
     * @returns {object} The initial state object for the game.
     * @protected
     */
    _createInitialGameState(gameId) {
        // Example, to be overridden by specific strategies:
        this.logger.warn(`Strategy ${this.strategyId}: _createInitialGameState not overridden. Game ${gameId} will have empty state.`);
        return {
            // strategySpecificField: null,
            // lastActionTick: -1,
        };
    }
    
    /**
     * Placeholder for loading persistent state. Subclasses can implement.
     * @returns {Promise<object>}
     * @protected
     */
    async _loadPersistentState() {
        this.logger.debug(`Strategy ${this.strategyId}: _loadPersistentState called (base implementation).`);
        return {};
    }

    /**
     * Placeholder for saving persistent state. Subclasses can implement.
     * @param {object} stateToSave - The state object to save.
     * @returns {Promise<void>}
     * @protected
     */
    async _savePersistentState(stateToSave) {
        this.logger.debug(`Strategy ${this.strategyId}: _savePersistentState called (base implementation) with state: ${JSON.stringify(stateToSave)}`);
    }

    // --- New Lifecycle Hooks for Enhanced Strategy Management ---

    /**
     * Validates the strategy's configuration.
     * Called by StrategyManager before initialize().
     * Subclasses should override this to perform specific validation.
     * @returns {Promise<boolean>} True if configuration is valid, false otherwise.
     */
    async validateConfiguration() {
        this.logger.debug(`Strategy ${this.strategyId}: validateConfiguration() called (base implementation). Returning true.`);
        // Example: Check if required config fields are present and have correct types.
        // if (!this.config.someRequiredParam) {
        //     this.logger.error(`Strategy ${this.strategyId}: Missing required configuration 'someRequiredParam'.`);
        //     return false;
        // }
        return true;
    }

    /**
     * Analyzes the strategy's performance at the end of a game.
     * Called by StrategyManager after onGameRugged().
     * Subclasses can use this to log detailed P&L, update persistentState, etc.
     * @param {string} gameId - The ID of the game that just ended.
     * @param {object} gameData - The final game data (e.g., from onGameRugged parameters).
     * @param {object} playerGameState - The strategy's state for this player in this game from PlayerStateService.
     * @returns {Promise<void>}
     */
    async analyzePerformance(gameId, gameData, playerGameState) {
        this.logger.debug(`Strategy ${this.strategyId}: analyzePerformance() called for game ${gameId} (base implementation).`);
        // Example: Calculate and log detailed P&L, update win/loss counters in persistentState.
    }

    /**
     * Allows the strategy to adjust its parameters, potentially based on performance or market conditions.
     * Called by StrategyManager periodically or on specific triggers (not yet defined how often).
     * Subclasses can implement logic to self-optimize or adapt.
     * @returns {Promise<void>}
     */
    async adjustParameters() {
        this.logger.debug(`Strategy ${this.strategyId}: adjustParameters() called (base implementation).`);
        // Example: Modify this.config based on recent performance or external factors.
        // This would require persistentState to track performance over time.
    }

    // --- Lifecycle Hooks (to be overridden by subclasses) ---

    /**
     * Called when a new game starts.
     * Subclasses overriding this and subscribing to 'game:newGame' should expect a payload object.
     * @param {object} payload - The event payload from EventBus for 'game:newGame'.
     * @param {string} payload.gameId - The ID of the new game.
     * @param {object} payload.initialState - The initial full state of the new game.
     * @param {number} payload.gameTimestamp - Timestamp of the game event.
     * @returns {Promise<void>}
     */
    async onNewGame(payload) {
        this.logger.debug(`Strategy ${this.strategyId}: onNewGame hook triggered for game ${payload.gameId}.`);
        // Example access: const { gameId, initialState, gameTimestamp } = payload;
        // const gameState = this.getGameState(gameId); 
    }

    /**
     * Called when the game phase changes.
     * Subclasses overriding this and subscribing to 'game:phaseChange' should expect a payload object.
     * @param {object} payload - The event payload from EventBus for 'game:phaseChange'.
     * @param {string} payload.gameId - The ID of the game.
     * @param {string} payload.currentPhase - The new phase of the game.
     * @param {string} payload.previousPhase - The previous phase of the game.
     * @param {object} payload.data - Full game state data at phase change, including tickCount.
     * @param {number} payload.gameTimestamp - Timestamp of the game event.
     * @returns {Promise<void>}
     */
    async onPhaseChange(payload) {
        this.logger.debug(`Strategy ${this.strategyId}: onPhaseChange hook for game ${payload.gameId}: ${payload.previousPhase} -> ${payload.currentPhase} at tick ${payload.data.tickCount}.`);
        // Example access: const { gameId, currentPhase, previousPhase, data, gameTimestamp } = payload;
        // const gameState = this.getGameState(gameId);
        // gameState.currentPhase = currentPhase; 
    }

    /**
     * Called on every price update during the 'active' game phase.
     * Subclasses overriding this and subscribing to 'game:priceUpdate' should expect a payload object.
     * @param {object} payload - The event payload from EventBus for 'game:priceUpdate'.
     * @param {string} payload.gameId - The ID of the game.
     * @param {number} payload.price - The current price.
     * @param {number} payload.tickCount - The current tick count.
     * @param {number} payload.gameTimestamp - Timestamp of the game event.
     * @returns {Promise<void>}
     */
    async onPriceUpdate(payload) {
        // This can be very frequent. Subclasses should be efficient.
        // this.logger.silly(`Strategy ${this.strategyId}: onPriceUpdate hook for game ${payload.gameId}: Price ${payload.price}, Tick ${payload.tickCount}.`);
        // Example access: const { gameId, price, tickCount, gameTimestamp } = payload;
        // const gameState = this.getGameState(gameId);
    }
    
    /**
     * Called when a new candle is formed.
     * Subclasses overriding this and subscribing to 'game:newCandle' should expect a payload object.
     * @param {object} payload - The event payload from EventBus for 'game:newCandle'.
     * @param {string} payload.gameId - The ID of the game.
     * @param {object} payload.candle - The new candle object.
     * @param {number} payload.gameTimestamp - Timestamp of the game event.
     * @returns {Promise<void>}
     */
    async onNewCandle(payload) {
        this.logger.debug(`Strategy ${this.strategyId}: onNewCandle hook for game ${payload.gameId}: Candle Index ${payload.candle.index}.`);
        // Example access: const { gameId, candle, gameTimestamp } = payload;
        // const gameState = this.getGameState(gameId);
    }

    /**
     * Called when the game has rugged (ended).
     * Subclasses overriding this and subscribing to 'game:rugged' should expect a payload object.
     * Responsible for any final actions and cleaning up game-specific state.
     * @param {object} payload - The event payload from EventBus for 'game:rugged'.
     * @param {string} payload.gameId - The ID of the rugged game.
     * @param {number} payload.finalPrice - The final price/multiplier at rug.
     * @param {number} payload.tickCount - The tick count at rug.
     * @param {object} payload.data - Full game state data at rug.
     * @param {number} payload.gameTimestamp - Timestamp of the game event.
     * @returns {Promise<void>}
     */
    async onGameRugged(payload) {
        this.logger.info(`Strategy ${this.strategyId}: onGameRugged hook for game ${payload.gameId}. Final price: ${payload.finalPrice}, Tick: ${payload.tickCount}.`);
        // Example access: const { gameId, finalPrice, tickCount, data, gameTimestamp } = payload;
        // const gameState = this.getGameState(gameId);
        // Perform any P&L calculation or final logging for this game.

        // Clean up state for this specific game
        if (this.gameStates[payload.gameId]) {
            this.logger.debug(`Strategy ${this.strategyId}: Removing state for ended game ${payload.gameId}.`);
            delete this.gameStates[payload.gameId];
        }
    }

    // --- Helper Methods (Examples, subclasses can add more) ---

    /**
     * Example helper to request a buy order.
     * @param {string} gameId - The ID of the game for the buy.
     * @param {number} amountToSpend - The amount of SOL to spend.
     * @param {string} [reason=''] - Optional reason for logging.
     * @returns {Promise<object|null>} Simulation result or null if tradeExecutor not available/inactive.
     */
    async executeBuy(gameId, amountToSpend, reason = '') {
        if (!this.tradeExecutor) {
            this.logger.error(`Strategy ${this.strategyId}: TradeExecutor not available. Cannot executeBuy.`);
            return { success: false, reason: 'TradeExecutor not available' };
        }
        if (!this.isActive) {
            this.logger.warn(`Strategy ${this.strategyId}: Attempted buy while inactive.`);
            return { success: false, reason: 'Strategy inactive' };
        }

        // Pre-trade Risk Check
        this.logger.debug(`Strategy ${this.strategyId}: executeBuy - About to perform risk check. RiskManager available: ${!!(this.context && this.context.riskManagerService)}, GameStateService available: ${!!(this.context && this.context.gameStateService)}`);
        if (this.context && this.context.riskManagerService && this.context.gameStateService) {
            const currentFullGameState = this.context.gameStateService.getCurrentState();
            this.logger.debug(`Strategy ${this.strategyId}: executeBuy - currentFullGameState: ${JSON.stringify(currentFullGameState ? { price: currentFullGameState.price, gameId: currentFullGameState.gameId, phase: this.context.gameStateService.getCurrentPhase()} : null)}`);

            if (!currentFullGameState || currentFullGameState.price === undefined) {
                this.logger.error(`Strategy ${this.strategyId}: Cannot perform risk check, current game state or price is unavailable.`);
                return { success: false, reason: 'Risk check failed: Game state/price unavailable' };
            }

            const tradeParams = {
                type: 'buy',
                amountToSpendOrEvaluatedValue: amountToSpend,
                currency: 'SOL', // Assuming SOL for buys, adjust if other currencies are used for spending
                currentPrice: currentFullGameState.price // Pass current price for context if needed by more advanced risk rules
            };
            this.logger.debug(`Strategy ${this.strategyId}: executeBuy - Constructed tradeParams for risk check: ${JSON.stringify(tradeParams)}`);

            try {
                const riskCheckResult = await this.context.riskManagerService.checkTradeRisk(
                    this.strategyId,
                    tradeParams,
                    currentFullGameState
                );
                this.logger.debug(`Strategy ${this.strategyId}: executeBuy - Risk check result: ${JSON.stringify(riskCheckResult)}`);

                if (!riskCheckResult.isApproved) {
                    this.logger.warn(`Strategy ${this.strategyId}: BUY trade rejected by RiskManager for game ${gameId}. Reason: ${riskCheckResult.reason}`);
                    return { success: false, reason: `RiskManager: ${riskCheckResult.reason}` };
                }
                this.logger.debug(`Strategy ${this.strategyId}: BUY trade risk check approved for game ${gameId}.`);
            } catch (riskError) {
                this.logger.error(`Strategy ${this.strategyId}: Error during risk check for BUY: ${riskError.message}`, riskError);
                return { success: false, reason: `Risk check error: ${riskError.message}` };
            }
        } else {
            this.logger.warn(`Strategy ${this.strategyId}: RiskManagerService or GameStateService not available in context. Skipping risk check for BUY.`);
        }

        this.logger.info(`Strategy ${this.strategyId} (Game: ${gameId}): Requesting BUY: ${amountToSpend} SOL. Reason: ${reason}`);
        try {
            // Assuming tradeExecutor.simulateBuy takes an object. Adjust if different.
            return await this.tradeExecutor.simulateBuy({
                playerId: this.strategyId, // Or a dedicated bot ID managed by the strategy
                currency: 'SOL',
                amountToSpend: amountToSpend,
                strategyName: this.strategyId, // Pass strategyId as strategyName
                gameId: gameId // If your simulateBuy needs gameId explicitly
            });
        } catch (error) {
            this.logger.error(`Strategy ${this.strategyId} (Game: ${gameId}): Error executing buy: ${error.message}`, error);
            return { success: false, reason: error.message, error };
        }
    }

    /**
     * Example helper to request a sell order by percentage.
     * @param {string} gameId - The ID of the game for the sell.
     * @param {number} percentageToSell - The percentage of holdings to sell (0-100).
     * @param {string} [reason=''] - Optional reason for logging.
     * @returns {Promise<object|null>} Simulation result or null if tradeExecutor not available/inactive.
     */
    async executeSellByPercentage(gameId, percentageToSell, reason = '') {
        if (!this.tradeExecutor) {
            this.logger.error(`Strategy ${this.strategyId}: TradeExecutor not available. Cannot executeSell.`);
            return { success: false, reason: 'TradeExecutor not available' };
        }
        if (!this.isActive) {
            this.logger.warn(`Strategy ${this.strategyId}: Attempted sell while inactive.`);
            return { success: false, reason: 'Strategy inactive' };
        }
        if (percentageToSell <= 0 || percentageToSell > 100) {
            this.logger.warn(`Strategy ${this.strategyId}: Invalid sell percentage: ${percentageToSell}. Must be > 0 and <= 100.`);
            return { success: false, reason: 'Invalid sell percentage' };
        }

        // Pre-trade Risk Check
        this.logger.debug(`Strategy ${this.strategyId}: executeSellByPercentage - About to perform risk check. RiskManager available: ${!!(this.context && this.context.riskManagerService)}, GameStateService available: ${!!(this.context && this.context.gameStateService)}, PlayerStateService available: ${!!(this.context && this.context.playerStateService)}`);
        if (this.context && this.context.riskManagerService && this.context.gameStateService && this.context.playerStateService) {
            const currentFullGameState = this.context.gameStateService.getCurrentState();
            const playerState = this.context.playerStateService.getPlayerState(gameId, this.strategyId);
            this.logger.debug(`Strategy ${this.strategyId}: executeSellByPercentage - currentFullGameState: ${JSON.stringify(currentFullGameState ? { price: currentFullGameState.price, gameId: currentFullGameState.gameId, phase: this.context.gameStateService.getCurrentPhase()} : null)}`);
            this.logger.debug(`Strategy ${this.strategyId}: executeSellByPercentage - playerState (SOL balance): ${JSON.stringify(playerState && playerState.sol ? playerState.sol.tokenBalance : 'Player state or SOL balance unavailable')}`);

            if (!currentFullGameState || currentFullGameState.price === undefined) {
                this.logger.error(`Strategy ${this.strategyId}: Cannot perform risk check for SELL, current game state or price is unavailable.`);
                return { success: false, reason: 'Risk check failed: Game state/price unavailable' };
            }
            if (!playerState || !playerState.sol || playerState.sol.tokenBalance === undefined) {
                this.logger.error(`Strategy ${this.strategyId}: Cannot perform risk check for SELL, player token balance is unavailable for ${this.strategyId} in game ${gameId}. PlayerState: ${JSON.stringify(playerState)}`);
                return { success: false, reason: 'Risk check failed: Player balance unavailable' };
            }

            const currentPrice = currentFullGameState.price;
            const tokenBalance = playerState.sol.tokenBalance;
            const tokenAmountToSell = tokenBalance * (percentageToSell / 100);
            const evaluatedSellValueSOL = tokenAmountToSell * currentPrice;

            if (tokenAmountToSell <= 0) {
                this.logger.info(`Strategy ${this.strategyId}: No tokens to sell for game ${gameId} based on percentage ${percentageToSell}% of balance ${tokenBalance}. Skipping sell and risk check.`);
                return { success: false, reason: 'No tokens to sell' , tokensSold: 0, proceeds: 0 }; // Or a specific non-error status
            }

            const tradeParams = {
                type: 'sell',
                amountToSpendOrEvaluatedValue: evaluatedSellValueSOL,
                currency: 'SOL', 
                tokenAmountToSell: tokenAmountToSell, 
                currentPrice: currentPrice
            };
            this.logger.debug(`Strategy ${this.strategyId}: executeSellByPercentage - Constructed tradeParams for risk check: ${JSON.stringify(tradeParams)}`);

            try {
                const riskCheckResult = await this.context.riskManagerService.checkTradeRisk(
                    this.strategyId,
                    tradeParams,
                    currentFullGameState
                );
                this.logger.debug(`Strategy ${this.strategyId}: executeSellByPercentage - Risk check result: ${JSON.stringify(riskCheckResult)}`);

                if (!riskCheckResult.isApproved) {
                    this.logger.warn(`Strategy ${this.strategyId}: SELL trade rejected by RiskManager for game ${gameId}. Reason: ${riskCheckResult.reason}`);
                    return { success: false, reason: `RiskManager: ${riskCheckResult.reason}` };
                }
                this.logger.debug(`Strategy ${this.strategyId}: SELL trade risk check approved for game ${gameId}.`);
            } catch (riskError) {
                this.logger.error(`Strategy ${this.strategyId}: Error during risk check for SELL: ${riskError.message}`, riskError);
                return { success: false, reason: `Risk check error: ${riskError.message}` };
            }
        } else {
            this.logger.warn(`Strategy ${this.strategyId}: RiskManagerService, GameStateService, or PlayerStateService not available in context. Skipping risk check for SELL.`);
        }

        this.logger.info(`Strategy ${this.strategyId} (Game: ${gameId}): Requesting SELL: ${percentageToSell}%. Reason: ${reason}`);
        try {
            // Assuming tradeExecutor.simulateSellByPercentage takes an object.
            return await this.tradeExecutor.simulateSellByPercentage({
                playerId: this.strategyId, // Or a dedicated bot ID
                currency: 'SOL', // Assuming SOL-based tokens
                percentageToSell: percentageToSell,
                strategyName: this.strategyId,
                gameId: gameId // If needed
            });
        } catch (error) {
            this.logger.error(`Strategy ${this.strategyId} (Game: ${gameId}): Error executing sell: ${error.message}`, error);
            return { success: false, reason: error.message, error };
        }
    }
}

module.exports = StrategyBase; 