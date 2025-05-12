/**
 * RugsGame protocol handler - translates between generic events and game-specific protocol
 */
class RugsProtocolAdapter {
  constructor() {
    this.eventBus = null;
    this.engine = null;
  }
  
  initialize(engine) {
    this.engine = engine;
    this.eventBus = engine.eventBus;
    
    // Subscribe to raw websocket messages
    this.eventBus.on('websocket:rawMessage', this.handleRawMessage.bind(this));
  }
  
  // Handle raw WebSocket messages
  handleRawMessage({ payload }) {
    try {
      // Check for Engine.IO/Socket.IO prefix (e.g., '42')
      const prefixMatch = payload.match(/^(\d+)(.*)$/);
      let dataToParse = payload;
      
      if (prefixMatch) {
        // Check if the part after digits looks like a JSON array/object
        if (prefixMatch[2] && (prefixMatch[2].startsWith('[') || prefixMatch[2].startsWith('{'))) {
          dataToParse = prefixMatch[2]; // Use the part after the digits
        } else {
          // Engine.IO control packet (ping/pong) - ignore these
          return;
        }
      } else if (/^\d+$/.test(payload)) {
        // Purely numeric payload - also likely an Engine.IO control packet
        return;
      }
      
      const parsedData = JSON.parse(dataToParse);
      
      // Check if it's the expected array format [eventName, eventData]
      if (Array.isArray(parsedData) && parsedData.length >= 1) {
        const eventName = parsedData[0];
        const eventData = parsedData[1] || {};
        
        // Convert to standardized event format
        this._processGameEvent(eventName, eventData);
      } else {
        console.warn('Parsed data is not the expected [eventName, eventData] array format:', parsedData);
      }
    } catch (error) {
      console.debug('Failed to parse WebSocket message:', error);
    }
  }
  
  /**
   * Process game-specific events and convert to standardized format
   * @param {string} eventName - Raw event name from WebSocket
   * @param {Object} eventData - Raw event data from WebSocket
   */
  _processGameEvent(eventName, eventData) {
    switch (eventName) {
      case 'gameStateUpdate':
        this._processGameStateUpdate(eventData);
        break;
      case 'tradeEvent':
        this._processTradeEvent(eventData);
        break;
      case 'crateInfo':
        this._processCrateInfo(eventData);
        break;
      default:
        // Emit as a generic event for any listeners that might want it
        this.eventBus.emit('game:rawEvent', { type: eventName, data: eventData });
    }
  }
  
  /**
   * Process game state update events
   * @param {Object} data - Raw game state data
   */
  _processGameStateUpdate(data) {
    if (!data) return;
    
    // Extract essential game state info
    const gameState = {
      gameId: data.gameId,
      active: data.active,
      price: data.price,
      rugged: data.rugged,
      tickCount: data.tickCount,
      candles: data.candles || [],
      currentCandle: data.currentCandle,
      cooldownTimer: data.cooldownTimer,
      allowPreRoundBuys: data.allowPreRoundBuys,
      timestamp: Date.now()
    };
    
    // Emit the standardized game state event
    this.eventBus.emit('game:stateUpdate', gameState);
    
    // Determine game phase for phase change events
    this._detectAndEmitPhaseChange(data);
    
    // Process any trades included in the update
    if (data.trades && Array.isArray(data.trades)) {
      data.trades.forEach(trade => {
        this.eventBus.emit('game:trade', {
          ...trade,
          gameId: data.gameId,
          timestamp: Date.now()
        });
      });
    }
    
    // Process leaderboard data
    if (data.leaderboard && Array.isArray(data.leaderboard)) {
      this.eventBus.emit('game:leaderboardUpdate', {
        gameId: data.gameId,
        leaderboard: data.leaderboard,
        timestamp: Date.now()
      });
    }
    
    // If the game has rugged, emit a specific event
    if (data.rugged && data.active === false) {
      this.eventBus.emit('game:rugged', {
        gameId: data.gameId,
        finalPrice: data.price,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Detect phase changes and emit corresponding events
   * @param {Object} data - Game state data
   */
  _detectAndEmitPhaseChange(data) {
    let phase = 'unknown';
    
    if (data.active === false && data.allowPreRoundBuys === true) {
      phase = 'presale';
    } else if (data.active === true) {
      phase = 'active';
    } else if (data.active === false && data.rugged === true) {
      phase = 'settlement';
    } else if (data.active === false && data.cooldownTimer > 0) {
      phase = 'cooldown';
    }
    
    // Store the current phase in the game state if it changed
    const previousPhase = this.engine.state.gameState?.phase;
    if (previousPhase !== phase) {
      this.eventBus.emit('game:phaseChange', {
        gameId: data.gameId,
        previousPhase,
        currentPhase: phase,
        timestamp: Date.now()
      });
      
      // Update the engine's game state
      this.engine.state.gameState = {
        ...(this.engine.state.gameState || {}),
        phase
      };
    }
  }
  
  /**
   * Process trade events
   * @param {Object} data - Raw trade event data
   */
  _processTradeEvent(data) {
    this.eventBus.emit('game:trade', {
      ...data,
      timestamp: Date.now()
    });
  }
  
  /**
   * Process crate info events
   * @param {Object} data - Raw crate info data
   */
  _processCrateInfo(data) {
    this.eventBus.emit('game:crateInfo', {
      ...data,
      timestamp: Date.now()
    });
  }
  
  /**
   * Create a buy order in the game's expected format
   * @param {number} amount - Amount to buy
   * @param {string} coin - Coin to use (e.g., "SOL")
   * @param {number} [autoCashout] - Optional auto-cashout multiplier
   * @returns {Object} Formatted buy order
   */
  createBuyOrder(amount, coin = "SOL", autoCashout = null) {
    const order = {
      type: "command",
      command: "placeBuy",
      parameters: {
        amount,
        coin
      },
      requestId: `buy-${Date.now()}`
    };
    
    if (autoCashout !== null) {
      order.parameters.autoCashout = autoCashout;
    }
    
    return order;
  }
  
  /**
   * Create a sell order in the game's expected format
   * @param {number} percentage - Percentage to sell (0-100)
   * @returns {Object} Formatted sell order
   */
  createSellOrder(percentage = 100) {
    return {
      type: "command",
      command: "placeSell",
      parameters: {
        percentage
      },
      requestId: `sell-${Date.now()}`
    };
  }
}

module.exports = RugsProtocolAdapter; 