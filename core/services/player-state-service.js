const logger = require('../../utils/logger');
const eventBus = require('../events/event-bus');
const ServiceBase = require('./service-base');

/**
 * @class PlayerStateService
 * @description Tracks individual player trades, positions, and Profit/Loss (P/L) 
 *              for both SOL and FREE currencies within each game.
 */
class PlayerStateService extends ServiceBase {
    constructor() {
        super('PlayerStateService');
        // Main state object: { gameId: { playerId: { sol: PlayerCurrencyState, free: PlayerCurrencyState } } }
        this.gameStates = {}; 
        this.isListening = false;

        // Bind handler methods
        this._handleNewGame = this._handleNewGame.bind(this);
        this._handleTradeEvent = this._handleTradeEvent.bind(this);
        this._handleGameRugged = this._handleGameRugged.bind(this);
        this._handleSimulatedBuy = this._handleSimulatedBuy.bind(this);
        this._handleSimulatedSell = this._handleSimulatedSell.bind(this);
        // Optional: Bind price update handler if implementing real-time P/L
        // this._handlePriceUpdate = this._handlePriceUpdate.bind(this); 

        logger.info('PlayerStateService initialized.');
    }

    /**
     * Creates the initial structure for a player's state within a specific currency.
     * @private
     */
    _createInitialPlayerCurrencyState() {
        return {
            tokenBalance: 0,    // How many game tokens the player holds
            totalSolInvested: 0, // Total SOL spent on buys (for SOL state)
            totalSolReturned: 0, // Total SOL received from sells (for SOL state)
            trades: [],         // List of { type, amount, price, tick, timestamp }
            realizedPlSol: 0,   // Final P/L calculated at game end (for SOL state)
            // Add equivalent fields for FREE state if needed (e.g., totalFreeInvested)
        };
    }

    /**
     * Starts listening for relevant game and protocol events.
     */
    startListening() {
        if (this.isListening) {
            logger.warn('PlayerStateService is already listening.');
            return;
        }
        logger.info('PlayerStateService starting to listen for events...');
        eventBus.on('game:newGame', this._handleNewGame);
        eventBus.on('protocol:tradeEvent', this._handleTradeEvent);
        eventBus.on('game:rugged', this._handleGameRugged);
        eventBus.on('trade:simulatedBuy', this._handleSimulatedBuy);
        eventBus.on('trade:simulatedSell', this._handleSimulatedSell);
        // Optional: eventBus.on('game:priceUpdate', this._handlePriceUpdate);
        this.isListening = true;
    }

    /**
     * Stops listening for events.
     */
    stopListening() {
        if (!this.isListening) {
            return;
        }
        logger.info('PlayerStateService stopping listening...');
        eventBus.off('game:newGame', this._handleNewGame);
        eventBus.off('protocol:tradeEvent', this._handleTradeEvent);
        eventBus.off('game:rugged', this._handleGameRugged);
        eventBus.off('trade:simulatedBuy', this._handleSimulatedBuy);
        eventBus.off('trade:simulatedSell', this._handleSimulatedSell);
        // Optional: eventBus.off('game:priceUpdate', this._handlePriceUpdate);
        this.isListening = false;
        // Consider whether to clear gameStates here or keep historical data
    }

    // --- Event Handlers ---

    /**
     * Initializes the state structure for a new game.
     * @param {object} eventData - Data from game:newGame event.
     * @param {string} eventData.gameId - The ID of the new game.
     * @private
     */
    _handleNewGame(payload) {
        const gameId = payload.gameId;
        if (!gameId) {
            logger.warn('PlayerStateService: _handleNewGame received event without gameId.', payload);
            return;
        }

        logger.info(`PlayerStateService: Initializing state for new game: ${gameId}`);
        if (!this.gameStates[gameId]) {
            this.gameStates[gameId] = {}; 
        } else {
            logger.warn(`PlayerStateService: Game state for ${gameId} already exists. Overwriting? (Should not happen ideally)`);
            // Potentially clear existing state if needed, depends on desired behavior for duplicate game IDs
            this.gameStates[gameId] = {};
        }
    }

