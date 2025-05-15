const logger = require('../../utils/logger');
const eventBus = require('../events/event-bus');
const browserManager = require('../browser/browser'); // Corrected path
const { getConfig } = require('../../config/config-service');

/**
 * @class WebSocketClient
 * @description Manages the connection to the game's WebSocket via CDP (Chrome DevTools Protocol).
 *              Listens for WebSocket frames and emits them onto the EventBus.
 */
class WebSocketClient {
    constructor() {
        this.cdpSession = null;
        this.targetPage = null;
        this.isConnecting = false;
        this.isConnected = false;
        this.retryTimeoutId = null;

        this.config = {
            targetUrlPattern: getConfig('webSocketClient.targetUrlPattern', 'rugs.fun'),
            retryDelay: getConfig('webSocketClient.retryConnectionDelayMs', 5000),
        };

        logger.info('WebSocketClient initialized.');
    }

    /**
     * Initializes the WebSocket client by connecting to the browser and target page.
     * Sets up CDP session and listeners for WebSocket frames.
     */
    async connect() {
        if (this.isConnecting || this.isConnected) {
            logger.info('WebSocketClient already connecting or connected.');
            return;
        }
        this.isConnecting = true;
        logger.info('WebSocketClient attempting to connect...');

        const browser = browserManager.getBrowser();
        if (!browser || !browser.isConnected()) {
            logger.error('WebSocketClient: Browser is not connected. Cannot establish CDP session.');
            logger.info(`Will retry WebSocket connection in ${this.config.retryDelay / 1000}s.`);
            this._scheduleRetry();
            this.isConnecting = false;
            return;
        }

        try {
            const pages = await browser.pages();
            this.targetPage = pages.find(p => p.url().includes(this.config.targetUrlPattern));

            if (!this.targetPage) {
                logger.error(`WebSocketClient: No page found matching URL pattern: "${this.config.targetUrlPattern}".`);
                logger.info(`Will retry WebSocket connection in ${this.config.retryDelay / 1000}s.`);
                this._scheduleRetry();
                this.isConnecting = false;
                return;
            }

            logger.info(`WebSocketClient: Found target page: ${this.targetPage.url()}`);
            this.cdpSession = await this.targetPage.createCDPSession();
            logger.info('WebSocketClient: CDP session created.');

            await this.cdpSession.send('Network.enable');
            logger.info('WebSocketClient: Network domain enabled via CDP.');

            // Listen for WebSocket frames
            this.cdpSession.on('Network.webSocketFrameSent', ({ requestId, timestamp, response }) => {
                eventBus.emit('websocket:frameSent', { 
                    frame: {
                        type: 'sent',
                        requestId,
                        originalTimestamp: timestamp * 1000, // Convert to ms, rename
                        data: response.payloadData // Rename payload to data
                    },
                    category: 'network_ws',
                    priority: 'low'
                });
            });

            this.cdpSession.on('Network.webSocketFrameReceived', ({ requestId, timestamp, response }) => {
                eventBus.emit('websocket:frameReceived', { 
                    frame: {
                        type: 'received',
                        requestId, 
                        originalTimestamp: timestamp * 1000, // Convert to ms, rename
                        data: response.payloadData // Rename payload to data
                    },
                    category: 'network_ws',
                    priority: 'normal'
                });
            });
            
            this.cdpSession.on('Network.webSocketClosed', ({ requestId, timestamp }) => {
                logger.warn(`WebSocketClient: WebSocket connection closed (ID: ${requestId})`);
                eventBus.emit('websocket:closed', {
                    connection: {
                        requestId,
                        originalTimestamp: timestamp * 1000,
                        status: 'closed' 
                    },
                    category: 'network_status',
                    priority: 'normal'
                });
                // Potentially handle reconnection logic or state change here if the specific WS closes
            });

            this.cdpSession.on('Network.webSocketCreated', ({ url, requestId }) => {
                logger.info(`WebSocketClient: WebSocket connection created to ${url} (ID: ${requestId})`);
                eventBus.emit('websocket:created', {
                    connection: {
                        url,
                        requestId,
                        status: 'created'
                    },
                    category: 'network_status',
                    priority: 'normal'
                });
            });

            // Handle CDP session detachment
            this.cdpSession.on('error', (error) => {
                logger.error(`WebSocketClient: CDP session error: ${error.message}`, error);
            });
            
            this.cdpSession.on('disconnected', () => {
                logger.warn('WebSocketClient: CDP session disconnected.');
                this.isConnected = false;
                this.cdpSession = null;
                this.targetPage = null;
                eventBus.emit('websocket:disconnected', {
                    statusDetails: { reason: 'CDP session disconnected' },
                    category: 'network_status',
                    priority: 'high'
                });
                logger.info(`Will attempt to re-establish WebSocket connection in ${this.config.retryDelay / 1000}s.`);
                this._scheduleRetry();
            });

            this.isConnected = true;
            this.isConnecting = false;
            logger.info('WebSocketClient: Successfully connected and listening for WebSocket frames.');
            eventBus.emit('websocket:connected', {
                statusDetails: { message: 'WebSocketClient successfully connected' },
                category: 'network_status',
                priority: 'high'
            });
            if (this.retryTimeoutId) {
                clearTimeout(this.retryTimeoutId);
                this.retryTimeoutId = null;
            }

        } catch (error) {
            logger.error('WebSocketClient: Error during connection setup:', error);
            this.isConnecting = false;
            this.isConnected = false;
            if (this.cdpSession) {
                try {
                    await this.cdpSession.detach();
                } catch (detachError) {
                    logger.error('WebSocketClient: Error detaching CDP session after failure:', detachError);
                }
                this.cdpSession = null;
            }
            this.targetPage = null;
            logger.info(`Will retry WebSocket connection in ${this.config.retryDelay / 1000}s.`);
            this._scheduleRetry();
            this.isConnected = false;
            eventBus.emit('websocket:disconnected', {
                statusDetails: { reason: 'Client initiated disconnect from disconnect() method' },
                category: 'network_status',
                priority: 'high'
            });
        }
    }

