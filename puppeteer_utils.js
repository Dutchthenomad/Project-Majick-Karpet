/**
 * @file puppeteer_utils.js
 * @description Utility functions for Puppeteer browser interactions.
 *
 * Purpose:
 * This module encapsulates common Puppeteer tasks, such as connecting to the browser,
 * handling navigation, performing reliable clicks, setting input values, and implementing waits.
 * It aims to provide reusable, robust, and logged interaction functions.
 *
 * Usage:
 * Import necessary functions into other modules, primarily `main.js` for setup and
 * `strategy.js` for performing UI actions.
 * Example: `import { connectToBrowser, clickButton, wait } from './puppeteer_utils.js';`
 *
 * Interaction:
 * - `connectToBrowser()`: Called by `main.js` to establish the initial browser connection.
 * - `wait()`, `randomWait()`, `clickButton()`, `setInputValue()`: Called by `strategy.js` (or potentially `main.js` for setup steps) to interact with the web page.
 * - Reads configuration constants (browser path, viewport, pauses) from `config.js`.
 *
 * Key Functions:
 * - `connectToBrowser`: Attempts to connect to a running Chrome instance via remote debugging
 *   port 9222, or launches a new instance if connection fails.
 * - `wait`: Simple fixed delay.
 * - `randomWait`: Delay for a random duration within a specified range.
 * - `clickButton`: A more robust function to find and click an element by XPath. It includes
 *   pre-click checks for visibility and interactability, configurable delays, and a fallback
 *   mechanism using `page.evaluate()` if the standard click fails or is forced.
 * - `setInputValue`: Clears and sets the value of an input field, with error handling.
 */

// Utility functions for Puppeteer interactions
import puppeteer from 'puppeteer-core';
import { puppeteerLogger as logger } from './logger.js';
import {
    CHROME_EXECUTABLE_PATH,
    USER_DATA_DIR,
    VIEWPORT,
    SHORT_PAUSE_MS,
    PRE_CLICK_DELAY_MS // Import the new constant
} from './config.js';

/**
 * Connects to an existing Chrome instance or launches a new one.
 * @returns {Promise<import('puppeteer-core').Browser | null>} Browser object or null on failure.
 */