    /**
     * Processes a trade event, updating the relevant player's state for the specific game and currency.
     * @param {object} eventData - Data from protocol:tradeEvent event.
     * @param {object} eventData.trade - The trade details object.
     * @param {number} eventData.timestamp - Timestamp of the event.
     * @private
     */
    _handleTradeEvent(payload) {
        const trade = payload.trade;
        const timestamp = payload.originalTimestamp;

        if (!trade) {
            logger.warn('PlayerStateService: _handleTradeEvent received event without trade data.', payload);
            return;
        }
        if (timestamp === undefined) {
            logger.warn('PlayerStateService: _handleTradeEvent received event without originalTimestamp.', payload);
            // Fallback or decide if this is critical. For tradeRecord, timestamp is important.
            // For now, let it proceed but log warning. Could use payload.timestamp (EventBus time) as fallback.
        }

        // The 'trade' object now comes augmented from RugsProtocolAdapter with gameId and currency.
        // It also contains qty, cost (for buys), proceeds (for sells), and tickCount (renamed from tickIndex).
        
        const { gameId, playerId, type, qty, price, tickCount, currency, cost, proceeds, username } = trade;

        // Validate essential fields
        if (!gameId || !playerId || !type || qty == null || price == null || !currency || tickCount == null) {
            logger.warn('PlayerStateService: Received trade event with missing essential fields:', trade);
            return;
        }
        // Validate currency-specific amount fields
        if (type === 'buy' && cost == null) {
            logger.warn('PlayerStateService: Received BUY trade event missing \'cost\' field:', trade);
            return;
        }
        if (type === 'sell' && proceeds == null) {
            logger.warn('PlayerStateService: Received SELL trade event missing \'proceeds\' field:', trade);
            return;
        }
        
        const normalizedCurrency = currency.toUpperCase(); // SOL/FREE or UNKNOWN
        if (normalizedCurrency !== 'SOL' && normalizedCurrency !== 'FREE') {
             logger.warn(`PlayerStateService: Received trade event with unknown or invalid currency: ${currency}`, trade);
             return;
        }

        if (!this.gameStates[gameId]) {
            // This might happen if a trade event arrives for a game that hasn't been initialized via game:newGame yet,
            // or if it's for an old game already cleaned up. For now, we'll initialize if it's missing.
            // This could be refined later based on strictness.
            logger.warn(`PlayerStateService: Game state for ${gameId} not found. Initializing on first trade for this game.`);
            this.gameStates[gameId] = {};
        }

        // Ensure player exists in the game state
        if (!this.gameStates[gameId][playerId]) {
            this.gameStates[gameId][playerId] = {
                sol: this._createInitialPlayerCurrencyState(),
                free: this._createInitialPlayerCurrencyState(),
                username: username || playerId // Store username if available
            };
            logger.debug(`PlayerStateService: Initialized state for player ${playerId} (User: ${username || 'N/A'}) in game ${gameId}`);
        }

        const playerState = this.gameStates[gameId][playerId];
        const currencyState = normalizedCurrency === 'SOL' ? playerState.sol : playerState.free;

        // Record the trade
        const tradeRecord = { type, qty, price, cost, proceeds, tick: tickCount, timestamp }; // Store cost/proceeds too
        currencyState.trades.push(tradeRecord);

        // Update balances and investment based on trade type
        if (type === 'buy') {
            const tokensReceived = qty; // 'qty' from trade data is the token quantity
            
            currencyState.tokenBalance += tokensReceived;
            if (normalizedCurrency === 'SOL') {
                currencyState.totalSolInvested += cost; // 'cost' is the SOL amount spent
            }
             logger.debug(`Player ${playerId} (${normalizedCurrency}) BOUGHT ${tokensReceived.toFixed(4)} tokens for ${cost.toFixed(4)} at ${price.toFixed(4)}x (Game: ${gameId}, Tick: ${tickCount})`);
            
        } else if (type === 'sell') {
            const tokensSold = qty; // 'qty' from trade data is the token quantity
            
            currencyState.tokenBalance -= tokensSold;
            if (normalizedCurrency === 'SOL') {
                 currencyState.totalSolReturned += proceeds; // 'proceeds' is the SOL amount received
            }
            logger.debug(`Player ${playerId} (${normalizedCurrency}) SOLD ${tokensSold.toFixed(4)} tokens for ${proceeds.toFixed(4)} at ${price.toFixed(4)}x (Game: ${gameId}, Tick: ${tickCount})`);
        } else {
             logger.warn(`PlayerStateService: Received trade event with unknown type: ${type}`, trade);
        }
    }

