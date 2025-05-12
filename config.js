/**
 * @file config.js
 * @description Configuration constants for the Rugs.fun bot.
 * 
 * Purpose:
 * This module centralizes all configuration settings and constants used throughout the bot.
 * This includes URLs, browser paths, timing parameters, and UI element selectors (XPaths).
 * Centralizing configuration makes it easier to update settings without searching through multiple files.
 *
 * Usage:
 * Import specific constants or the entire SELECTORS object into other modules as needed.
 * Example: `import { URL, SHORT_PAUSE_MS, SELECTORS } from './config.js';`
 * 
 * Interaction:
 * - Read by `main.js` for URL.
 * - Read by `puppeteer_utils.js` for browser paths, viewport, and pause durations.
 * - Read by `strategy.js` for button XPaths and timing delays (SELL_DELAY_MS).
 * 
 * How to Modify:
 * - Update URL if the target site changes.
 * - Adjust CHROME_EXECUTABLE_PATH and USER_DATA_DIR based on your system setup.
 * - Modify timing constants (SHORT_PAUSE_MS, SELL_DELAY_MS) to tune bot behavior.
 * - Update XPaths if the Rugs.fun UI changes. Use browser developer tools to find new XPaths if necessary.
 */

// Configuration constants for the Rugs.fun bot

export const URL = 'https://rugs.fun/';
export const CHROME_EXECUTABLE_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'; // Adjust if your path differs
export const USER_DATA_DIR = 'C:\\chrome-debug-profile'; // Optional: For persistent sessions
export const VIEWPORT = { width: 1366, height: 768 };

// --- Timing ---
export const SHORT_PAUSE_MS = 200; // Small pause after actions
export const PRE_CLICK_DELAY_MS = 250; // Delay before attempting a click, after element is found and checked
export const SELL_DELAY_MS = 3000; // Delay before selling after buy confirmation (adjust as needed)

// --- Selectors (Using XPath for robustness) ---
export const SELECTORS = {
  BUY_AMOUNT_INPUT: "//input[contains(@class, 'buy-amount-input')]", // Find input more reliably
};

// --- Updated XPaths from User ---
export const BUY_BUTTON_XPATH = '//*[@id="root"]/div/div[2]/div/div[3]/div/div[3]/div/div/div[2]/div/button[1]';
export const ADD_001_BUTTON_XPATH = '//*[@id="root"]/div/div[2]/div/div[3]/div/div[3]/div/div/div[1]/div/div[1]/div[1]/div[2]/button[2]';
export const SELL_BUTTON_XPATH = '//*[@id="root"]/div/div[2]/div/div[3]/div/div[3]/div/div/div[2]/div/button[2]';

// --- Updated Existing / Potentially Outdated XPaths ---
export const ALL_BUTTON_XPATH = '//*[@id="root"]/div/div[2]/div/div[3]/div/div[3]/div/div/div[1]/div/div[2]/div[1]/div[2]/button[5]'; // Verify this one too if needed later -> Updated by user
export const CLEAR_BUTTON_XPATH = '//*[@id="root"]/div/div[2]/div/div[3]/div/div[3]/div/div/div[1]/div/div[1]/div[2]/div/div[2]/button'; // Verify this one too if needed later -> Updated by user

// --- Session Capital Constants ---
export const SESSION_TOTAL_CAPITAL_DEFAULT = 0.01; // Default session capital if not provided by user
export const MIN_SESSION_CAPITAL = 0.003;         // Minimum allowed session capital
export const MAX_SESSION_CAPITAL = 999.9999;      // Maximum allowed session capital

const MAX_CAPITAL_PER_GAME_PERCENT = 0.30; // Max 30% of SESSION_TOTAL_CAPITAL in a single game.

const CANDLE_HISTORY_LENGTH = 4; // For current candle + 3 previous for pattern detection
const PRICE_VELOCITY_LOOKBACK = 2; // Number of candle intervals for velocity calculation (e.g., current vs N-2)

// --- Strategy State Variables ---
// ... existing code ...

// Add other constants as needed (e.g., default buy amounts, strategy parameters)
