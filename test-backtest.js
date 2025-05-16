const logger = require('./utils/logger');
const BotEngine = require('./core/engine');
const BacktestEngine = require('./core/backtest/backtest-engine');
const { getConfig, getAllConfig } = require('./config/config-service');
const path = require('path'); // For appRoot if needed

async function runMyBacktest() {
    logger.info('===== Starting Backtest Run =====');

    const engine = new BotEngine(getAllConfig()); // Pass full config to engine
    let gameIdToTest = null;
    let strategyToTestConfig = null;

    try {
        logger.info('Initializing BotEngine for DataPersistenceService access...');
        await engine.start(); // Start engine to init services, connect DB, etc.
        logger.info('BotEngine initialized.');

        // Ensure DataPersistenceService is available
        if (!engine.dataPersistenceService || !engine.dataPersistenceService.db) {
            logger.error('DataPersistenceService not available or DB not initialized after engine start. Exiting backtest.');
            await engine.stop();
            return;
        }

        // 1. Fetch a game to test (e.g., the most recent fully rugged game)
        const gamesSummary = await engine.dataPersistenceService.getAllGamesSummary(20, 0); // Get last 20 games
        const ruggedGames = gamesSummary.filter(g => g.is_rugged && g.end_time && g.tick_count > 50); // Find a decent length rugged game
        
        if (ruggedGames.length === 0) {
            logger.error('No suitable rugged games found in the database to backtest against. Please run live data collection first.');
            await engine.stop();
            return;
        }
        gameIdToTest = ruggedGames[0].game_id; // Test the most recent suitable one
        logger.info(`Selected game for backtest: ${gameIdToTest}`);

        // 2. Get Strategy Configuration
        const strategiesConfig = getConfig('strategies');
        if (!strategiesConfig || strategiesConfig.length === 0) {
            logger.error('No strategies defined in configuration.');
            await engine.stop();
            return;
        }
        // For now, let's use the first enabled strategy in the config
        strategyToTestConfig = strategiesConfig.find(s => s.enabled);
        if (!strategyToTestConfig) {
            logger.error('No enabled strategies found in configuration to backtest.');
            await engine.stop();
            return;
        }
        logger.info(`Selected strategy for backtest: ${strategyToTestConfig.id} (${strategyToTestConfig.name})`);

        // 3. Instantiate BacktestEngine
        // Pass the global config (which now includes appRoot if we set it), and engine's DPC and StratManager
        const globalConfigWithAppRoot = getAllConfig();
        if (!globalConfigWithAppRoot.appRoot) { // Ensure appRoot is defined for path.resolve in BacktestEngine
            globalConfigWithAppRoot.appRoot = path.resolve(__dirname);
        }

        const backtestEngine = new BacktestEngine(globalConfigWithAppRoot, engine.dataPersistenceService, engine.strategyManager);

        // 4. Run Backtest
        logger.info(`--- Starting backtest on game ${gameIdToTest} with strategy ${strategyToTestConfig.id} ---`);
        const backtestResult = await backtestEngine.runBacktest(gameIdToTest, strategyToTestConfig);

        // 5. Log Results
        if (backtestResult) {
            logger.info('--- Backtest Run Complete --- ');
            logger.info('Backtest Result:', JSON.stringify(backtestResult, null, 2));
        } else {
            logger.error('Backtest run failed or returned no result.');
        }

    } catch (error) {
        logger.error('Error during backtest execution:', error);
    } finally {
        logger.info('Shutting down BotEngine after backtest...');
        await engine.stop();
        logger.info('===== Backtest Run Finished =====');
    }
}

runMyBacktest().catch(err => {
    logger.error('Unhandled error in runMyBacktest:', err);
    process.exit(1);
}); 