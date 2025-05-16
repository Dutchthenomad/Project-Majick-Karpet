const logger = require('../../utils/logger');
const { cloneDeep } = require('lodash');

/**
 * @class BacktestRiskManagerService
 * @description Manages and enforces risk parameters for a single strategy within a single backtest run.
 */
class BacktestRiskManagerService {
    /**
     * @param {EventEmitter} backtestEventBus The event bus specific to this backtest instance.
     * @param {string} strategyId The ID of the strategy being backtested.
     * @param {string} gameId The ID of the game being backtested.
     * @param {object} globalRiskLimitsConfig Global risk limits from the main config.
     * @param {object} strategyRiskConfig Specific risk configuration for the strategy under test.
     * @param {BacktestPlayerStateService} backtestPlayerStateService Instance of BacktestPlayerStateService for this run.
     * @param {object} loggerInstance Logger.
     */
    constructor(backtestEventBus, strategyId, gameId, globalRiskLimitsConfig, strategyRiskConfig, backtestPlayerStateService, loggerInstance) {
        this.backtestEventBus = backtestEventBus;
        this.strategyId = strategyId;
        this.gameId = gameId;
        this.globalRiskLimits = cloneDeep(globalRiskLimitsConfig || {}); // Use defaults if not provided
        this.strategyLimits = cloneDeep(strategyRiskConfig || {});   // Use defaults if not provided
        this.backtestPlayerStateService = backtestPlayerStateService; // For cost basis on sells
        this.logger = loggerInstance || logger;
        this.logPrefix = `[BacktestRiskManager][${this.strategyId}][${this.gameId}]`;

        this.activeExposure = {
            capitalAtRisk: 0,       // For this strategy in this backtest game
            openTradesCount: 0      // For this strategy in this backtest game
        };

        this._handleSimulatedTrade = this._handleSimulatedTrade.bind(this);
        this.logger.info(`${this.logPrefix} Initialized with strategy limits: ${JSON.stringify(this.strategyLimits)} and global limits: ${JSON.stringify(this.globalRiskLimits)}`);
    }

    startListening() {
        this.logger.info(`${this.logPrefix} Starting to listen for simulated trade events on backtest event bus.`);
        this.backtestEventBus.on('trade:simulatedBuy', this._handleSimulatedTrade);
        this.backtestEventBus.on('trade:simulatedSell', this._handleSimulatedTrade);
    }

    stopListening() {
        this.logger.info(`${this.logPrefix} Stopping listening for simulated trade events.`);
        this.backtestEventBus.off('trade:simulatedBuy', this._handleSimulatedTrade);
        this.backtestEventBus.off('trade:simulatedSell', this._handleSimulatedTrade);
    }

    // To be called by StrategyManager/Strategy during backtest initialization for this specific strategy
    // For now, config is passed in constructor, but this aligns with live RiskManagerService interface.
    registerStrategyRiskConfig(strategyId, rawRiskConfig = {}) {
        if (strategyId === this.strategyId) {
            // In a real scenario, we might re-validate/merge, but here we assume constructor received the final one.
            this.logger.info(`${this.logPrefix} Risk config already set for ${strategyId} via constructor.`);
            this.strategyLimits = cloneDeep(rawRiskConfig || {}); 
        } else {
            this.logger.warn(`${this.logPrefix} Attempted to register risk config for unexpected strategy ${strategyId}`);
        }
    }

