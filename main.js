/**
 * @file main.js
 * @description Main entry point for the Rugs.fun Puppeteer bot.
 *
 * Purpose:
 * This script orchestrates the entire bot operation. It initializes the necessary modules,
 * connects to the browser, navigates to the target page, sets up the WebSocket listener,
 * and then passes incoming game state updates to the strategy module for processing.
 * It also includes basic error handling and ensures the script keeps running.
 *
 * Usage:
 * Run this script using Node.js after ensuring Chrome is running with remote debugging enabled.
 * Example: `node main.js` or `npm start` (if defined in package.json).
 *
 * Interaction:
 * - Imports configuration (`URL`) from `config.js`.
 * - Uses `connectToBrowser` from `puppeteer_utils.js` to get the browser instance.
 * - Uses `setupWebSocketListener` from `websocket_handler.js` to get the WebSocket event emitter.
 * - Listens for 'message' events from the WebSocket emitter.
 * - Calls `handleGameStateUpdate` from `strategy.js` when a relevant WebSocket message is received,
 *   passing the `page` object and message data.
 * - Handles top-level errors and attempts graceful shutdown.
 *
 * Execution Flow:
 * 1. IIFE (Immediately Invoked Function Expression) starts the async execution.
 * 2. Connect to browser (`connectToBrowser`).
 * 3. Get or create a page and navigate to the URL.
 * 4. Set up WebSocket listener (`setupWebSocketListener`).
 * 5. Attach listener to WebSocket 'message' events.
 * 6. Periodically update and display a console dashboard.
 * 7. On 'gameStateUpdate', call `handleGameStateUpdate`.
 * 8. On WebSocket 'close', log error and exit.
 * 9. Keep the script running indefinitely.
 * 10. Catch major errors, clean up, display final stats, and exit.
 */

// Main entry point for the Rugs.fun Puppeteer bot

// import readline from 'node:readline'; // No longer needed
import blessed from 'blessed'; // Import blessed
import logger from './logger.js'; // Only import the default logger
import { URL, SESSION_TOTAL_CAPITAL_DEFAULT, MIN_SESSION_CAPITAL, MAX_SESSION_CAPITAL } from './config.js'; // Added defaults
import { connectToBrowser, wait } from './puppeteer_utils.js';
import { setupWebSocketListener } from './websocket_handler.js';
// --- Add strategy import back ---
import { 
    handleGameStateUpdate, 
    getStrategyStats, 
    getCurrentStrategyState, 
    toggleManualCooldown, 
    initializeSessionCapital 
} from './strategy3_refined.js'; // Using Strategy 3 Refined
// ----------------------------
// import './tui.js'; // Import TUI for side effects (initialization)  // TEMP COMMENT OUT
// import { handleGameStateUpdate, getStrategyStats, getCurrentStrategyState, toggleManualCooldown, initializeSessionCapital } from './strategy.js'; // <-- Original Strategy 1
// import { handleGameStateUpdate, getStrategyStats, getCurrentStrategyState, toggleManualCooldown, initializeSessionCapital } from './strategy2.js'; // <-- Original Strategy 2
// ---------------------------
import inquirer from 'inquirer';
import { HouseTracker } from './house_tracker.js'; // Added import for HouseTracker

// --- TUI Integration ---
// SET FLAG BEFORE TUI OR LOGGER ARE FULLY INITIALIZED
// global.TUI_ACTIVE = true; // Delay full TUI init
// import './tui.js'; // Delay full TUI init

