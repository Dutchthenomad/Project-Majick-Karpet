const logger = require('../../utils/logger');
const eventBus = require('../events/event-bus');
const { getConfig } = require('../../config/config-service');

/**
 * @class RugsProtocolAdapter
 * @description Handles parsing of raw WebSocket messages (including Socket.IO framing)
 *              from the game based on the detailed dictionary.
 *              Identifies key events like gameStateUpdate and emits structured data.
 */
class RugsProtocolAdapter {
    constructor() {
        this.lastServerSeedHash = null;
        this.currentGameId = null;
        this._handleRawFrame = this._handleRawFrame.bind(this); // Bind the handler method
        
        this.tradeEventQueue = []; // Queue for trades arriving before gameId is known
        this.MAX_QUEUE_AGE_MS = getConfig('protocolAdapter.maxQueueAgeMs', 7000); // Configurable max age (e.g., 7 seconds)
        this.MAX_QUEUE_SIZE = getConfig('protocolAdapter.maxQueueSize', 100); // Configurable max queue size

        logger.info('RugsProtocolAdapter initialized (Enhanced Parsing with Trade Event Queue).');
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
     * Handles incoming raw WebSocket frame data, including Socket.IO/Engine.IO framing.
     * Parses known events like 'gameStateUpdate' based on the dictionary.
     * @param {object} frameData - The data emitted by WebSocketClient.
     * @private
     */
    _handleRawFrame(eventPayload) {
        const frame = eventPayload.frame;
        if (!frame) {
            logger.warn('RugsProtocolAdapter: _handleRawFrame received event without frame data.', eventPayload);
            return;
        }

        // Destructure from frame
        const { type, originalTimestamp, data: rawWebSocketPayload } = frame; 
        // const requestId = frame.requestId; // Available if needed

        if (type !== 'received') return; // Only process received messages

        // Use 'rawWebSocketPayload' instead of 'payload' for the actual WS message content
        // Use 'originalTimestamp' instead of 'timestamp' for the WS frame's timestamp
        try {
            let eventName = null;
            let eventData = null;

            // 1. Handle Socket.IO/Engine.IO Framing (e.g., "42["eventName",{...}]")
            if (rawWebSocketPayload.startsWith('42[')) {
                // Attempt to parse the inner JSON array
                try {
                    const parsedArray = JSON.parse(rawWebSocketPayload.substring(2)); // Remove "42"
                    if (Array.isArray(parsedArray) && parsedArray.length >= 1) {
                        eventName = parsedArray[0];
                        eventData = parsedArray[1] || {}; // Data payload is the second element
                        // logger.debug(`Parsed Socket.IO message. Event: ${eventName}`);
                    } else {
                        logger.warn(`RugsProtocolAdapter: Received 42[...] frame, but inner content is not a valid event array: ${rawWebSocketPayload}`);
                        return;
                    }
                } catch (e) {
                    logger.warn(`RugsProtocolAdapter: Failed to parse Socket.IO frame payload: ${rawWebSocketPayload}`, e);
                    return; // Stop processing if inner JSON is invalid
                }
            } else if (rawWebSocketPayload.startsWith('{')) {
                // 2. Handle Plain JSON (if any messages arrive like this)
                try {
                    const parsedJson = JSON.parse(rawWebSocketPayload);
                    // Check if it has a structure we can interpret as an event
                    if (parsedJson.type && parsedJson.data) {
                        eventName = parsedJson.type;
                        eventData = parsedJson.data;
                        logger.debug(`Parsed plain JSON message. Type: ${eventName}`);
                    } else if (parsedJson.serverSeedHash) {
                        // Directly handle simple seed hash message if it exists
                        this._handleServerSeedHash(parsedJson, originalTimestamp); // Use originalTimestamp
                        return; // Handled this specific message type
                    } else {
                        logger.debug(`RugsProtocolAdapter: Received plain JSON, but unknown structure: ${rawWebSocketPayload.substring(0, 200)}...`);
                        return;
                    }
                } catch (e) {
                    logger.debug(`RugsProtocolAdapter: Received non-Socket.IO frame that is not valid JSON: ${rawWebSocketPayload.substring(0, 100)}...`);
                    return; // Ignore if it's not valid JSON
                }
            } else {
                // 3. Handle other non-JSON messages (like Engine.IO ping/pong '2' or '3')
                logger.debug(`RugsProtocolAdapter: Received non-JSON, non-Socket.IO message (likely ping/pong): ${rawWebSocketPayload}`);
                return;
            }

            // 4. Process known event types based on eventName
            if (eventName === 'gameStateUpdate') {
                this._processGameStateUpdate(eventData, originalTimestamp); // Use originalTimestamp
            } else if (eventName === 'newTrade') {
                this._processTradeEvent(eventData, originalTimestamp); // Use originalTimestamp
            } else if (eventName === 'crateInfo') {
                this._processCrateInfo(eventData, originalTimestamp); // Use originalTimestamp
            } else if (eventName === 'newChatMessage') {
                this._processChatMessage(eventData, originalTimestamp); // Use originalTimestamp
            } else if (eventName === 'playerUpdate') {
                logger.debug(`RugsProtocolAdapter: Received playerUpdate event (currently logged only): ${JSON.stringify(eventData).substring(0,100)}...`);
            } else if (eventName) {
                // Emit generic event for UNHANDLED known event types
                logger.info(`RugsProtocolAdapter: Received unhandled known event type: ${eventName}`);
                eventBus.emit(`protocol:raw:${eventName}`, {
                    rawEventName: eventName, 
                    originalTimestamp: originalTimestamp, // Pass through the originalTimestamp
                    eventData: eventData,
                    category: 'protocol_raw',
                    priority: 'low'
                });
            }
            // else: Unparseable or other messages are ignored based on logic above

        } catch (error) {
            // Catch unexpected errors during the main handling logic
            const directLogger = require('../../utils/logger'); // Directly require for safety here
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Use directLogger instead of this.logger
            directLogger.error(`RugsProtocolAdapter: Unexpected error in _handleRawFrame: ${errorMessage}`, { stack: error instanceof Error ? error.stack : undefined });
            
            if (rawWebSocketPayload) { 
                directLogger.debug(`Original payload that may have caused error in _handleRawFrame: ${String(rawWebSocketPayload).substring(0, 500)}...`);
            } else {
                directLogger.debug('Original rawWebSocketPayload was undefined during error in _handleRawFrame.');
            }
        }
    }

    /**
     * Processes the detailed gameStateUpdate event data.
     * Emits a structured protocol:gameStateUpdate event.
     * @param {object} data - The event data object from the gameStateUpdate message.
     * @param {number} timestamp - The timestamp associated with the raw frame.
     * @private
     */
    _processGameStateUpdate(data, timestamp) {
        if (!data || typeof data !== 'object') {
            logger.warn('RugsProtocolAdapter: Invalid data received for gameStateUpdate event.');
            return;
        }

        // Update currentGameId
        if (data.gameId) {
            this.currentGameId = data.gameId;
        } else {
            // This case should ideally not happen if gameStateUpdate always has gameId
            logger.warn('RugsProtocolAdapter: gameStateUpdate received without gameId. Trade events might not be correctly associated.');
        }

        // Extract provably fair info first, as it's crucial
        const provablyFair = data.provablyFair || {};
        this._handleServerSeedHash(provablyFair, timestamp);
        
        // Structure the output based on the dictionary
        const structuredGameState = {
            timestamp: timestamp,
            gameId: data.gameId,
            active: data.active,
            rugged: data.rugged,
            tickCount: data.tickCount,
            price: data.price,
            cooldownTimer: data.cooldownTimer,
            allowPreRoundBuys: data.allowPreRoundBuys,
            connectedPlayers: data.connectedPlayers,
            tradeCount: data.tradeCount,
            gameVersion: data.gameVersion, // Added from dictionary
            prngCallCount: data.prngCallCount, // Added from dictionary
            averageMultiplier: data.averageMultiplier, // Added from dictionary
            cooldownPaused: data.cooldownPaused, // Added from dictionary
            pauseMessage: data.pauseMessage, // Added from dictionary (likely empty)
            
            // Candle Data
            candles: data.candles || [], // Array of past candles
            currentCandle: data.currentCandle || null, // The candle currently forming
            
            // Trade Data (recent trades within the update)
            trades: data.trades || [],
            
            // Player Data
            leaderboard: data.leaderboard || [],
            
            // Provably Fair (already handled for seed hash, include for completeness)
            provablyFair: {
                serverSeedHash: provablyFair.serverSeedHash,
                version: provablyFair.version
            },
            
            // Game Parameters (included in gameStateUpdate)
            gameParameters: {
                BIG_MOVE_CHANCE: data.BIG_MOVE_CHANCE,
                BIG_MOVE_MAX: data.BIG_MOVE_MAX,
                BIG_MOVE_MIN: data.BIG_MOVE_MIN,
                DRIFT_MAX: data.DRIFT_MAX,
                DRIFT_MIN: data.DRIFT_MIN,
                GOD_CANDLE_CHANCE: data.GOD_CANDLE_CHANCE,
                // GOD_CANDLE_MOVE is variable, not usually in update
                MAX_BET_SOL: data.MAX_BET_SOL,
                MIN_VALID_TICKS: data.MIN_VALID_TICKS,
                RUG_PROB: data.RUG_PROB,
                TICKS_PER_CANDLE: data.TICKS_PER_CANDLE,
                TICK_MS: data.TICK_MS,
                TRADE_FEE: data.TRADE_FEE,
                // MAX_TICKS not typically in update
                // PRESALE_DURATION / COOLDOWN_DURATION not typically in update
            },
            
            // Rugpool Info (Added from example payload)
            rugpool: data.rugpool || null,
            
            // Historical game snippets (Added from example payload)
            gameHistory: data.gameHistory || []
        };

        // Emit the structured event
        eventBus.emit('protocol:gameStateUpdate', {
            gameState: structuredGameState,
            category: 'protocol',
            priority: 'high'
        });
        // logger.debug('Emitted protocol:gameStateUpdate');

        // After a new gameId is confirmed and a gameStateUpdate processed,
        // try to process any queued trades.
        if (this.currentGameId) { // Ensure currentGameId was successfully set from the update
            this._processQueuedTrades(this.currentGameId);
        }
    }

    /**
     * Handles checking for and emitting serverSeedHash updates.
     * @param {object} provablyFairData - The object containing the hash (e.g., gameStateUpdate.provablyFair).
     * @param {number} timestamp - The timestamp associated with the raw frame.
     * @private
     */
    _handleServerSeedHash(provablyFairData, timestamp) {
        if (provablyFairData && provablyFairData.serverSeedHash) {
            const newSeedHash = provablyFairData.serverSeedHash;
            if (newSeedHash !== this.lastServerSeedHash) {
                this.lastServerSeedHash = newSeedHash;
                logger.info(`RugsProtocolAdapter: Detected new serverSeedHash: ${newSeedHash}`);
                eventBus.emit('protocol:serverSeedFound', {
                    serverSeedHash: newSeedHash,
                    originalTimestamp: timestamp, // Preserve original timestamp
                    category: 'protocol',
                    priority: 'normal'
                });
            } // else { logger.debug('Repeated serverSeedHash received.'); }
        } 
    }

    /**
     * Processes the tradeEvent data.
     * Emits a structured protocol:tradeEvent event.
     * @param {object} data - The event data object from the tradeEvent message.
     * @param {number} timestamp - The timestamp associated with the raw frame.
     * @private
     */
    _processTradeEvent(data, timestamp) {
        // --- TEMPORARY LOGGING --- 
        // logger.info(`[DEBUG] _processTradeEvent received data (original): ${JSON.stringify(data)}`);
        // --- END TEMPORARY LOGGING ---
        
        if (!this.currentGameId) {
            if (this.tradeEventQueue.length < this.MAX_QUEUE_SIZE) {
                this.tradeEventQueue.push({ data, timestamp, receivedAt: Date.now() });
                logger.warn(`RugsProtocolAdapter: currentGameId not set. Queued trade event for Player: ${data ? data.username : 'N/A'}, Type: ${data ? data.type : 'N/A'}. Queue size: ${this.tradeEventQueue.length}`);
            } else {
                logger.error(`RugsProtocolAdapter: Trade event queue full (${this.MAX_QUEUE_SIZE}). Discarding event for Player: ${data ? data.username : 'N/A'}`);
            }
            return;
        }
        // logger.debug(`RugsProtocolAdapter: Passed currentGameId check. this.currentGameId = '${this.currentGameId}'`);

        if (!data || typeof data !== 'object') {
            logger.warn('RugsProtocolAdapter: Invalid data received for tradeEvent event.');
            return;
        }

        let currency = 'UNKNOWN';

        if (data.type === 'buy') {
            if (data.coinTicker === 'FREE' || data.coinAddress === '0xPractice') {
                currency = 'FREE';
            } else if (data.realPortion > 0) { // SOL indicated by real portion
                currency = 'SOL';
            } else if (data.bonusPortion > 0) { // FREE indicated by bonus portion (less common for buys if not explicitly FREE coin)
                currency = 'FREE';
            } else if (data.isPreRoundBuy) { 
                // For pre-round buys, if not explicitly FREE, assume SOL.
                // This covers cases where realPortion/bonusPortion might be 0 or absent.
                currency = 'SOL';
            }
            // If still UNKNOWN after buy checks, it's an edge case or new buy type.
            // Defaulting to SOL for buys if all else fails and not pre-round might be too broad.
            // For now, pre-round buys are the main focus for this fallback.

        } else if (data.type === 'sell') {
            // For sells, coinTicker is a strong indicator.
            if (data.coinTicker === 'FREE') {
                currency = 'FREE';
            } 
            // Otherwise, examine proceeds composition.
            // realPortion/bonusPortion on sells refer to the currency of the *proceeds*.
            else if (data.realPortion > 0) { // If any part of the proceeds is 'real' (SOL)
                currency = 'SOL'; // Implies SOL tokens were sold to get SOL back
            } else if (data.bonusPortion > 0) { // If any part of the proceeds is 'bonus' (FREE)
                currency = 'FREE'; // Implies FREE tokens were sold to get FREE tokens back (less common, usually FREE tokens sell for SOL)
                                   // Or SOL tokens were sold and for some reason only bonus was returned (highly unlikely)
                                   // This path makes more sense if it's FREE tokens being sold.
            }
            // Fallback for sells: If coinTicker wasn't 'FREE' and proceeds portions were zero/null,
            // but it was a sell action, assume SOL tokens were sold (e.g., for zero value or error).
            else if (currency === 'UNKNOWN' && data.coinTicker !== 'FREE') { 
                currency = 'SOL';
            }
        }
        
        // If currency is still UNKNOWN, log a warning with more details
        if (currency === 'UNKNOWN') {
            logger.warn(`RugsProtocolAdapter: Could not determine currency for trade. Type: ${data.type}, isPreRoundBuy: ${data.isPreRoundBuy}, coinTicker: ${data.coinTicker}, coinAddress: ${data.coinAddress}, realPortion: ${data.realPortion}, bonusPortion: ${data.bonusPortion}. Original data: ${JSON.stringify(data)}`);
        }

        const augmentedTradeData = {
            ...data,
            gameId: this.currentGameId, // Add the current gameId
            currency: currency,          // Add the inferred currency
            tickCount: data.tickIndex  // Rename tickIndex to tickCount for consistency if PlayerStateService expects it
        };

        // --- TEMPORARY LOGGING for augmented data ---
        logger.info(`[DEBUG] _processTradeEvent emitting augmented data: ${JSON.stringify(augmentedTradeData)}`);
        // --- END TEMPORARY LOGGING ---

        // Emit event with timestamp and the AUGMENTED trade data itself
        eventBus.emit('protocol:tradeEvent', {
            trade: augmentedTradeData, // Main data under a key
            originalTimestamp: timestamp, // Preserve original timestamp
            category: 'protocol',
            priority: 'high'
        });
        logger.debug(`Processed ${currency} tradeEvent for player: ${data.username} in game: ${this.currentGameId}`);
    }

    /**
     * Processes the crateInfo event data.
     * Emits a structured protocol:crateInfo event.
     * @param {object} data - The event data object from the crateInfo message.
     * @param {number} timestamp - The timestamp associated with the raw frame.
     * @private
     */
    _processCrateInfo(data, timestamp) {
        if (!data || typeof data !== 'object') {
            logger.warn('RugsProtocolAdapter: Invalid data received for crateInfo event.');
            return;
        }
        eventBus.emit('protocol:crateInfo', {
            crateInfo: data, // Main data under a key
            originalTimestamp: timestamp, // Preserve original timestamp
            category: 'protocol',
            priority: 'normal'
        });
        logger.info('Processed crateInfo event.');
    }

    /**
     * Processes the newChatMessage event data.
     * Emits a structured protocol:chatMessage event.
     * @param {object} data - The event data object from the newChatMessage message.
     * @param {number} timestamp - The timestamp associated with the raw frame.
     * @private
     */
    _processChatMessage(data, timestamp) {
        if (!data || typeof data !== 'object') {
            logger.warn('RugsProtocolAdapter: Invalid data received for newChatMessage event.');
            return;
        }
        eventBus.emit('protocol:chatMessage', {
            chatMessage: data, // Main data under a key
            originalTimestamp: timestamp, // Preserve original timestamp
            category: 'protocol_chat',
            priority: 'low'
        });
        // logger.debug(`Processed chat message from: ${data.username}`);
    }

    /**
     * Processes trades that were queued because gameId was not known at the time of their arrival.
     * Also cleans up very old trades from the queue.
     * @param {string} currentGameIdToProcess The game ID that is now active.
     * @private
     */
    _processQueuedTrades(currentGameIdToProcess) {
        if (this.tradeEventQueue.length === 0) {
            return;
        }

        logger.info(`RugsProtocolAdapter: Processing ${this.tradeEventQueue.length} queued trade events for game ${currentGameIdToProcess}.`);
        
        const tradesToKeepInQueue = []; // Store trades that are not processed (e.g. too stale or for a future game if logic was added)
        let processedCount = 0;

        for (const queuedEvent of this.tradeEventQueue) {
            const age = Date.now() - queuedEvent.receivedAt;
            if (age > this.MAX_QUEUE_AGE_MS) {
                logger.warn(`RugsProtocolAdapter: Discarding stale queued trade event (aged ${age}ms, limit ${this.MAX_QUEUE_AGE_MS}ms) for Player: ${queuedEvent.data ? queuedEvent.data.username : 'N/A'}. Data: ${JSON.stringify(queuedEvent.data)}`);
                continue; // Skip this stale event, do not add to tradesToKeepInQueue
            }
            
            // Current assumption: all non-stale queued trades are for the newly identified currentGameIdToProcess.
            // If we had a way to associate queued trades with specific game IDs (e.g., if raw trade data included it),
            // we would add a filter here: if (queuedEvent.gameIdHint === currentGameIdToProcess) { ... }
            this.logger.debug(`RugsProtocolAdapter: Processing queued trade for game ${currentGameIdToProcess}: Player ${queuedEvent.data ? queuedEvent.data.username : 'N/A'}`);
            this._processTradeEventLogic(queuedEvent.data, queuedEvent.timestamp, currentGameIdToProcess);
            processedCount++;
            // Do not add to tradesToKeepInQueue as it has been processed.
        }

        this.tradeEventQueue = tradesToKeepInQueue; // Assign back only those not processed (which will be empty in current logic after stale removal)
        
        if (processedCount > 0) {
            logger.info(`RugsProtocolAdapter: Processed ${processedCount} trade events from queue. New queue size: ${this.tradeEventQueue.length}`);
        }
    }

    /**
     * Core logic for processing a trade event, used by both direct and queued trades.
     * This was the original content of _processTradeEvent after the gameId check.
     */
    _processTradeEventLogic(data, timestamp, gameIdForTrade) {
        // This check is now redundant here if called by _processTradeEvent (which already checks)
        // or _processQueuedTrades (which passes a valid gameIdForTrade)
        // if (!gameIdForTrade) { ... return ... }

        if (!data || typeof data !== 'object') {
            logger.warn('RugsProtocolAdapter: Invalid data provided to _processTradeEventLogic.');
            return;
        }

        let currency = 'UNKNOWN';
        // ... (rest of the currency determination logic from the original _processTradeEvent) ...
        if (data.type === 'buy') {
            if (data.coinTicker === 'FREE' || data.coinAddress === '0xPractice') {
                currency = 'FREE';
            } else if (data.realPortion > 0) { 
                currency = 'SOL';
            } else if (data.bonusPortion > 0) { 
                currency = 'FREE';
            } else if (data.isPreRoundBuy) { 
                currency = 'SOL';
            }
        } else if (data.type === 'sell') {
            if (data.coinTicker === 'FREE') {
                currency = 'FREE';
            } 
            else if (data.realPortion > 0) { 
                currency = 'SOL'; 
            } else if (data.bonusPortion > 0) { 
                currency = 'FREE'; 
            }
            else if (currency === 'UNKNOWN' && data.coinTicker !== 'FREE') { 
                currency = 'SOL';
            }
        }
        if (currency === 'UNKNOWN') {
            logger.warn(`RugsProtocolAdapter: Could not determine currency for trade (logic). Type: ${data.type}, isPreRoundBuy: ${data.isPreRoundBuy}, coinTicker: ${data.coinTicker}, coinAddress: ${data.coinAddress}, realPortion: ${data.realPortion}, bonusPortion: ${data.bonusPortion}.`);
        }

        const augmentedTradeData = {
            ...data,
            gameId: gameIdForTrade, // Use the passed gameIdForTrade
            currency: currency,          
            tickCount: data.tickIndex  
        };

        logger.info(`[DEBUG] _processTradeEventLogic emitting augmented data: ${JSON.stringify(augmentedTradeData)}`);

        eventBus.emit('protocol:tradeEvent', {
            trade: augmentedTradeData, 
            originalTimestamp: timestamp, 
            category: 'protocol',
            priority: 'high'
        });
        logger.debug(`Processed ${currency} tradeEvent for player: ${data.username} in game: ${gameIdForTrade}`);
    }
}

// Export a single instance (Singleton pattern)
const instance = new RugsProtocolAdapter();
module.exports = instance; 