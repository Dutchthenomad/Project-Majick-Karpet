const ServiceBase = require('../services/service-base');
const eventBus = require('../events/event-bus');
const logger = require('../../utils/logger');

/**
 * @class PatternRecognitionService
 * @description Analyzes price movements and game state to detect tradable patterns
 * in real-time. Emits events when patterns are detected.
 */
class PatternRecognitionService extends ServiceBase {
    constructor(options = {}) {
        super('PatternRecognitionService', options);
        
        // Configuration options with defaults
        this.minDataPoints = options.minDataPoints || 10;
        this.dipThresholdPercent = options.dipThresholdPercent || 15; // 15% drop for dip detection
        this.dipWindowTicks = options.dipWindowTicks || 20; // Number of ticks to look back for dip detection
        
        // State variables
        this.priceHistory = [];
        this.recentPatterns = new Set(); // Currently active patterns
        this.patternMetadata = new Map(); // Additional data about each pattern
        this.lastProcessedTick = 0;
        
        // Bind methods
        this._handlePriceUpdate = this._handlePriceUpdate.bind(this);
        this._detectPatterns = this._detectPatterns.bind(this);
        
        logger.info('PatternRecognitionService initialized with options:', { 
            dipThresholdPercent: this.dipThresholdPercent,
            dipWindowTicks: this.dipWindowTicks
        });
    }
    
    /**
     * @override
     * Start the service
     */
    async start() {
        await super.start();
        
        // Subscribe to relevant events
        this.eventBus.on('game:priceUpdate', this._handlePriceUpdate);
        this.eventBus.on('game:stateUpdate', (data) => {
            // If this is a new game, reset our state
            if (data.gameId && this.currentGameId !== data.gameId) {
                this.resetState(data.gameId);
            }
        });
        
        logger.info('PatternRecognitionService started and listening for events');
    }
    
    /**
     * @override
     * Stop the service
     */
    async stop() {
        // Unsubscribe from events
        this.eventBus.off('game:priceUpdate', this._handlePriceUpdate);
        
        await super.stop();
        logger.info('PatternRecognitionService stopped');
    }
    
    /**
     * Reset the service state for a new game
     * @param {string} gameId - The new game ID
     */
    resetState(gameId) {
        this.priceHistory = [];
        this.recentPatterns.clear();
        this.patternMetadata.clear();
        this.lastProcessedTick = 0;
        this.currentGameId = gameId;
        
        logger.info(`PatternRecognitionService state reset for new game: ${gameId}`);
    }
    
    /**
     * Handle price update events from the EventBus
     * @param {Object} eventData - The price update event data
     */
    _handlePriceUpdate(eventData) {
        const { price, tickCount, gameId } = eventData;
        
        // Validate data
        if (price === undefined || tickCount === undefined) {
            return;
        }
        
        // If this is a new game, reset state
        if (gameId && this.currentGameId !== gameId) {
            this.resetState(gameId);
        }
        
        // Store the current game ID
        this.currentGameId = gameId;
        
        // Add price to history
        this.priceHistory.push({
            price: parseFloat(price),
            tick: tickCount,
            timestamp: Date.now()
        });
        
        // Keep a reasonable history size (e.g., 100 ticks)
        if (this.priceHistory.length > 100) {
            this.priceHistory.shift();
        }
        
        // Only process once per tick (might receive multiple updates per tick)
        if (tickCount > this.lastProcessedTick) {
            this.lastProcessedTick = tickCount;
            this._detectPatterns();
        }
    }
    
    /**
     * Detect patterns in the price history
     * @private
     */
    _detectPatterns() {
        // Skip if we don't have enough data points
        if (this.priceHistory.length < this.minDataPoints) {
            return;
        }
        
        // Clear expired patterns
        this._clearExpiredPatterns();
        
        // Run each pattern detection algorithm
        this._detectDip();
        this._detectConsecutiveCandles();
        this._detectPriceExhaustion();
        
        // Emit all active patterns
        this._emitPatterns();
    }
    
