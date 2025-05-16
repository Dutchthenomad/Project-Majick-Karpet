const StrategyBase = require('./strategy-base');

/**
 * @class StatisticalArbitrageV1_PresaleStrategy
 * @description Attempts to buy in presale (or very early) and exit based on statistically derived optimal
 *              tick windows and multiplier targets.
 */
class StatisticalArbitrageV1_PresaleStrategy extends StrategyBase {
    constructor(strategyId, config, context) {
        super(strategyId, config, context);
        this.strategyName = 'StatisticalArbitrageV1_PresaleStrategy';
        this.logPrefix = `[${this.strategyId}]`; // Simplified log prefix for this strategy

        // Validate and set default config values specific to this strategy
        this.config.presaleBuyAmountSOL = this.config.presaleBuyAmountSOL || 0.001;
        this.config.entryMaxTick = this.config.entryMaxTick === undefined ? 5 : this.config.entryMaxTick;
        this.config.minAcceptableEntryPrice = this.config.minAcceptableEntryPrice === undefined ? 1.0 : this.config.minAcceptableEntryPrice;
        this.config.maxAcceptableEntryPrice = this.config.maxAcceptableEntryPrice === undefined ? 1.05 : this.config.maxAcceptableEntryPrice;
        
        this.config.targetExitTickMin = this.config.targetExitTickMin || 150;
        this.config.targetExitTickMax = this.config.targetExitTickMax || 199;
        this.config.targetExitMultiplier = this.config.targetExitMultiplier || 5.45;
        this.config.emergencyExitTick = this.config.emergencyExitTick || 220;
        this.config.minProfitTakeMultiplier = this.config.minProfitTakeMultiplier || 1.1; // Min multiplier for timed window exit

        this.logger.info(`${this.logPrefix} instance created with config: ${JSON.stringify(this.config)}`);
    }

    async initialize() {
        await super.initialize();
        this.logger.info(`${this.logPrefix} Initializing...`);
        this.subscribe('game:newGame', this.handleGameChange); // Use a common handler for newGame and phaseChange to presale
        this.subscribe('game:phaseChange', this.handleGameChange);
        this.subscribe('game:priceUpdate', this.handlePriceUpdate);
        this.subscribe('game:rugged', this.handleGameRugged); // Base class handles report emit
        this.logger.info(`${this.logPrefix} Subscribed to game events.`);
    }

    _createInitialGameState(gameId) {
        const baseState = super._createInitialGameState(gameId);
        return {
            ...baseState, // Includes tradesAttempted, etc.
            hasOpenPosition: false,
            entryPrice: null,
            entryTick: null,
            // Add any other V1 specific state here
        };
    }

    async handleGameChange(payload) {
        const gameId = payload.gameId;
        const gameSpecificState = this.getGameState(gameId);
        if (!gameSpecificState) { 
            this.logger.error(`${this.logPrefix} Game ${gameId} - NO gameSpecificState in handleGameChange. This is unexpected.`);
            return;
        }

        const currentPhase = payload.currentPhase || (payload.initialState?.phase);
        const currentTick = payload.data?.tickCount !== undefined ? payload.data.tickCount : (payload.initialState?.tickCount || 0);
        const currentPrice = payload.initialState?.price !== undefined ? payload.initialState.price : (this.gameStateService ? this.gameStateService.getCurrentState()?.price : 1.0);

        // Heuristic: If allowPreRoundBuys is undefined during presale, but price is ~1.0, assume true.
        let effectiveAllowPreRoundBuys = payload.initialState?.allowPreRoundBuys;
        if (currentPhase === 'presale' && effectiveAllowPreRoundBuys === undefined && currentPrice !== null && currentPrice !== undefined && Math.abs(currentPrice - 1.0) < 0.01) {
            effectiveAllowPreRoundBuys = true; 
            this.logger.info(`${this.logPrefix} Game ${gameId} - Assuming allowPreRoundBuys for presale with price ~1.0 as it was undefined.`);
        }

        this.logger.info(`${this.logPrefix} Game ${gameId} - handleGameChange EVALUATING. Phase: ${currentPhase}, AllowPreBuy: ${effectiveAllowPreRoundBuys}, Tick: ${currentTick}, Price: ${currentPrice?.toFixed(6)}, HasOpenPos: ${gameSpecificState.hasOpenPosition}`);

        if ((currentPhase === 'presale' && effectiveAllowPreRoundBuys === true) || 
            (currentPhase === 'active' && currentTick <= this.config.entryMaxTick)) {
            if (!gameSpecificState.hasOpenPosition) {
                if (currentPrice >= this.config.minAcceptableEntryPrice && currentPrice <= this.config.maxAcceptableEntryPrice) {
                    this.logger.info(`${this.logPrefix} Game ${gameId} - Favorable entry condition. Phase: ${currentPhase}, Tick: ${currentTick}, Price: ${currentPrice.toFixed(6)}. Attempting BUY.`);
                    const buyResult = await this.executeBuy(gameId, this.config.presaleBuyAmountSOL, 'StatArbV1_Entry');
                    if (buyResult && buyResult.success) {
                        gameSpecificState.hasOpenPosition = true;
                        gameSpecificState.entryPrice = buyResult.price; 
                        gameSpecificState.entryTick = currentTick; 
                        this.logger.info(`${this.logPrefix} Game ${gameId} - BUY EXECUTED. Entry Price: ${buyResult.price.toFixed(6)}, Entry Tick: ${currentTick}`);
                    } else {
                        this.logger.warn(`${this.logPrefix} Game ${gameId} - BUY FAILED or REJECTED. Result: ${JSON.stringify(buyResult)}`);
                    }
                } else {
                    this.logger.info(`${this.logPrefix} Game ${gameId} - Entry price condition NOT MET. Price: ${currentPrice?.toFixed(6)} (Min: ${this.config.minAcceptableEntryPrice}, Max: ${this.config.maxAcceptableEntryPrice})`);
                }
            }
        }
    }

