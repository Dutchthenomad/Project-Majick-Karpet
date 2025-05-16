const EventEmitter = require('events');
const logger = require('../../utils/logger');
const path = require('path'); // path is needed for require.resolve or path.resolve
const { getConfig, getAllConfig } = require('../../config/config-service');
const BacktestPlayerStateService = require('./backtest-player-state-service'); // Import new service
const BacktestRiskManagerService = require('./backtest-risk-manager-service'); // Import
// We will need StrategyManager to instantiate strategies if we pass full configs
// const StrategyManager = require('../strategy-manager'); 
// For now, let's assume strategy class is passed directly or resolved via modulePath
const cloneDeep = require('lodash/cloneDeep');

/**
 * @class BacktestEngine
 * @description Orchestrates running trading strategies against historical game data.
 */
class BacktestEngine {
    /**
     * Constructor for BacktestEngine.
     * @param {object} globalConfig - The main application configuration object.
     * @param {DataPersistenceService} dataPersistenceService - Instance of DataPersistenceService.
     * @param {StrategyManager} strategyManager - Instance of StrategyManager (optional for now, can pass strategy class directly).
     */
    constructor(globalConfig, dataPersistenceService, strategyManager = null) {
        this.globalConfig = globalConfig;
        this.dataPersistenceService = dataPersistenceService;
        this.strategyManager = strategyManager; // For loading strategies by config later
        
        this.backtestEventBus = new EventEmitter(); // Dedicated event bus for each backtest run
        this.logger = logger; // Use global logger
        this.currentBacktestGameState = null; // Will hold { gameId, price, tickCount, phase, timestamp, gameParameters }
        this.currentBacktestPlayerStateService = null; // To hold the BPS instance for the current run

        // Mock Trade Executor that will be passed to strategies in backtest context
        this.mockTradeExecutor = {
            simulateBuy: async (params, engineInstance) => {
                const tradeFee = engineInstance.currentBacktestGameState?.gameParameters?.TRADE_FEE || 0.01;
                const price = params.price || (engineInstance.currentBacktestGameState ? engineInstance.currentBacktestGameState.price : 1);
                const costAfterFees = params.amountToSpend * (1 - tradeFee);
                const tokensBought = price > 0 ? costAfterFees / price : 0;
                
                engineInstance.logger.info(`[BacktestTradeExecutor] Simulate Buy: ${params.amountToSpend.toFixed(6)} ${params.currency} for ${tokensBought.toFixed(6)} tokens @ ${price.toFixed(6)}. Fee: ${(tradeFee * 100).toFixed(2)}%`);
                
                const result = { 
                    success: tokensBought > 0, 
                    tokensBought, 
                    cost: params.amountToSpend, // Original amount strategy wanted to spend
                    price, 
                    gameId: params.gameId, 
                    playerId: params.playerId, 
                    strategyName: params.strategyName, 
                    feeApplied: tradeFee,
                    message: tokensBought > 0 ? 'Backtest Buy OK' : 'Backtest Buy Failed (e.g. zero price)'
                };
                engineInstance.backtestEventBus.emit('trade:simulatedBuy', { 
                    details: { ...result, simulationTimestamp: engineInstance.currentBacktestGameState?.timestamp || Date.now(), type: 'buy', currency: params.currency, amountSpent: params.amountToSpend, costIncludingFees: params.amountToSpend }, 
                    category: 'trade_simulation' 
                });
                return result;
            },
            simulateSellByTokenAmount: async (params, engineInstance) => {
                const tradeFee = engineInstance.currentBacktestGameState?.gameParameters?.TRADE_FEE || 0.01;
                const price = params.price || (engineInstance.currentBacktestGameState ? engineInstance.currentBacktestGameState.price : 1);
                
                let costBasisOfTokensSold = 0;
                let positionsClosedCount = 0;
                let tokensActuallySold = params.tokenAmountToSell; // Start with requested amount
                // Initialize fifoResult with default values to prevent reference error if the if-block is skipped
                let fifoResult = { costOfGoodsSold: 0, tokensAccountedFor: params.tokenAmountToSell, positionsClosedCount: 0, weightedAvgHoldTimeForSoldPortion: 0 }; 

                if (engineInstance.currentBacktestPlayerStateService && params.currency && params.currency.toUpperCase() === 'SOL') { 
                    const bps = engineInstance.currentBacktestPlayerStateService;
                    fifoResult = bps._calculateFifoCostAndApplySell(bps.solState, params.tokenAmountToSell, engineInstance.currentBacktestGameState?.timestamp || Date.now());
                    costBasisOfTokensSold = fifoResult.costOfGoodsSold;
                    positionsClosedCount = fifoResult.positionsClosedCount;
                    tokensActuallySold = fifoResult.tokensAccountedFor; 
                } else {
                    engineInstance.logger.warn('[BacktestTradeExecutor] BacktestPlayerStateService not available or non-SOL currency for sell cost basis calculation. Using requested sell amount for proceeds calc.');
                    // If BPS isn't used, tokensActuallySold remains params.tokenAmountToSell, and costBasis/positionsClosed remain 0.
                }

                const proceedsBeforeFees = tokensActuallySold * price;
                const feeAmount = proceedsBeforeFees * tradeFee;
                const proceedsNet = proceedsBeforeFees - feeAmount;

                engineInstance.logger.info(`[BacktestTradeExecutor] Simulate Sell Amount: ${tokensActuallySold.toFixed(6)} tokens @ ${price.toFixed(6)} for ${proceedsNet.toFixed(6)} ${params.currency}. CostBasis: ${costBasisOfTokensSold.toFixed(6)}, PositionsClosed: ${positionsClosedCount}. Fee: ${(tradeFee*100).toFixed(2)}%`);
                
                const result = { 
                    success: true, 
                    tokensSold: tokensActuallySold, 
                    proceedsNet, 
                    price, 
                    gameId: params.gameId, 
                    playerId: params.playerId, 
                    strategyName: params.strategyName, 
                    feeApplied: tradeFee,
                    costBasisOfTokensSold, 
                    positionsClosedCount,  // Already here from previous edit
                    durationMs: fifoResult.weightedAvgHoldTimeForSoldPortion, // Add this
                    message: 'Backtest Sell Amount OK' 
                }; 
                engineInstance.backtestEventBus.emit('trade:simulatedSell', { 
                    details: { ...result, simulationTimestamp: engineInstance.currentBacktestGameState?.timestamp || Date.now(), type: 'sell', currencySold: params.currency }, 
                    category: 'trade_simulation' 
                });
                return result;
            },
            simulateSellByPercentage: async (params, engineInstance) => {
                engineInstance.logger.info(`[BacktestTradeExecutor] Simulate Sell %: ${params.percentageToSell}% by ${params.playerId}.`);
                if (!engineInstance.currentBacktestPlayerStateService || !params.currency) {
                    engineInstance.logger.error('[BacktestTradeExecutor] Missing playerStateService or currency for percentage sell.');
                    return { success: false, reason: 'Internal error for sell by percentage.' };
                }
                const bps = engineInstance.currentBacktestPlayerStateService;
                const balanceState = params.currency.toUpperCase() === 'SOL' ? bps.solState : bps.freeState;
                const tokenBalance = balanceState.tokenBalance;
                const tokenAmountToSell = tokenBalance * (params.percentageToSell / 100);

                if (tokenAmountToSell <= 0.00000001) {
                    return { success: false, reason: 'Calculated token amount to sell is zero or less.', tokensSold:0, proceedsNet:0 };
                }
                // Pass the explicit tokenAmountToSell to simulateSellByTokenAmount
                return engineInstance.mockTradeExecutor.simulateSellByTokenAmount({ ...params, tokenAmountToSell }, engineInstance);
            }
        };

        this.logger.info('BacktestEngine initialized.');
    }

