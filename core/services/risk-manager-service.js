const ServiceBase = require('./service-base');
const logger = require('../../utils/logger');
const eventBus = require('../events/event-bus');
const { getConfig } = require('../../config/config-service'); // For global risk limits
const fs = require('fs');
const path = require('path');
const playerStateService = require('./player-state-service'); // Import PlayerStateService singleton

const RISK_STATE_FILE_PATH = path.join(__dirname, '..', '..', 'data', 'risk_manager_state.json'); // Adjusted path

/**
 * @class RiskManagerService
 * @extends ServiceBase
 * @description Manages and enforces risk parameters for trading strategies.
 *              It checks proposed trades against strategy-specific and global risk limits,
 *              and reacts to game events to adjust risk postures if necessary.
 */
class RiskManagerService extends ServiceBase {
    constructor(options = {}, dependencies = {}) {
        super('RiskManagerService', options, dependencies);
        // configService can be obtained from getConfig directly if not injected via dependencies
        this.globalRiskLimits = getConfig('riskManagement.globalLimits', {});
        this.presaleRiskConfig = getConfig('riskManagement.presaleEntryRisk', { applySpecificLimits: false, maxTickForPresaleRisk: 0, maxBuyAmountSOL: Infinity }); // Load presale risk config
        this.strategyRiskConfigs = new Map(); // strategyId -> validatedRiskConfig
        this.activeExposure = {
            totalCapitalAtRisk: 0,
            perStrategy: new Map(), // strategyId -> { capitalAtRisk, openTradesCount, pnl (optional) }
        };

        this._handleSimulatedTrade = this._handleSimulatedTrade.bind(this);
        // TODO: Bind _handlePhaseChange if/when implemented

        logger.info('RiskManagerService instantiated.');
        if (Object.keys(this.globalRiskLimits).length === 0) {
            logger.warn('RiskManagerService: Global risk limits are not configured or found!');
        } else {
            logger.info(`RiskManagerService: Loaded global risk limits: ${JSON.stringify(this.globalRiskLimits)}`);
        }
        if (!this.presaleRiskConfig.applySpecificLimits) {
            logger.info('RiskManagerService: Presale-specific entry risk limits are disabled.');
        } else {
            logger.info(`RiskManagerService: Loaded presale-specific entry risk limits: ${JSON.stringify(this.presaleRiskConfig)}`);
        }
        this._loadActiveExposure(); // Call load on construction or in initialize
    }

    async initialize() {
        await super.initialize();
        // _loadActiveExposure might be better here if it needs async or more setup from base.
        // For now, constructor call is okay for synchronous load attempt.
        this.logger.info('RiskManagerService initialized state and ready.');
    }

    async start() {
        await super.start();
        // Subscribe to simulated trade events to update exposure
        this.logger.info('RiskManagerService: Subscribing to trade:simulatedBuy WITH category filter.');
        eventBus.on('trade:simulatedBuy', this._handleSimulatedTrade, { category: 'trade_simulation' });
        
        this.logger.info('RiskManagerService: Subscribing to trade:simulatedSell WITH category filter.');
        eventBus.on('trade:simulatedSell', this._handleSimulatedTrade, { category: 'trade_simulation' });
        
        // TODO: Subscribe to game phase changes to adjust risk profiles/postures
        // eventBus.on('game:phaseChange', this._handlePhaseChange, { category: 'game_lifecycle' });
        
        this.logger.info('RiskManagerService started and listening for simulated trade events.');
    }

    async stop() {
        eventBus.off('trade:simulatedBuy', this._handleSimulatedTrade);
        eventBus.off('trade:simulatedSell', this._handleSimulatedTrade);
        // TODO: Unsubscribe from game:phaseChange if subscribed
        // eventBus.off('game:phaseChange', this._handlePhaseChange);
        await this._saveActiveExposure(); // Save state on stop
        await super.stop();
        this.logger.info('RiskManagerService stopped, listeners removed, and state saved.');
    }

