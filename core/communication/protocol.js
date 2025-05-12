const logger = require('../../utils/logger');
const eventBus = require('../events/event-bus');

/**
 * @class RugsProtocolAdapter
 * @description Handles basic parsing of raw WebSocket messages from the game.
 *              Identifies key information like the serverSeedHash and emits relevant events.
 */
class RugsProtocolAdapter {
    constructor() {
        this.lastServerSeedHash = null;
        this._handleRawFrame = this._handleRawFrame.bind(this); // Bind the handler method
        logger.info('RugsProtocolAdapter initialized.');
    }

    /**
     * Starts listening to raw WebSocket frames from the EventBus.
     */
    startListening() {
        logger.info('RugsProtocolAdapter starting to listen for WebSocket frames...');
        // Ensure we don't subscribe multiple times if called again
        eventBus.off('websocket:frameReceived', this._handleRawFrame);
        eventBus.on('websocket:frameReceived', this._handleRawFrame);
    }

    /**
     * Stops listening to raw WebSocket frames.
     */
    stopListening() {
        logger.info('RugsProtocolAdapter stopping listening.');
        eventBus.off('websocket:frameReceived', this._handleRawFrame);
    }

    /**
     * Handles incoming raw WebSocket frame data from the event bus.
     * @param {object} frameData - The data emitted by WebSocketClient.
     * @param {string} frameData.type - 'received' or 'sent'.
     * @param {string} frameData.requestId - CDP WebSocket request ID.
     * @param {number} frameData.timestamp - Timestamp in ms.
     * @param {string} frameData.payload - The raw payload string.
     * @private
     */
    _handleRawFrame({ type, requestId, timestamp, payload }) {
        if (type !== 'received') { // Only interested in received messages for now
            return;
        }

        try {
            const message = JSON.parse(payload);
            
            // Emit generic parsed message event
            eventBus.emit('protocol:parsedMessage', { timestamp, message });
            
            // Check for specific known structures, like serverSeedHash
            if (message && typeof message === 'object' && message.serverSeedHash) {
                const newSeedHash = message.serverSeedHash;
                if (newSeedHash !== this.lastServerSeedHash) {
                    this.lastServerSeedHash = newSeedHash;
                    logger.info(`RugsProtocolAdapter: Detected new serverSeedHash: ${newSeedHash}`);
                    eventBus.emit('protocol:serverSeedFound', {
                        timestamp,
                        serverSeedHash: newSeedHash,
                    });
                } 
                // else { logger.debug('Repeated serverSeedHash received.'); } 
            }

            // --- Future Expansion --- 
            // Add more checks here for other known message types as the protocol is reverse-engineered.
            // Example:
            // if (message.type === 'gameStateUpdate') {
            //    eventBus.emit('protocol:gameStateUpdate', { timestamp, state: message.data });
            // }
            // if (message.type === 'tradeResult') {
            //    eventBus.emit('protocol:tradeResult', { timestamp, result: message.data });
            // }
            // ------------------------

        } catch (error) {
            // Ignore messages that aren't valid JSON (could be ping/pong or other non-JSON frames)
            if (error instanceof SyntaxError) {
                logger.debug(`RugsProtocolAdapter: Received non-JSON message payload: ${payload.substring(0, 100)}...`);
            } else {
                logger.error('RugsProtocolAdapter: Error parsing message:', error);
                logger.debug(`Original payload: ${payload}`);
            }
        }
    }
}

// Export a single instance (Singleton pattern)
const instance = new RugsProtocolAdapter();
module.exports = instance; 