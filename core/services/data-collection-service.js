const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const eventBus = require('../events/event-bus');
const { getConfig } = require('../../config/config-service');

// Consider making the filename configurable if needed
const RAW_DATA_FILENAME = 'raw_websocket_data.jsonl';

/**
 * @class DataCollectionService
 * @description Collects raw WebSocket frames (sent and received) and logs them 
 *              to a file in JSON Lines (JSONL) format.
 */
class DataCollectionService {
    constructor() {
        this.logDirectory = path.resolve(__dirname, '..', '..', getConfig('logging.logDirectory', 'logs'));
        this.logFilePath = path.join(this.logDirectory, RAW_DATA_FILENAME);
        this.logStream = null;
        this.isListening = false;

        this._handleWebSocketFrame = this._handleWebSocketFrame.bind(this); // Bind handler

        logger.info('DataCollectionService initialized.');
        logger.info(`Raw data will be logged to: ${this.logFilePath}`);
    }

    /**
     * Starts listening for WebSocket frame events and opens the log file stream.
     */
    startListening() {
        if (this.isListening) {
            logger.warn('DataCollectionService is already listening.');
            return;
        }

        logger.info('DataCollectionService starting to listen for WebSocket frames...');
        try {
            // Ensure log directory exists (although logger likely created it)
            if (!fs.existsSync(this.logDirectory)) {
                fs.mkdirSync(this.logDirectory, { recursive: true });
            }
            // Open stream in append mode
            this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
            this.logStream.on('error', (err) => {
                logger.error(`DataCollectionService: Error writing to raw data log file: ${err.message}`, err);
                // Attempt to close stream on error
                this.stopListening(); 
            });
            logger.info(`Opened raw data log file for appending: ${this.logFilePath}`);

            // Subscribe to both sent and received frames
            eventBus.on('websocket:frameSent', this._handleWebSocketFrame);
            eventBus.on('websocket:frameReceived', this._handleWebSocketFrame);
            this.isListening = true;

        } catch (error) {
            logger.error('DataCollectionService: Failed to start listening or open log file:', error);
            this.logStream = null; // Ensure stream is null on failure
            this.isListening = false;
        }
    }

    /**
     * Stops listening for events and closes the log file stream.
     */
    stopListening() {
        if (!this.isListening) {
            // logger.debug('DataCollectionService is already stopped.');
            return;
        }
        logger.info('DataCollectionService stopping listening...');

        // Unsubscribe from events
        eventBus.off('websocket:frameSent', this._handleWebSocketFrame);
        eventBus.off('websocket:frameReceived', this._handleWebSocketFrame);

        // Close the file stream
        if (this.logStream) {
            this.logStream.end(() => {
                logger.info(`Closed raw data log file: ${this.logFilePath}`);
            });
            this.logStream = null;
        } else {
             logger.info(`Raw data log file was already closed or not opened: ${this.logFilePath}`);
        }
        this.isListening = false;
    }

    /**
     * Handles incoming WebSocket frame data and writes it to the log file.
     * @param {object} frameData - The frame data object from the event bus.
     * @param {string} frameData.type - 'sent' or 'received'.
     * @param {string} frameData.requestId - CDP WebSocket request ID.
     * @param {number} frameData.timestamp - Timestamp in ms.
     * @param {string} frameData.payload - The raw payload string.
     * @private
     */
    _handleWebSocketFrame(frameData) {
        if (!this.logStream) {
            logger.warn('DataCollectionService: Cannot log frame, log stream is not open.');
            return;
        }
        try {
            const logEntry = JSON.stringify(frameData);
            this.logStream.write(logEntry + '\n'); // Append newline for JSONL format
        } catch (error) {
            // Should not happen with frameData structure, but good to have
            logger.error('DataCollectionService: Error serializing frame data for logging:', error);
        }
    }
}

// Export a single instance (Singleton pattern)
const instance = new DataCollectionService();
module.exports = instance; 