const logger = require('../../utils/logger');
const eventBus = require('../events/event-bus');
const ServiceBase = require('./service-base'); // Require ServiceBase

/**
 * @class GameStateService
 * @description Maintains the current game state based on processed protocol events.
 *              Detects phase changes, new games, and other significant state transitions,
 *              emitting higher-level game events.
 */
class GameStateService extends ServiceBase { // Extend ServiceBase
    constructor() {
        super('GameStateService'); // Call super constructor
        this.currentState = this._getDefaultState();
        this._handleGameStateUpdate = this._handleGameStateUpdate.bind(this);
        this.isListening = false;
        logger.info('GameStateService initialized.');
    }

    _getDefaultState() {
        return {
            gameId: null,
            phase: 'unknown', // e.g., 'presale', 'active', 'settlement', 'cooldown', 'unknown'
            lastPrice: null,
            lastTickCount: -1,
            lastCandleIndex: -1,
            lastServerSeedHash: null, 
            // Store the most recent full update for reference
            lastUpdate: null 
        };
    }

    /**
     * Starts listening for processed gameStateUpdate events.
     */
    startListening() {
        if (this.isListening) {
            logger.warn('GameStateService is already listening.');
            return;
        }
        logger.info('GameStateService starting to listen for protocol events...');
        eventBus.on('protocol:gameStateUpdate', this._handleGameStateUpdate);
        this.isListening = true;
        // Consider emitting an initial state event or null state event?
    }

    /**
     * Stops listening for processed gameStateUpdate events.
     */
    stopListening() {
        if (!this.isListening) {
            return;
        }
        logger.info('GameStateService stopping listening...');
        eventBus.off('protocol:gameStateUpdate', this._handleGameStateUpdate);
        this.isListening = false;
        // Reset state when stopped?
        // this.currentState = this._getDefaultState(); 
    }

    /**
     * Returns the last known game state.
     * @returns {object | null} A deep copy of the last received structured game state, or null.
     */
    getCurrentState() {
        // Return a copy to prevent external modification
        return this.currentState.lastUpdate 
               ? JSON.parse(JSON.stringify(this.currentState.lastUpdate)) 
               : null;
    }
    
     /**
     * Returns the current determined game phase.
     * @returns {string} The current game phase ('presale', 'active', 'settlement', 'cooldown', 'unknown').
     */
    getCurrentPhase() {
        return this.currentState.phase;
    }

    /**
     * Handles the structured gameStateUpdate event from the protocol adapter.
     * Detects changes and emits higher-level game events.
     * @param {object} payload - The full event bus payload.
     * @private
     */
    _handleGameStateUpdate(payload) { // Expects the full event bus payload
        const update = payload.gameState; // Extract the actual game state data
        if (!update) {
            logger.warn('GameStateService: Received protocol:gameStateUpdate without gameState in payload.');
            return;
        }

        const previousState = { ...this.currentState }; // Copy previous state for comparison
        this.currentState.lastUpdate = update; // Store the latest full update

        // 1. Check for New Game
        if (update.gameId && update.gameId !== previousState.gameId) {
            logger.info(`New Game Detected: ${update.gameId} (Previous: ${previousState.gameId})`);
            this.currentState = this._getDefaultState(); // Reset state for new game
            this.currentState.gameId = update.gameId;
            this.currentState.lastUpdate = update; // Store update after reset
            eventBus.emit('game:newGame', { 
                // timestamp: update.timestamp, // This is the original event timestamp from protocol adapter
                gameTimestamp: update.timestamp, // Renaming to avoid clash, this is the game data's timestamp
                gameId: update.gameId,
                initialState: update, // Include the first update for this game
                category: 'game_lifecycle',
                priority: 'high'
            });
            // Re-evaluate phase and other state for the new game immediately
            this._updateAndEmitChanges(update, previousState); // Pass original previous state here
            return; // Stop further processing for this update as state was reset
        }
        
        // 2. Update internal state and detect changes
        this._updateAndEmitChanges(update, previousState);
    }

