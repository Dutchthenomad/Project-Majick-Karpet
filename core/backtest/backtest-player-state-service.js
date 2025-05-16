const logger = require('../../utils/logger');
const { cloneDeep } = require('lodash'); // For deep copying state safely

/**
 * @class BacktestPlayerStateService
 * @description Manages the state (balances, trades, P&L) for a single strategy
 *              during a single game backtest run. Listens to events on a
 *              dedicated backtest event bus.
 */
class BacktestPlayerStateService {
    /**
     * Constructor for BacktestPlayerStateService.
     * @param {EventEmitter} backtestEventBus - The event bus specific to this backtest instance.
     * @param {string} strategyId - The ID of the strategy whose state is being tracked.
     * @param {string} gameId - The ID of the game being backtested.
     * @param {object} [initialPlayerState=null] - Optional initial state (e.g. starting capital, though usually starts at 0 for a game).
     */
    constructor(backtestEventBus, strategyId, gameId, initialPlayerState = null) {
        this.backtestEventBus = backtestEventBus;
        this.strategyId = strategyId;
        this.gameId = gameId;
        this.logger = logger; // Use global logger for now
        this.logPrefix = `[BacktestPlayerState][${this.strategyId}][${this.gameId}]`;

        this.solState = this._createInitialCurrencyState('SOL');
        this.freeState = this._createInitialCurrencyState('FREE');

        // Apply initial state if provided (e.g. if strategy starts with some capital)
        if (initialPlayerState) {
            if (initialPlayerState.sol) Object.assign(this.solState, initialPlayerState.sol);
            if (initialPlayerState.free) Object.assign(this.freeState, initialPlayerState.free);
        }

        this._handleSimulatedBuy = this._handleSimulatedBuy.bind(this);
        this._handleSimulatedSell = this._handleSimulatedSell.bind(this);
        
        this.logger.info(`${this.logPrefix} Initialized.`);
    }

    _createInitialCurrencyState(currency) {
        return {
            currency: currency,
            tokenBalance: 0,        
            totalAmountInvested: 0, 
            totalAmountReturned: 0, 
            realizedPnL: 0,         
            buyLots: [], // For FIFO: array of { qty, price (per token), cost (total for lot), entryTimestamp }
            trades: [],  // Record of trades made: { type, qty, price, totalValue, timestamp, pnl (for sells), durationMs (for sells) }
            
            // New performance metrics
            executedTradeCount: 0,
            winningTradeCount: 0,
            losingTradeCount: 0,
            breakevenTradeCount: 0,
            totalHoldingTimeMs: 0,
            closedTradesForAvgHoldCount: 0 // Renamed for clarity
        };
    }

    startListening() {
        this.logger.info(`${this.logPrefix} Starting to listen for simulated trade events on backtest event bus.`);
        this.backtestEventBus.on('trade:simulatedBuy', this._handleSimulatedBuy);
        this.backtestEventBus.on('trade:simulatedSell', this._handleSimulatedSell);
    }

    stopListening() {
        this.logger.info(`${this.logPrefix} Stopping listening for simulated trade events.`);
        this.backtestEventBus.off('trade:simulatedBuy', this._handleSimulatedBuy);
        this.backtestEventBus.off('trade:simulatedSell', this._handleSimulatedSell);
    }

    // --- Event Handlers (to be implemented next) ---
    _handleSimulatedBuy(payload) {
        this.logger.debug(`${this.logPrefix} _handleSimulatedBuy received:`, payload);
        if (!payload || !payload.details) {
            this.logger.warn(`${this.logPrefix} Invalid payload for _handleSimulatedBuy.`);
            return;
        }
        const details = payload.details;

        if (details.playerId !== this.strategyId || details.gameId !== this.gameId) {
            return; 
        }

        if (details.currency && details.currency.toUpperCase() === 'SOL') {
            const state = this.solState;
            state.tokenBalance += details.tokensBought;
            state.totalAmountInvested += details.amountSpent; 
            
            state.buyLots.push({
                qty: details.tokensBought,
                price: details.price, 
                cost: details.amountSpent, 
                entryTimestamp: details.simulationTimestamp // Store entry timestamp for holding duration
            });
            
            state.trades.push({
                type: 'buy',
                qty: details.tokensBought,
                price: details.price,
                totalValue: details.amountSpent,
                timestamp: details.simulationTimestamp,
                tick: details.tickCount || details.tick || null 
            });
            this.logger.info(`${this.logPrefix} BUY: ${details.tokensBought.toFixed(6)} @ ${details.price.toFixed(6)} (Cost: ${details.amountSpent.toFixed(6)} SOL). Balance: ${state.tokenBalance.toFixed(6)} tokens. Total Invested: ${state.totalAmountInvested.toFixed(6)} SOL.`);
        } else {
            this.logger.warn(`${this.logPrefix} Simulated buy for non-SOL currency (${details.currency}) not fully handled yet.`);
        }
    }

