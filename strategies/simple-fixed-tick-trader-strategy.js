const StrategyBase = require('./strategy-base');
const { BRIGHT_MAGENTA, RESET_COLOR } = require('../utils/logger'); // Assuming logger exports these, or define them locally

/**
 * @class SimpleFixedTickTraderStrategy
 * @description A baseline strategy that implements the fixed tick-based trading logic 
 *              previously in test-phase1.js for simBotUser1.
 *              - Buys on presale if allowed.
 *              - Buys on specific ticks (e.g., 10, 30, 50...) during 'active' phase.
 *              - Sells on specific ticks (e.g., 20, 40, 60...) during 'active' phase.
 */
class SimpleFixedTickTraderStrategy extends StrategyBase {
    /**
     * Constructor for SimpleFixedTickTraderStrategy.
     * @param {string} strategyId - The unique ID for this strategy instance (e.g., 'simBotUser1').
     * @param {object} config - Configuration for this strategy.
     * @param {number} config.presaleBuyAmount - Amount of SOL to spend on presale buy.
     * @param {number} config.tickBuyAmount - Amount of SOL to spend on tick-based buys.
     * @param {number} config.buyTickModulus - Modulus for buy ticks (e.g., 20 for buys every 20 ticks).
     * @param {number} config.buyTickOffset - Offset for buy ticks (e.g., 10 to buy on 10, 30, 50...).
     * @param {number} config.sellTickModulus - Modulus for sell ticks.
     * @param {number} config.sellTickOffset - Offset for sell ticks (e.g., 0 to sell on 20, 40, 60... if modulus is 20).
     * @param {number} config.sellPercentage - Percentage of holdings to sell.
     * @param {object} context - Context object with logger, eventBus, tradeExecutor, etc.
     */
    constructor(strategyId, config, context) {
        super(strategyId, config, context);
        this.strategyName = 'SimpleFixedTickTraderStrategy'; // For clarity in logs if needed

        // Validate and set default config values
        this.config.presaleBuyAmount = this.config.presaleBuyAmount || 0.01;
        this.config.tickBuyAmount = this.config.tickBuyAmount || 0.01;
        this.config.buyTickModulus = this.config.buyTickModulus || 20;
        this.config.buyTickOffset = this.config.buyTickOffset === undefined ? 10 : this.config.buyTickOffset;
        this.config.sellTickModulus = this.config.sellTickModulus || 20;
        this.config.sellTickOffset = this.config.sellTickOffset === undefined ? 0 : this.config.sellTickOffset; 
        this.config.sellPercentage = this.config.sellPercentage || 100;
        
        // For specific colored logging for this strategy's target bot
        this.logPrefix = `${BRIGHT_MAGENTA || ''}[${this.strategyId}-Strategy]${RESET_COLOR || ''}`;
        this.logger.info(`${this.logPrefix} instance created with config: ${JSON.stringify(this.config)}`);
    }