    /**
     * Clear patterns that are no longer valid
     * @private
     */
    _clearExpiredPatterns() {
        for (const pattern of this.recentPatterns) {
            const metadata = this.patternMetadata.get(pattern);
            
            // If the pattern has an expiration time and it's passed, remove it
            if (metadata && metadata.expiresAt && Date.now() > metadata.expiresAt) {
                this.recentPatterns.delete(pattern);
                this.patternMetadata.delete(pattern);
                
                // Emit pattern expiration event
                this.eventBus.emit('analytics:patternExpired', {
                    pattern,
                    gameId: this.currentGameId,
                    timestamp: Date.now(),
                    category: 'analytics',
                    priority: 'normal'
                });
                
                logger.debug(`Pattern expired: ${pattern}`);
            }
        }
    }
    
    /**
     * Detect significant price dips
     * @private
     */
    _detectDip() {
        // Get recent price data within our window
        const recentPrices = this.priceHistory.slice(-this.dipWindowTicks);
        if (recentPrices.length < 5) return; // Need at least 5 data points
        
        // Find local high in the window
        const localHigh = Math.max(...recentPrices.map(p => p.price));
        
        // Get current price
        const currentPrice = recentPrices[recentPrices.length - 1].price;
        
        // Calculate drop percentage
        const dropPercent = ((localHigh - currentPrice) / localHigh) * 100;
        
        // Check if this is a significant dip
        if (dropPercent >= this.dipThresholdPercent) {
            // If we don't already have this pattern active
            if (!this.recentPatterns.has('MAJOR_DIP')) {
                // Add it to active patterns
                this.recentPatterns.add('MAJOR_DIP');
                
                // Set metadata with confidence level based on drop size
                const confidence = Math.min(100, Math.round(dropPercent / this.dipThresholdPercent * 100));
                this.patternMetadata.set('MAJOR_DIP', {
                    confidence,
                    details: {
                        dropPercent: dropPercent.toFixed(2),
                        fromPrice: localHigh.toFixed(4),
                        toPrice: currentPrice.toFixed(4)
                    },
                    detectedAt: Date.now(),
                    expiresAt: Date.now() + 10000 // Pattern expires after 10 seconds
                });
                
                logger.info(`Major dip detected: ${dropPercent.toFixed(2)}% drop from ${localHigh.toFixed(4)} to ${currentPrice.toFixed(4)}`);
            }
        } else {
            // If the drop is no longer significant, remove the pattern
            if (this.recentPatterns.has('MAJOR_DIP')) {
                this.recentPatterns.delete('MAJOR_DIP');
                this.patternMetadata.delete('MAJOR_DIP');
            }
        }
    }
    
    /**
     * Detect consecutive candle patterns (if candle data is available)
     * @private
     */
    _detectConsecutiveCandles() {
        // This would require candle data, which might come from a different event
        // For now, this is a placeholder for future implementation
    }
    
    /**
     * Detect price exhaustion (when a trend is likely to reverse)
     * @private
     */
    _detectPriceExhaustion() {
        // Placeholder for price exhaustion detection algorithm
        // This would look for slowing momentum, volume changes, etc.
    }
    
    /**
     * Emit events for all active patterns
     * @private
     */
    _emitPatterns() {
        if (this.recentPatterns.size === 0) return;
        
        // Prepare patterns data
        const patternsData = {};
        for (const pattern of this.recentPatterns) {
            patternsData[pattern] = this.patternMetadata.get(pattern) || {};
        }
        
        // Emit event with all active patterns
        this.eventBus.emit('analytics:patterns', {
            patterns: Array.from(this.recentPatterns),
            metadata: patternsData,
            gameId: this.currentGameId,
            tickCount: this.lastProcessedTick,
            timestamp: Date.now(),
            category: 'analytics',
            priority: 'normal'
        });
    }
}

// Export a singleton instance
const instance = new PatternRecognitionService();
module.exports = instance; 