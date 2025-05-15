const ServiceBase = require('./service-base');
const logger = require('../../utils/logger');
const eventBus = require('../events/event-bus');
const playerStateService = require('./player-state-service'); // To get player balances
const gameStateService = require('./game-state-service');   // To get current prices/game state

/**
 * @class TradeExecutionService
 * @description Simulates trade executions based on requests. Does NOT execute real trades initially.
 *              It will check player balances and current market prices to determine
 *              the theoretical outcome of a trade.
 */
class TradeExecutionService extends ServiceBase {
    constructor(options = {}, dependencies = {}) {
        super('TradeExecutionService', options, dependencies);
        // Dependencies will be injected or can be accessed via singletons
        this.playerStateService = dependencies.playerStateService || playerStateService;
        this.gameStateService = dependencies.gameStateService || gameStateService;

        // TODO: Define event listeners for trade requests if using an event-driven approach for strategies
        // e.g., this.eventBus.on('strategy:requestBuy', this.handleStrategyBuyRequest.bind(this));
        this.isListening = false;
    }

    /**
     * Starts listening for any relevant events if necessary.
     * For now, methods might be called directly by strategy modules.
     */
    startListening() {
        if (this.isListening) {
            this.logger.warn(`${this.serviceName} is already listening.`);
            return;
        }
        this.logger.info(`${this.serviceName} starting to listen for events... (currently no direct event listeners defined)`);
        // Example: eventBus.on('strategy:requestBuy', this.handleStrategyBuyRequest.bind(this));
        this.isListening = true;
    }

    /**
     * Stops listening for events.
     */
    stopListening() {
        if (!this.isListening) {
            return;
        }
        this.logger.info(`${this.serviceName} stopping listening...`);
        // Example: eventBus.off('strategy:requestBuy', this.handleStrategyBuyRequest.bind(this));
        this.isListening = false;
    }

    /**
     * Simulates a buy order.
     * @param {object} params - The parameters for the buy simulation.
     * @param {string} params.playerId - The ID of the player making the buy.
     * @param {string} params.currency - The currency to use for buying (e.g., 'SOL').
     * @param {number} params.amountToSpend - The amount of the specified currency to spend.
     * @param {string} [params.strategyName='Manual'] - Name of the strategy initiating the trade.
     * @returns {Promise<object>} - Result of the simulation (e.g., { success: true, tokensBought: X, cost: Y } or { success: false, reason: '...' })
     */
    async simulateBuy({ playerId, currency, amountToSpend, strategyName = 'Manual' }) {
        this.logger.info(`[${this.serviceName}] Received simulateBuy request from ${strategyName}: Player ${playerId}, Spend ${amountToSpend} ${currency}`);

        // 1. Validate input parameters
        if (currency !== 'SOL') {
            const reason = `Unsupported currency for spending: ${currency}. Only SOL allowed.`;
            this.logger.warn(`[${this.serviceName}] simulateBuy by ${strategyName} for player ${playerId}: ${reason}`);
            return { success: false, reason };
        }
        if (typeof amountToSpend !== 'number' || amountToSpend <= 0) {
            const reason = `Invalid amountToSpend: ${amountToSpend}. Must be a positive number.`;
            this.logger.warn(`[${this.serviceName}] simulateBuy by ${strategyName} for player ${playerId}: ${reason}`);
            return { success: false, reason };
        }

        // 2. Get current game state from GameStateService
        const currentGameState = this.gameStateService.getCurrentState(); // Full gameStateUpdate object
        const currentGamePhase = this.gameStateService.getCurrentPhase(); // 'presale', 'active', etc.

        if (!currentGameState || !currentGameState.gameId) {
            const reason = 'No current game state available.';
            this.logger.warn(`[${this.serviceName}] simulateBuy by ${strategyName} for player ${playerId}: ${reason}`);
            return { success: false, reason };
        }

        const { gameId, price: currentPrice } = currentGameState;
        
        // 3. Check if game is active and tradable
        // Assuming presale buys are allowed if game is in 'presale' phase and allowPreRoundBuys is true
        const isPresaleBuyAllowed = currentGamePhase === 'presale' && currentGameState.allowPreRoundBuys;
        if (currentGamePhase !== 'active' && !isPresaleBuyAllowed) {
            const reason = `Game ${gameId} is not in a tradable phase (currently ${currentGamePhase}, PreRoundBuysAllowed: ${currentGameState.allowPreRoundBuys}).`;
            this.logger.info(`[${this.serviceName}] simulateBuy by ${strategyName} for player ${playerId}, game ${gameId}: ${reason}`);
            return { success: false, reason };
        }
        if (currentPrice == null || currentPrice <= 0) {
            const reason = `Invalid current price in game ${gameId}: ${currentPrice}.`;
            this.logger.warn(`[${this.serviceName}] simulateBuy by ${strategyName} for player ${playerId}, game ${gameId}: ${reason}`);
            return { success: false, reason };
        }

        // 4. Player SOL Balance Check (Strategy's responsibility for budget, this is more about game mechanics)
        // For this simulation, we assume the strategy has already determined the amountToSpend is within its own budget.
        // A future enhancement could involve PlayerStateService providing a more direct 'available SOL for trading in-game' value.

        // 5. Calculate how many tokens can be bought
        // The game has a 1% trade fee (0.01)
        const tradeFeePercent = currentGameState.gameParameters?.TRADE_FEE || 0.01; // Default to 1% if not found
        const costAfterFees = amountToSpend * (1 - tradeFeePercent);
        const tokensBought = costAfterFees / currentPrice;

        if (tokensBought <= 0) {
            const reason = `Calculated tokens to buy is not positive (${tokensBought.toFixed(8)}) for ${amountToSpend} ${currency} at price ${currentPrice}. Possible issue with price or amount.`;
            this.logger.warn(`[${this.serviceName}] simulateBuy by ${strategyName} for player ${playerId}, game ${gameId}: ${reason}`);
            return { success: false, reason };
        }

        // 6. Log simulation details
        const logMessage = `SIMULATED BUY by ${strategyName}: Player ${playerId} bought ${tokensBought.toFixed(8)} tokens with ${amountToSpend.toFixed(8)} ${currency} (cost after fee: ${costAfterFees.toFixed(8)}) at price ${currentPrice.toFixed(6)} in game ${gameId}.`;
        this.logger.info(`[${this.serviceName}] ${logMessage}`);

        // 7. Emit event
        const buyDetails = {
            simulationTimestamp: Date.now(), // Explicit timestamp for the simulation event itself
            gameId,
            playerId,
            strategyName,
            type: 'buy',
            currency,
            amountSpent: amountToSpend, 
            costIncludingFees: amountToSpend, 
            tokensBought,
            price: currentPrice,
            feeApplied: tradeFeePercent,
            simulated: true,
            success: true // Explicitly add success to the emitted event details
        };
        this.eventBus.emit('trade:simulatedBuy', {
            details: buyDetails,
            category: 'trade_simulation',
            priority: 'normal'
        });

        // 8. Return success
        return {
            success: true,
            gameId,
            playerId,
            strategyName,
            tokensBought,
            cost: amountToSpend, // The initial amount the strategy decided to spend
            price: currentPrice,
            fee: tradeFeePercent,
            message: logMessage
        };
    }