    async validateConfiguration() {
        await super.validateConfiguration(); // Good practice, though base returns true
        let isValid = true;
        const errors = [];

        const checkNumericParam = (paramName, minValue, isInteger = false, maxValue = Infinity) => {
            const value = this.config[paramName];
            if (value === undefined) {
                errors.push(`${paramName} is undefined.`);
                isValid = false;
                return;
            }
            if (typeof value !== 'number') {
                errors.push(`${paramName} must be a number, got ${typeof value}.`);
                isValid = false;
                return;
            }
            if (isInteger && !Number.isInteger(value)) {
                errors.push(`${paramName} must be an integer, got ${value}.`);
                isValid = false;
            }
            if (value < minValue) {
                errors.push(`${paramName} must be >= ${minValue}, got ${value}.`);
                isValid = false;
            }
            if (value > maxValue) {
                errors.push(`${paramName} must be <= ${maxValue}, got ${value}.`);
                isValid = false;
            }
        };

        checkNumericParam('presaleBuyAmount', 0.00000001); // Effectively > 0
        checkNumericParam('tickBuyAmount', 0.00000001);    // Effectively > 0
        checkNumericParam('buyTickModulus', 1, true);
        checkNumericParam('buyTickOffset', 0, true);
        checkNumericParam('sellTickModulus', 1, true);
        checkNumericParam('sellTickOffset', 0, true);
        checkNumericParam('sellPercentage', 0.00000001, false, 100); // Effectively > 0 and <= 100

        if (!this.config.riskConfig || typeof this.config.riskConfig !== 'object') {
            errors.push('riskConfig is missing or not an object.');
            isValid = false;
        } else {
            // We can also do basic checks on riskConfig fields expected by this strategy's logic
            // although RiskManagerService will do its own more detailed validation of riskConfig content.
            if (this.config.riskConfig.maxBuyAmountSOL === undefined) {
                // This is more of a note, as RiskManagerService will apply defaults
                this.logger.debug(`${this.logPrefix} riskConfig.maxBuyAmountSOL is not explicitly set, RiskManager will use its defaults.`);
            }
        }

        if (!isValid) {
            this.logger.error(`${this.logPrefix} Configuration validation failed: ${errors.join('; ')}`);
        }
        return isValid;
    }

    async initialize() {
        await super.initialize(); // Call base class initialize
        this.logger.info(`${this.logPrefix} Initializing...`);

        this.subscribe('game:newGame', this.handleNewGame);
        this.subscribe('game:phaseChange', this.handlePhaseChange);
        this.subscribe('game:priceUpdate', this.handlePriceUpdate);
        this.subscribe('game:rugged', this.handleGameRugged);
        this.logger.info(`${this.logPrefix} Subscribed to game events.`);
    }

    _createInitialGameState(gameId) {
        this.logger.debug(`${this.logPrefix} Creating initial state for game ${gameId}`);
        return {
            hasMadePresaleBuyThisGame: false,
            lastProcessedTick: -1,
            currentGameId: gameId, // Store for convenience, though key in this.gameStates
        };
    }

    // Event Handlers specific to this strategy's logic
    async handleNewGame(payload) { // Changed to single payload
        const { gameId, initialState, gameTimestamp } = payload; // gameTimestamp available
        this.logger.info(`${this.logPrefix} New game detected: ${gameId} at ${new Date(gameTimestamp).toISOString()}. Resetting trade state.`);
        const gameSpecificState = this.getGameState(gameId); // Ensures state is created

        const currentGameState = this.gameStateService ? this.gameStateService.getCurrentState() : initialState;
        const currentGamePhase = this.gameStateService ? this.gameStateService.getCurrentPhase() : (initialState ? initialState.phase : 'unknown'); // Infer phase if possible

        this.logger.info(`${this.logPrefix} Initial state for ${gameId}. Phase: ${currentGamePhase}, Allow PreRound Buys: ${currentGameState ? currentGameState.allowPreRoundBuys : 'N/A'}`);

        if (currentGameState && currentGamePhase === 'presale' && currentGameState.allowPreRoundBuys && !gameSpecificState.hasMadePresaleBuyThisGame) {
            this.logger.info(`${this.logPrefix} Game ${gameId} in PRESALE and allows buys. Attempting presale buy.`);
            const buyResult = await this.executeBuy(gameId, this.config.presaleBuyAmount, 'PresaleAutoBuy');
            this.logger.info(`${this.logPrefix} Presale simulateBuy Result: ${JSON.stringify(buyResult, null, 2)}`);
            if (buyResult && buyResult.success) {
                gameSpecificState.hasMadePresaleBuyThisGame = true;
            }
        }
    }