    /**
     * Finalizes the state for a completed (rugged) game, calculating final P/L.
     * @param {object} eventData - Data from game:rugged event.
     * @param {string} eventData.gameId - The ID of the rugged game.
     * @param {number} eventData.finalPrice - The final multiplier at rug.
     * @private
     */
    _handleGameRugged(payload) {
        const gameId = payload.gameId;
        const finalPrice = payload.finalPrice;

        if (!gameId || finalPrice === undefined) {
            logger.warn('PlayerStateService: _handleGameRugged received event without gameId or finalPrice.', payload);
            return;
        }

        logger.info(`PlayerStateService: Finalizing state for rugged game: ${gameId} at ${finalPrice}x`);
        
        const game = this.gameStates[gameId];
        if (!game) {
            logger.warn(`PlayerStateService: Received rugged event for unknown game: ${gameId}`);
            return;
        }

        for (const playerId in game) {
            const player = game[playerId];

            // Calculate SOL P/L
            const solState = player.sol;
            if (solState.trades.length > 0) { // Only calculate if player participated with SOL
                const remainingValueSol = solState.tokenBalance * finalPrice;
                solState.totalSolReturned += remainingValueSol; // Add value of remaining tokens at rug
                solState.realizedPlSol = solState.totalSolReturned - solState.totalSolInvested;
                solState.tokenBalance = 0; // Tokens are gone after rug

                logger.info(`Player ${playerId} (SOL) - Game ${gameId}: Final P/L = ${solState.realizedPlSol.toFixed(6)} SOL (Invested: ${solState.totalSolInvested.toFixed(6)}, Returned: ${solState.totalSolReturned.toFixed(6)})`);
                // TODO: Emit final player result event
                // eventBus.emit('player:gameResult', { gameId, playerId, currency: 'SOL', result: solState });
            }
            
            // Calculate FREE P/L (if tracked similarly)
            const freeState = player.free;
             if (freeState.trades.length > 0) {
                 const remainingValueFree = freeState.tokenBalance * finalPrice;
                 // Assuming FREE P/L calculation mirrors SOL for tracking purposes
                 // freeState.totalFreeReturned += remainingValueFree; // Need totalFreeReturned field
                 // freeState.realizedPlFree = freeState.totalFreeReturned - freeState.totalFreeInvested; // Need these fields
                 freeState.tokenBalance = 0;

                 logger.info(`Player ${playerId} (FREE) - Game ${gameId}: Final position cleared.`);
                 // TODO: Emit final player result event for FREE if needed
                 // eventBus.emit('player:gameResult', { gameId, playerId, currency: 'FREE', result: freeState });
             }
        }

        // Optional: Archive or remove the game state from active memory after processing
        // logger.debug(`Archiving/removing state for game ${gameId}`);
        // delete this.gameStates[gameId]; 
    }

