const EventEmitter = require('events');

/**
 * Generic WebSocket client that handles connection lifecycle
 */
class WebSocketClient {
  constructor(options = {}) {
    this.options = options;
    this.eventBus = null;
    this.engine = null;
    this.cdpClient = null;
    this.protocolAdapter = null;
    this.isConnected = false;
  }
  
  initialize(engine) {
    this.engine = engine;
    this.eventBus = engine.eventBus;
    
    // Get the protocol adapter if registered
    this.protocolAdapter = engine.modules.get('protocolAdapter');
    if (!this.protocolAdapter) {
      console.warn('Protocol adapter not registered, WebSocket messages will not be parsed');
    }
  }
  
  async connect() {
    if (this.isConnected) {
      console.warn('WebSocket client already connected');
      return;
    }
    
    try {
      const page = this.engine.state.page;
      if (!page) {
        throw new Error('Page not available');
      }
      
      // Create CDP session (similar to your existing websocket_handler.js)
      this.cdpClient = await page.target().createCDPSession();
      await this.cdpClient.send('Network.enable');
      
      // Set up event listeners
      this.cdpClient.on('Network.webSocketFrameReceived', this._handleWebSocketFrame.bind(this));
      this.cdpClient.on('Network.webSocketClosed', this._handleWebSocketClosed.bind(this));
      this.cdpClient.on('disconnected', this._handleCdpDisconnected.bind(this));
      
      this.isConnected = true;
      this.eventBus.emit('websocket:connected', { timestamp: Date.now() });
      console.log('WebSocket client connected');
    } catch (error) {
      console.error('Failed to connect WebSocket client:', error);
      throw error;
    }
  }
  
  async disconnect() {
    if (!this.isConnected) {
      return;
    }
    
    try {
      // Clean up CDP session if it exists
      if (this.cdpClient) {
        // Remove listeners to prevent memory leaks
        this.cdpClient.removeAllListeners('Network.webSocketFrameReceived');
        this.cdpClient.removeAllListeners('Network.webSocketClosed');
        this.cdpClient.removeAllListeners('disconnected');
        
        // Disable network domain to stop receiving events
        await this.cdpClient.send('Network.disable').catch(() => {});
        this.cdpClient = null;
      }
      
      this.isConnected = false;
      this.eventBus.emit('websocket:disconnected', { timestamp: Date.now() });
      console.log('WebSocket client disconnected');
    } catch (error) {
      console.error('Error disconnecting WebSocket client:', error);
    }
  }
  
  _handleWebSocketFrame({ requestId, timestamp, response }) {
    if (!this.isConnected) return;
    
    const rawPayload = response.payloadData;
    
    // Emit raw message event
    this.eventBus.emit('websocket:rawMessage', { 
      requestId, 
      timestamp, 
      payload: rawPayload 
    });
    
    // If we have a protocol adapter, let it parse the message
    if (this.protocolAdapter) {
      this.protocolAdapter.handleRawMessage(rawPayload);
    } else {
      // Basic parsing if no protocol adapter
      try {
        if (response.opcode === 1) { // Text frame
          // Try to parse as JSON
          const parsed = JSON.parse(rawPayload);
          this.eventBus.emit('websocket:message', parsed);
        }
      } catch (error) {
        console.debug('Failed to parse WebSocket message:', error);
      }
    }
  }
  
  _handleWebSocketClosed({ requestId, timestamp }) {
    console.warn('WebSocket connection closed by remote server');
    this.eventBus.emit('websocket:closed', { requestId, timestamp });
    
    // Try to reconnect if engine is still running
    if (this.engine.state.running) {
      console.log('Attempting to reconnect WebSocket...');
      setTimeout(() => {
        this.connect().catch(err => {
          console.error('Failed to reconnect WebSocket:', err);
        });
      }, 5000); // Wait 5 seconds before reconnecting
    }
  }
  
  _handleCdpDisconnected() {
    console.warn('CDP session disconnected');
    this.cdpClient = null;
    this.isConnected = false;
    this.eventBus.emit('websocket:disconnected', { timestamp: Date.now() });
    
    // Try to reconnect if engine is still running
    if (this.engine.state.running) {
      console.log('Attempting to reconnect CDP session...');
      setTimeout(() => {
        this.connect().catch(err => {
          console.error('Failed to reconnect CDP session:', err);
        });
      }, 5000);
    }
  }
  
  // Send a message through the WebSocket (if needed in the future)
  async sendMessage(message) {
    if (!this.isConnected || !this.cdpClient) {
      throw new Error('WebSocket not connected');
    }
    
    // Implement message sending through CDP if needed
  }
}

module.exports = WebSocketClient; 