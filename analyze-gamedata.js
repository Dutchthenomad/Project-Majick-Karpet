const logger = require('./utils/logger');
const BotEngine = require('./core/engine');
const { getConfig, getAllConfig } = require('./config/config-service');

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

            // 1. Average Tick Length
            const totalTicks = ruggedGames.reduce((sum, game) => sum + game.tick_count, 0);
            const averageTickLength = totalTicks / ruggedGames.length;
            logger.info(`Average Tick Length: ${averageTickLength.toFixed(2)} ticks`);

            // 2. Average Peak Multiplier
            const validPeakGames = ruggedGames.filter(g => g.peak_multiplier !== null && g.peak_multiplier > 0);
            if (validPeakGames.length > 0) {
                const totalPeakMultiplier = validPeakGames.reduce((sum, game) => sum + game.peak_multiplier, 0);
                const averagePeakMultiplier = totalPeakMultiplier / validPeakGames.length;
                logger.info(`Average Peak Multiplier (for ${validPeakGames.length} games with peak data): ${averagePeakMultiplier.toFixed(4)}x`);
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
                if (gamesReachingBucket.length === 0) continue; // No games even reached this bucket start

                const gamesRuggedInBucket = gamesReachingBucket.filter(g => g.tick_count <= bucketEnd).length; // g.is_rugged is already true for ruggedGames
                
                const rugProbInBucket = (gamesRuggedInBucket / gamesReachingBucket.length) * 100;
                logger.info(`Ticks [${bucketStart}-${bucketEnd}]: Reached: ${gamesReachingBucket.length}, Rugged in bucket: ${gamesRuggedInBucket}, Rug Prob if reached: ${rugProbInBucket.toFixed(2)}%`);
            }
            logger.info('-----------------------------------------');
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