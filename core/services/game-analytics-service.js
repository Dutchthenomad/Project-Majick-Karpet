const logger = require('../../utils/logger');
const eventBus = require('../events/event-bus');
const playerStateService = require('./player-state-service'); // To get game results
const ServiceBase = require('./service-base'); // Require ServiceBase

/**
 * @class GameAnalyticsService
 * @description Calculates and logs summary statistics for each completed game.
 */
class GameAnalyticsService extends ServiceBase { // Extend ServiceBase
    constructor() {
        super('GameAnalyticsService'); // Call super constructor
        this.isListening = false;
        this._handleGameRugged = this._handleGameRugged.bind(this);
        logger.info('GameAnalyticsService initialized.');
    }

    /**
     * Starts listening for relevant game events.
     */
    startListening() {
        if (this.isListening) {
            logger.warn('GameAnalyticsService is already listening.');
            return;
        }
        logger.info('GameAnalyticsService starting to listen for game events...');
        eventBus.on('game:rugged', this._handleGameRugged);
        this.isListening = true;
    }

    /**
     * Stops listening for game events.
     */
    stopListening() {
        if (!this.isListening) {
            return;
        }
        logger.info('GameAnalyticsService stopping listening...');
        eventBus.off('game:rugged', this._handleGameRugged);
        this.isListening = false;
    }

    /**
     * Handles the game:rugged event to calculate and log game statistics.
     * @param {object} eventData.data - The full gameStateUpdate data that triggered the rug.
     * @private
     */
    _handleGameRugged(payload) {
        const { gameId, finalPrice, data } = payload;

        if (!gameId || finalPrice === undefined || !data) {
            logger.warn('[GameAnalytics] _handleGameRugged received event with missing gameId, finalPrice, or data.', payload);
            return;
        }

        logger.info(`[GameAnalytics] Received rugged event for game: ${gameId}. Calculating stats...`);

        const gameResults = playerStateService.getGameResults(gameId);

        if (!gameResults) {
            logger.warn(`[GameAnalytics] No game results found in PlayerStateService for game ${gameId}. Cannot calculate stats.`);
            return;
        }

        let totalSolInvestedInGame = 0;
        let totalSolReturnedInGame = 0;
        // Assuming FREE tokens are primarily tracked by quantity, not direct SOL equivalent for house edge yet
        let totalFreeTokensInvested = 0; 
        let totalFreeTokensSold = 0; // Based on 'proceeds' for FREE sells (which is token quantity)
        let numberOfPlayers = 0;
        let numberOfTrades = 0;

        for (const playerId in gameResults) {
            numberOfPlayers++;
            const playerGameData = gameResults[playerId];

            // SOL calculations
            if (playerGameData.sol) {
                totalSolInvestedInGame += playerGameData.sol.totalSolInvested || 0;
                // totalSolReturned already includes value of tokens at rug from PlayerStateService's _handleGameRugged
                totalSolReturnedInGame += playerGameData.sol.totalSolReturned || 0; 
                numberOfTrades += playerGameData.sol.trades ? playerGameData.sol.trades.length : 0;
            }

            // FREE token calculations (tracking token quantity flow)
            if (playerGameData.free) {
                // 'totalSolInvested' in PlayerCurrencyState for FREE currency actually stores total 'cost' in FREE tokens.
                totalFreeTokensInvested += playerGameData.free.totalSolInvested || 0; 
                // 'totalSolReturned' for FREE currency stores total 'proceeds' in FREE tokens.
                totalFreeTokensSold += playerGameData.free.totalSolReturned || 0;
                // Value of remaining FREE tokens at rug (if any)
                // PlayerStateService currently sets freeState.tokenBalance to 0 without adding to a 'totalFreeReturned' equivalent of SOL.
                // For now, we'll sum what was explicitly sold. We can refine this if FREE tokens have a SOL value at rug.
                numberOfTrades += playerGameData.free.trades ? playerGameData.free.trades.length : 0;
            }
        }

        const houseTakeSol = totalSolInvestedInGame - totalSolReturnedInGame;
        const gameDurationTicks = data ? data.tickCount : 'N/A';
        const finalGameMultiplier = finalPrice; // Already provided

        logger.info('--------------------------------------------------');
        logger.info(`[GameAnalytics] Summary for Game ID: ${gameId}`);
        logger.info('--------------------------------------------------');
        logger.info(`  Game Duration (Ticks):      ${gameDurationTicks}`);
        logger.info(`  Final Game Multiplier (x):  ${finalGameMultiplier.toFixed(6)}`);
        logger.info(`  Number of Players:          ${numberOfPlayers}`);
        logger.info(`  Total Trades in Game:       ${numberOfTrades}`);
        logger.info('  --- SOL Currency ---');
        logger.info(`  Total SOL Invested:         ${totalSolInvestedInGame.toFixed(6)} SOL`);
        logger.info(`  Total SOL Returned:         ${totalSolReturnedInGame.toFixed(6)} SOL`);
        logger.info(`  House Take (SOL):           ${houseTakeSol.toFixed(6)} SOL`);
        logger.info('  --- FREE Currency (Token Qty Flow) ---');
        logger.info(`  Total FREE Tokens Invested: ${totalFreeTokensInvested.toFixed(4)} FREE`);
        logger.info(`  Total FREE Tokens Sold:     ${totalFreeTokensSold.toFixed(4)} FREE`);
        // Note: House take for FREE tokens is more complex if they don't have a direct SOL conversion baked in.
        // For now, we're just observing flow.
        logger.info('--------------------------------------------------');

        // Optionally, emit an event with these stats
        const summaryData = {
            gameId,
            durationTicks: gameDurationTicks,
            finalMultiplier: finalGameMultiplier,
            playerCount: numberOfPlayers,
            tradeCount: numberOfTrades,
            solInvested: totalSolInvestedInGame,
            solReturned: totalSolReturnedInGame,
            solHouseTake: houseTakeSol,
            freeTokensInvested: totalFreeTokensInvested,
            freeTokensSold: totalFreeTokensSold,
            // timestamp: Date.now() // EventBus will add its own timestamp
            gameEndTimestamp: payload.gameTimestamp || payload.timestamp // Prefer gameTimestamp if available
        };

        eventBus.emit('analytics:gameSummary', {
            summary: summaryData,
            category: 'analytics',
            priority: 'normal'
        });
    }
}

// Export a single instance (Singleton pattern)
const instance = new GameAnalyticsService();
module.exports = instance; 