    async _handleSimulatedTrade(payload) {
        this.logger.debug(`${this.logPrefix} _handleSimulatedTrade received:`, payload);
        if (!payload || !payload.details) {
            this.logger.warn(`${this.logPrefix} Invalid payload for _handleSimulatedTrade.`);
            return;
        }
        const details = payload.details;

        if (details.playerId !== this.strategyId || details.gameId !== this.gameId) {
            return; 
        }

        if (!details.success) {
            this.logger.debug(`${this.logPrefix} Trade was not successful, no exposure change for Risk Manager.`);
            return;
        }

        const type = details.type;

        if (type === 'buy') {
            const amountSpent = details.amountSpent; // This is the 'cost' field from the buy result
            if (amountSpent === undefined || typeof amountSpent !== 'number') {
                this.logger.warn(`${this.logPrefix} Invalid amountSpent in buy event details. Cannot update exposure.`, details);
                return;
            }
            this.activeExposure.capitalAtRisk += amountSpent;
            this.activeExposure.openTradesCount++;
            this.logger.info(`${this.logPrefix} Exposure updated after BUY. Capital@Risk: ${this.activeExposure.capitalAtRisk.toFixed(8)}, OpenTrades: ${this.activeExposure.openTradesCount}`);
        } else if (type === 'sell') {
            const costBasisOfTokensSold = details.costBasisOfTokensSold;
            const positionsClosedCount = details.positionsClosedCount; // Should be provided by mockTradeExecutor

            if (costBasisOfTokensSold === undefined || typeof costBasisOfTokensSold !== 'number') {
                this.logger.warn(`${this.logPrefix} costBasisOfTokensSold not found or invalid in sell event details. Capital at risk reduction will be 0 for this trade. Details:`, details);
                // Do not reduce capitalAtRisk if cost basis is unknown for now.
            } else {
                this.activeExposure.capitalAtRisk -= costBasisOfTokensSold;
            }
            
            if (typeof positionsClosedCount === 'number' && positionsClosedCount > 0) {
                this.activeExposure.openTradesCount -= positionsClosedCount;
            } else {
                this.logger.warn(`${this.logPrefix} positionsClosedCount not valid in sell event details (${positionsClosedCount}). Defaulting to decrementing open trades by 1.`);
                this.activeExposure.openTradesCount--; 
            }

            if (this.activeExposure.capitalAtRisk < 0) {
                 this.logger.warn(`${this.logPrefix} CapitalAtRisk fell below zero (${this.activeExposure.capitalAtRisk.toFixed(8)}) after sell. Clamping to 0.`);
                 this.activeExposure.capitalAtRisk = 0;
            }
            if (this.activeExposure.openTradesCount < 0) {
                this.logger.warn(`${this.logPrefix} OpenTradesCount fell below zero (${this.activeExposure.openTradesCount}) after sell. Clamping to 0.`);
                this.activeExposure.openTradesCount = 0;
            }
            this.logger.info(`${this.logPrefix} Exposure updated after SELL. Cost Basis Used: ${(costBasisOfTokensSold || 0).toFixed(8)}. Capital@Risk: ${this.activeExposure.capitalAtRisk.toFixed(8)}, OpenTrades: ${this.activeExposure.openTradesCount}`);
        } else {
            this.logger.warn(`${this.logPrefix} Unhandled trade type ('${type}') in _handleSimulatedTrade for ${this.strategyId}`);
            return;
        }
        // Persist state (for backtest, this is in-memory only, no file save)
        // this.logger.debug(`${this.logPrefix} Current Exposure State:`, this.activeExposure);
    }