    async handlePriceUpdate(payload) {
        const gameId = payload.gameId;
        const gameSpecificState = this.getGameState(gameId);
        if (!this.isActive || !gameSpecificState || !gameSpecificState.hasOpenPosition || !gameSpecificState.entryPrice || gameSpecificState.entryPrice <= 0) {
            return;
        }

        const currentPhase = this.gameStateService ? this.gameStateService.getCurrentPhase() : 'unknown';
        if (currentPhase !== 'active') return;

        const currentPrice = payload.price;
        const currentTick = payload.tickCount;
        const currentMultiplier = currentPrice / gameSpecificState.entryPrice;

        let shouldSell = false;
        let sellReason = '';

        // 1. Profit Target Exit
        if (currentMultiplier >= this.config.targetExitMultiplier && currentTick >= this.config.targetExitTickMin && currentTick <= this.config.targetExitTickMax) {
            shouldSell = true;
            sellReason = `Profit target ${this.config.targetExitMultiplier}x reached in optimal window`;
        }
        // 2. Optimal Window Timed Exit (with minimal profit)
        else if (!shouldSell && currentTick >= this.config.targetExitTickMin && currentTick <= this.config.targetExitTickMax && currentMultiplier >= this.config.minProfitTakeMultiplier) {
            shouldSell = true;
            sellReason = `Optimal tick window exit at ${currentMultiplier.toFixed(2)}x`;
        }
        // 3. Emergency Time-Based Exit
        else if (!shouldSell && currentTick > this.config.emergencyExitTick) {
            shouldSell = true;
            sellReason = `Emergency time exit at tick ${currentTick}`;
        }

        if (shouldSell) {
            this.logger.info(`${this.logPrefix} Game ${gameId} - ${sellReason}. Current Multiplier: ${currentMultiplier.toFixed(2)}x, Tick: ${currentTick}. Attempting SELL.`);
            const sellResult = await this.executeSellByPercentage(gameId, 100, `StatArbV1_Exit: ${sellReason}`);
            if (sellResult && sellResult.success) {
                gameSpecificState.hasOpenPosition = false;
                this.logger.info(`${this.logPrefix} Game ${gameId} - SELL EXECUTED for ${sellReason}.`);
            }
        }
    }

    async handleGameRugged(payload) {
        const gameId = payload.gameId;
        const gameSpecificState = this.getGameState(gameId);
        if (gameSpecificState && gameSpecificState.hasOpenPosition) {
            this.logger.info(`${this.logPrefix} Game ${gameId} rugged with an open position. P&L will be finalized by BacktestPlayerStateService.`);
            gameSpecificState.hasOpenPosition = false; // Mark as closed for this strategy instance
        }
        await super.onGameRugged(payload); // This handles emitting the performance report
    }
}

module.exports = StatisticalArbitrageV1_PresaleStrategy; 