    _scheduleRetry() {
        if (this.retryTimeoutId) clearTimeout(this.retryTimeoutId); // Clear existing timer
        this.retryTimeoutId = setTimeout(() => {
            this.isConnecting = false; // Allow a new connection attempt
            this.connect();
        }, this.config.retryDelay);
    }

    /**
     * Disconnects the CDP session and stops listening for WebSocket frames.
     */
    async disconnect() {
        this.isConnecting = false;
        if (this.retryTimeoutId) {
            clearTimeout(this.retryTimeoutId);
            this.retryTimeoutId = null;
            logger.info('WebSocketClient: Connection retry cancelled.');
        }

        if (!this.cdpSession) {
            logger.info('WebSocketClient: Already disconnected or no CDP session to detach.');
            this.isConnected = false;
            return;
        }
        logger.info('WebSocketClient: Disconnecting CDP session...');
        try {
            await this.cdpSession.detach();
            logger.info('WebSocketClient: CDP session detached successfully.');
        } catch (error) {
            logger.error('WebSocketClient: Error detaching CDP session:', error);
        } finally {
            this.cdpSession = null;
            this.targetPage = null;
            this.isConnected = false;
            eventBus.emit('websocket:disconnected', {
                statusDetails: { reason: 'Client initiated disconnect from disconnect() method' },
                category: 'network_status',
                priority: 'high'
            });
        }
    }

    /**
     * Sends a raw message over the WebSocket via CDP.
     * Note: This requires knowing the specific WebSocket connection's `requestId` 
     * if multiple WebSockets are active on the page. For now, this is a placeholder.
     * 
     * @param {string} payload - The message payload to send.
     * @param {string} [requestId] - The ID of the WebSocket connection (optional, for future use if needed).
     */
    async sendMessage(payload, requestId) {
        if (!this.cdpSession || !this.isConnected) {
            logger.error('WebSocketClient: Cannot send message. CDP session not active.');
            return;
        }
        // This is a simplified send. CDP's Network.sendWebSocketFrame requires a requestId.
        // This requestId is the one associated with the specific WebSocket connection, 
        // obtained from Network.webSocketCreated or similar events.
        // For now, we log a warning. A more robust implementation would track active WebSockets.
        logger.warn('WebSocketClient.sendMessage: This is a placeholder. Proper implementation needs to target a specific WebSocket requestId.');
        // Example (needs a valid requestId for an active WS connection):
        // await this.cdpSession.send('Network.sendWebSocketFrame', {
        //     requestId: aValidWebSocketRequestId, 
        //     payload: payload,
        // });
        logger.debug(`WebSocketClient: Placeholder send message called with payload: ${payload}`);
    }
}

// Export a single instance (Singleton pattern)
const instance = new WebSocketClient();
module.exports = instance; 