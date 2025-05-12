const logger = require('./utils/logger');
const BotEngine = require('./core/engine');

logger.info('===== Starting Phase 1 Test =====');

// Ensure Chrome is launched manually before running this script!
logger.info('Ensure Chrome is launched with remote debugging enabled on port 9222.');
logger.info('Example PowerShell command:');
logger.info('  Start-Process "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" -ArgumentList @("--remote-debugging-port=9222", "--user-data-dir=$env:USERPROFILE\\AppData\\Local\\Google\\Chrome\\User Data", "--profile-directory=Default")');
logger.info('-'.repeat(60));

const engine = new BotEngine();

let isShuttingDown = false;

async function startup() {
    try {
        logger.info('Initializing and starting the Bot Engine...');
        await engine.start();

        if (engine.state.running) {
            logger.info('Engine started. Monitoring WebSocket data...');
            logger.info('Check logs/raw_websocket_data.jsonl for raw frames.');
            logger.info('Look for serverSeedHash detection in console logs.');
            logger.info('Press Ctrl+C to stop gracefully.');
        } else {
            logger.error('Engine failed to start properly. Check previous logs for errors (e.g., browser connection issues).');
            process.exit(1); // Exit with error code if engine didn't start
        }
    } catch (error) {
        logger.error('Fatal error during engine startup:', error);
        process.exit(1);
    }
}

async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);
    try {
        await engine.stop();
        logger.info('Engine stopped. Exiting test script.');
        process.exit(0);
    } catch (error) {
        logger.error('Error during engine shutdown:', error);
        process.exit(1);
    }
}

// --- Graceful Shutdown Handlers ---
process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // Termination signal
process.on('uncaughtException', (error, origin) => {
    logger.error(`Uncaught Exception at: ${origin}, error: ${error.message}`, error);
    // Attempt graceful shutdown even on uncaught exceptions
    if (!isShuttingDown) {
        shutdown('uncaughtException').catch(() => process.exit(1)); 
    } else {
        process.exit(1); // Already shutting down, just exit
    }
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Optionally attempt shutdown or just log
});

// --- Start the Engine --- 
startup(); 