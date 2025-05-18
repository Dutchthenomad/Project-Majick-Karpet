const StrategyBase = require('./strategy-base');

/**
 * @class StatisticalArbitrageV1_PresaleStrategy
 * @description Attempts to buy in presale (or very early) and exit based on statistically derived optimal
 *              tick windows and multiplier targets. (Simpler Version)
 */
class StatisticalArbitrageV1_PresaleStrategy extends StrategyBase {
    constructor(strategyId, config, context) {
        super(strategyId, config, context);
        this.strategyName = 'StatisticalArbitrageV1_PresaleStrategy'; // Original simpler name
        this.logPrefix = `[${this.strategyId}]`;

        // Configuration for the simpler version
        this.config.presaleBuyAmountSOL = this.config.presaleBuyAmountSOL === undefined ? 0.0005 : this.config.presaleBuyAmountSOL;
        this.config.entryMaxTick = this.config.entryMaxTick === undefined ? 5 : this.config.entryMaxTick;
        this.config.minAcceptableEntryPrice = this.config.minAcceptableEntryPrice === undefined ? 1.0 : this.config.minAcceptableEntryPrice;
        this.config.maxAcceptableEntryPrice = this.config.maxAcceptableEntryPrice === undefined ? 1.05 : this.config.maxAcceptableEntryPrice;
        
        this.config.targetExitTickMin = this.config.targetExitTickMin === undefined ? 150 : this.config.targetExitTickMin;
        this.config.targetExitTickMax = this.config.targetExitTickMax === undefined ? 199 : this.config.targetExitTickMax;
        this.config.targetExitMultiplier = this.config.targetExitMultiplier === undefined ? 5.45 : this.config.targetExitMultiplier;
        this.config.emergencyExitTick = this.config.emergencyExitTick === undefined ? 220 : this.config.emergencyExitTick;
        this.config.minProfitTakeMultiplier = this.config.minProfitTakeMultiplier === undefined ? 1.1 : this.config.minProfitTakeMultiplier;
        this.config.stopLossMultiplier = this.config.stopLossMultiplier === undefined ? 0.15 : this.config.stopLossMultiplier; // 85% drawdown

        this.logger.info(`${this.logPrefix} instance (Simpler Version) created with config: ${JSON.stringify(this.config)}`);
    }

    async initialize() {
        await super.initialize();
        this.logger.info(`${this.logPrefix} Initializing (Simpler Version)...`);
        this.subscribe('game:newGame', this.handleGameChange);
        this.subscribe('game:phaseChange', this.handleGameChange); // Can use the same handler for entry logic
        this.subscribe('game:priceUpdate', this.handlePriceUpdate);
        this.subscribe('game:rugged', this.handleGameRugged);
        this.logger.info(`${this.logPrefix} Subscribed to game events (Simpler Version).`);
    }

    _createInitialGameState(gameId) {
        const baseState = super._createInitialGameState(gameId);
        return {
            ...baseState,
            hasOpenPosition: false,
            entryPrice: null,
            entryTick: null,
        };
    }

