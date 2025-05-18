const logger = require('./utils/logger');
const BotEngine = require('./core/engine');
const BacktestEngine = require('./core/backtest/backtest-engine');
const { getConfig, getAllConfig } = require('./config/config-service');
const path = require('path');

/**
 * Calculates and logs aggregate performance metrics from multiple backtest results.
 * @param {Array<object>} allPerformanceResults - An array of performance summary objects from each backtest run.
 * @param {string} strategyId - The ID of the strategy that was backtested.
 */
function calculateAndLogAggregateMetrics(allPerformanceResults, strategyId) {
    if (!allPerformanceResults || allPerformanceResults.length === 0) {
        logger.info('No performance results to aggregate.');
        return;
    }

    const totalGames = allPerformanceResults.length;
    let totalPnL = 0;
    let totalInvested = 0;
    let totalReturned = 0;
    let totalExecutedTrades = 0;
    let totalWinningTrades = 0;
    let totalLosingTrades = 0;
    let totalBreakevenTrades = 0;
    let sumOfAvgHoldingTimes = 0;
    let gamesWithHoldingTimeData = 0;

    for (const result of allPerformanceResults) {
        if (result && result.performance) {
            const perf = result.performance;
            totalPnL += perf.solRealizedPnL || 0;
            totalInvested += perf.solTotalInvested || 0;
            totalReturned += perf.solTotalReturned || 0;
            totalExecutedTrades += perf.executedTradeCount || 0;
            totalWinningTrades += perf.winningTradeCount || 0;
            totalLosingTrades += perf.losingTradeCount || 0;
            totalBreakevenTrades += perf.breakevenTradeCount || 0;
            if (perf.averageHoldingTimeSeconds !== undefined && perf.executedTradeCount > 0) {
                // Weight average holding time by number of trades in that game for a more accurate overall average
                // This assumes executedTradeCount is for closed trades relevant to holding time.
                // BacktestPlayerStateService calculates avgHoldingTimeSeconds based on closedTradesForAvgHoldCount (sum of token-weighted durations).
                // So a simple average of these averages might be skewed if games have vastly different trade counts.
                // For now, let's do a simple average of the per-game averages if available.
                sumOfAvgHoldingTimes += perf.averageHoldingTimeSeconds;
                gamesWithHoldingTimeData++;
            }
        }
    }

    const averagePnLPerGame = totalGames > 0 ? totalPnL / totalGames : 0;
    const overallWinRate = totalExecutedTrades > 0 ? (totalWinningTrades / totalExecutedTrades) * 100 : 0;
    const overallAveragePnlPerTrade = totalExecutedTrades > 0 ? totalPnL / totalExecutedTrades : 0;
    const overallAverageHoldingTime = gamesWithHoldingTimeData > 0 ? sumOfAvgHoldingTimes / gamesWithHoldingTimeData : 0;

    logger.info(`\n----- Aggregate Backtest Performance for Strategy: ${strategyId} -----`);
    logger.info(`Total Games Backtested: ${totalGames}`);
    logger.info(`Total Realized P&L (SOL): ${totalPnL.toFixed(8)}`);
    logger.info(`Average P&L per Game (SOL): ${averagePnLPerGame.toFixed(8)}`);
    logger.info(`Total Invested (SOL): ${totalInvested.toFixed(8)}`);
    logger.info(`Total Returned (SOL): ${totalReturned.toFixed(8)}`);
    logger.info(`--- Trade Statistics ---`);
    logger.info(`Total Executed Trades (Sells with P&L): ${totalExecutedTrades}`);
    logger.info(`Total Winning Trades: ${totalWinningTrades}`);
    logger.info(`Total Losing Trades: ${totalLosingTrades}`);
    logger.info(`Total Breakeven Trades: ${totalBreakevenTrades}`);
    logger.info(`Overall Win Rate: ${overallWinRate.toFixed(2)}%`);
    logger.info(`Overall Average P&L per Executed Trade (SOL): ${overallAveragePnlPerTrade.toFixed(8)}`);
    logger.info(`Overall Average Holding Time (seconds): ${overallAverageHoldingTime.toFixed(2)} (based on ${gamesWithHoldingTimeData} games with data)`);
    logger.info('------------------------------------------------------------\n');
}