    /**
     * Simulates a sell order based on a specific amount of tokens.
     * @param {object} params - The parameters for the sell simulation.
     * @param {string} params.playerId - The ID of the player making the sell.
     * @param {string} params.currency - The currency of the tokens being sold (e.g., 'SOL' or 'FREE' game tokens).
     * @param {number} params.tokenAmountToSell - The quantity of game tokens to sell.
     * @param {string} [params.strategyName='Manual'] - Name of the strategy initiating the trade.
     * @returns {Promise<object>} - Result of the simulation (e.g., { success: true, proceeds: X, tokensSold: Y } or { success: false, reason: '...' })
     */
    async simulateSellByTokenAmount({ playerId, currency, tokenAmountToSell, strategyName = 'Manual' }) {
        this.logger.info(`[${this.serviceName}] Received simulateSellByTokenAmount request from ${strategyName}: Player ${playerId}, Sell ${tokenAmountToSell} ${currency}-tokens`);

        // 1. Validate input parameters
        if (typeof tokenAmountToSell !== 'number' || tokenAmountToSell <= 0) {
            const reason = `Invalid tokenAmountToSell: ${tokenAmountToSell}. Must be a positive number.`;
            this.logger.warn(`[${this.serviceName}] simulateSellByTokenAmount by ${strategyName} for player ${playerId}: ${reason}`);
            return { success: false, reason };
        }
        // Assuming 'currency' here refers to the type of game token being sold (e.g., tokens bought with SOL or tokens bought with FREE)
        if (currency !== 'SOL' && currency !== 'FREE') { 
            const reason = `Unsupported currency for tokens being sold: ${currency}. Must be 'SOL' (for SOL-based tokens) or 'FREE' (for FREE-based tokens).`;
            this.logger.warn(`[${this.serviceName}] simulateSellByTokenAmount by ${strategyName} for player ${playerId}: ${reason}`);
            return { success: false, reason };
        }

        // 2. Get current game state from GameStateService
        const currentGameState = this.gameStateService.getCurrentState();
        const currentGamePhase = this.gameStateService.getCurrentPhase();

        if (!currentGameState || !currentGameState.gameId) {
            const reason = 'No current game state available.';
            this.logger.warn(`[${this.serviceName}] simulateSellByTokenAmount by ${strategyName} for player ${playerId}: ${reason}`);
            return { success: false, reason };
        }

        const { gameId, price: currentPrice } = currentGameState;

        // 3. Check if game is active and tradable (sells typically only allowed in 'active' phase)
        if (currentGamePhase !== 'active') {
            const reason = `Game ${gameId} is not in 'active' phase (currently ${currentGamePhase}). Sells typically only allowed during active phase.`;
            this.logger.info(`[${this.serviceName}] simulateSellByTokenAmount by ${strategyName} for player ${playerId}, game ${gameId}: ${reason}`);
            return { success: false, reason };
        }
        if (currentPrice == null || currentPrice <= 0) {
            const reason = `Invalid current price in game ${gameId}: ${currentPrice}.`;
            this.logger.warn(`[${this.serviceName}] simulateSellByTokenAmount by ${strategyName} for player ${playerId}, game ${gameId}: ${reason}`);
            return { success: false, reason };
        }

        // 4. Get player's token balance for the specified currency from PlayerStateService
        const playerOverallState = this.playerStateService.getPlayerState(gameId, playerId);
        let playerTokenBalance = 0;

        if (playerOverallState) {
            if (currency === 'SOL' && playerOverallState.sol) {
                playerTokenBalance = playerOverallState.sol.tokenBalance;
            } else if (currency === 'FREE' && playerOverallState.free) {
                playerTokenBalance = playerOverallState.free.tokenBalance;
            }
        } else {
            const reason = `Player ${playerId} not found in game ${gameId} for token balance check.`;
            this.logger.warn(`[${this.serviceName}] simulateSellByTokenAmount by ${strategyName}: ${reason}`);
            return { success: false, reason };
        }

        if (tokenAmountToSell > playerTokenBalance) {
            const reason = `Insufficient ${currency} token balance for player ${playerId} in game ${gameId}. Requested to sell: ${tokenAmountToSell.toFixed(8)}, Available: ${playerTokenBalance.toFixed(8)}.`;
            this.logger.info(`[${this.serviceName}] simulateSellByTokenAmount by ${strategyName}: ${reason}`);
            return { success: false, reason, currentBalance: playerTokenBalance };
        }

        // 5. Calculate proceeds from selling tokens
        const tradeFeePercent = currentGameState.gameParameters?.TRADE_FEE || 0.01; // Default to 1%
        const proceedsBeforeFees = tokenAmountToSell * currentPrice;
        const feeAmount = proceedsBeforeFees * tradeFeePercent;
        const proceedsAfterFees = proceedsBeforeFees - feeAmount;

        if (proceedsAfterFees < 0) { // Should not happen if price & amount are positive, but good check
             this.logger.warn(`[${this.serviceName}] Calculated negative proceeds (${proceedsAfterFees.toFixed(8)}) for selling ${tokenAmountToSell} ${currency}-tokens. Player ${playerId}, Game ${gameId}. This might indicate an issue.`);
             // Decide if this is a failure or just a 0 proceed trade, for now, let it proceed if tokens can be sold.
        }

        // 6. Log simulation details
        const logMessage = `SIMULATED SELL by ${strategyName}: Player ${playerId} sold ${tokenAmountToSell.toFixed(8)} ${currency}-tokens for ${proceedsAfterFees.toFixed(8)} SOL (proceeds before fee: ${proceedsBeforeFees.toFixed(8)}) at price ${currentPrice.toFixed(6)} in game ${gameId}.`;
        this.logger.info(`[${this.serviceName}] ${logMessage}`);

        // 7. Emit event
        const sellDetails = {
            simulationTimestamp: Date.now(), // Explicit timestamp for the simulation event itself
            gameId,
            playerId,
            strategyName,
            type: 'sell',
            currencySold: currency, 
            tokensSold: tokenAmountToSell,
            proceedsNet: proceedsAfterFees, 
            price: currentPrice,
            feeApplied: tradeFeePercent,
            simulated: true,
            success: true // Explicitly add success to the emitted event details
        };
        this.eventBus.emit('trade:simulatedSell', {
            details: sellDetails,
            category: 'trade_simulation',
            priority: 'normal'
        });

        // 8. Return success
        return {
            success: true,
            gameId,
            playerId,
            strategyName,
            tokensSold: tokenAmountToSell,
            proceeds: proceedsAfterFees, // Net SOL received
            price: currentPrice,
            fee: tradeFeePercent,
            message: logMessage
        };
    }

