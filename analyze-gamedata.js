const logger = require('./utils/logger');
const BotEngine = require('./core/engine');
const { getConfig, getAllConfig } = require('./config/config-service');

/**
 * Calculates percentiles for a sorted array of numbers.
 * @param {number[]} sortedArr - The sorted array of numbers.
 * @param {number[]} percentiles - Array of percentiles to calculate (e.g., [25, 50, 75, 90]).
 * @returns {object} Object with percentile keys and their values.
 */
function calculatePercentiles(sortedArr, percentilesToCalc = [25, 50, 75, 90, 95]) {
    const results = {};
    if (!sortedArr || sortedArr.length === 0) return results;

    percentilesToCalc.forEach(p => {
        if (p <= 0 || p >= 100) return; // Invalid percentile
        const index = (p / 100) * (sortedArr.length - 1);
        if (Number.isInteger(index)) {
            results[`p${p}`] = sortedArr[index];
        } else {
            // Linear interpolation for non-integer indices
            const lowerIndex = Math.floor(index);
            const upperIndex = Math.ceil(index);
            const fraction = index - lowerIndex;
            if (upperIndex < sortedArr.length) {
                 results[`p${p}`] = sortedArr[lowerIndex] + (sortedArr[upperIndex] - sortedArr[lowerIndex]) * fraction;
            } else { // Handle edge case if upperIndex is out of bounds
                 results[`p${p}`] = sortedArr[lowerIndex];
            }
        }
        if (results[`p${p}`] && typeof results[`p${p}`].toFixed === 'function') {
            results[`p${p}`] = parseFloat(results[`p${p}`].toFixed(4));
        }
    });
    return results;
}

