const logger = require('./utils/logger');
const BotEngine = require('./core/engine');
const eventBus = require('./core/events/event-bus'); // Import EventBus
const util = require('util'); // Added for detailed inspection

logger.info('===== Starting Phase 1 & 2 Test ====='); // Updated title

// Ensure Chrome is launched manually before running this script!
logger.info('Ensure Chrome is launched with remote debugging enabled on port 9222.');
logger.info('Example PowerShell command:');
logger.info('  Start-Process "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" -ArgumentList @("--remote-debugging-port=9222", "--user-data-dir=$env:USERPROFILE\\AppData\\Local\\Google\\Chrome\\User Data", "--profile-directory=Default")');
logger.info('-'.repeat(60));

const engine = new BotEngine();

let isShuttingDown = false;

// --- Event Listeners for GameStateService --- 
function setupGameEventListeners() {
    logger.info('Setting up high-level game event listeners...');

    eventBus.on('game:newGame', (payload) => {
        const { gameId, gameTimestamp, initialState } = payload;
        logger.info(`[EVENT] New Game Started: ${gameId} at ${new Date(gameTimestamp).toISOString()}`);
        // Optionally log more initialState details if needed
    });

    eventBus.on('game:phaseChange', (payload) => {
        const { gameId, gameTimestamp, previousPhase, currentPhase, data } = payload;
        logger.info(`[EVENT] Phase Changed: ${gameId} | ${previousPhase} -> ${currentPhase} (Tick: ${data.tickCount}) at ${new Date(gameTimestamp).toISOString()}`);
    });

    eventBus.on('game:priceUpdate', (payload) => {
        const { gameId, gameTimestamp, price, tickCount } = payload;
        // This can be very frequent, maybe log less verbosely or sample?
        // For now, logging every update.
        logger.info(`[EVENT] Price Update: ${gameId} | Price: ${price.toFixed(6)} | Tick: ${tickCount} at ${new Date(gameTimestamp).toISOString()}`);
    });

    eventBus.on('game:newCandle', (payload) => {
        const { gameId, gameTimestamp, candle } = payload;
        logger.info(`[EVENT] New Candle: ${gameId} | Index: ${candle.index} | Close: ${candle.close.toFixed(6)} at ${new Date(gameTimestamp).toISOString()}`);
    });
    
    eventBus.on('game:rugged', (payload) => {
        const { gameId, gameTimestamp, finalPrice, tickCount } = payload;
        logger.warn(`[EVENT] GAME RUGGED: ${gameId} | Final Price: ${finalPrice.toFixed(6)} | Tick: ${tickCount} at ${new Date(gameTimestamp).toISOString()}`);
    });
    
    // Listener for the raw seed hash detection (still useful)
    eventBus.on('protocol:serverSeedFound', (payload) => {
        const { serverSeedHash, originalTimestamp } = payload;
        logger.info(`[EVENT] Server Seed Hash Found: ${serverSeedHash} at ${new Date(originalTimestamp).toISOString()}`);
    });
}