    /**
     * Checks if a proposed trade conforms to risk limits for the backtest.
     * @param {string} strategyId - The ID of the strategy proposing the trade (should match this.strategyId).
     * @param {object} tradeParams - Parameters of the proposed trade.
     * @param {object} currentBacktestGameState - Current game state in the backtest.
     * @returns {Promise<{isApproved: boolean, reason: string | null}>}
     */
    async checkTradeRisk(strategyId, tradeParams, currentBacktestGameState = null) {
        if (strategyId !== this.strategyId) {
            const reason = `Risk check called for incorrect strategy: ${strategyId}. Expected: ${this.strategyId}`;
            this.logger.error(`${this.logPrefix} ${reason}`);
            return { isApproved: false, reason };
        }

        const { type, amountToSpendOrEvaluatedValue, currency, tokenAmountToSell } = tradeParams;
        // Use a more concise log for checkTradeRisk invocation
        this.logger.debug(`${this.logPrefix} checkTradeRisk: ${type} ${amountToSpendOrEvaluatedValue?.toFixed(6) || tokenAmountToSell?.toFixed(8)} ${currency || 'tokens'}`);

        // --- Buy Order Checks ---
        if (type === 'buy') {
            // 1. Strategy-Specific Limits for Buys
            if (amountToSpendOrEvaluatedValue > (this.strategyLimits.maxBuyAmountSOL || Infinity)) {
                const reason = `Buy amount ${amountToSpendOrEvaluatedValue.toFixed(6)} ${currency} exceeds strategy limit of ${(this.strategyLimits.maxBuyAmountSOL || Infinity).toFixed(6)}.`;
                this.logger.warn(`${this.logPrefix} REJECTED: ${reason}`);
                return { isApproved: false, reason };
            }
            if (this.activeExposure.openTradesCount >= (this.strategyLimits.maxOpenTradesPerGame || Infinity)) {
                const reason = `Max open trades limit of ${this.strategyLimits.maxOpenTradesPerGame} reached for strategy. (${this.activeExposure.openTradesCount} open).`;
                this.logger.warn(`${this.logPrefix} REJECTED: ${reason}`);
                return { isApproved: false, reason };
            }
            const projectedStrategyExposure = this.activeExposure.capitalAtRisk + amountToSpendOrEvaluatedValue;
            if (projectedStrategyExposure > (this.strategyLimits.maxStrategyExposureSOL || Infinity)) {
                const reason = `Projected strategy exposure ${projectedStrategyExposure.toFixed(6)} exceeds limit ${(this.strategyLimits.maxStrategyExposureSOL || Infinity).toFixed(6)}.`;
                this.logger.warn(`${this.logPrefix} REJECTED: ${reason}`);
                return { isApproved: false, reason };
            }
            if (currentBacktestGameState && currentBacktestGameState.tickCount < (this.strategyLimits.minRequiredSafeTickCount || 0)) {
                const reason = `Attempted buy at tick ${currentBacktestGameState.tickCount} which is below strategy's minRequiredSafeTickCount of ${this.strategyLimits.minRequiredSafeTickCount}.`;
                this.logger.warn(`${this.logPrefix} REJECTED: ${reason}`);
                return { isApproved: false, reason };
            }

            // 2. Global Limits for Buys (applied to this single strategy in backtest context)
            if (amountToSpendOrEvaluatedValue > (this.globalRiskLimits.globalMaxBuyAmountSOL || Infinity)) {
                const reason = `Buy amount ${amountToSpendOrEvaluatedValue.toFixed(6)} ${currency} exceeds global max buy amount of ${(this.globalRiskLimits.globalMaxBuyAmountSOL || Infinity).toFixed(6)}.`;
                this.logger.warn(`${this.logPrefix} REJECTED: ${reason}`);
                return { isApproved: false, reason };
            }
            // For a single strategy backtest, totalCapitalAtRisk IS strategy.capitalAtRisk for global exposure check
            if (projectedStrategyExposure > (this.globalRiskLimits.maxTotalExposureSOL || Infinity)) {
                const reason = `Projected total exposure (for this strategy) ${projectedStrategyExposure.toFixed(6)} exceeds global limit ${(this.globalRiskLimits.maxTotalExposureSOL || Infinity).toFixed(6)}.`;
                this.logger.warn(`${this.logPrefix} REJECTED: ${reason}`);
                return { isApproved: false, reason };
            }
            // For a single strategy backtest, openTradesCount IS globalOpenTrades for this specific run
            // The globalMaxConcurrentTradesGlobal check applies to the strategy's own open trades in this context.
            if (this.activeExposure.openTradesCount >= (this.globalRiskLimits.maxConcurrentTradesGlobal || Infinity)) {
                const reason = `Global maximum concurrent trades limit (interpreted as strategy max for this backtest) of ${(this.globalRiskLimits.maxConcurrentTradesGlobal || Infinity)} reached. Currently ${this.activeExposure.openTradesCount} open.`;
                this.logger.warn(`${this.logPrefix} REJECTED: ${reason}`);
                return { isApproved: false, reason };
            }

        } else if (type === 'sell') {
            this.logger.debug(`${this.logPrefix} Sell order - Defaulting to approved by risk manager.`);
        }

        this.logger.info(`${this.logPrefix} Trade APPROVED.`);
        return { isApproved: true, reason: null };
    }
}

module.exports = BacktestRiskManagerService; 