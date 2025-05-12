/**
 * @file websocket_handler.js
 * @description Handles WebSocket communication via Chrome DevTools Protocol (CDP).
 *
 * Purpose:
 * This module is responsible for establishing a listener for WebSocket messages
 * originating from the target web page. It uses the Puppeteer page's CDP session
 * to intercept WebSocket frames, parse them, and emit structured events.
 * This abstracts the complexity of direct CDP interaction for WebSocket handling.
 *
 * Usage:
 * Called once by `main.js` during the setup phase after the page has loaded.
 * `setupWebSocketListener(page)` returns an EventEmitter instance.
 * The calling module (`main.js`) should then attach listeners to this emitter
 * for specific message types (e.g., 'message', 'close').
 * Example: 
 *   `const ws = await setupWebSocketListener(page);`
 *   `ws.on('message', (parsedData) => { ... });`
 *
 * Interaction:
 * - Takes a Puppeteer `page` object as input.
 * - Creates a CDP session (`page.createCDPSession()`).
 * - Enables the CDP `Network` domain.
 * - Listens for `Network.webSocketFrameReceived` and `Network.webSocketFrameError` events.
 * - Parses JSON payloads from received frames.
 * - Emits a `message` event with the parsed data object.
 * - Emits a `close` event if the WebSocket connection is reported closed by CDP.
 * - Requires `EventEmitter` for event handling.
 *
 * Note:
 * Currently, it only parses and emits messages assumed to be JSON. Binary frames or
 * other formats are not explicitly handled.
 */

// Handles setting up the WebSocket listener via Chrome DevTools Protocol (CDP)
import EventEmitter from 'events'; // Use import syntax
import logger from './logger.js'; // Updated path for root location
import { wait } from './puppeteer_utils.js'; // Updated path for root location

/**
 * Attaches a listener to the page's WebSocket frames using CDP.
 * NOTE: Returns an EventEmitter proxy, not a true WebSocket object.
 * This proxy emits 'message' events with parsed JSON data and 'close' events.
 * @param {import('puppeteer-core').Page} page The Puppeteer page object.
 * @returns {Promise<EventEmitter | null>} A promise that resolves with an EventEmitter proxy or null if failed.
 */
export async function setupWebSocketListener(page) {
    logger.info('Setting up WebSocket listener via CDP...'); // <<< Use logger
    try {
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');

        const wsProxy = new EventEmitter();
        let cdpSessionActive = true; // Flag to control event emission

        client.on('Network.webSocketFrameReceived', ({ requestId, timestamp, response }) => {
            if (!cdpSessionActive) return;
            
            const rawPayload = response.payloadData;
            // console.log('[WS Handler] Raw Payload Received:', rawPayload);

            if (response.opcode === 1) { // Opcode 1 is for text frames
                try {
                    let eventName = null;
                    let eventData = null;

                    // Check for Engine.IO/Socket.IO prefix (e.g., '42')
                    const prefixMatch = rawPayload.match(/^(\d+)(.*)$/);
                    let dataToParse = rawPayload;
                    let isLikelyEngineIOPacket = false;

                    if (prefixMatch) {
                        // Check if the part after digits looks like a JSON array/object
                        if (prefixMatch[2] && (prefixMatch[2].startsWith('[') || prefixMatch[2].startsWith('{'))) {
                            dataToParse = prefixMatch[2]; // Use the part after the digits
                        } else {
                            // It's likely an Engine.IO control packet (e.g., just '2' for ping, '3' for pong)
                            isLikelyEngineIOPacket = true;
                            logger.debug(`[WS Handler] Detected Engine.IO control packet: ${rawPayload}`);
                        }
                    } else if (/^\d+$/.test(rawPayload)) {
                        // Purely numeric payload, also likely an Engine.IO control packet not caught by prefixMatch (e.g. if regex needs adjustment for single digits)
                        isLikelyEngineIOPacket = true;
                        logger.debug(`[WS Handler] Detected likely Engine.IO numeric control packet: ${rawPayload}`);
                    }
                    
                    if (isLikelyEngineIOPacket) {
                        // Do nothing further for these packets, they are not game events to parse
                        return;
                    }

                    // Now parse the dataToParse, which should be a JSON string if we reached here
                    const parsedArray = JSON.parse(dataToParse);

                    // Check if it's the expected array format [eventName, eventData]
                    if (Array.isArray(parsedArray) && parsedArray.length >= 1) {
                        eventName = parsedArray[0];
                        eventData = parsedArray[1] || {}; // Use empty object if no data part

                        // Emit in the format main.js expects
                        const emitData = { type: eventName, data: eventData }; // <<< Store data to log
                        wsProxy.emit('message', emitData);
                        // Use logger.debug for successful emission
                        logger.debug(`[WS Handler] Emitted message. Type: ${eventName}`, { data: eventData });
                    } else {
                        // Use logger.warn for unexpected format
                        logger.warn('[WS Handler] Parsed data is not the expected [eventName, eventData] array format:', parsedArray);
                    }

                } catch (parseError) {
                    // Use logger.warn for parse failures
                    logger.warn('[WS Handler] Failed to parse WebSocket message payload.', { error: parseError.message });
                    logger.warn('[WS Handler] Raw Data:', String(rawPayload)); // Explicitly log rawPayload as a string
                }
            }
             // Handle binary opcodes (opcode === 2) if needed
        });

        client.on('Network.webSocketClosed', ({ requestId, timestamp }) => {
            if (!cdpSessionActive) return;
            logger.warn('CDP: Underlying WebSocket closed (Request ID:', requestId, ')'); // <<< Use logger
            wsProxy.emit('close'); // Notify listeners the conceptual socket closed
            // Consider if we need to detach or clean up the CDP session here
        });

        // Handle potential detachment of the CDP session itself
        client.on('disconnected', () => {
             logger.warn('CDP session disconnected.'); // <<< Use logger
             cdpSessionActive = false; // Stop emitting events from this session
             wsProxy.emit('close'); // Treat CDP disconnect as a close event
        });

        // Initial wait to allow listeners to attach - might not be strictly necessary
        // but was in the original code.
        await wait(500); 
        logger.info('CDP WebSocket listener conceptually attached.'); // <<< Use logger
        return wsProxy;

    } catch (error) {
        logger.error('Error setting up CDP session or Network listeners:', error); // <<< Use logger
        return null;
    }
}
