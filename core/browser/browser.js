const puppeteer = require('puppeteer-core');
const path = require('path');
const logger = require('../../utils/logger');
const { getConfig } = require('../../config/config-service');

/**
 * @class BrowserManager
 * @description Manages the Puppeteer browser instance connection.
 *              Connects to a pre-launched Chrome instance with remote debugging enabled.
 *              Acts as a singleton to ensure consistent connection management.
 */
class BrowserManager {
    constructor() {
        this.browser = null;
        // Primarily uses remoteDebuggingUrl. Other settings kept for reference/docs.
        this.config = {
            executablePath: getConfig('browser.executablePath'), // For reference
            userDataDir: path.resolve(__dirname, '..', '..', getConfig('browser.userDataDir', './user_data')), // For reference
            remoteDebuggingUrl: getConfig('browser.remoteDebuggingUrl', 'http://127.0.0.1:9222'),
            headless: getConfig('browser.headless', false), // For reference
            defaultViewport: getConfig('browser.defaultViewport', { width: 1920, height: 1080 }),
            protocolTimeout: getConfig('browser.protocolTimeout', 60000),
            launchArgs: getConfig('browser.launchArgs', []) // For reference
        };
        logger.info('BrowserManager initialized (Connect-Only Mode).');
        logger.debug(`Browser config (using remoteDebuggingUrl): ${JSON.stringify(this.config, null, 2)}`);
    }

    /**
     * Gets the currently managed browser instance.
     * @returns {import('puppeteer-core').Browser | null} The browser instance or null.
     */
    getBrowser() {
        return this.browser;
    }

    /**
     * Attempts to connect to a pre-launched browser instance via the remote debugging port.
     * Stores the resulting browser instance in `this.browser`.
     * Does NOT launch a new browser if connection fails.
     * @returns {Promise<import('puppeteer-core').Browser | null>} Browser object or null on failure.
     */
    async connect() {
        if (this.browser && this.browser.isConnected()) {
            logger.info('Browser already connected.');
            return this.browser;
        }

        logger.info(`Attempting to connect to existing browser at ${this.config.remoteDebuggingUrl}...`);
        try {
            this.browser = await puppeteer.connect({
                browserURL: this.config.remoteDebuggingUrl,
                defaultViewport: this.config.defaultViewport, // Still useful for page context
                protocolTimeout: this.config.protocolTimeout,
            });
            logger.info(`Successfully connected to existing browser instance at ${this.config.remoteDebuggingUrl}.`);
            this._setupDisconnectListener();
            return this.browser;
        } catch (error) {
            logger.error('='.repeat(80));
            logger.error('Failed to connect to existing Chrome instance!');
            logger.error(`Error: ${error.message}`);
            logger.error('Please ensure Chrome is running and was launched with the correct parameters:');
            logger.error('  1. Close ALL existing Chrome instances completely (check Task Manager). ');
            logger.error('  2. Launch Chrome from PowerShell using a command like: ');
            logger.error('     Start-Process "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" -ArgumentList @("--remote-debugging-port=9222", "--user-data-dir=$env:USERPROFILE\\AppData\\Local\\Google\\Chrome\\User Data", "--profile-directory=Default")');
            logger.error(`  (Verify the chrome.exe path and ensure remote debugging on port ${this.config.remoteDebuggingUrl.split(':')[2]} is enabled)`);
            logger.error('='.repeat(80));
            this.browser = null; // Ensure browser is null on failure
            return null;
        }
    }

    /**
     * Closes the browser connection (if connected via Puppeteer).
     * Note: This disconnects Puppeteer but usually won't close the manually launched browser.
     * @returns {Promise<void>}
     */
    async disconnect() { // Renamed from closeBrowser for clarity
        if (this.browser && this.browser.isConnected()) {
            logger.info('Disconnecting Puppeteer from browser...');
            try {
                // Don't call browser.close() as it might terminate the manually launched instance.
                // Instead, just disconnect Puppeteer.
                await this.browser.disconnect(); 
                logger.info('Puppeteer disconnected from browser successfully.');
            } catch (error) {
                logger.error('Error disconnecting Puppeteer from browser:', error);
            } finally {
                this.browser = null;
            }
        } else {
            logger.info('Puppeteer already disconnected or not connected.');
            this.browser = null; // Ensure it's null
        }
    }
    
    /**
     * Sets up a listener for the browser's disconnected event.
     * @private
     */
    _setupDisconnectListener() {
        if (this.browser) {
            // Remove previous listener if any to prevent duplicates
            this.browser.removeAllListeners('disconnected'); 

            this.browser.on('disconnected', () => {
                logger.warn('Browser disconnected unexpectedly!');
                this.browser = null;
                // Optionally: Emit an event via EventBus or attempt reconnection
                // const eventBus = require('../events/event-bus');
                // eventBus.emit('browser:disconnected');
            });
        }
    }
}

// Export a single instance (Singleton pattern)
const instance = new BrowserManager();

module.exports = instance; 