export async function connectToBrowser() {
    logger.info('Attempting to connect to browser...');
    try {
        const browser = await puppeteer.connect({
            browserURL: 'http://127.0.0.1:9222', // Standard remote debugging port
            defaultViewport: VIEWPORT,
            protocolTimeout: 60000,
        });
        logger.info('Successfully connected to existing browser instance.');
        return browser;
    } catch (error) {
        logger.warn('Could not connect to existing browser instance. Attempting to launch new one...');
        try {
            const browser = await puppeteer.launch({
                executablePath: CHROME_EXECUTABLE_PATH,
                headless: false, // Run in non-headless mode to see the browser
                userDataDir: USER_DATA_DIR, // Optional: Use if you want persistence/logged-in state
                defaultViewport: VIEWPORT,
                protocolTimeout: 60000,
                args: [
                    `--remote-debugging-port=9222`, // Ensure debugging port is open
                    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`
                    // Add other args if needed
                ]
            });
            logger.info('Successfully launched new browser instance.');
            // Wait a moment for the browser to fully initialize
            await wait(2000);
            return browser;
        } catch (launchError) {
            logger.error('Failed to launch new browser instance:', launchError);
            logger.error('Please ensure Chrome is installed at the specified path and that port 9222 is available.');
            logger.error('You might need to close existing Chrome instances or run Chrome manually with:');
            logger.error(`"${CHROME_EXECUTABLE_PATH}" --remote-debugging-port=9222`);
            return null;
        }
    }
}

/**
 * Waits for a fixed duration.
 * @param {number} ms Duration in milliseconds.
 */
export async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Waits for a random duration between minMs and maxMs.
 * @param {number} minMs Minimum duration in milliseconds.
 * @param {number} maxMs Maximum duration in milliseconds.
 */
export async function randomWait(minMs, maxMs) {
    if (minMs > maxMs) {
        logger.warn(`randomWait: minMs (${minMs}) cannot be greater than maxMs (${maxMs}). Swapping values.`);
        [minMs, maxMs] = [maxMs, minMs]; // Swap them
    }
    const waitTime = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    logger.debug(`Waiting for ${waitTime}ms (random between ${minMs}-${maxMs})`);
    await wait(waitTime);
}

/**
 * Attempts to click an element identified by XPath with enhanced reliability.
 *
 * This function performs several checks and uses multiple strategies to ensure a click is successful:
 * 1. Waits for the element to be present and visible using `page.waitForSelector`.
 * 2. Performs pre-click checks:
 *    - Verifies the element is intersecting the viewport (i.e., actually visible on screen).
 *    - Checks if the element has a `disabled` attribute.
 * 3. Introduces a configurable delay (`PRE_CLICK_DELAY_MS`) before the click attempt to allow the UI to settle.
 * 4. Attempts a standard `element.click()`.
 * 5. If the standard click is suspected to be problematic or if `forceEvaluate` is true, it can attempt a click via `page.evaluate()`.
 * 6. Logs detailed information about each step to `puppeteer_actions.log` (via the logger).
 *
 * @param {import('puppeteer-core').Page} page The Puppeteer page object.
 * @param {string} xpath The XPath selector for the button.
 * @param {string} buttonName A descriptive name for logging (e.g., "BUY Button", "Clear Amount").
 * @param {object} [options={}] Optional parameters for the click operation.
 * @param {number} [options.timeout=5000] Timeout in milliseconds for `page.waitForSelector`.
 * @param {boolean} [options.forceEvaluate=false] If true, attempts the click using `page.evaluate()` directly (or as a primary method if combined with skipping standard click).
 * @param {boolean} [options.skipStandardClick=false] If true and `forceEvaluate` is true, skips the standard `element.click()` and only uses `page.evaluate()`.
 * @param {number} [options.preClickDelayMs=PRE_CLICK_DELAY_MS] Override for the pre-click delay.
 * @param {number} [options.postClickDelayMs=SHORT_PAUSE_MS] Override for the post-click delay.
 * @returns {Promise<boolean>} True if the click was considered successful (either standard or evaluate), false otherwise.
 * @throws {Error} If the element is not found within the timeout, or if a non-optional click definitively fails.
 */
export async function clickButton(page, xpath, buttonName, options = {}) {
    const { 
        timeout = 5000, 
        forceEvaluate = false, 
        skipStandardClick = false,
        preClickDelayMs = PRE_CLICK_DELAY_MS, 
        postClickDelayMs = SHORT_PAUSE_MS 
    } = options;

    let element = null;
    let clickSuccessful = false;
    const logPreamble = `[clickButton-'${buttonName}']`;

    try {
        logger.debug(`${logPreamble} Finding with XPath: ${xpath}`);
        element = await page.waitForSelector('xpath/' + xpath, { visible: true, timeout });
        
        if (!element) {
            logger.warn(`${logPreamble} Element not found after waitForSelector.`);
            throw new Error(`Element '${buttonName}' not found with XPath: ${xpath}`);
        }
        logger.debug(`${logPreamble} Found element.`);

        // Pre-click checks
        const isInViewport = await element.isIntersectingViewport();
        if (!isInViewport) {
            logger.warn(`${logPreamble} Element found but not in viewport. Attempting to scroll into view (basic)...`);
            await element.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }));
            await wait(100); // Give a moment for scroll to settle
            if (!await element.isIntersectingViewport()) {
                 logger.error(`${logPreamble} Element still not in viewport after scroll attempt.`);
                 throw new Error(`'${buttonName}' found but not visible/scrollable into view.`);
            }
             logger.debug(`${logPreamble} Element scrolled into view.`);
        }

        const isDisabled = await element.evaluate(el => el.hasAttribute('disabled'));
        if (isDisabled) {
            logger.error(`${logPreamble} Element is disabled.`);
            throw new Error(`'${buttonName}' is disabled and cannot be clicked.`);
        }
        logger.debug(`${logPreamble} Pre-click checks passed (in viewport, not disabled).`);

        // Pre-click delay
        if (preClickDelayMs > 0) {
            logger.debug(`${logPreamble} Applying pre-click delay: ${preClickDelayMs}ms.`);
            await wait(preClickDelayMs);
        }

        // Attempt click
        if (!skipStandardClick || !forceEvaluate) {
            try {
                logger.debug(`${logPreamble} Attempting standard click.`);
                await element.click();
                clickSuccessful = true;
                logger.debug(`${logPreamble} Standard click successful.`);
            } catch (clickError) {
                logger.warn(`${logPreamble} Standard click failed: ${clickError.message}`);
                if (!forceEvaluate) { // If not forcing evaluate later, this is the final error
                    throw clickError;
                }
                // If forceEvaluate is true, we'll try that next, so don't re-throw here.
            }
        }

        if (forceEvaluate && !clickSuccessful) {
            logger.debug(`${logPreamble} Attempting click via page.evaluate().`);
            try {
                await page.evaluate((xpathStr) => {
                    const el = document.evaluate(xpathStr, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    if (el instanceof HTMLElement) {
                        el.click();
                    } else {
                        throw new Error('Element not found or not an HTMLElement in page.evaluate');
                    }
                }, xpath); // Pass xpath directly to evaluate
                clickSuccessful = true;
                logger.debug(`${logPreamble} page.evaluate() click successful.`);
            } catch (evaluateError) {
                logger.error(`${logPreamble} page.evaluate() click failed: ${evaluateError.message}`);
                // If this was the fallback or forced method, this is the final error.
                throw evaluateError; 
            }
        }

        if (!clickSuccessful) {
             // This should ideally not be reached if errors are thrown correctly above
             logger.error(`${logPreamble} Click ultimately failed for unknown reasons after all attempts.`);
             throw new Error(`'${buttonName}' click failed after all attempts.`);
        }

        // Post-click delay
        if (postClickDelayMs > 0) {
            await wait(postClickDelayMs);
        }
        return true; // Click was successful

    } catch (error) {
        logger.error(`${logPreamble} General error: ${error.message}`);
        // To provide more context to the caller, ensure the error message includes the button name.
        // The original error might be more specific, so we could wrap it or ensure its message is clear.
        const finalError = new Error(`Failed to click '${buttonName}': ${error.message}`);
        finalError.cause = error; // Preserve original error if needed
        throw finalError;
    }
}

/**
 * Sets the value of an input field identified by a selector.
 * @param {import('puppeteer-core').Page} page The Puppeteer page object.
 * @param {string} selector The CSS or XPath selector for the input.
 * @param {string | number} value The value to set.
 * @param {string} inputName A descriptive name for logging.
 */
export async function setInputValue(page, selector, value, inputName) {
    try {
        await page.waitForSelector(selector, { visible: true, timeout: 3000 });
        // Clear the input field first
        await page.click(selector, { clickCount: 3 }); // Select all text
        await page.keyboard.press('Backspace');
        await wait(50); // Short pause

        // Type the new value
        await page.type(selector, String(value));
        logger.debug(`Set '${inputName}' to '${value}'.`);
        await wait(SHORT_PAUSE_MS); // Use imported constant
    } catch (error) {
        logger.error(`Error setting value for '${inputName}' (Selector: ${selector}):`, error);
        throw error;
    }
}
