/**
 * @file tracker_only.js
 * @description Standalone runner for the House Edge Tracker without bot trading.
 * 
 * This script is a simplified version of main.js that connects to the browser,
 * sets up WebSocket listening, and feeds data to the HouseTracker for analysis
 * without executing any trades. Perfect for theory validation and data collection.
 */

import logger from './logger.js';
import { URL } from './config.js';
import { connectToBrowser, wait } from './puppeteer_utils.js';
import { setupWebSocketListener } from './websocket_handler.js';
import { HouseTracker } from './house_tracker.js';
import blessed from 'blessed';

// Function to display stats and exit gracefully
function displayStatsAndExit(exitCode = 0) {
  try {
    logger.info('------------------------------------');
    logger.info('     HOUSE TRACKER SESSION STATS    ');
    logger.info('------------------------------------');
    logger.info('Exiting. Goodbye!');
  } catch (error) {
    logger.error('Error displaying stats on exit:', error);
  }
  
  setTimeout(() => {
    process.exit(exitCode);
  }, 500);
}

// Helper function for blessed-based prompts
async function askWithBlessed(promptText, inputType = 'button', defaultValue = '') {
  return new Promise((resolve) => {
    const promptScreen = blessed.screen({ smartCSR: true, fullUnicode: true, autoPadding: true });
    
    const formHeight = inputType === 'button' ? 5 : 9;

    const form = blessed.form({
      parent: promptScreen,
      width: '70%',
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
      top: 0,
      left: 1,
      right: 1,
      height: inputType === 'button' ? 1 : 3,
      tags: true,
    });

    let inputElement;

    if (inputType === 'textbox') {
      blessed.text({
        parent: form,
        content: "Value:",
        top: 3,
        left: 1,
        height: 1
      });
      inputElement = blessed.textbox({
        parent: form,
        name: 'input',
        top: 4,
        left: 1,
        right: 1,
        height: 1,
        inputOnFocus: true,
        value: defaultValue,
        style: { 
          fg: 'white', 
          bg: 'black',
          focus: { bg: 'blue', fg: 'white' },
          border: { fg: 'gray' }
        },
        border: { type: 'line' },
      });
      inputElement.focus();
    }

    const submitButton = blessed.button({
      parent: form,
      name: 'submit',
      content: inputType === 'button' ? 'OK / Continue' : 'Submit Value',
      top: inputType === 'button' ? 2 : 6,
      left: 'center',
      width: 'shrink',
      height: 1,
      padding: { left: 2, right: 2 },
      style: { 
        fg: 'white', 
        bg: 'green', 
        focus: { bg: 'lightgreen', fg: 'black', bold: true },
        hover: { bg: 'lightgreen' }
      },
      mouse: true
    });

    if (inputType === 'button') {
      submitButton.focus();
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
      logger.warn('[TrackerSetup] Setup prompt cancelled by user.');
      process.exit(0);
    });

    promptScreen.render();
  });
}

process.on('SIGINT', () => {
  logger.info('Received interrupt signal (Ctrl+C).');
  displayStatsAndExit(0); 
});

// --- Main Execution Block ---
(async () => {
  let browser = null;
  let page = null;
  let houseTracker = null;

  try {
    logger.info('--- House Edge Tracker Starting (No Trading) ---');
    browser = await connectToBrowser();
    if (!browser) throw new Error('Failed to connect to or launch browser.');

    logger.info("\n--- Wallet Interaction Required (in browser) ---");
    await askWithBlessed("1. Please ensure you are logged into Phantom Wallet in the browser.\n   Press OK to continue.", 'button');
    logger.info("Wallet login step acknowledged.");

    // Initialize House Tracker
    houseTracker = new HouseTracker();
    logger.info('[TrackerSetup] House Edge Tracker initialized.');

    houseTracker.on('exit', () => {
      logger.info('[Tracker] House Tracker signalled exit.');
      displayStatsAndExit(0);
    });

    const pages = await browser.pages();
    page = pages.length > 0 ? pages[0] : await browser.newPage();
    logger.info(`Navigating to: ${URL}`);
    
    // Set window size for better viewing
    await page.setViewport({ width: 1280, height: 800 });
    
    await page.goto(URL, { waitUntil: 'networkidle2' });
    logger.info('Page navigated successfully.');
    await wait(1000);

    const ws = await setupWebSocketListener(page);
    if (!ws) throw new Error('Failed to set up WebSocket listener.');
    logger.info('[Tracker] WebSocket listener attached. Tracker running...');
    
    ws.on('message', (parsedData) => {
        // Pass message only to HouseTracker
        if (houseTracker) {
            houseTracker.processMessage(parsedData);
        }

        if (parsedData?.type !== 'gameStateUpdate') {
             logger.debug(`[Tracker] WS Msg: ${parsedData?.type || 'N/A'}`);
        }
    });

    ws.on('close', () => {
        logger.error('[Tracker] WebSocket connection closed unexpectedly.');
        displayStatsAndExit(1); 
    });

    logger.info('[Tracker] House Edge Tracker running in data collection mode (no trading).');
    logger.info('[Tracker] Use the UI to monitor game state and record statistics.');
    logger.info('[Tracker] Press Q to exit, R to reset stats, D to view data summary.');
    
    await new Promise(() => {});

  } catch (error) {
    logger.error('--- FATAL ERROR in tracker execution ---', error);
    if (houseTracker && houseTracker.screen && houseTracker.screen.destroyed === false) {
        logger.info('[Tracker] HouseTracker UI might still be active during fatal error.');
    }
    displayStatsAndExit(1);
  } finally {
    logger.info("Tracker script execution block finished or terminated."); 
  }
})(); 