// --- Test Function for TradeExecutionService ---
async function testTradeExecutionService(engineInstance) {
    if (!engineInstance || !engineInstance.tradeExecutionService) {
        logger.error('[TestTradeSim] TradeExecutionService not available on engine instance.');
        return;
    }

    const playerId = "simBotUser1"; // A test player ID
    
    const brightMagenta = '\x1b[95m';
    const resetColor = '\x1b[0m';
    const testPrefix = `${brightMagenta}[TestTradeSim]${resetColor}`;

    let hasMadePresaleBuyThisGame = false;
    let currentGameIdForTrading = null;
    let lastProcessedTick = -1; // To prevent multiple actions on the same tick

    // Listener for New Game - Handles presale buy and resets for a new game
    const newGameListener = async (payload) => {
        const { gameId, initialState } = payload;
        logger.info(`${testPrefix} New game detected: ${gameId}. Resetting simBotUser1 trade state.`);
        hasMadePresaleBuyThisGame = false;
        currentGameIdForTrading = gameId;
        lastProcessedTick = -1;

        const currentGameState = engineInstance.gameStateService.getCurrentState();
        const currentGamePhase = engineInstance.gameStateService.getCurrentPhase();

        logger.info(`${testPrefix} Initial state for ${gameId}. Player: ${brightMagenta}${playerId}${resetColor}. Phase: ${currentGamePhase}, Allow PreRound Buys: ${currentGameState ? currentGameState.allowPreRoundBuys : 'N/A'}`);

        if (currentGameState && currentGamePhase === 'presale' && currentGameState.allowPreRoundBuys && !hasMadePresaleBuyThisGame) {
            logger.info(`${testPrefix} Game ${gameId} in PRESALE and allows buys. Attempting presale buy for ${brightMagenta}${playerId}${resetColor}.`);
            const buyResult = await engineInstance.tradeExecutionService.simulateBuy({
                playerId: playerId,
                currency: 'SOL',
                amountToSpend: 0.01,
                strategyName: 'TestScript_PresaleAutoBuy'
            });
            logger.info(`${testPrefix} Presale simulateBuy Result for ${brightMagenta}${playerId}${resetColor}: ${JSON.stringify(buyResult, null, 2)}`);
            if (buyResult.success) {
                hasMadePresaleBuyThisGame = true;
            }
        }
    };

    // Listener for Phase Changes - Also checks for presale buy opportunity
    const phaseChangeListener = async (payload) => {
        const { gameId, currentPhase, data } = payload;
        if (gameId !== currentGameIdForTrading) return; 

        logger.info(`${testPrefix} Phase changed for game ${gameId} (Player: ${brightMagenta}${playerId}${resetColor}) to ${currentPhase}. (Tick: ${data.tickCount})`);
        const currentGameState = engineInstance.gameStateService.getCurrentState();

        if (currentGameState && currentPhase === 'presale' && currentGameState.allowPreRoundBuys && !hasMadePresaleBuyThisGame) {
            logger.info(`${testPrefix} Game ${gameId} transitioned to PRESALE and allows buys. Attempting presale buy for ${brightMagenta}${playerId}${resetColor}.`);
            const buyResult = await engineInstance.tradeExecutionService.simulateBuy({
                playerId: playerId,
                currency: 'SOL',
                amountToSpend: 0.01,
                strategyName: 'TestScript_PresalePhaseChangeBuy'
            });
            logger.info(`${testPrefix} Presale (Phase Change) simulateBuy Result for ${brightMagenta}${playerId}${resetColor}: ${JSON.stringify(buyResult, null, 2)}`);
            if (buyResult.success) {
                hasMadePresaleBuyThisGame = true;
            }
        }
    };

    // Listener for Price Updates (to get Ticks for timed trades)
    const priceUpdateListener = async (payload) => {
        const { gameId, price, tickCount } = payload;
        if (gameId !== currentGameIdForTrading) return; 

        const currentGamePhase = engineInstance.gameStateService.getCurrentPhase();
        if (currentGamePhase !== 'active' || tickCount <= lastProcessedTick) {
            return; 
        }
        
        const previousTickProcessed = lastProcessedTick; // Store for logging clarity
        lastProcessedTick = tickCount; 

        // Buy on tick 10, 30, 50, etc. (tickCount % 20 === 10)
        if (tickCount > 0 && tickCount % 20 === 10) {
            logger.info(`${testPrefix} Tick ${tickCount} (Prev Processed: ${previousTickProcessed}) in game ${gameId}. Attempting BUY for ${brightMagenta}${playerId}${resetColor}.`);
            const buyResult = await engineInstance.tradeExecutionService.simulateBuy({
                playerId: playerId,
                currency: 'SOL',
                amountToSpend: 0.01, 
                strategyName: 'TestScript_TickBuyStrategy'
            });
            logger.info(`${testPrefix} Tick ${tickCount} BUY Result for ${brightMagenta}${playerId}${resetColor}: ${JSON.stringify(buyResult, null, 2)}`);
        }
        // Sell on tick 20, 40, 60, etc. (tickCount % 20 === 0)
        else if (tickCount > 0 && tickCount % 20 === 0) {
            logger.info(`${testPrefix} Tick ${tickCount} (Prev Processed: ${previousTickProcessed}) in game ${gameId}. Attempting SELL 100% for ${brightMagenta}${playerId}${resetColor}.`);
            const sellResult = await engineInstance.tradeExecutionService.simulateSellByPercentage({
                playerId: playerId,
                currency: 'SOL', 
                percentageToSell: 100,
                strategyName: 'TestScript_TickSellStrategy'
            });
            logger.info(`${testPrefix} Tick ${tickCount} SELL Result for ${brightMagenta}${playerId}${resetColor}: ${JSON.stringify(sellResult, null, 2)}`);
        }
    };
    
    // Listener for Rug Event
    const gameRuggedListener = (payload) => {
        const { gameId } = payload;
        if (gameId === currentGameIdForTrading) {
            logger.info(`${testPrefix} Game ${gameId} rugged. SimBot ${brightMagenta}${playerId}${resetColor} trading for this game ends.`);
            // State for the *next* game (like hasMadePresaleBuyThisGame) will be reset by newGameListener.
            // We can clear currentGameIdForTrading to signify no active trading game for the bot.
            // currentGameIdForTrading = null; 
            // lastProcessedTick = -1; // Reset for safety, though newGameListener also does this.
        }
    };

    // Initial setup message
    logger.info(`${testPrefix} --- testTradeExecutionService is active for player: ${brightMagenta}${playerId}${resetColor} ---`);
    logger.info(`${testPrefix} Will attempt presale buy if conditions met.`);
    logger.info(`${testPrefix} Will attempt to BUY on ticks 10, 30, 50,... and SELL on ticks 20, 40, 60,... during 'active' phase.`);

    // Subscribe to events
    // Ensure old listeners from previous test structure are not present or are managed.
    // For this test script, direct subscription is fine.
    eventBus.on('game:newGame', newGameListener);
    eventBus.on('game:phaseChange', phaseChangeListener);
    eventBus.on('game:priceUpdate', priceUpdateListener);
    eventBus.on('game:rugged', gameRuggedListener);

    // Note: This test service will now run continuously for each game,
    // listeners are not removed by default within this function.
    // They would be cleared if the engine itself stops and clears all eventBus listeners,
    // or if we add explicit cleanup here tied to engine shutdown.
}
// --- End Test Function ---