    /**
     * Helper method to update state fields and emit change events.
     * @param {object} update - The current structured game state update.
     * @param {object} previousInternalState - The internal state BEFORE this update.
     * @private
     */
    _updateAndEmitChanges(update, previousInternalState) {
        // Determine Current Phase (based on dictionary logic)
        let determinedPhase = 'unknown';
        if (update.active === false && update.allowPreRoundBuys === true && update.cooldownTimer <= 0) {
            determinedPhase = 'presale';
        } else if (update.active === true) {
            determinedPhase = 'active';
        } else if (update.active === false && update.rugged === true) {
            determinedPhase = 'settlement';
        } else if (update.active === false && update.cooldownTimer > 0) {
            determinedPhase = 'cooldown';
        }
        
        // Emit Phase Change
        if (determinedPhase !== previousInternalState.phase && determinedPhase !== 'unknown') {
            logger.info(`Phase Changed: ${previousInternalState.phase} -> ${determinedPhase} (Game: ${update.gameId})`);
            this.currentState.phase = determinedPhase;
            eventBus.emit('game:phaseChange', {
                // timestamp: update.timestamp,
                gameTimestamp: update.timestamp,
                gameId: update.gameId,
                previousPhase: previousInternalState.phase,
                currentPhase: this.currentState.phase,
                data: update, // Include full data that triggered change
                category: 'game_lifecycle',
                priority: 'normal'
            });
             // If game becomes rugged, also emit specific event
            if(determinedPhase === 'settlement' && previousInternalState.phase !== 'settlement') {
                logger.info(`Game Rugged: ${update.gameId} at price ${update.price}`);
                 eventBus.emit('game:rugged', {
                    // timestamp: update.timestamp,
                    gameTimestamp: update.timestamp,
                    gameId: update.gameId,
                    finalPrice: update.price,
                    tickCount: update.tickCount,
                    data: update,
                    category: 'game_lifecycle',
                    priority: 'high'
                 });
            }
        } else if (determinedPhase !== 'unknown') {
             // Ensure state reflects determined phase even if no change event
             this.currentState.phase = determinedPhase;
        }

        // Emit Price Update
        if (update.price !== null && update.price !== previousInternalState.lastPrice) {
            this.currentState.lastPrice = update.price;
            eventBus.emit('game:priceUpdate', {
                // timestamp: update.timestamp,
                gameTimestamp: update.timestamp,
                gameId: update.gameId,
                price: update.price,
                tickCount: update.tickCount,
                category: 'game_data',
                priority: 'normal'
            });
        }

        // Emit Tick Update (can be noisy, consider if needed)
        if (update.tickCount !== null && update.tickCount > previousInternalState.lastTickCount) {
             this.currentState.lastTickCount = update.tickCount;
             // eventBus.emit('game:tick', {
             //     timestamp: update.timestamp,
             //     gameId: update.gameId,
             //     tickCount: update.tickCount,
             //     price: update.price
             // });
        }
        
         // Emit New Candle
        const currentCandleIndex = update.currentCandle ? update.currentCandle.index : (update.candles && update.candles.length > 0 ? update.candles[update.candles.length-1].index : -1);
        if (currentCandleIndex > previousInternalState.lastCandleIndex) {
             this.currentState.lastCandleIndex = currentCandleIndex;
             const newCandle = update.currentCandle || (update.candles && update.candles.length > 0 ? update.candles[update.candles.length-1] : null);
             if (newCandle) {
                 logger.debug(`New Candle Detected: Index ${currentCandleIndex} (Game: ${update.gameId})`);
                 eventBus.emit('game:newCandle', {
                    // timestamp: update.timestamp, // Timestamp of the update that completed/showed the candle
                    gameTimestamp: update.timestamp,
                    gameId: update.gameId,
                    candle: newCandle,
                    category: 'game_data',
                    priority: 'normal'
                 });
             }
        }
        
        // Emit Leaderboard Update (maybe only if changed? Deep comparison is expensive)
        // For now, let's just emit if present. Consumers can debounce/compare if needed.
        if(update.leaderboard && update.leaderboard.length > 0) {
             // eventBus.emit('game:leaderboardUpdate', {
             //    timestamp: update.timestamp,
             //    gameId: update.gameId,
             //    leaderboard: update.leaderboard
             // });
        }
        
        // Update Server Seed Hash state (if changed)
        if(update.provablyFair && update.provablyFair.serverSeedHash && update.provablyFair.serverSeedHash !== previousInternalState.lastServerSeedHash){
             this.currentState.lastServerSeedHash = update.provablyFair.serverSeedHash;
             // Note: protocol:serverSeedFound is already emitted by ProtocolAdapter
        }

        // --- Add more change detections as needed --- 
    }
}

// Export a single instance (Singleton pattern)
const instance = new GameStateService();
module.exports = instance; 