    _handleSimulatedBuy(payload) {
        const details = payload.details;
        if (!details) {
            logger.warn('PlayerStateService: _handleSimulatedBuy received event without details.', payload);
            return;
        }

        const { gameId, playerId, currency, tokensBought, costIncludingFees, strategyName, simulationTimestamp } = details;

        if (!gameId || !playerId || !currency || tokensBought === undefined || costIncludingFees === undefined) {
            logger.warn('PlayerStateService: Simulated buy event missing crucial details.', details);
            return;
        }

        const normalizedCurrency = currency.toUpperCase();
        if (normalizedCurrency !== 'SOL' && normalizedCurrency !== 'FREE') {
            logger.warn(`PlayerStateService: Simulated buy for unsupported currency ${currency}. Player: ${playerId}`, details);
            return;
        }

        if (!this.gameStates[gameId]) {
            this.gameStates[gameId] = {};
            logger.debug(`PlayerStateService: Initialized game state for ${gameId} due to simulated buy.`);
        }
        if (!this.gameStates[gameId][playerId]) {
            this.gameStates[gameId][playerId] = {
                sol: this._createInitialPlayerCurrencyState(),
                free: this._createInitialPlayerCurrencyState(),
                username: strategyName || playerId // Use strategyName as username for simulated entities
            };
            logger.debug(`PlayerStateService: Initialized state for player ${playerId} (Strategy: ${strategyName}) in game ${gameId} due to simulated buy.`);
        }

        const playerCurrencyState = normalizedCurrency === 'SOL' ? this.gameStates[gameId][playerId].sol : this.gameStates[gameId][playerId].free;
        
        playerCurrencyState.tokenBalance += tokensBought;
        if (normalizedCurrency === 'SOL') {
            playerCurrencyState.totalSolInvested += costIncludingFees; // Assuming costIncludingFees is the actual SOL spent by strategy
        }
        // TODO: Add to a separate this.simulatedTrades array if needed for auditing

        logger.info(`PlayerStateService (Simulated): ${playerId} BOUGHT ${tokensBought.toFixed(6)} ${normalizedCurrency}-tokens for ${costIncludingFees.toFixed(6)} SOL. Balance: ${playerCurrencyState.tokenBalance.toFixed(6)}. Game: ${gameId}.`);
    }

    _handleSimulatedSell(payload) {
        const details = payload.details;
        if (!details) {
            logger.warn('PlayerStateService: _handleSimulatedSell received event without details.', payload);
            return;
        }

        const { gameId, playerId, currencySold, tokensSold, proceedsNet, strategyName, simulationTimestamp } = details;

        if (!gameId || !playerId || !currencySold || tokensSold === undefined || proceedsNet === undefined) {
            logger.warn('PlayerStateService: Simulated sell event missing crucial details.', details);
            return;
        }

        const normalizedCurrency = currencySold.toUpperCase();
        if (normalizedCurrency !== 'SOL' && normalizedCurrency !== 'FREE') {
            logger.warn(`PlayerStateService: Simulated sell for unsupported currency ${currencySold}. Player: ${playerId}`, details);
            return;
        }

        if (!this.gameStates[gameId] || !this.gameStates[gameId][playerId]) {
            logger.warn(`PlayerStateService: No state found for player ${playerId} in game ${gameId} to process simulated sell. This shouldn't happen if buys are processed first.`, details);
            return;
        }

        const playerCurrencyState = normalizedCurrency === 'SOL' ? this.gameStates[gameId][playerId].sol : this.gameStates[gameId][playerId].free;

        if (playerCurrencyState.tokenBalance < tokensSold) {
            logger.warn(`PlayerStateService (Simulated): ${playerId} attempted to sell ${tokensSold.toFixed(6)} ${normalizedCurrency}-tokens but only has ${playerCurrencyState.tokenBalance.toFixed(6)}. Adjusting sell amount. Game: ${gameId}`);
            // This case should ideally be prevented by TradeExecutionService checks, but good to be robust.
            // tokensSold = playerCurrencyState.tokenBalance; // Or handle as an error / partial sell
        }
        
        playerCurrencyState.tokenBalance -= tokensSold;
        if (normalizedCurrency === 'SOL') {
            playerCurrencyState.totalSolReturned += proceedsNet;
        }
        // TODO: Add to a separate this.simulatedTrades array if needed for auditing

        logger.info(`PlayerStateService (Simulated): ${playerId} SOLD ${tokensSold.toFixed(6)} ${normalizedCurrency}-tokens for ${proceedsNet.toFixed(6)} SOL. Balance: ${playerCurrencyState.tokenBalance.toFixed(6)}. Game: ${gameId}.`);
    }
    
    // --- Data Access Methods ---

