const StrategyBase = require('./strategy-base'); // Assuming strategy-base.js is in the same directory

/**
 * @class CopyTraderStrategy
 * @description Replicates another player's trades with fixed SOL moves.
 */
class CopyTraderStrategy extends StrategyBase {
    constructor(strategyId, config = {}, context = {}) {
        super(strategyId, config, context);
        this.targetUsername = config.username;
        this.targetGameId = config.gameId; // Will be undefined if not in config, that's fine
        this.amountToSpend = config.amountToSpend || 0.01; // Default to 0.01 SOL

        if (!this.targetUsername) {
            this.logger.error(`CopyTraderStrategy [${this.strategyId}]: 'username' is a required config field.`);
            // Consider throwing an error or setting a flag to disable the strategy
            this.isActive = false; 
        }
    }

    async initialize() {
        await super.initialize();
        if (this.isActive === false) { // Check if constructor marked it as inactive
            this.logger.warn(`CopyTraderStrategy [${this.strategyId}] is not active due to missing configuration (e.g., targetUsername).`);
            return;
        }
        this.subscribe('protocol:tradeEvent', this.onTradeEvent.bind(this)); // Ensure 'this' context
        this.logger.info(`CopyTraderStrategy [${this.strategyId}] initialized. Targeting user: '${this.targetUsername}', game: '${this.targetGameId || 'any'}', amount: ${this.amountToSpend} SOL.`);
    }

    /**
     * Handler for protocol:tradeEvent. Copies BUY/SELL from target user.
     * @param {object} eventData - The event data.
     * @param {object} eventData.trade - The trade object from the event.
     */
    async onTradeEvent({ trade }) {
        if (!this.isActive) return;

        // Log every trade event received by this strategy for debugging
        this.logger.debug(`CopyTraderStrategy [${this.strategyId}] received tradeEvent: User '${trade.username}', Type '${trade.type}', Game '${trade.gameId}', Tick '${trade.tick || 'N/A'}' at ${new Date().toISOString()}`);

        if (trade.username !== this.targetUsername) {
            this.logger.silly(`CopyTraderStrategy [${this.strategyId}]: Ignoring trade from user '${trade.username}' (target: '${this.targetUsername}').`);
            return;
        }
        
        if (this.targetGameId && trade.gameId !== this.targetGameId) {
            this.logger.silly(`CopyTraderStrategy [${this.strategyId}]: Ignoring trade from game '${trade.gameId}' (target: '${this.targetGameId}').`);
            return;
        }

        this.logger.info(`CopyTraderStrategy [${this.strategyId}]: Detected target trade from User '${trade.username}' in Game '${trade.gameId}'. Type: '${trade.type}', Tick '${trade.tick || 'N/A'}'. Attempting replication.`);

        try {
            if (trade.type === 'buy') {
                this.logger.info(`CopyTraderStrategy [${this.strategyId}]: Replicating BUY by ${this.targetUsername} with ${this.amountToSpend} SOL.`);
                await this.tradeExecutor.executeBuy({
                    playerId: this.strategyId, // Or however your bot identifies its own player ID for trades
                    currency: 'SOL',
                    amountToSpend: this.amountToSpend,
                    strategyName: this.strategyId,
                    gameId: trade.gameId // Ensure we're trading in the same game
                });
            } else if (trade.type === 'sell') {
                const gameState = this.gameStateService.getCurrentState(trade.gameId); // Get state for the specific game
                const price = gameState ? gameState.price : null;

                if (!price || price <= 0) {
                    this.logger.warn(`CopyTraderStrategy [${this.strategyId}]: Cannot replicate SELL for game ${trade.gameId}, invalid price: ${price}. Target user ${this.targetUsername} sold.`);
                    return;
                }
                const tokenAmount = this.amountToSpend / price; // Calculate token amount based on fixed SOL spend
                this.logger.info(`CopyTraderStrategy [${this.strategyId}]: Replicating SELL by ${this.targetUsername}. Attempting to sell ${tokenAmount.toFixed(8)} tokens for approx ${this.amountToSpend} SOL at price ${price}.`);
                await this.tradeExecutor.executeSellByTokenAmount({
                    playerId: this.strategyId,
                    currency: 'SOL',
                    tokenAmountToSell: tokenAmount,
                    strategyName: this.strategyId,
                    gameId: trade.gameId
                });
            } else {
                this.logger.debug(`CopyTraderStrategy [${this.strategyId}]: Ignoring unknown trade type: '${trade.type}' from user '${this.targetUsername}'.`);
            }
        } catch (error) {
            this.logger.error(`CopyTraderStrategy [${this.strategyId}]: Error executing trade replication for user '${this.targetUsername}':`, error);
        }
    }

    async shutdown() {
        this.logger.info(`CopyTraderStrategy [${this.strategyId}] shutting down.`);
        this.unsubscribe('protocol:tradeEvent', this.onTradeEvent.bind(this));
        await super.shutdown();
    }
}

module.exports = CopyTraderStrategy;