function removeGameEventListeners() {
    logger.info('Removing high-level game event listeners...');
    eventBus.removeAllListeners('game:newGame');
    eventBus.removeAllListeners('game:phaseChange');
    eventBus.removeAllListeners('game:priceUpdate');
    eventBus.removeAllListeners('game:newCandle');
    eventBus.removeAllListeners('game:rugged');
    eventBus.removeAllListeners('protocol:serverSeedFound');
}
// --- End Event Listeners ---

async function startup() {
    try {
        logger.info('Initializing and starting the Bot Engine...');
        await engine.start();

        if (engine.state.running) {
            logger.info('Engine started. Monitoring WebSocket data & game events...');
            logger.info('Check logs/raw_websocket_data.jsonl for raw frames.');
            logger.info('Look for [EVENT] messages in console logs.');
            logger.info('Press Ctrl+C to stop gracefully.');
            setupGameEventListeners(); // Activate listeners AFTER engine starts
            
            // Call the test function for TradeExecutionService
            await testTradeExecutionService(engine);

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
    removeGameEventListeners(); // Remove listeners before stopping engine
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
    // Raw console output for maximum detail first
    console.error('--- UNHANDLED REJECTION ---');
    try {
        console.error('Promise details:', util.inspect(promise, { depth: 2, colors: true, showHidden: false }));
    } catch (e) {
        console.error('Could not inspect promise:', e.message);
    }

    console.error('Reason details:');
    if (reason instanceof Error) {
        console.error('  Type: Error object');
        console.error('  Message:', reason.message || '(No message)');
        console.error('  Stack:', reason.stack || '(No stack)');
        console.error('  Constructor Name:', reason.constructor ? reason.constructor.name : '(No constructor name)');
        try {
            console.error('  Keys (Enumerable):', Object.keys(reason));
            const allProps = Object.getOwnPropertyNames(reason);
            console.error('  All Own Property Names (Including Non-Enumerable):', allProps);
            for (const prop of allProps) {
                try {
                    // Avoid inspecting overly complex or circular properties too deeply in this loop
                    console.error(`    ${prop}:`, util.inspect(reason[prop], { depth: 0, compact: true }));
                } catch (eInspectProp) { console.error(`    Error inspecting prop ${prop}:`, eInspectProp.message); }
            }
        } catch (eProps) { console.error('  Error getting property names for reason:', eProps.message); }
    } else {
        console.error('  Type: Not an Error object');
        console.error('  Raw reason:', util.inspect(reason, { depth: 3, colors: true, showHidden: false }));
    }
    console.error('--- END UNHANDLED REJECTION ---');

    // Log summary with Winston
    logger.error('Unhandled Rejection Detected.');
    // Avoid logging the full promise object to Winston if it's too complex / causes issues
    logger.error('Promise type (constructor): ' + (promise && promise.constructor ? promise.constructor.name : 'N/A'));

    if (reason instanceof Error) {
        logger.error('Reason was an Error object.');
        logger.error('Error Constructor:', reason.constructor ? reason.constructor.name : 'N/A');
        logger.error('Error Message:', reason.message || 'No message');
        logger.error('Error Stack:', reason.stack || 'No stack');
    } else {
        logger.error('Reason was not an Error object. Logging with util.inspect (limited depth).');
        try {
            logger.error('Raw reason (inspected):', util.inspect(reason, {depth: 1, breakLength: Infinity}));
        } catch (eStringify) {
            logger.error('Could not stringify/inspect the reason object for Winston. Logging as is:', reason);
        }
    }
    // For now, we will not automatically shutdown on unhandledRejection to see if more occur
});

// --- Start the Engine --- 
startup(); 