    /**
     * Simulates a sell order based on a percentage of the player's holdings.
     * @param {object} params - The parameters for the sell simulation.
     * @param {string} params.playerId - The ID of the player making the sell.
     * @param {string} params.currency - The currency of the tokens being sold.
     * @param {number} params.percentageToSell - The percentage of current token holdings to sell (0-100).
     * @param {string} [params.strategyName='Manual'] - Name of the strategy initiating the trade.
     * @returns {Promise<object>} - Result of the simulation.
     */
    async simulateSellByPercentage({ playerId, currency, percentageToSell, strategyName = 'Manual' }) {
        this.logger.info(`[${this.serviceName}] Received simulateSellByPercentage request from ${strategyName}: Player ${playerId}, Sell ${percentageToSell}% of ${currency}-tokens`);

        // 1. Validate input parameters
        if (typeof percentageToSell !== 'number' || percentageToSell <= 0 || percentageToSell > 100) {
            const reason = `Invalid percentageToSell: ${percentageToSell}. Must be a number between 0 (exclusive) and 100 (inclusive).`;
            this.logger.warn(`[${this.serviceName}] simulateSellByPercentage by ${strategyName} for player ${playerId}: ${reason}`);
            return { success: false, reason };
        }
        if (currency !== 'SOL' && currency !== 'FREE') {
            const reason = `Unsupported currency for tokens being sold: ${currency}. Must be 'SOL' or 'FREE'.`;
            this.logger.warn(`[${this.serviceName}] simulateSellByPercentage by ${strategyName} for player ${playerId}: ${reason}`);
            return { success: false, reason };
        }

        // Need gameId to fetch player state
        const currentGameState = this.gameStateService.getCurrentState();
        if (!currentGameState || !currentGameState.gameId) {
            const reason = 'No current game state available to determine gameId for player balance.';
            this.logger.warn(`[${this.serviceName}] simulateSellByPercentage by ${strategyName} for player ${playerId}: ${reason}`);
            return { success: false, reason };
        }
        const gameId = currentGameState.gameId;

        // 2. Get player's token balance.
        const playerOverallState = this.playerStateService.getPlayerState(gameId, playerId);
        let playerTokenBalance = 0;

        if (playerOverallState) {
            if (currency === 'SOL' && playerOverallState.sol) {
                playerTokenBalance = playerOverallState.sol.tokenBalance;
            } else if (currency === 'FREE' && playerOverallState.free) {
                playerTokenBalance = playerOverallState.free.tokenBalance;
            }
        } else {
            const reason = `Player ${playerId} not found in game ${gameId} for token balance check.`;
            this.logger.warn(`[${this.serviceName}] simulateSellByPercentage by ${strategyName}: ${reason}`);
            return { success: false, reason };
        }

        if (playerTokenBalance <= 0) {
            const reason = `Player ${playerId} has no ${currency}-tokens to sell in game ${gameId}. Balance: ${playerTokenBalance.toFixed(8)}.`;
            this.logger.info(`[${this.serviceName}] simulateSellByPercentage by ${strategyName}: ${reason}`);
            return { success: false, reason, currentBalance: playerTokenBalance };
        }

        // 3. Calculate tokenAmountToSell based on percentage.
        const tokenAmountToSell = playerTokenBalance * (percentageToSell / 100);

        if (tokenAmountToSell <= 0) {
            // This might happen if percentage is very small and balance is also small, leading to a near-zero amount
            const reason = `Calculated tokenAmountToSell is not positive (${tokenAmountToSell.toFixed(8)}) for ${percentageToSell}% of balance ${playerTokenBalance.toFixed(8)}.`;
            this.logger.info(`[${this.serviceName}] simulateSellByPercentage by ${strategyName}: ${reason}`);
            return { success: false, reason, calculatedAmount: tokenAmountToSell };
        }

        // 4. Call simulateSellByTokenAmount.
        this.logger.info(`[${this.serviceName}] simulateSellByPercentage for ${playerId}: Calculated ${tokenAmountToSell.toFixed(8)} ${currency}-tokens to sell from ${percentageToSell}% of ${playerTokenBalance.toFixed(8)}.`);
        return this.simulateSellByTokenAmount({
            playerId,
            currency,
            tokenAmountToSell, // The calculated amount
            strategyName
        });
    }

}

// Export a single instance (Singleton pattern) if this service will be managed like others
// For now, we might just export the class if BotEngine will instantiate it manually.
// const instance = new TradeExecutionService();
// module.exports = instance;

module.exports = TradeExecutionService; // Export class for BotEngine to instantiate 