    async handleGameChange(payload) { // Combined handler for newGame and phaseChange for entry
        const gameId = payload.gameId;
        const gameSpecificState = this.getGameState(gameId);
        if (!gameSpecificState || gameSpecificState.hasOpenPosition) {
            return; 
        }

        const currentPhase = payload.currentPhase || (payload.initialState?.phase);
        const currentTick = payload.data?.tickCount !== undefined ? payload.data.tickCount : (payload.initialState?.tickCount || 0);
        const currentPrice = payload.initialState?.price !== undefined ? payload.initialState.price : (this.gameStateService ? this.gameStateService.getCurrentState()?.price : 1.0);

        let effectiveAllowPreRoundBuys = payload.initialState?.allowPreRoundBuys;
        if (currentPhase === 'presale' && effectiveAllowPreRoundBuys === undefined && currentPrice !== null && currentPrice !== undefined && Math.abs(currentPrice - 1.0) < 0.01) {
            effectiveAllowPreRoundBuys = true; 
        }

        this.logger.debug(`${this.logPrefix} Game ${gameId} - handleGameChange EVAL. Phase: ${currentPhase}, AllowPreBuy: ${effectiveAllowPreRoundBuys}, Tick: ${currentTick}, Price: ${currentPrice?.toFixed(6)}, HasOpenPos: ${gameSpecificState.hasOpenPosition}`);

        if ((currentPhase === 'presale' && effectiveAllowPreRoundBuys === true) || 
            (currentPhase === 'active' && currentTick <= this.config.entryMaxTick)) {
            if (currentPrice >= this.config.minAcceptableEntryPrice && currentPrice <= this.config.maxAcceptableEntryPrice) {
                this.logger.info(`${this.logPrefix} Game ${gameId} - Favorable entry condition. Phase: ${currentPhase}, Tick: ${currentTick}, Price: ${currentPrice.toFixed(6)}. Attempting BUY.`);
                const buyResult = await this.executeBuy(gameId, this.config.presaleBuyAmountSOL, 'StatArbV1_Entry_Simple', { executionPrice: currentPrice });
                if (buyResult && buyResult.success) {
                    gameSpecificState.hasOpenPosition = true;
                    gameSpecificState.entryPrice = buyResult.price; 
                    gameSpecificState.entryTick = currentTick; 
                    this.logger.info(`${this.logPrefix} Game ${gameId} - BUY EXECUTED. Entry Price: ${buyResult.price.toFixed(6)}, Entry Tick: ${currentTick}`);
                } else {
                    this.logger.warn(`${this.logPrefix} Game ${gameId} - BUY FAILED or REJECTED. Result: ${JSON.stringify(buyResult)}`);
                }
            } else {
                 this.logger.debug(`${this.logPrefix} Game ${gameId} - Entry price condition NOT MET. Price: ${currentPrice?.toFixed(6)} (Min: ${this.config.minAcceptableEntryPrice}, Max: ${this.config.maxAcceptableEntryPrice})`);
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

        // Stop-Loss Check
        if (currentMultiplier < this.config.stopLossMultiplier) {
            shouldSell = true;
            sellReason = `Stop-loss triggered at ${currentMultiplier.toFixed(2)}x (target < ${this.config.stopLossMultiplier}x)`;
        }
        // Profit Target Exit
        else if (currentMultiplier >= this.config.targetExitMultiplier && currentTick >= this.config.targetExitTickMin && currentTick <= this.config.targetExitTickMax) {
            shouldSell = true;
            sellReason = `Profit target ${this.config.targetExitMultiplier}x reached in optimal window`;
        }
        // Optimal Window Timed Exit (with minimal profit)
        else if (currentTick >= this.config.targetExitTickMin && currentTick <= this.config.targetExitTickMax && currentMultiplier >= this.config.minProfitTakeMultiplier) {
            shouldSell = true;
            sellReason = `Optimal tick window exit at ${currentMultiplier.toFixed(2)}x`;
        }
        // Emergency Time-Based Exit
        else if (currentTick > this.config.emergencyExitTick) {
            shouldSell = true;
            sellReason = `Emergency time exit at tick ${currentTick}`;
        }

        if (shouldSell) {
            this.logger.info(`${this.logPrefix} Game ${gameId} - ${sellReason}. Current Multiplier: ${currentMultiplier.toFixed(2)}x, Tick: ${currentTick}. Attempting SELL.`);
            const sellResult = await this.executeSellByPercentage(gameId, 100, `StatArbV1_Exit_Simple: ${sellReason}`);
            if (sellResult && sellResult.success) {
                gameSpecificState.hasOpenPosition = false; // Reset position state
                this.logger.info(`${this.logPrefix} Game ${gameId} - SELL EXECUTED for ${sellReason}.`);
            } else {
                this.logger.warn(`${this.logPrefix} Game ${gameId} - SELL FAILED/REJECTED for ${sellReason}. Result: ${JSON.stringify(sellResult)}`);
            }
        }
    }

    async handleGameRugged(payload) {
        const gameId = payload.gameId;
        const gameSpecificState = this.getGameState(gameId);
        if (gameSpecificState && gameSpecificState.hasOpenPosition) {
            this.logger.info(`${this.logPrefix} Game ${gameId} rugged with an open position. P&L will be finalized by BacktestPlayerStateService/liquidation.`);
            gameSpecificState.hasOpenPosition = false; 
        }
        // Call base class to ensure performance report is still emitted if super.onGameRugged does that
        await super.onGameRugged(payload); 
    }
}

module.exports = StatisticalArbitrageV1_PresaleStrategy; 