    /**
     * Runs a backtest for a given gameId and strategy configuration.
     * @param {string} gameId - The ID of the game to backtest against.
     * @param {object} strategyConfig - The configuration object for the strategy to test (as from default.json).
     * @returns {Promise<object|null>} - An object containing backtest results or null on failure.
     */
    async runBacktest(gameId, strategyConfig) {
        this.logger.info(`Starting backtest for game ${gameId}, strategy ${strategyConfig.id} (${strategyConfig.name}).`);
        this.backtestEventBus.removeAllListeners(); // Fresh event bus for each run

        // 0. Initialize Backtest-Scoped Services
        this.currentBacktestPlayerStateService = new BacktestPlayerStateService(this.backtestEventBus, strategyConfig.id, gameId, this.logger);
        this.currentBacktestPlayerStateService.startListening();

        const backtestRiskManagerService = new BacktestRiskManagerService(
            this.backtestEventBus,
            strategyConfig.id,
            gameId,
            this.globalConfig.riskManagement.globalLimits,
            strategyConfig.config.riskConfig,
            this.currentBacktestPlayerStateService, // Pass BPS for potential future use by BRMS
            this.logger
        );
        backtestRiskManagerService.startListening();

        // 1. Load Historical Data
        const gameDetails = await this.dataPersistenceService.getGameDetails(gameId);
        if (!gameDetails) {
            this.logger.error(`BacktestEngine: Game details not found for game ${gameId}. Cannot run backtest.`);
            if (this.currentBacktestPlayerStateService) this.currentBacktestPlayerStateService.stopListening();
            if (backtestRiskManagerService) backtestRiskManagerService.stopListening();
            return null;
        }
        // Extract gameParameters for fee calculation in mockTradeExecutor
        const gameParameters = gameDetails.metadata ? JSON.parse(gameDetails.metadata).gameParameters : {}; 
        // ^ This assumes gameParameters are stored in gameDetails.metadata; adjust if different!
        // If not in metadata, maybe fetch from first `gameStateUpdate` event in `gameEvents` later.
        // For now, mockTradeExecutor has a default fee.

        const priceHistory = await this.dataPersistenceService.getGamePriceHistory(gameId);
        const gameEventsFromDB = await this.dataPersistenceService.getGameEvents(gameId);

        if (!priceHistory || priceHistory.length === 0) {
            this.logger.error(`BacktestEngine: Insufficient price data for game ${gameId}. Cannot run backtest.`);
            if (this.currentBacktestPlayerStateService) this.currentBacktestPlayerStateService.stopListening();
            if (backtestRiskManagerService) backtestRiskManagerService.stopListening();
            return null;
        }
        this.logger.info(`Loaded ${priceHistory.length} price updates and ${gameEventsFromDB.length} game events for game ${gameId}.`);

        // 2. Prepare Combined Event Sequence (simplified: interleave by timestamp)
        const allEvents = [...priceHistory, ...gameEventsFromDB].sort((a, b) => a.timestamp - b.timestamp);
        this.logger.info(`Total ordered events to replay: ${allEvents.length}`);

        // 3. Initialize Strategy for Backtest
        let strategyInstance;
        try {
            const appRoot = getConfig('appRoot', path.resolve(__dirname, '..', '..')); // Get appRoot or default
            const strategyModulePath = path.resolve(appRoot, strategyConfig.modulePath);
            const StrategyClass = require(strategyModulePath);
            
            // Bind `this` of BacktestEngine to mock executor methods
            const boundMockTradeExecutor = {
                simulateBuy: (params) => this.mockTradeExecutor.simulateBuy(params, this),
                simulateSellByTokenAmount: (params) => this.mockTradeExecutor.simulateSellByTokenAmount(params, this),
                simulateSellByPercentage: (params) => this.mockTradeExecutor.simulateSellByPercentage(params, this),
            };

            const backtestContext = {
                logger: this.logger,
                eventBus: this.backtestEventBus,
                tradeExecutor: boundMockTradeExecutor, // Use bound mock executor
                playerStateService: this.currentBacktestPlayerStateService,
                gameStateService: {
                    getCurrentState: () => this.currentBacktestGameState,
                    getCurrentPhase: () => this.currentBacktestGameState?.phase || 'unknown'
                },
                riskManagerService: backtestRiskManagerService // Use the stateful instance
            };
            strategyInstance = new StrategyClass(strategyConfig.id, strategyConfig.config, backtestContext);
            // Strategies might call registerStrategyRiskConfig during initialize
            if (strategyInstance.context.riskManagerService && typeof strategyInstance.context.riskManagerService.registerStrategyRiskConfig === 'function') {
                 strategyInstance.context.riskManagerService.registerStrategyRiskConfig(strategyConfig.id, strategyConfig.config.riskConfig);
            }
            await strategyInstance.initialize();
            await strategyInstance.start();
            this.logger.info(`Strategy ${strategyConfig.id} initialized and started for backtest.`);
        } catch (err) {
            this.logger.error(`BacktestEngine: Error initializing strategy ${strategyConfig.id} (${strategyConfig.modulePath}): ${err.message}`, err);
            if (this.currentBacktestPlayerStateService) this.currentBacktestPlayerStateService.stopListening();
            if (backtestRiskManagerService) backtestRiskManagerService.stopListening();
            return null;
        }

        // 4. Replay Events
        this.logger.info('Starting event replay...');

        // Emit initial game:newGame event
        this.currentBacktestGameState = {
            gameId: gameDetails.game_id,
            price: priceHistory[0]?.price || 1,
            tickCount: priceHistory[0]?.tick || 0,
            phase: 'presale',
            timestamp: gameDetails.start_time,
            gameParameters: gameParameters // Make gameParameters available in the initial state
        };
        this.backtestEventBus.emit('game:newGame', {
            gameId: gameDetails.game_id,
            gameTimestamp: gameDetails.start_time,
            initialState: cloneDeep(this.currentBacktestGameState),
            category: 'game_lifecycle',
            priority: 'high'
        });

        for (const event of allEvents) {
            // Update currentBacktestGameState for the strategy context
            this.currentBacktestGameState.timestamp = event.timestamp;
            if (event.price !== undefined && event.tick !== undefined) { // It's a price_update like object
                this.currentBacktestGameState.price = event.price;
                this.currentBacktestGameState.tickCount = event.tick;
                this.backtestEventBus.emit('game:priceUpdate', { gameId, price: event.price, tickCount: event.tick, gameTimestamp: event.timestamp, category:'game_data' });
            } else if (event.event_type) { // It's a game_event like object
                const eventData = JSON.parse(event.data);
                if (event.event_type === 'game:phaseChange') {
                    this.currentBacktestGameState.phase = eventData.currentPhase;
                    this.currentBacktestGameState.tickCount = eventData.tickCount !== undefined ? eventData.tickCount : this.currentBacktestGameState.tickCount;
                    this.backtestEventBus.emit(event.event_type, { gameId, previousPhase: eventData.previousPhase, currentPhase: eventData.currentPhase, data: { tickCount: this.currentBacktestGameState.tickCount }, gameTimestamp: event.timestamp, category:'game_lifecycle'});
                } else if (event.event_type === 'game:newCandle') {
                    this.currentBacktestGameState.tickCount = eventData.index; // Assuming candle index is tick for this purpose
                    this.backtestEventBus.emit(event.event_type, { gameId, candle: eventData, gameTimestamp: event.timestamp, category:'game_data' });
                }
            }
            // Simple immediate processing, no complex time scaling yet
            await new Promise(resolve => setImmediate(resolve)); 
        }

        // Emit final game:rugged event
        this.currentBacktestGameState.price = gameDetails.rug_price;
        this.currentBacktestGameState.tickCount = gameDetails.tick_count;
        this.currentBacktestGameState.phase = 'settlement';
        
        const ruggedEventPayload = {
            gameId: gameDetails.game_id,
            finalPrice: gameDetails.rug_price,
            peakPrice: gameDetails.peak_multiplier, // Using peak_multiplier as peakPrice for now
            tickCount: gameDetails.tick_count,
            data: cloneDeep(this.currentBacktestGameState),
            gameTimestamp: gameDetails.end_time || allEvents[allEvents.length-1].timestamp,
            category: 'game_lifecycle',
            priority: 'high'
        };
        this.backtestEventBus.emit('game:rugged', ruggedEventPayload);
        this.logger.info('Finished event replay.');

        // Call onGameRugged for the player state service to finalize P&L
        if (this.currentBacktestPlayerStateService) {
            this.currentBacktestPlayerStateService.onGameRugged(gameDetails.rug_price);
        }

        // 5. Collect Results & Shutdown Strategy
        let strategyPerformanceData = {};
        if (this.currentBacktestPlayerStateService) { // Get performance from our stateful service
            strategyPerformanceData = this.currentBacktestPlayerStateService.getPerformanceSummary();
        }
        
        this.logger.info(`Backtest for strategy ${strategyConfig.id} on game ${gameId} complete. Performance:`, strategyPerformanceData);
        
        if(strategyInstance) await strategyInstance.shutdown();
        if(this.currentBacktestPlayerStateService) this.currentBacktestPlayerStateService.stopListening();
        if(backtestRiskManagerService) backtestRiskManagerService.stopListening(); // Stop its listeners
        this.currentBacktestPlayerStateService = null; // Clear for next run

        return { gameId, strategyId: strategyConfig.id, performance: strategyPerformanceData, gameDetails };
    }
}

module.exports = BacktestEngine; 