    _handleSimulatedSell(payload) {
        this.logger.debug(`${this.logPrefix} _handleSimulatedSell received:`, payload);
        if (!payload || !payload.details) {
            this.logger.warn(`${this.logPrefix} Invalid payload for _handleSimulatedSell.`);
            return;
        }
        const details = payload.details;

        if (details.playerId !== this.strategyId || details.gameId !== this.gameId) {
            return; 
        }

        // currencySold is the type of game token, e.g., 'SOL' or 'FREE'
        if (details.currencySold && details.currencySold.toUpperCase() === 'SOL') {
            const state = this.solState;
            
            // These values are now authoritative from the event details, 
            // as FIFO calculation and lot adjustment happened in mockTradeExecutor calling _calculateFifoCostAndApplySell.
            const tokensActuallySold = details.tokensSold;       // This is tokensAccountedFor from FIFO
            const proceedsFromThisSell = details.proceedsNet;
            const costOfGoodsSold = details.costBasisOfTokensSold; 
            // const positionsClosed = details.positionsClosedCount; // Available if needed for metrics here
            const sellTimestamp = details.simulationTimestamp;

            if (tokensActuallySold === undefined || proceedsFromThisSell === undefined || costOfGoodsSold === undefined) {
                this.logger.error(`${this.logPrefix} Critical data missing from trade:simulatedSell event details (tokensSold, proceedsNet, costBasisOfTokensSold). Payload:`, payload);
                return;
            }

            // Note: state.buyLots has already been mutated by the _calculateFifoCostAndApplySell call initiated by mockTradeExecutor.
            // We just need to update the aggregate state here.

            state.tokenBalance -= tokensActuallySold; 
            state.totalAmountReturned += proceedsFromThisSell;
            const pnlForThisSell = proceedsFromThisSell - costOfGoodsSold;
            state.realizedPnL += pnlForThisSell; // This should now be correct as CoGS is from FIFO

            // Update performance counters for this sell trade
            if (tokensActuallySold > 0.000000001) { // Only count if something was actually sold
                state.executedTradeCount++;
                if (pnlForThisSell > 0.00000001) state.winningTradeCount++;
                else if (pnlForThisSell < -0.00000001) state.losingTradeCount++;
                else state.breakevenTradeCount++;
                // Holding time accumulation is now done within _calculateFifoCostAndApplySell
            }

            state.trades.push({
                type: 'sell',
                qty: tokensActuallySold, 
                price: details.price,
                totalValue: proceedsFromThisSell,
                pnl: pnlForThisSell,
                costBasis: costOfGoodsSold, 
                timestamp: sellTimestamp,
                tick: details.tickCount || details.tick || null,
                // durationMs: details.durationMs // If mockTradeExecutor adds this after calling FIFO
            });
            this.logger.info(`${this.logPrefix} SELL PROCESSED: ${tokensActuallySold.toFixed(6)} @ ${details.price.toFixed(6)} (Proceeds: ${proceedsFromThisSell.toFixed(6)} SOL, CostBasis: ${costOfGoodsSold.toFixed(6)}, PnL: ${pnlForThisSell.toFixed(6)}). Balance: ${state.tokenBalance.toFixed(6)} tokens. Total Returned: ${state.totalAmountReturned.toFixed(6)} SOL. Realized PnL: ${state.realizedPnL.toFixed(6)} SOL.`);
        
        } else {
            this.logger.warn(`${this.logPrefix} Simulated sell for non-SOL currency (${details.currencySold}) not fully handled yet.`);
        }
    }

    /**
     * Calculates the cost of goods sold using FIFO for a given amount of tokens to sell,
     * updates the buyLots, and returns the cost basis and tokens accounted for.
     * This method MUTATES the state.buyLots array.
     * @param {object} currencyState - The state object for the currency (e.g., this.solState).
     * @param {number} tokensToSell - The amount of tokens intended to be sold.
     * @returns {{costOfGoodsSold: number, tokensAccountedFor: number, positionsClosedCount: number}}
     * @private
     */
    _calculateFifoCostAndApplySell(currencyState, tokensToSell, sellTimestamp) {
        let costOfGoodsSold = 0;
        let tokensAccountedFor = 0;
        let positionsClosedCount = 0;
        let weightedHoldingTimeSum = 0; // For avg holding time of this specific sell
        const newBuyLots = [];

        for (const buyLot of currencyState.buyLots) {
            if (tokensAccountedFor >= tokensToSell || Math.abs(tokensAccountedFor - tokensToSell) < 0.00000001) {
                newBuyLots.push(buyLot);
                continue;
            }

            const pricePerTokenInLot = buyLot.cost / buyLot.qty;
            const tokensToTakeFromThisLot = Math.min(buyLot.qty, tokensToSell - tokensAccountedFor);
            
            costOfGoodsSold += tokensToTakeFromThisLot * pricePerTokenInLot;
            tokensAccountedFor += tokensToTakeFromThisLot;
            
            if (tokensToTakeFromThisLot > 0.00000001) {
                positionsClosedCount++;
                const holdTimeForLotPortion = sellTimestamp - buyLot.entryTimestamp;
                weightedHoldingTimeSum += holdTimeForLotPortion * tokensToTakeFromThisLot;
                currencyState.totalHoldingTimeMs += holdTimeForLotPortion * tokensToTakeFromThisLot; // Add to total for overall average
                currencyState.closedTradesForAvgHoldCount += tokensToTakeFromThisLot; // Weight by token quantity for overall average
            }
            
            const remainingInLot = buyLot.qty - tokensToTakeFromThisLot;
            if (remainingInLot > 0.00000001) { 
                newBuyLots.push({
                    ...buyLot,
                    qty: remainingInLot,
                    cost: remainingInLot * pricePerTokenInLot 
                });
            }
        }
        currencyState.buyLots = newBuyLots; 
        
        const weightedAvgHoldTimeForSoldPortion = tokensAccountedFor > 0 ? weightedHoldingTimeSum / tokensAccountedFor : 0;
        return { costOfGoodsSold, tokensAccountedFor, positionsClosedCount, weightedAvgHoldTimeForSoldPortion };
    }