// --- Helper function for blessed-based prompts ---
async function askWithBlessed(promptText, inputType = 'button', defaultValue = '') {
    return new Promise((resolve) => {
        const promptScreen = blessed.screen({ smartCSR: true, fullUnicode: true, autoPadding: true });
        
        const formHeight = inputType === 'button' ? 5 : 9; // Button: label(1)+prompt(1)+button(1)+padding(2) = 5. Textbox: label(1)+prompt(3)+val_label(1)+textbox(1)+button(1)+padding(2)=9

        const form = blessed.form({
            parent: promptScreen,
            width: '70%', // Wider for more text space
            height: formHeight,
            top: 'center',
            left: 'center',
            border: 'line',
            label: ' {blue-fg}Setup Input Required{/} ',
            keys: true,
            vi: true,
            mouse: true,
            tags: true,
            style: { border: { fg: 'cyan' }, label: { fg: 'white' } }
        });

        const promptTextDisplay = blessed.text({
            parent: form,
            content: promptText,
            top: 0, // Start prompt text at the very top of the form (inside border/label)
            left: 1,
            right: 1,
            height: inputType === 'button' ? 1 : 3, // 1 line for button prompt, 3 lines for textbox prompt
            tags: true,
            // style: { bg: 'red' } // For debugging layout
        });

        let inputElement;

        if (inputType === 'textbox') {
            blessed.text({ // Label for textbox
                parent: form,
                content: "Value:",
                top: 3, // After the 3 lines for promptTextDisplay
                left: 1,
                height: 1
                // style: { bg: 'magenta' } // For debugging layout
            });
            inputElement = blessed.textbox({
                parent: form,
                name: 'input',
                top: 4, // Below "Value:" label
                left: 1,
                right: 1,
                height: 1,
                inputOnFocus: true,
                value: defaultValue,
                style: { 
                    fg: 'white', 
                    bg: 'black', // Ensure background is explicitly black
                    focus: { bg: 'blue', fg: 'white' },
                    border: { fg: 'gray' }
                },
                border: { type: 'line' }, // Explicitly give it a border
                // censor: false, // Ensure not censoring if that was ever a possibility
            });
            inputElement.focus();
        } else { // inputType === 'button' (the OK/Continue prompt)
            // No separate inputElement, button is primary focus
        }

        const submitButton = blessed.button({
            parent: form,
            name: 'submit',
            content: inputType === 'button' ? 'OK / Continue' : 'Submit Value',
            top: inputType === 'button' ? 2 : 6, // Button: below 1-line prompt. Textbox: below textbox (+1 for space)
            left: 'center',
            width: 'shrink',
            height: 1,
            padding: { left: 2, right: 2 }, // More padding
            style: { 
                fg: 'white', 
                bg: 'green', 
                focus: { bg: 'lightgreen', fg: 'black', bold: true },
                hover: { bg: 'lightgreen' }
            },
            mouse: true
        });

        if (inputType === 'button') {
            submitButton.focus(); // Focus button directly for simple prompts
        }

        submitButton.on('press', () => {
            form.submit();
        });

        form.on('submit', (data) => {
            promptScreen.destroy();
            resolve(inputType === 'textbox' ? data.input : true);
        });
        
        promptScreen.key(['escape'], () => {
            promptScreen.destroy();
            logger.warn('[MainSetup] Setup prompt cancelled by user.');
            process.exit(0); // or resolve with a specific cancel value
        });

        promptScreen.render();
    });
}

// Function to display trade stats and exit gracefully
function displayStatsAndExit(exitCode = 0) {
  try {
    logger.info('------------------------------------');
    logger.info('         BOT SESSION STATS          ');
    logger.info('    (Also see TUI for final state)    ');
    logger.info('------------------------------------');
    logger.info('Exiting bot. Goodbye!');
  } catch (error) {
    logger.error('Error displaying stats on exit:', error);
  }
  
  setTimeout(() => {
    process.exit(exitCode);
  }, 500);
}

process.on('SIGINT', () => {
  logger.info('Received interrupt signal (Ctrl+C). TUI should close.');
  displayStatsAndExit(0); 
});

// --- Function to display main menu ---
async function showMainMenu() {
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'Select operation mode:',
      choices: [
        { name: 'Trading Bot (Full functionality)', value: 'trading' },
        { name: 'House Edge Tracker Only (No trading)', value: 'tracker' },
        { name: 'WebSocket Data Analyzer (for reverse engineering)', value: 'ws_analyzer' },
        { name: 'Exit', value: 'exit' }
      ]
    }
  ]);

  switch (answer.mode) {
    case 'trading':
      logger.info('Starting in Trading Bot mode...');
      startTradingBot();
      break;
    case 'tracker':
      logger.info('Starting in House Edge Tracker mode...');
      // Run the tracker-only script
      const { spawn } = await import('child_process');
      spawn('node', ['tracker_only.js'], { stdio: 'inherit' });
      break;
    case 'ws_analyzer':
      logger.info('Starting WebSocket Data Analyzer...');
      // Run the WebSocket dashboard
      const { spawn: spawnWs } = await import('child_process');
      spawnWs('node', ['ws_dashboard.js'], { stdio: 'inherit' });
      break;
    case 'exit':
      logger.info('Exiting program. Goodbye!');
      process.exit(0);
      break;
  }
}