    /**
     * Retrieves the state for a specific player in a specific game.
     * @param {string} gameId - The game ID.
     * @param {string} playerId - The player ID.
     * @returns {object | null} The player's state object { sol: ..., free: ... } or null if not found.
     */
    getPlayerState(gameId, playerId) {
        if (this.gameStates[gameId] && this.gameStates[gameId][playerId]) {
            // Return a deep copy to prevent external modification
            return JSON.parse(JSON.stringify(this.gameStates[gameId][playerId]));
        }
        return null;
    }

    /**
     * Retrieves the final results for all players in a completed game.
     * Note: This currently relies on the game state *not* being deleted immediately after rug.
     * @param {string} gameId - The game ID.
     * @returns {object | null} An object mapping playerId to their final state, or null.
     */
    getGameResults(gameId) {
         if (this.gameStates[gameId]) {
             // Ensure P/L calculations have been done (might need a 'finalized' flag)
             // For now, assume if game exists after rug, P/L is calculated.
             return JSON.parse(JSON.stringify(this.gameStates[gameId]));
         }
         return null;
    }

    /**
     * Calculates the cost basis and details of positions closed for a simulated sell, using FIFO.
     * @param {string} playerId - The ID of the player/strategy.
     * @param {string} gameId - The ID of the game.
     * @param {string} currency - The currency of the tokens being sold (e.g., 'SOL').
     * @param {number} tokenAmountToSell - The quantity of game tokens intended to be sold.
     * @returns {Promise<{totalCostBasis: number, positionsClosedCount: number, tokensAccountedFor: number, contributingBuyTrades: Array<object>}>}
     *          - totalCostBasis: Sum of the cost of the tokens being sold.
     *          - positionsClosedCount: Number of distinct buy trades fully or partially consumed.
     *          - tokensAccountedFor: Actual number of tokens that could be accounted for from buy history (might be less than tokenAmountToSell if insufficient history).
     *          - contributingBuyTrades: Array of buy trade records (or parts) that contributed.
     */
    async getCostBasisAndPositionDetailsForSell(playerId, gameId, currency, tokenAmountToSell) {
        this.logger.info(`PlayerStateService: getCostBasisAndPositionDetailsForSell called for Player ${playerId}, Game ${gameId}, Sell ${tokenAmountToSell} ${currency}-tokens.`);

        let totalCostBasis = 0;
        let positionsClosedCount = 0;
        let tokensAccountedFor = 0;
        const contributingBuyTradesDetails = []; // Renamed for clarity

        if (!playerId || !gameId || !currency || typeof tokenAmountToSell !== 'number' || tokenAmountToSell <= 0) {
            this.logger.warn(`PlayerStateService: Invalid parameters for getCostBasisAndPositionDetailsForSell. Player: ${playerId}, Game: ${gameId}, Currency: ${currency}, Amount: ${tokenAmountToSell}`);
            return { totalCostBasis, positionsClosedCount, tokensAccountedFor, contributingBuyTrades: contributingBuyTradesDetails };
        }

        const normalizedCurrency = currency.toUpperCase();
        const playerGameData = this.gameStates[gameId] ? this.gameStates[gameId][playerId] : null;

        if (!playerGameData) {
            this.logger.warn(`PlayerStateService: No game data found for player ${playerId} in game ${gameId}. Cannot calculate cost basis.`);
            return { totalCostBasis, positionsClosedCount, tokensAccountedFor, contributingBuyTrades: contributingBuyTradesDetails };
        }

        const currencyState = normalizedCurrency === 'SOL' ? playerGameData.sol : playerGameData.free;

        if (!currencyState) {
            this.logger.warn(`PlayerStateService: No ${normalizedCurrency} currency state found for player ${playerId} in game ${gameId}.`);
            return { totalCostBasis, positionsClosedCount, tokensAccountedFor, contributingBuyTrades: contributingBuyTradesDetails };
        }

        // Ensure valid buy trades with qty and cost, sorted for FIFO
        const buyTrades = currencyState.trades
            .filter(t => t.type === 'buy' && t.qty > 0 && t.cost > 0) 
            .sort((a, b) => a.timestamp - b.timestamp);

        if (buyTrades.length === 0) {
            this.logger.info(`PlayerStateService: No valid buy trades found for ${playerId} (${normalizedCurrency}) in game ${gameId} to calculate cost basis. Cost basis is 0.`);
            return { totalCostBasis, positionsClosedCount, tokensAccountedFor, contributingBuyTrades: contributingBuyTradesDetails };
        }

        this.logger.debug(`PlayerStateService: Found ${buyTrades.length} buy trades for ${playerId} (${normalizedCurrency}) in game ${gameId} to process for cost basis. Selling ${tokenAmountToSell} tokens.`);
        
        let tokensStillToAccountFor = tokenAmountToSell;

        for (const buyTrade of buyTrades) {
            if (tokensStillToAccountFor <= 0.000000001) { // Use a small epsilon for float comparison
                break; // All tokens for the sell have been accounted for
            }

            // Ensure pricePerTokenForThisBuy is valid
            if (!buyTrade.qty || buyTrade.qty <= 0 || !buyTrade.cost || buyTrade.cost <=0) {
                this.logger.warn(`PlayerStateService: Skipping invalid buy trade lot during FIFO for ${playerId} (Game ${gameId}): qty=${buyTrade.qty}, cost=${buyTrade.cost}`);
                continue;
            }
            const pricePerTokenForThisBuy = buyTrade.cost / buyTrade.qty;

            let tokensTakenFromThisLot = 0;
            
            if (buyTrade.qty >= tokensStillToAccountFor) {
                tokensTakenFromThisLot = tokensStillToAccountFor;
            } else {
                tokensTakenFromThisLot = buyTrade.qty;
            }

            const costOfTokensTakenFromThisLot = tokensTakenFromThisLot * pricePerTokenForThisBuy;

            totalCostBasis += costOfTokensTakenFromThisLot;
            tokensAccountedFor += tokensTakenFromThisLot;
            tokensStillToAccountFor -= tokensTakenFromThisLot;
            
            // Only increment positionsClosedCount if we actually take tokens from this lot
            if (tokensTakenFromThisLot > 0.000000001) { // Use epsilon
                positionsClosedCount++; 
            }

            contributingBuyTradesDetails.push({
                buyTradeTimestamp: buyTrade.timestamp,
                tokensFromThisLot: tokensTakenFromThisLot,
                costFromThisLot: costOfTokensTakenFromThisLot,
                originalBuyPrice: buyTrade.price,
                originalBuyQty: buyTrade.qty,
                originalBuyCost: buyTrade.cost
            });

            this.logger.debug(`PlayerStateService: FIFO - Took ${tokensTakenFromThisLot.toFixed(8)} tokens (cost: ${costOfTokensTakenFromThisLot.toFixed(8)}) from buy lot @ ${new Date(buyTrade.timestamp).toISOString()} (Price: ${buyTrade.price}). Remaining to account: ${tokensStillToAccountFor.toFixed(8)}`);
        }

        if (tokensStillToAccountFor > 0.000000001) { // Use epsilon
            this.logger.warn(`PlayerStateService: Could not account for all tokens to sell for ${playerId} (${normalizedCurrency}) in game ${gameId}. Requested: ${tokenAmountToSell}, Accounted for: ${tokensAccountedFor.toFixed(8)}. Missing: ${tokensStillToAccountFor.toFixed(8)}`);
        }

        this.logger.info(`PlayerStateService: Cost basis for selling ${tokensAccountedFor.toFixed(8)} ${normalizedCurrency}-tokens for player ${playerId} in game ${gameId}: TotalCostBasis=${totalCostBasis.toFixed(8)}, PositionsClosedCount=${positionsClosedCount}.`);
        return { 
            totalCostBasis, 
            positionsClosedCount, 
            tokensAccountedFor, 
            contributingBuyTrades: contributingBuyTradesDetails 
        };
    }
}

// Export a single instance (Singleton pattern)
const instance = new PlayerStateService();
module.exports = instance; 