    async handlePhaseChange(payload) { // Changed to single payload
        const { gameId, currentPhase, previousPhase, data, gameTimestamp } = payload;
        const gameSpecificState = this.getGameState(gameId);
        if (!gameSpecificState) { 
            this.logger.warn(`${this.logPrefix} Received phaseChange for ${gameId} but no state found. This might be an old game event.`);
            return;
        }
        if (gameId !== gameSpecificState.currentGameId) return; 

        this.logger.info(`${this.logPrefix} Phase changed for game ${gameId} to ${currentPhase}. (Tick: ${data.tickCount}) at ${new Date(gameTimestamp).toISOString()}`);
        const currentFullGameState = this.gameStateService ? this.gameStateService.getCurrentState() : data;

        if (currentFullGameState && currentPhase === 'presale' && currentFullGameState.allowPreRoundBuys && !gameSpecificState.hasMadePresaleBuyThisGame) {
            this.logger.info(`${this.logPrefix} Game ${gameId} transitioned to PRESALE and allows buys. Attempting presale buy.`);
            const buyResult = await this.executeBuy(gameId, this.config.presaleBuyAmount, 'PresalePhaseChangeBuy');
            this.logger.info(`${this.logPrefix} Presale (Phase Change) simulateBuy Result: ${JSON.stringify(buyResult, null, 2)}`);
            if (buyResult && buyResult.success) {
                gameSpecificState.hasMadePresaleBuyThisGame = true;
            }
        }
    }

    async handlePriceUpdate(payload) { // Changed to single payload
        const { gameId, price, tickCount, gameTimestamp } = payload;
        const gameSpecificState = this.getGameState(gameId);
        if (!gameSpecificState || gameId !== gameSpecificState.currentGameId) return;
        if (!this.isActive) return; 

        const currentGamePhase = this.gameStateService ? this.gameStateService.getCurrentPhase() : 'unknown';
        if (currentGamePhase !== 'active' || tickCount <= gameSpecificState.lastProcessedTick) {
            return;
        }

        const previousTickProcessed = gameSpecificState.lastProcessedTick;
        gameSpecificState.lastProcessedTick = tickCount;

        // Buy logic
        if (tickCount > 0 && tickCount % this.config.buyTickModulus === this.config.buyTickOffset) {
            this.logger.info(`${this.logPrefix} Tick ${tickCount} (Prev: ${previousTickProcessed}) in game ${gameId} at ${new Date(gameTimestamp).toISOString()}. Attempting BUY.`);
            const buyResult = await this.executeBuy(gameId, this.config.tickBuyAmount, 'TickBuyStrategy');
            this.logger.info(`${this.logPrefix} Tick ${tickCount} BUY Result: ${JSON.stringify(buyResult, null, 2)}`);
        }
        // Sell logic
        else if (tickCount > 0 && tickCount % this.config.sellTickModulus === this.config.sellTickOffset) {
            this.logger.info(`${this.logPrefix} Tick ${tickCount} (Prev: ${previousTickProcessed}) in game ${gameId} at ${new Date(gameTimestamp).toISOString()}. Attempting SELL ${this.config.sellPercentage}%.`);
            const sellResult = await this.executeSellByPercentage(gameId, this.config.sellPercentage, 'TickSellStrategy');
            this.logger.info(`${this.logPrefix} Tick ${tickCount} SELL Result: ${JSON.stringify(sellResult, null, 2)}`);
        }
    }

    async handleGameRugged(payload) { // Changed to single payload
        // const { gameId, finalPrice, tickCount, data, gameTimestamp } = payload; // data might be used by super or for more detailed logging
        // Call super.onGameRugged to handle game state cleanup from this.gameStates
        await super.onGameRugged(payload); // Pass the full payload to the super method
        this.logger.info(`${this.logPrefix} Game ${payload.gameId} rugged at ${new Date(payload.gameTimestamp).toISOString()}. Trading for this game ends.`);
        // Specific strategy cleanup for this game already handled by super.onGameRugged's deletion of gameStates[gameId]
    }
    
    // Override lifecycle methods from StrategyBase as needed, 
    // for example, onNewGame, onPhaseChange are already handled by the specific handlers above.
    // The base class versions of these hooks are just for logging/example.
    // We use specific handlers here for clarity which are called by subscriptions in initialize().
}

module.exports = SimpleFixedTickTraderStrategy; 