// --- Original Main Execution Block (now as a function) ---
async function startTradingBot() {
  let browser = null;
  let page = null;
  let houseTracker = null; // Initialize houseTracker
  // let rl = null; // No longer needed

  try {
    // rl = readline.createInterface({ input: process.stdin, output: process.stdout }); // Removed
    // const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve)); // Removed

    // --- DELAY TUI INIT --- 
    // global.TUI_ACTIVE = false; // TEMP SET TO FALSE

    logger.info('--- Bot Starting ---');
    browser = await connectToBrowser();
    if (!browser) throw new Error('Failed to connect to or launch browser.');

    logger.info("\\n--- Wallet Interaction Required (in browser) ---");
    // await askQuestion("1. Please log into Phantom Wallet. Press Enter when done..."); // Removed
    await askWithBlessed("1. Please ensure you are logged into Phantom Wallet in the browser.\\n   Press OK to continue.", 'button');
    logger.info("Wallet login step acknowledged.");

    // const walletBalanceInput = await askQuestion(`2. Enter session capital (SOL, format X.XXXX, min ${MIN_SESSION_CAPITAL}, max ${MAX_SESSION_CAPITAL}). Press Enter for default (${SESSION_TOTAL_CAPITAL_DEFAULT} SOL): `); // Removed
    initializeSessionCapital(); // Initialize with default capital
    logger.info("[MainSetup] Session capital initialized with default value.")

    // --- Initialize House Tracker ---
    houseTracker = new HouseTracker();
    logger.info('[MainSetup] House Edge Tracker initialized.');

    houseTracker.on('exit', () => {
      logger.info('[Main] House Tracker signalled exit.');
      // Potentially add a small delay or check if other TUI is active
      // For now, directly call displayStatsAndExit
      displayStatsAndExit(0);
    });

    // --- NOW Initialize Full TUI --- // TEMP COMMENT OUT BLOCK
    /*
    logger.info('[MainSetup] Initial prompts complete. Initializing main TUI...');
    global.TUI_ACTIVE = true;
    const { logPanelWidget } = await import('./tui.js'); 
    */
    let logPanelWidget = null; // TEMP: Ensure it's defined for catch blocks

    const pages = await browser.pages();
    page = pages.length > 0 ? pages[0] : await browser.newPage();
    logger.info(`Navigating to: ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle2' });
    logger.info('Page navigated successfully.');
    await wait(1000);

    const ws = await setupWebSocketListener(page);
    if (!ws) throw new Error('Failed to set up WebSocket listener.');
    logger.info('[Main] WebSocket listener attached. Bot core running...');
    
    ws.on('message', (parsedData) => {
        // Pass message to HouseTracker first
        if (houseTracker) { // Ensure houseTracker is initialized
            houseTracker.processMessage(parsedData);
        }

        if (parsedData?.type !== 'gameStateUpdate') {
             logger.debug(`[Main] WS Msg: ${parsedData?.type || 'N/A'}`);
        }
        if (parsedData.type === 'gameStateUpdate' && parsedData.data) {
             handleGameStateUpdate(page, parsedData.data).catch(strategyError => {
                 logger.error('[Main] Error executing strategy handler:', strategyError);
                 if (logPanelWidget && typeof logPanelWidget.log === 'function') { // Check if logPanel was successfully imported and is usable
                    logPanelWidget.log(`Strategy Error: ${strategyError.message}`);
                 } else {
                    // logger.warn('[Main] TUI logPanel not available for strategy error.'); // Already logged to file
                 }
             });
        }
    });

    ws.on('close', () => {
        logger.error('[Main] WebSocket connection closed unexpectedly.');
        if (logPanelWidget && typeof logPanelWidget.log === 'function') {
            logPanelWidget.log('WebSocket connection CLOSED unexpectedly!');
        }
        displayStatsAndExit(1); 
    });

    // logger.info('[Main] Bot core setup complete. TUI is primary interface. Press Q/ESC in TUI to exit.'); // TEMP COMMENT OUT
    logger.info('[Main] Bot core setup complete (TUI TEMPORARILY DISABLED). Script will run until manually stopped (Ctrl+C).');

  } catch (error) {
    logger.error('--- FATAL ERROR in Main Execution ---', error);
    if (browser) {
      try {
        await browser.close();
        logger.info('Browser closed after fatal error.');
      } catch (closeError) {
        logger.error('Error closing browser:', closeError);
      }
    }
    process.exit(1);
  }
}

// --- Main execution block ---
// Show the main menu at startup
showMainMenu();