async function runBatchBacktests(numGamesToTest = 10, strategyIdToTest = null) {
    logger.info(`===== Starting Batch Backtest Run for ${numGamesToTest} games =====`);

    const engine = new BotEngine(getAllConfig());
    const allPerformanceResults = [];
    let testedGameIds = new Set(); // To avoid re-testing same game if summaries overlap

    try {
        logger.info('Initializing BotEngine for DataPersistenceService access...');
        await engine.start();
        logger.info('BotEngine initialized.');

        if (!engine.dataPersistenceService || !engine.dataPersistenceService.db) {
            logger.error('DataPersistenceService not available or DB not initialized. Exiting batch backtest.');
            await engine.stop();
            return;
        }

        const strategiesConfig = getConfig('strategies');
        if (!strategiesConfig || strategiesConfig.length === 0) {
            logger.error('No strategies defined in configuration.');
            await engine.stop(); return;
        }

        const targetStrategyConfig = strategyIdToTest 
            ? strategiesConfig.find(s => s.id === strategyIdToTest && s.enabled)
            : strategiesConfig.find(s => s.enabled); // Default to first enabled if not specified

        // ---- ADDED DEBUG LOG ----
        logger.info('DEBUG: Just before error check, targetStrategyConfig is:', targetStrategyConfig ? targetStrategyConfig.id : 'null or undefined');
        // ---- END ADDED DEBUG LOG ----

        if (!targetStrategyConfig) {
            logger.error(`Strategy ID '${strategyIdToTest || 'any enabled'}' not found or not enabled.`);
            await engine.stop(); return;
        }
        logger.info(`Selected strategy for batch backtest: ${targetStrategyConfig.id} (${targetStrategyConfig.name})`);

        const globalConfigWithAppRoot = getAllConfig();
        if (!globalConfigWithAppRoot.appRoot) {
            globalConfigWithAppRoot.appRoot = path.resolve(__dirname);
        }
        const backtestEngine = new BacktestEngine(globalConfigWithAppRoot, engine.dataPersistenceService, engine.strategyManager);

        let gamesFetchedOffset = 0;
        const gamesFetchLimit = Math.max(20, numGamesToTest); // Fetch a bit more to ensure we find enough rugged games

        while (allPerformanceResults.length < numGamesToTest) {
            const gamesSummary = await engine.dataPersistenceService.getAllGamesSummary(gamesFetchLimit, gamesFetchedOffset);
            if (gamesSummary.length === 0 && gamesFetchedOffset > 0) {
                logger.info('No more games found in database to backtest.');
                break; // No more games to fetch
            }
            if (gamesSummary.length === 0 && gamesFetchedOffset === 0) {
                logger.error('No games found in database to backtest against. Please run live data collection first.');
                break;
            }

            let foundNewGameInBatch = false;
            for (const game of gamesSummary) {
                if (testedGameIds.has(game.game_id)) continue;
                testedGameIds.add(game.game_id);
                foundNewGameInBatch = true;

                if (game.is_rugged && game.end_time && game.tick_count > 50) { // Suitable game
                    logger.info(`--- Starting backtest ${allPerformanceResults.length + 1}/${numGamesToTest} on game ${game.game_id} with strategy ${targetStrategyConfig.id} ---`);
                    const backtestResult = await backtestEngine.runBacktest(game.game_id, targetStrategyConfig);
                    if (backtestResult && backtestResult.performance) {
                        allPerformanceResults.push(backtestResult);
                        logger.info(`Backtest for game ${game.game_id} complete. P&L: ${backtestResult.performance.solRealizedPnL?.toFixed(8)} SOL.`);
                    } else {
                        logger.warn(`Backtest for game ${game.game_id} failed or returned no performance data.`);
                    }
                    if (allPerformanceResults.length >= numGamesToTest) break;
                } else {
                    logger.debug(`Skipping game ${game.game_id} (not rugged, no end_time, or too short).`);
                }
            }
            if (allPerformanceResults.length >= numGamesToTest || !foundNewGameInBatch && gamesSummary.length < gamesFetchLimit) {
                // Stop if we have enough games or if we fetched a partial batch and found no new ones to process
                break;
            }
            gamesFetchedOffset += gamesFetchLimit;
        }

        if (allPerformanceResults.length > 0) {
            calculateAndLogAggregateMetrics(allPerformanceResults, targetStrategyConfig.id);
        } else {
            logger.info('No backtests were successfully completed.');
        }

    } catch (error) {
        logger.error('Error during batch backtest execution:', error);
    } finally {
        logger.info('Shutting down BotEngine after batch backtest...');
        await engine.stop();
        logger.info(`===== Batch Backtest Run for ${numGamesToTest} games Finished =====`);
    }
}

// --- Script Execution ---
const numGamesArg = process.argv[2] ? parseInt(process.argv[2], 10) : 10; // Default to 10 games
const strategyIdArg = process.argv[3] || null; // Optional strategy ID from command line

if (isNaN(numGamesArg) || numGamesArg <= 0) {
    logger.error('Please provide a valid number of games to backtest as the first argument.');
    process.exit(1);
}

runBatchBacktests(numGamesArg, strategyIdArg).catch(err => {
    logger.error('Unhandled error in runBatchBacktests:', err);
    process.exit(1);
}); 