    _ensureDataDirectoryExists() {
        const dir = path.dirname(RISK_STATE_FILE_PATH);
        if (!fs.existsSync(dir)) {
            this.logger.info(`Data directory ${dir} does not exist, creating...`);
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    _saveActiveExposure() {
        this.logger.info(`RiskManagerService: Attempting to save active exposure to ${RISK_STATE_FILE_PATH}`);
        this._ensureDataDirectoryExists();
        try {
            // Convert Maps to arrays of [key, value] pairs for JSON serialization
            const serializableExposure = {
                totalCapitalAtRisk: this.activeExposure.totalCapitalAtRisk,
                perStrategy: Array.from(this.activeExposure.perStrategy.entries()),
            };
            const jsonData = JSON.stringify(serializableExposure, null, 2);
            fs.writeFileSync(RISK_STATE_FILE_PATH, jsonData, 'utf8');
            this.logger.info(`RiskManagerService: Active exposure saved successfully to ${RISK_STATE_FILE_PATH}`);
        } catch (error) {
            this.logger.error(`RiskManagerService: Failed to save active exposure: ${error.message}`, error);
        }
    }

    _loadActiveExposure() {
        this.logger.info(`RiskManagerService: Attempting to load active exposure from ${RISK_STATE_FILE_PATH}`);
        this._ensureDataDirectoryExists(); // Ensure directory exists before trying to read
        try {
            if (fs.existsSync(RISK_STATE_FILE_PATH)) {
                const jsonData = fs.readFileSync(RISK_STATE_FILE_PATH, 'utf8');
                const loadedExposure = JSON.parse(jsonData);
                
                this.activeExposure.totalCapitalAtRisk = loadedExposure.totalCapitalAtRisk || 0;
                // Convert array of [key, value] pairs back to Map
                this.activeExposure.perStrategy = new Map(loadedExposure.perStrategy || []);
                
                this.logger.info(`RiskManagerService: Active exposure loaded successfully from ${RISK_STATE_FILE_PATH}`);
                this.logger.debug(`Loaded exposure details: ${JSON.stringify(this.activeExposure)}`);
            } else {
                this.logger.info(`RiskManagerService: State file ${RISK_STATE_FILE_PATH} not found. Initializing with empty exposure.`);
                // Ensure activeExposure is initialized with empty Maps if no file found
                this.activeExposure.totalCapitalAtRisk = 0;
                this.activeExposure.perStrategy = new Map();
            }
        } catch (error) {
            this.logger.error(`RiskManagerService: Failed to load active exposure: ${error.message}. Initializing with empty exposure.`, error);
            this.activeExposure.totalCapitalAtRisk = 0;
            this.activeExposure.perStrategy = new Map();
        }
    }

    /**
     * Validates a strategy's risk configuration.
     * @param {string} strategyId For logging/context.
     * @param {object} [riskConfig={}] The raw risk config from strategy.
     * @returns {object} The validated (and potentially defaulted) risk configuration.
     * @private
     */
    _validateRiskConfig(strategyId, riskConfig = {}) {
        // TODO: Implement more robust schema-based validation here (e.g., using Joi or similar) later.
        const defaults = {
            maxBuyAmountSOL: Infinity,
            maxOpenTradesPerGame: Infinity,
            maxStrategyExposureSOL: Infinity,
            minRequiredSafeTickCount: 0, // Default to 0 if not specified
        };
        
        const validatedConfig = { ...defaults };

        if (riskConfig === null || typeof riskConfig !== 'object') {
            logger.warn(`RiskManager: Strategy ${strategyId} provided invalid riskConfig (not an object or null). Using defaults.`);
            return defaults; // Return full defaults if riskConfig itself is invalid
        }

        // Validate maxBuyAmountSOL
        if (riskConfig.maxBuyAmountSOL !== undefined) {
            if (typeof riskConfig.maxBuyAmountSOL === 'number' && riskConfig.maxBuyAmountSOL > 0) {
                validatedConfig.maxBuyAmountSOL = riskConfig.maxBuyAmountSOL;
            } else {
                logger.warn(`RiskManager: Strategy ${strategyId} invalid maxBuyAmountSOL (${riskConfig.maxBuyAmountSOL}). Using default: ${defaults.maxBuyAmountSOL}.`);
            }
        } else {
            logger.info(`RiskManager: Strategy ${strategyId} riskConfig missing maxBuyAmountSOL. Using default: ${defaults.maxBuyAmountSOL}.`);
        }

        // Validate maxOpenTradesPerGame
        if (riskConfig.maxOpenTradesPerGame !== undefined) {
            if (typeof riskConfig.maxOpenTradesPerGame === 'number' && Number.isInteger(riskConfig.maxOpenTradesPerGame) && riskConfig.maxOpenTradesPerGame >= 0) {
                validatedConfig.maxOpenTradesPerGame = riskConfig.maxOpenTradesPerGame;
            } else {
                logger.warn(`RiskManager: Strategy ${strategyId} invalid maxOpenTradesPerGame (${riskConfig.maxOpenTradesPerGame}). Using default: ${defaults.maxOpenTradesPerGame}.`);
            }
        } else {
            logger.info(`RiskManager: Strategy ${strategyId} riskConfig missing maxOpenTradesPerGame. Using default: ${defaults.maxOpenTradesPerGame}.`);
        }

        // Validate maxStrategyExposureSOL
        if (riskConfig.maxStrategyExposureSOL !== undefined) {
            if (typeof riskConfig.maxStrategyExposureSOL === 'number' && riskConfig.maxStrategyExposureSOL >= 0) {
                validatedConfig.maxStrategyExposureSOL = riskConfig.maxStrategyExposureSOL;
            } else {
                logger.warn(`RiskManager: Strategy ${strategyId} invalid maxStrategyExposureSOL (${riskConfig.maxStrategyExposureSOL}). Using default: ${defaults.maxStrategyExposureSOL}.`);
            }
        } else {
            logger.info(`RiskManager: Strategy ${strategyId} riskConfig missing maxStrategyExposureSOL. Using default: ${defaults.maxStrategyExposureSOL}.`);
        }
        
        // Validate minRequiredSafeTickCount
        if (riskConfig.minRequiredSafeTickCount !== undefined) {
            if (typeof riskConfig.minRequiredSafeTickCount === 'number' && Number.isInteger(riskConfig.minRequiredSafeTickCount) && riskConfig.minRequiredSafeTickCount >= 0) {
                validatedConfig.minRequiredSafeTickCount = riskConfig.minRequiredSafeTickCount;
            } else {
                logger.warn(`RiskManager: Strategy ${strategyId} invalid minRequiredSafeTickCount (${riskConfig.minRequiredSafeTickCount}). Using default: ${defaults.minRequiredSafeTickCount}.`);
            }
        } else {
            logger.info(`RiskManager: Strategy ${strategyId} riskConfig missing minRequiredSafeTickCount. Using default: ${defaults.minRequiredSafeTickCount}.`);
        }
        
        // Example for future boolean flag
        // if (riskConfig.allowAggressiveOnGodCandle !== undefined) {
        //    validatedConfig.allowAggressiveOnGodCandle = !!riskConfig.allowAggressiveOnGodCandle;
        // } else {
        //    validatedConfig.allowAggressiveOnGodCandle = defaults.allowAggressiveOnGodCandle;
        // }

        logger.debug(`RiskManager: Validated riskConfig for ${strategyId}: ${JSON.stringify(validatedConfig)}`);
        return validatedConfig;
    }

    /**
     * Registers and validates risk configuration for a specific strategy.
     * Typically called by StrategyManager when a strategy is loaded.
     * @param {string} strategyId - The ID of the strategy.
     * @param {object} rawRiskConfig - The raw risk parameters from the strategy's configuration.
     */
    registerStrategyRiskConfig(strategyId, rawRiskConfig = {}) {
        const validatedConfig = this._validateRiskConfig(strategyId, rawRiskConfig);
        this.logger.info(`Registering validated risk config for strategy '${strategyId}': ${JSON.stringify(validatedConfig)}`);
        this.strategyRiskConfigs.set(strategyId, validatedConfig);

        if (!this.activeExposure.perStrategy.has(strategyId)) {
            this.activeExposure.perStrategy.set(strategyId, { capitalAtRisk: 0, openTradesCount: 0, pnl: 0 });
            logger.debug(`Initialized exposure tracking for new strategy: ${strategyId}`);
        }
    }

    /**
     * Checks if a proposed trade conforms to risk limits.
     * This is the primary pre-trade check method to be called by StrategyBase.
     * @param {string} strategyId - The ID of the strategy proposing the trade.
     * @param {object} tradeParams - Parameters of the proposed trade.
     * @param {string} tradeParams.type - 'buy' or 'sell'.
     * @param {number} tradeParams.amountToSpendOrEvaluatedValue - Value of the trade in SOL (e.g., amountToSpend for buy, current value of tokens for sell).
     * @param {string} tradeParams.currency - Currency of the trade (e.g., 'SOL').
     * @param {object} [currentGameState=null] - Optional: current full game state for context-aware risk checks (phase, tick count etc.).
     * @returns {Promise<{isApproved: boolean, reason: string | null}>}
     */
    async checkTradeRisk(strategyId, tradeParams, currentGameState = null) {
        const { type, amountToSpendOrEvaluatedValue, currency } = tradeParams;
        this.logger.info(`RiskManager: checkTradeRisk invoked for strategy '${strategyId}': ${type} ${amountToSpendOrEvaluatedValue.toFixed(6)} ${currency}`);

        const strategyLimits = this.strategyRiskConfigs.get(strategyId);
        const strategyExposure = this.activeExposure.perStrategy.get(strategyId);

        if (!strategyLimits) {
            const reason = `No risk configuration registered for strategy ${strategyId}. Trade denied by default.`;
            this.logger.error(`RiskManager: ${reason}`);
            return { isApproved: false, reason };
        }
        if (!strategyExposure) {
            const reason = `No active exposure tracking found for strategy ${strategyId}. Trade denied.`;
            this.logger.error(`RiskManager: ${reason}`);
            return { isApproved: false, reason };
        }

        // --- Buy Order Checks ---
        if (type === 'buy') {
            // 0. Presale/Early Entry Specific Risk Limit Check
            if (this.presaleRiskConfig.applySpecificLimits && 
                currentGameState && 
                currentGameState.tickCount <= this.presaleRiskConfig.maxTickForPresaleRisk) {
                if (amountToSpendOrEvaluatedValue > this.presaleRiskConfig.maxBuyAmountSOL) {
                    const reason = `Buy amount ${amountToSpendOrEvaluatedValue.toFixed(6)} ${currency} exceeds presale/early entry limit of ${this.presaleRiskConfig.maxBuyAmountSOL.toFixed(6)} (tick ${currentGameState.tickCount} <= ${this.presaleRiskConfig.maxTickForPresaleRisk}).`;
                    this.logger.warn(`RiskManager: ${reason} for ${strategyId}`);
                    this._emitRiskEvent('risk:limitReached', strategyId, 'presaleMaxBuyAmountSOL', tradeParams, reason, currentGameState);
                    return { isApproved: false, reason };
                }
            }

            // 1. Strategy-Specific Limits for Buys
            if (amountToSpendOrEvaluatedValue > (strategyLimits.maxBuyAmountSOL || Infinity)) {
                const reason = `Buy amount ${amountToSpendOrEvaluatedValue.toFixed(6)} ${currency} exceeds strategy limit of ${strategyLimits.maxBuyAmountSOL.toFixed(6)}.`;
                this.logger.warn(`RiskManager: ${reason} for ${strategyId}`);
                this._emitRiskEvent('risk:limitReached', strategyId, 'maxBuyAmountSOL', tradeParams, reason, currentGameState);
                return { isApproved: false, reason };
            }
            if (strategyExposure.openTradesCount >= (strategyLimits.maxOpenTradesPerGame || Infinity)) {
                const reason = `Max open trades limit of ${strategyLimits.maxOpenTradesPerGame} reached for ${strategyId}. (${strategyExposure.openTradesCount} open).`;
                this.logger.warn(`RiskManager: ${reason}`);
                this._emitRiskEvent('risk:limitReached', strategyId, 'maxOpenTradesPerGame', tradeParams, reason, currentGameState);
                return { isApproved: false, reason };
            }
            const projectedStrategyExposure = strategyExposure.capitalAtRisk + amountToSpendOrEvaluatedValue;
            if (projectedStrategyExposure > (strategyLimits.maxStrategyExposureSOL || Infinity)) {
                const reason = `Projected strategy exposure ${projectedStrategyExposure.toFixed(6)} exceeds limit ${strategyLimits.maxStrategyExposureSOL.toFixed(6)} for ${strategyId}.`;
                this.logger.warn(`RiskManager: ${reason}`);
                this._emitRiskEvent('risk:limitReached', strategyId, 'maxStrategyExposureSOL', tradeParams, reason, currentGameState);
                return { isApproved: false, reason };
            }
            if (currentGameState && currentGameState.tickCount < (strategyLimits.minRequiredSafeTickCount || 0)) {
                const reason = `Attempted buy at tick ${currentGameState.tickCount} which is below strategy's minRequiredSafeTickCount of ${strategyLimits.minRequiredSafeTickCount} for ${strategyId}.`;
                this.logger.warn(`RiskManager: ${reason}`);
                this._emitRiskEvent('risk:limitReached', strategyId, 'minRequiredSafeTickCount', tradeParams, reason, currentGameState);
                return { isApproved: false, reason };
            }

            // 2. Global Limits for Buys
            if (amountToSpendOrEvaluatedValue > (this.globalRiskLimits.globalMaxBuyAmountSOL || Infinity)) {
                const reason = `Buy amount ${amountToSpendOrEvaluatedValue.toFixed(6)} ${currency} exceeds global max buy amount of ${(this.globalRiskLimits.globalMaxBuyAmountSOL || Infinity).toFixed(6)}.`;
                this.logger.warn(`RiskManager: ${reason} for ${strategyId}`);
                this._emitRiskEvent('risk:limitReached', strategyId, 'globalMaxBuyAmountSOL', tradeParams, reason, currentGameState);
                return { isApproved: false, reason };
            }
            const projectedTotalExposure = this.activeExposure.totalCapitalAtRisk + amountToSpendOrEvaluatedValue;
            if (projectedTotalExposure > (this.globalRiskLimits.maxTotalExposureSOL || Infinity)) {
                const reason = `Projected total exposure ${projectedTotalExposure.toFixed(6)} exceeds global limit ${(this.globalRiskLimits.maxTotalExposureSOL || Infinity).toFixed(6)}.`;
                this.logger.warn(`RiskManager: ${reason} (Strategy: ${strategyId})`);
                this._emitRiskEvent('risk:limitReached', strategyId, 'maxTotalExposureSOL', tradeParams, reason, currentGameState);
                return { isApproved: false, reason };
            }
            
            // Calculate current total open trades across all strategies
            let currentGlobalOpenTrades = 0;
            for (const exposure of this.activeExposure.perStrategy.values()) {
                currentGlobalOpenTrades += exposure.openTradesCount;
            }

            if (currentGlobalOpenTrades >= (this.globalRiskLimits.maxConcurrentTradesGlobal || Infinity)) {
                const reason = `Global maximum concurrent trades limit of ${(this.globalRiskLimits.maxConcurrentTradesGlobal || Infinity)} reached. Currently ${currentGlobalOpenTrades} open trades globally.`;
                this.logger.warn(`RiskManager: ${reason} (Attempt by strategy: ${strategyId})`);
                this._emitRiskEvent('risk:limitReached', strategyId, 'maxConcurrentTradesGlobal', tradeParams, reason, currentGameState);
                return { isApproved: false, reason };
            }

        } else if (type === 'sell') {
            // Currently, most sell orders are approved by default from a risk perspective as they reduce exposure.
            // Add specific sell-side risk checks here if needed (e.g., preventing selling into extreme volatility, etc.)
            this.logger.debug(`RiskManager: Sell order for ${strategyId} (Amount: ${amountToSpendOrEvaluatedValue.toFixed(6)} ${currency}) - Defaulting to approved.`);
        }

        this.logger.info(`RiskManager: Trade approved for ${strategyId}. Details: ${JSON.stringify(tradeParams)}`);
        return { isApproved: true, reason: null };
    }

    /**
     * Helper to emit risk-related events.
     * @private
     */
    _emitRiskEvent(eventName, strategyId, limitType, tradeParams, reason, currentGameState) {
        this.eventBus.emit(eventName, {
            details: { 
                strategyId, 
                limitType, 
                tradeParams, 
                reason, 
                gamePhase: currentGameState?.phase,
                gameTick: currentGameState?.tickCount,
                currentStrategyExposure: this.activeExposure.perStrategy.get(strategyId),
                currentTotalExposure: this.activeExposure.totalCapitalAtRisk
            }, 
            category: 'risk_management', 
            priority: 'high' 
        });
    }

    /**
     * Handles simulated trade events to update exposure.
     * @param {object} payload - The event payload from trade:simulatedBuy or trade:simulatedSell.
     * @private
     */
    async _handleSimulatedTrade(payload) {
        this.logger.info('RiskManager: _handleSimulatedTrade ABSOLUTELY TRIGGERED.'); 

        if (payload && typeof payload === 'object') {
            this.logger.info(`RiskManager: Raw payload received. Type: ${typeof payload}. Keys: ${Object.keys(payload).join(', ')}`);
            // For more detail, if needed, uncomment the line below AND ensure your logger level is set to debug for this message to appear.
            // this.logger.debug('RiskManager: Full raw payload details:', payload);
        } else {
            this.logger.info('RiskManager: Raw payload is null, undefined, or not a typical object. Value:', payload);
        }

        if (!payload || typeof payload !== 'object') {
            this.logger.error('RiskManager: _handleSimulatedTrade called with invalid payload structure. Cannot process.');
            return;
        }

        let category = payload.category || 'N/A_Cat_Default';
        let priority = payload.priority || 'N/A_Pri_Default';
        let details = payload.details;
        let detailsAvailable = !!details;

        this.logger.info(`RiskManager: _handleSimulatedTrade processing. Category: ${category}, Priority: ${priority}. Details available: ${detailsAvailable}`);

        if (!details || !details.simulated) {
            this.logger.info('RiskManager: _handleSimulatedTrade received non-simulated, detail-less event after checks. Skipping.', payload);
            return;
        }

        const {
            playerId, 
            gameId, 
            type, 
            tokensBought, 
            amountSpent, 
            tokensSold, 
            proceedsNet, 
            currency: buyCurrency, // For buy events, the currency spent (e.g., SOL)
            currencySold: sellCurrency, // For sell events, the currency of the tokens sold (e.g., SOL-tokens, FREE-tokens)
            price, 
            success,
            strategyName
        } = details;

        this.logger.info(`RiskManager: Extracted from details - playerId: ${playerId}, type: ${type}, success: ${success}, buyCurrency: ${buyCurrency}, sellCurrency: ${sellCurrency}`);

        if (!playerId) {
            this.logger.error('RiskManager: _handleSimulatedTrade event details missing playerId. Cannot update exposure.', details);
            return;
        }

        if (!success) {
            this.logger.info(`RiskManager: _handleSimulatedTrade received non-successful trade event for ${playerId}. Skipping.`, payload);
            return;
        }

        let strategyExposure = this.activeExposure.perStrategy.get(playerId);
        if (!strategyExposure) {
            this.logger.warn(`RiskManager: Exposure state not found for strategy ${playerId} in game ${gameId}. Initializing.`);
            strategyExposure = { capitalAtRisk: 0, openTradesCount: 0, pnl: 0 }; 
            this.activeExposure.perStrategy.set(playerId, strategyExposure); 
        }
        
        const isBuy = (type === 'buy' && amountSpent !== undefined);
        const isSell = (type === 'sell' && tokensSold !== undefined && proceedsNet !== undefined);

        if (isBuy) {
            strategyExposure.capitalAtRisk += amountSpent; 
            this.activeExposure.totalCapitalAtRisk += amountSpent;
            strategyExposure.openTradesCount++; 
            this.logger.info(`RiskManager: Exposure updated for ${playerId} after SIMULATED BUY. Capital@Risk: ${strategyExposure.capitalAtRisk.toFixed(6)}, OpenTrades: ${strategyExposure.openTradesCount}, Game: ${gameId}`);
        } else if (isSell) {
            // Determine the currency of the tokens that were sold.
            // For SOL-based game tokens, this would be 'SOL'. For FREE-based, 'FREE'.
            const currencyOfTokensSold = sellCurrency; 

            if (!currencyOfTokensSold) {
                this.logger.error(`RiskManager: Cannot determine currency of tokens sold for player ${playerId}, game ${gameId}. Sell event details:`, details);
                return; // Cannot proceed without knowing which token type's cost basis to fetch
            }

            // Get cost basis and positions closed details from PlayerStateService
            const costBasisDetails = await playerStateService.getCostBasisAndPositionDetailsForSell(
                playerId, 
                gameId, 
                currencyOfTokensSold, 
                tokensSold
            );

            // Use totalCostBasis from details for capital reduction
            const capitalReduced = costBasisDetails.totalCostBasis;
            const positionsToDecrement = costBasisDetails.positionsClosedCount;

            strategyExposure.capitalAtRisk -= capitalReduced; 
            this.activeExposure.totalCapitalAtRisk -= capitalReduced; 
            strategyExposure.openTradesCount -= positionsToDecrement; // Decrement by actual positions closed
            
            if (strategyExposure.capitalAtRisk < 0) strategyExposure.capitalAtRisk = 0; 
            if (this.activeExposure.totalCapitalAtRisk < 0) this.activeExposure.totalCapitalAtRisk = 0;
            if (strategyExposure.openTradesCount < 0) strategyExposure.openTradesCount = 0; 
            
            this.logger.info(`RiskManager: Exposure updated for ${playerId} after SIMULATED SELL. Capital@Risk: ${strategyExposure.capitalAtRisk.toFixed(6)}, OpenTrades: ${strategyExposure.openTradesCount}, Game: ${gameId}`);
        } else {
            this.logger.warn(`RiskManager: Unhandled trade type ('${type}') or missing critical money/token fields in _handleSimulatedTrade for ${playerId}`, details);
            return; 
        }
        
        this.logger.info(`RiskManager: Trade for ${playerId} processed by _handleSimulatedTrade. Current totalCapitalAtRisk: ${this.activeExposure.totalCapitalAtRisk.toFixed(6)}`);
    }
}

module.exports = RiskManagerService;