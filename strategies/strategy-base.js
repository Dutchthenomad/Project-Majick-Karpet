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
        this.logger.debug(`Strategy ${this.strategyId}: _createInitialGameState for game ${gameId}.`);
        return {
            gameId: gameId, // For convenience if needed within state object itself
            // strategySpecificField: null,
            // lastActionTick: -1,
            tradesAttempted: 0,
            tradesExecuted: 0,
            tradesRejectedByRisk: 0,
            // Strategy-specific state fields would go here
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
        const gameId = payload.gameId;
        this.logger.info(`Strategy ${this.strategyId}: onGameRugged hook for game ${gameId}. Final price: ${payload.finalPrice}, Tick: ${payload.tickCount}.`);
        
        const gameSpecificState = this.getGameState(gameId);
        this.logger.info(`Strategy ${this.strategyId}: gameSpecificState for ${gameId} in onGameRugged:`, gameSpecificState);

        const playerGameState = this.context.playerStateService ? this.context.playerStateService.getPlayerState(gameId, this.strategyId) : null;
        this.logger.info(`Strategy ${this.strategyId}: playerGameState for ${gameId} in onGameRugged:`, playerGameState);

        let reportData = {
            strategyId: this.strategyId,
            gameId: gameId,
            tradesAttempted: gameSpecificState?.tradesAttempted || 0,
            tradesExecuted: gameSpecificState?.tradesExecuted || 0,
            tradesRejectedByRisk: gameSpecificState?.tradesRejectedByRisk || 0,
            totalSpentSOL: 0,
            totalReceivedSOL: 0,
            realizedPnLSOL: 0,
            // endExposureSOL: null, // Deferred for now or get from RiskManager if feasible
            endStatus: 'completed_game' // Or more detailed status if available
        };

        if (playerGameState && playerGameState.sol) {
            reportData.totalSpentSOL = playerGameState.sol.totalSolInvested || 0;
            reportData.totalReceivedSOL = playerGameState.sol.totalSolReturned || 0;
            reportData.realizedPnLSOL = playerGameState.sol.realizedPlSol || 0;
        }

        this.logger.info(`Strategy ${this.strategyId}: PREPARING to emit gamePerformanceReport for game ${gameId}. Report Data:`, reportData);
        this.eventBus.emit('strategy:gamePerformanceReport', {
            performanceReport: reportData,
            category: 'strategy_metrics',
            priority: 'normal'
        });
        this.logger.info(`Strategy ${this.strategyId}: Emitted gamePerformanceReport for game ${gameId}.`, reportData);

        // Clean up state for this specific game (already handled by super if called, or manage here)
        if (this.gameStates[gameId]) {
            this.logger.debug(`Strategy ${this.strategyId}: Removing state for ended game ${gameId}.`);
            delete this.gameStates[gameId];
        }
    }

    // --- Helper Methods (Examples, subclasses can add more) ---

    /**
     * Example helper to request a buy order.
     * @param {string} gameId - The ID of the game for the buy.
     * @param {number} amountToSpend - The amount of SOL to spend.
     * @param {string} [reason=''] - Optional reason for logging.
     * @param {object} [options={}] - Optional parameters for execution.
     * @param {number} [options.executionPrice] - Specific price to attempt execution at.
     * @returns {Promise<object|null>} Simulation result or null if tradeExecutor not available/inactive.
     */
    async executeBuy(gameId, amountToSpend, reason = '', options = {}) {
        const gameSpecificState = this.getGameState(gameId);
        gameSpecificState.tradesAttempted++;

        if (!this.tradeExecutor) {
            this.logger.error(`Strategy ${this.strategyId}: TradeExecutor not available. Cannot executeBuy.`);
            return { success: false, reason: 'TradeExecutor not available' };
        }
        if (!this.isActive) {
            this.logger.warn(`Strategy ${this.strategyId}: Attempted buy while inactive.`);
            return { success: false, reason: 'Strategy inactive' };
        }

        // Fetch current game state reliably for both risk check and trade execution params
        const currentFullGameState = this.context.gameStateService ? this.context.gameStateService.getCurrentState() : null;

        // Determine the price to use: passed executionPrice, or current game state price
        const priceForExecution = options.executionPrice !== undefined && options.executionPrice !== null 
                                  ? options.executionPrice 
                                  : currentFullGameState?.price;

        // Pre-trade Risk Check
        this.logger.debug(`Strategy ${this.strategyId}: executeBuy - About to perform risk check. RiskManager available: ${!!(this.context && this.context.riskManagerService)}, GameStateService available: ${!!(this.context && this.context.gameStateService)}`);
        if (this.context && this.context.riskManagerService && this.context.gameStateService) {
            this.logger.debug(`Strategy ${this.strategyId}: executeBuy - currentFullGameState for risk check: ${JSON.stringify(currentFullGameState ? { price: currentFullGameState.price, gameId: currentFullGameState.gameId, phase: this.context.gameStateService.getCurrentPhase()} : null)}`);

            if (!currentFullGameState || priceForExecution === undefined || priceForExecution === null) {
                this.logger.error(`Strategy ${this.strategyId}: Cannot perform risk check for BUY, current game state or priceForExecution is unavailable. Price for exec: ${priceForExecution}`);
                return { success: false, reason: 'Risk check failed: Game state/price unavailable' };
            }

            const tradeParams = {
                type: 'buy',
                amountToSpendOrEvaluatedValue: amountToSpend,
                currency: 'SOL', // Assuming SOL for buys, adjust if other currencies are used for spending
                currentPrice: priceForExecution // Use priceForExecution for risk check context
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
                    gameSpecificState.tradesRejectedByRisk++;
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
            const tradeResult = await this.tradeExecutor.simulateBuy({
                playerId: this.strategyId, 
                currency: 'SOL',
                amountToSpend: amountToSpend,
                strategyName: this.strategyId, 
                gameId: gameId, 
                price: priceForExecution, // Pass priceForExecution to trade executor
                tickCount: currentFullGameState?.tickCount 
            });
            if (tradeResult && tradeResult.success) {
                gameSpecificState.tradesExecuted++;
            }
            return tradeResult;
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
        const gameSpecificState = this.getGameState(gameId);
        gameSpecificState.tradesAttempted++;

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
        
        const currentFullGameState = this.context.gameStateService ? this.context.gameStateService.getCurrentState() : null;
        const playerState = this.context.playerStateService ? this.context.playerStateService.getPlayerState(gameId, this.strategyId) : null;

        if (!playerState || !playerState.sol || playerState.sol.tokenBalance === undefined) {
            this.logger.error(`Strategy ${this.strategyId}: Player token balance is unavailable for ${this.strategyId} in game ${gameId} for sell. PlayerState: ${JSON.stringify(playerState)}`);
            // This error now happens BEFORE the risk check if player state is not available, making the other error moot.
            return { success: false, reason: 'Player balance unavailable for sell operation' }; 
        }

        const tokenBalance = playerState.sol.tokenBalance;
        const tokenAmountToSell = tokenBalance * (percentageToSell / 100);
        this.logger.info(`Strategy ${this.strategyId}: Calculated tokenAmountToSell: ${tokenAmountToSell} (from balance: ${tokenBalance}, %: ${percentageToSell})`);

        if (tokenAmountToSell <= 0.00000001) { // Epsilon for very small balances
            this.logger.info(`Strategy ${this.strategyId}: No tokens to sell for game ${gameId} based on percentage ${percentageToSell}% of balance ${tokenBalance.toFixed(8)}. Calculated amount: ${tokenAmountToSell.toFixed(8)}.`);
            return { success: false, reason: 'No tokens to sell or amount too small', tokensSold: 0, proceeds: 0 };
        }

        // Pre-trade Risk Check
        this.logger.debug(`Strategy ${this.strategyId}: executeSellByPercentage - About to perform risk check.`);
        if (this.context && this.context.riskManagerService && this.context.gameStateService) {
            this.logger.debug(`Strategy ${this.strategyId}: executeSellByPercentage - currentFullGameState for risk check: ${JSON.stringify(currentFullGameState ? { price: currentFullGameState.price, gameId: currentFullGameState.gameId, phase: this.context.gameStateService.getCurrentPhase()} : null)}`);

            if (!currentFullGameState || currentFullGameState.price === undefined) {
                this.logger.error(`Strategy ${this.strategyId}: Cannot perform risk check for SELL, current game state or price is unavailable.`);
                gameSpecificState.tradesRejectedByRisk++; // Still count as attempt and rejection
                return { success: false, reason: 'Risk check failed: Game state/price unavailable' };
            }
            
            const currentPrice = currentFullGameState.price;
            const evaluatedSellValueSOL = tokenAmountToSell * currentPrice;

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
                    gameSpecificState.tradesRejectedByRisk++;
                    return { success: false, reason: `RiskManager: ${riskCheckResult.reason}` };
                }
                this.logger.debug(`Strategy ${this.strategyId}: SELL trade risk check approved for game ${gameId}.`);
            } catch (riskError) {
                this.logger.error(`Strategy ${this.strategyId}: Error during risk check for SELL: ${riskError.message}`, riskError);
                gameSpecificState.tradesRejectedByRisk++; // Count as attempt and rejection
                return { success: false, reason: `Risk check error: ${riskError.message}` };
            }
        } else {
            this.logger.warn(`Strategy ${this.strategyId}: RiskManagerService, GameStateService, or PlayerStateService not available in context. Skipping risk check for SELL.`);
        }

        this.logger.info(`Strategy ${this.strategyId} (Game: ${gameId}): Requesting SELL: ${percentageToSell}% (${tokenAmountToSell.toFixed(8)} tokens). Reason: ${reason}`);
        try {
            const tradeResult = await this.tradeExecutor.simulateSellByPercentage({
                playerId: this.strategyId, 
                currency: 'SOL', 
                percentageToSell: percentageToSell,
                tokenAmountToSell: tokenAmountToSell, // Pass the calculated tokenAmountToSell
                price: currentFullGameState?.price, // Pass current price to mock executor
                strategyName: this.strategyId,
                gameId: gameId, 
                tickCount: currentFullGameState?.tickCount 
            });
            if (tradeResult && tradeResult.success) {
                gameSpecificState.tradesExecuted++;
            }
            return tradeResult;
        } catch (error) {
            this.logger.error(`Strategy ${this.strategyId} (Game: ${gameId}): Error executing sell: ${error.message}`, error);
            return { success: false, reason: error.message, error };
        }
    }
}

module.exports = StrategyBase; 