async function performAnalysis() {
    logger.info('===== Starting Game Data Analysis =====');
    const engine = new BotEngine(getAllConfig());
    let dataPersistenceService;

    try {
        // We only need to initialize services enough to get DataPersistenceService
        // A full engine.start() might try to connect to browser etc. which isn't needed for DB queries.
        // However, engine.start() currently initializes DataPersistenceService and its DB connection.
        // For simplicity now, we'll use engine.start() and engine.stop().
        // Later, DataPersistenceService could have a standalone init method if needed for scripts.
        logger.info('Initializing BotEngine to access DataPersistenceService...');
        await engine.start(); 
        dataPersistenceService = engine.dataPersistenceService;

        if (!dataPersistenceService || !dataPersistenceService.db) {
            logger.error('DataPersistenceService not available or DB not initialized. Cannot perform analysis.');
            if(engine) await engine.stop();
            return;
        }
        logger.info('DataPersistenceService ready.');

        // Fetch a larger sample for more robust statistics
        const gamesToFetch = getConfig('analysis.sampleSize', 500);
        const minTickCountForAnalysis = getConfig('analysis.minTickCount', 10);
        logger.info(`Fetching up to ${gamesToFetch} game summaries...`);
        const gamesSummary = await dataPersistenceService.getAllGamesSummary(gamesToFetch, 0); 
        
        const ruggedGames = gamesSummary.filter(g => g.is_rugged && g.tick_count !== null && g.tick_count > minTickCountForAnalysis); 
        
        if (ruggedGames.length < getConfig('analysis.minSampleForStats', 20)) { // Need a reasonable sample
            logger.warn(`Not enough rugged games in the sample (${ruggedGames.length}) for meaningful analysis (min needed: ${getConfig('analysis.minSampleForStats', 20)}). Please collect more data.`);
        } else {
            logger.info(`Analyzing based on ${ruggedGames.length} recent rugged games (tick > ${minTickCountForAnalysis}).`);

            // 1. Game Length (Ticks) Analysis
            const tickCounts = ruggedGames.map(g => g.tick_count).sort((a, b) => a - b);
            const totalTicks = tickCounts.reduce((sum, ticks) => sum + ticks, 0);
            const averageTickLength = totalTicks / ruggedGames.length;
            const tickPercentiles = calculatePercentiles(tickCounts);
            logger.info(`--- Game Length (Ticks) ---`);
            logger.info(`Average: ${averageTickLength.toFixed(2)} ticks`);
            logger.info(`Min: ${tickCounts[0]}, Max: ${tickCounts[tickCounts.length - 1]}`);
            logger.info(`Percentiles: ${JSON.stringify(tickPercentiles)}`);

            // 2. Peak Multiplier Analysis
            const validPeakGames = ruggedGames.filter(g => g.peak_multiplier !== null && g.peak_multiplier > 0);
            if (validPeakGames.length > 0) {
                const peakMultipliers = validPeakGames.map(g => g.peak_multiplier).sort((a, b) => a - b);
                const totalPeakMultiplier = peakMultipliers.reduce((sum, mult) => sum + mult, 0);
                const averagePeakMultiplier = totalPeakMultiplier / validPeakGames.length;
                const peakPercentiles = calculatePercentiles(peakMultipliers);
                logger.info(`--- Peak Multiplier (for ${validPeakGames.length} games with peak data) ---`);
                logger.info(`Average: ${averagePeakMultiplier.toFixed(4)}x`);
                logger.info(`Min: ${peakMultipliers[0].toFixed(4)}, Max: ${peakMultipliers[peakMultipliers.length - 1].toFixed(4)}`);
                logger.info(`Percentiles: ${JSON.stringify(peakPercentiles)}`);
            } else {
                logger.info('No games with peak multiplier data found in the rugged sample.');
            }
            
            // 3. Instant/Early Rug Probabilities
            const instantRugTickThreshold = getConfig('analysis.instantRugTickThreshold', 20);
            const earlyRugTickThreshold = getConfig('analysis.earlyRugTickThreshold', 50);

            const instantRugs = ruggedGames.filter(g => g.tick_count <= instantRugTickThreshold).length;
            const instantRugProbability = ruggedGames.length > 0 ? (instantRugs / ruggedGames.length) * 100 : 0;
            logger.info(`Instant Rug Probability (<= ${instantRugTickThreshold} ticks): ${instantRugProbability.toFixed(2)}% (${instantRugs}/${ruggedGames.length})`);

            const earlyRugs = ruggedGames.filter(g => g.tick_count <= earlyRugTickThreshold).length;
            const earlyRugProbability = ruggedGames.length > 0 ? (earlyRugs / ruggedGames.length) * 100 : 0;
            logger.info(`Early Rug Probability (<= ${earlyRugTickThreshold} ticks): ${earlyRugProbability.toFixed(2)}% (${earlyRugs}/${ruggedGames.length})`);

            // 4. Average Peak for Games > 10x
            const highMultiplierThreshold = getConfig('analysis.highMultiplierThreshold', 10);
            const gamesOverThreshold = ruggedGames.filter(g => g.peak_multiplier !== null && g.peak_multiplier >= highMultiplierThreshold);
            if (gamesOverThreshold.length > 0) {
                const totalPeakForHighGames = gamesOverThreshold.reduce((sum, game) => sum + game.peak_multiplier, 0);
                const averagePeakForHighGames = totalPeakForHighGames / gamesOverThreshold.length;
                logger.info(`For games reaching at least ${highMultiplierThreshold}x (${gamesOverThreshold.length} such games):`);
                logger.info(`  Average Peak Multiplier achieved: ${averagePeakForHighGames.toFixed(4)}x`);
                
                const totalRugForHighGames = gamesOverThreshold.reduce((sum, game) => sum + (game.rug_price || 0), 0);
                const averageRugForHighGames = totalRugForHighGames / gamesOverThreshold.length;
                logger.info(`  Average Rug Multiplier for these high-peak games: ${averageRugForHighGames.toFixed(4)}x`);
            } else {
                logger.info(`No games in sample reached at least a ${highMultiplierThreshold}x peak multiplier.`);
            }

            // 5. Rug Probability by Tick Buckets
            logger.info('--- Rug Probability by Tick Buckets --- ');
            const maxTick = Math.max(...ruggedGames.map(g => g.tick_count));
            const bucketSize = getConfig('analysis.rugProbBucketSize', 50); // e.g., 0-50, 51-100
            
            for (let i = 0; i <= maxTick; i += bucketSize) {
                const bucketStart = i;
                const bucketEnd = i + bucketSize -1;
                
                const gamesReachingBucket = ruggedGames.filter(g => g.tick_count >= bucketStart);
                if (gamesReachingBucket.length === 0 && i > 0) { // Stop if no games reach this bucket (unless it's the first bucket)
                    logger.debug(`No games reached tick bucket [${bucketStart}-${bucketEnd}], stopping bucket analysis.`);
                    break;
                } 
                if (gamesReachingBucket.length === 0 && i === 0) {
                    logger.info(`Ticks [${bucketStart}-${bucketEnd}]: Reached: 0, Rugged in bucket: 0, Rug Prob if reached: N/A%`);
                    continue;
                }

                const gamesRuggedInBucket = gamesReachingBucket.filter(g => g.tick_count <= bucketEnd).length; 
                
                const rugProbInBucket = (gamesRuggedInBucket / gamesReachingBucket.length) * 100;
                logger.info(`Ticks [${bucketStart}-${bucketEnd}]: Reached: ${gamesReachingBucket.length}, Rugged in bucket: ${gamesRuggedInBucket}, Rug Prob if reached: ${rugProbInBucket.toFixed(2)}%`);
            }
            logger.info('-----------------------------------------');

            // 6. Initial Trade Volume & Large Trade Analysis (New)
            logger.info('--- Initial Trade Volume Analysis (per game, for actual trades) --- ');
            for (const game of ruggedGames.slice(0, getConfig('analysis.tradeAnalysisGameSample', 10))) { // Analyze first few games for brevity
                const tradesInGame = await dataPersistenceService.getTradesForGame(game.game_id, { isSimulated: 0 });
                if (tradesInGame.length > 0) {
                    const solTrades = tradesInGame.filter(t => (t.currency_sold === 'SOL' || t.currency_received === 'SOL'));
                    const totalSolVolume = solTrades.reduce((sum, t) => sum + (t.amount_currency || 0), 0);
                    const largeTradeThresholdSOL = getConfig('analysis.largeTradeThresholdSOL', 0.1);
                    const largeTrades = solTrades.filter(t => (t.amount_currency || 0) >= largeTradeThresholdSOL);
                    const uniquePlayers = new Set(tradesInGame.map(t => t.player_id));

                    logger.info(`Game ${game.game_id} (Ticks: ${game.tick_count}, Peak: ${game.peak_multiplier?.toFixed(2)}x, Rug: ${game.rug_price?.toFixed(2)}x):`);
                    logger.info(`  Total Actual Trades: ${tradesInGame.length}, Unique Players: ${uniquePlayers.size}`);
                    logger.info(`  Total SOL Volume: ${totalSolVolume.toFixed(4)} SOL`);
                    logger.info(`  Number of Large Trades (>=${largeTradeThresholdSOL} SOL): ${largeTrades.length}`);
                    if (largeTrades.length > 0) {
                        // Log top 1-2 large trades for example
                        largeTrades.slice(0,2).forEach(lt => {
                            logger.info(`    Large Trade Example: Player ${lt.player_id?.substring(0,10)}... ${lt.action} ${lt.amount_tokens.toFixed(4)} tokens for ${lt.amount_currency.toFixed(4)} SOL @ tick ${lt.tick}`);
                        });
                    }
                } else {
                    logger.info(`Game ${game.game_id}: No actual trades found in DB for analysis.`);
                }
            }
            logger.info('-----------------------------------------------------------------');
        }

        // TODO for next steps: Add queries/analysis for House P&L (requires GameAnalytics data in DB)
        // TODO: Add queries/analysis for Whale / Player Liquidity (requires trade data analysis)

    } catch (error) {
        logger.error('Error during data analysis:', error);
    } finally {
        if (engine && engine.state.running) { // Check if engine was successfully started
            logger.info('Shutting down BotEngine after analysis...');
            await engine.stop();
        }
        logger.info('===== Game Data Analysis Finished =====');
    }
}

performAnalysis().catch(err => {
    logger.error('Unhandled error in performAnalysis script:', err);
    process.exit(1); // Exit with error on unhandled promise rejection
}); 