    // --- Data Access Methods ---
    getPlayerState(gameId, playerId) {
        if (gameId === this.gameId && playerId === this.strategyId) {
            // Return a deep copy to prevent external modification and to match live service behavior
            return cloneDeep({ 
                sol: this.solState, 
                free: this.freeState, 
                username: this.strategyId // Strategies typically use their ID as username
            });
        }
        this.logger.warn(`${this.logPrefix} getPlayerState called with mismatched gameId/playerId. Expected: ${this.gameId}/${this.strategyId}, Got: ${gameId}/${playerId}`);
        return null; // Or { dataAvailable: false } as suggested by AI
    }

    getPerformanceSummary() {
        const solTrades = this.solState.executedTradeCount;
        const winRate = solTrades > 0 ? (this.solState.winningTradeCount / solTrades) * 100 : 0;
        const avgPnlPerTrade = solTrades > 0 ? this.solState.realizedPnL / solTrades : 0;
        const avgHoldTimeSeconds = this.solState.closedTradesForAvgHoldCount > 0 ? (this.solState.totalHoldingTimeMs / this.solState.closedTradesForAvgHoldCount) / 1000 : 0;

        return {
            strategyId: this.strategyId,
            gameId: this.gameId,
            solRealizedPnL: this.solState.realizedPnL,
            solTotalInvested: this.solState.totalAmountInvested,
            solTotalReturned: this.solState.totalAmountReturned,
            solFinalTokenBalance: this.solState.tokenBalance, 
            
            executedTradeCount: solTrades,
            winningTradeCount: this.solState.winningTradeCount,
            losingTradeCount: this.solState.losingTradeCount,
            breakevenTradeCount: this.solState.breakevenTradeCount,
            winRatePercent: winRate,
            averagePnlPerTradeSOL: avgPnlPerTrade,
            averageHoldingTimeSeconds: avgHoldTimeSeconds,
            // TODO: Max Drawdown (more complex, requires equity curve tracking)
            tradeCount: this.solState.trades.length // This is total buy/sell actions recorded
        };
    }

    /**
     * Called by BacktestEngine when the game simulation ends (rugevent).
     * Calculates the value of any remaining tokens at the final rug price.
     * @param {number} finalPrice - The rug price of the game tokens.
     */
    onGameRugged(finalPrice) {
        this.logger.info(`${this.logPrefix} Game rugged. Final price: ${finalPrice}. Calculating final P&L.`);
        
        // For SOL-based tokens
        if (this.solState.tokenBalance > 0) {
            const remainingValue = this.solState.tokenBalance * finalPrice;
            this.logger.info(`${this.logPrefix} Valuing remaining ${this.solState.tokenBalance.toFixed(8)} SOL-tokens at ${finalPrice.toFixed(6)} = ${remainingValue.toFixed(6)} SOL.`);
            this.solState.totalAmountReturned += remainingValue;
            // Realized P&L is typically sum of trade P&Ls + value of remaining assets - total invested
            // Or, simpler: total returned (including liquidated assets) - total invested
            this.solState.realizedPnL = this.solState.totalAmountReturned - this.solState.totalAmountInvested;
            this.solState.tokenBalance = 0; // Tokens are now valueless or liquidated
        }
        // else, PnL is already what it was from completed trades.
        // If no trades, PnL is 0.

        // TODO: Handle FREE tokens similarly if they have a value at rug or need separate tracking.

        this.logger.info(`${this.logPrefix} Final SOL P&L: ${this.solState.realizedPnL.toFixed(6)} (Invested: ${this.solState.totalAmountInvested.toFixed(6)}, Returned: ${this.solState.totalAmountReturned.toFixed(6)})`);
    }
}

module.exports = BacktestPlayerStateService; 