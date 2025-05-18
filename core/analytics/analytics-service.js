const ServiceBase = require('../services/service-base');
const eventBus = require('../events/event-bus');
const logger = require('../../utils/logger');

// Import analytics services
const patternRecognitionService = require('./pattern-recognition-service');
const gamePhaseAnalyticsService = require('./game-phase-analytics-service');
const rugProbabilityService = require('./rug-probability-service');

/**
 * @class AnalyticsService
 * @description Main service that orchestrates all analytics services and provides
 * a unified API for accessing analytics data and insights.
 */
class AnalyticsService extends ServiceBase {
    constructor(options = {}) {
        super('AnalyticsService', options);
        
        // Store references to all analytics services
        this.services = {
            patternRecognition: patternRecognitionService,
            gamePhaseAnalytics: gamePhaseAnalyticsService,
            rugProbability: rugProbabilityService
        };
        
        // Current game state
        this.currentGameId = null;
        this.currentTickCount = 0;
        
        // Combined analytics state
        this.analytics = {
            gamePhase: null,
            patterns: [],
            rugProbability: null,
            compositeSignals: {
                entryStrength: 0,
                exitStrength: 0,
                optimalPositionSize: 0
            },
            lastUpdated: null
        };
        
        // Bind methods
        this._handleGameStateUpdate = this._handleGameStateUpdate.bind(this);
        this._handlePatterns = this._handlePatterns.bind(this);
        this._handleGamePhaseStatus = this._handleGamePhaseStatus.bind(this);
        this._handleCurrentRugProbability = this._handleCurrentRugProbability.bind(this);
        this._calculateCompositeSignals = this._calculateCompositeSignals.bind(this);
        
        logger.info('AnalyticsService initialized');
    }
    
    /**
     * @override
     * Start all analytics services
     */
    async start() {
        await super.start();
        
        try {
            // Start all analytics services
            for (const [name, service] of Object.entries(this.services)) {
                logger.info(`Starting ${name} service...`);
                await service.start();
            }
            
            // Subscribe to events
            this.eventBus.on('game:stateUpdate', this._handleGameStateUpdate);
            this.eventBus.on('analytics:patterns', this._handlePatterns);
            this.eventBus.on('analytics:gamePhaseStatus', this._handleGamePhaseStatus);
            this.eventBus.on('analytics:currentRugProbability', this._handleCurrentRugProbability);
            
            logger.info('AnalyticsService started successfully');
        } catch (error) {
            logger.error('Error starting AnalyticsService:', error);
            throw error;
        }
    }
    
    /**
     * @override
     * Stop all analytics services
     */
    async stop() {
        // Unsubscribe from events
        this.eventBus.off('game:stateUpdate', this._handleGameStateUpdate);
        this.eventBus.off('analytics:patterns', this._handlePatterns);
        this.eventBus.off('analytics:gamePhaseStatus', this._handleGamePhaseStatus);
        this.eventBus.off('analytics:currentRugProbability', this._handleCurrentRugProbability);
        
        // Stop all analytics services
        for (const [name, service] of Object.entries(this.services)) {
            logger.info(`Stopping ${name} service...`);
            await service.stop();
        }
        
        await super.stop();
        logger.info('AnalyticsService stopped');
    }
    
    /**
     * Handle game state updates
     * @param {Object} eventData - The game state update data
     * @private
     */
    _handleGameStateUpdate(eventData) {
        if (!eventData || !eventData.data) return;
        
        const data = eventData.data;
        const gameId = data.gameId;
        const tickCount = data.tickCount;
        
        // If no game ID or tick count, ignore
        if (!gameId || tickCount === undefined) return;
        
        // Check if this is a new game
        if (gameId !== this.currentGameId) {
            this.currentGameId = gameId;
            this.currentTickCount = 0;
            
            // Reset analytics state for new game
            this.analytics = {
                gamePhase: null,
                patterns: [],
                rugProbability: null,
                compositeSignals: {
                    entryStrength: 0,
                    exitStrength: 0,
                    optimalPositionSize: 0
                },
                lastUpdated: Date.now()
            };
            
            logger.info(`AnalyticsService: New game detected - ${gameId}`);
        }
        
        // Update current tick count
        this.currentTickCount = tickCount;
        
        // Every 5 ticks, emit current analytics state
        if (this.currentTickCount % 5 === 0) {
            this._emitCurrentAnalytics();
        }
    }
    
    /**
     * Handle pattern detection events
     * @param {Object} eventData - The patterns event data
     * @private
     */
    _handlePatterns(eventData) {
        if (!eventData || !eventData.patterns) return;
        
        this.analytics.patterns = eventData.patterns;
        this.analytics.patternMetadata = eventData.metadata;
        this.analytics.lastUpdated = Date.now();
        
        // Calculate composite signals after pattern update
        this._calculateCompositeSignals();
        
        // Emit current analytics state
        this._emitCurrentAnalytics();
    }
    
    /**
     * Handle game phase status events
     * @param {Object} eventData - The game phase status event data
     * @private
     */
    _handleGamePhaseStatus(eventData) {
        if (!eventData || !eventData.currentPhase) return;
        
        this.analytics.gamePhase = {
            phase: eventData.currentPhase,
            confidence: eventData.confidence,
            tickCount: eventData.tickCount,
            tickPercentile: eventData.tickPercentile,
            avgGameLength: eventData.avgGameLength,
            phaseThresholds: eventData.phaseThresholds
        };
        this.analytics.lastUpdated = Date.now();
        
        // Calculate composite signals after phase update
        this._calculateCompositeSignals();
    }
    
    /**
     * Handle current rug probability events
     * @param {Object} eventData - The rug probability event data
     * @private
     */
    _handleCurrentRugProbability(eventData) {
        if (!eventData) return;
        
        this.analytics.rugProbability = {
            nextTickProbability: eventData.nextTickProbability,
            currentWindowProbability: eventData.currentWindowProbability,
            isHighRiskWindow: eventData.isHighRiskWindow,
            houseProfitablePercent: eventData.houseProfitablePercent
        };
        this.analytics.lastUpdated = Date.now();
        
        // Calculate composite signals after rug probability update
        this._calculateCompositeSignals();
    }
    
    /**
     * Calculate composite trading signals based on all analytics
     * @private
     */
    _calculateCompositeSignals() {
        // Default values
        let entryStrength = 50; // Neutral
        let exitStrength = 50; // Neutral
        let optimalPositionSize = 0.5; // 50% of max
        
        // --- ENTRY STRENGTH CALCULATION ---
        
        // 1. Adjust based on game phase
        if (this.analytics.gamePhase) {
            const phase = this.analytics.gamePhase.phase;
            
            if (phase === 'EARLY_ACCUMULATION') {
                entryStrength += 20; // Higher entry strength in early game
                exitStrength -= 20; // Lower exit strength in early game
            } else if (phase === 'MID_VOLATILITY') {
                entryStrength += 10; // Moderate entry strength in mid game
                exitStrength -= 10; // Moderate exit strength in mid game
            } else if (phase === 'LATE_RISK_ZONE') {
                entryStrength -= 20; // Lower entry strength in late game
                exitStrength += 20; // Higher exit strength in late game
            } else if (phase === 'EXTREME_EXTENSION') {
                entryStrength -= 40; // Very low entry strength in extreme extension
                exitStrength += 40; // Very high exit strength in extreme extension
            }
        }
        
        // 2. Adjust based on patterns
        if (this.analytics.patterns) {
            if (this.analytics.patterns.includes('MAJOR_DIP')) {
                const dipMetadata = this.analytics.patternMetadata?.MAJOR_DIP;
                const confidence = dipMetadata?.confidence || 50;
                
                // Stronger entry signal for bigger dips with higher confidence
                const entryBoost = (confidence / 100) * 30; // Up to +30 points for high confidence dips
                entryStrength += entryBoost;
                
                // Reduce exit strength on dips (don't sell during dips)
                exitStrength -= entryBoost * 0.5;
            }
        }
        
        // 3. Adjust based on rug probability
        if (this.analytics.rugProbability) {
            const { nextTickProbability, isHighRiskWindow } = this.analytics.rugProbability;
            
            // Reduce entry strength based on rug probability
            const rugRiskPenalty = nextTickProbability * 100 * 2; // Scale for more impact
            entryStrength -= rugRiskPenalty;
            
            // Increase exit strength based on rug probability
            exitStrength += rugRiskPenalty;
            
            // High risk window has a strong impact
            if (isHighRiskWindow) {
                entryStrength -= 25;
                exitStrength += 30;
            }
        }
        
        // --- POSITION SIZE CALCULATION ---
        
        // Start with neutral position size
        optimalPositionSize = 0.5;
        
        // Adjust based on game phase
        if (this.analytics.gamePhase) {
            const phase = this.analytics.gamePhase.phase;
            const percentile = this.analytics.gamePhase.tickPercentile / 100;
            
            // Reduce position size as game progresses
            optimalPositionSize *= Math.max(0.1, 1 - percentile);
            
            // Phase-specific adjustments
            if (phase === 'EARLY_ACCUMULATION') {
                optimalPositionSize *= 1.3; // Larger positions in early game
            } else if (phase === 'LATE_RISK_ZONE' || phase === 'EXTREME_EXTENSION') {
                optimalPositionSize *= 0.5; // Smaller positions in late game
            }
        }
        
        // Adjust based on rug probability
        if (this.analytics.rugProbability) {
            const { nextTickProbability } = this.analytics.rugProbability;
            
            // Reduce position size as rug probability increases
            optimalPositionSize *= Math.max(0.1, 1 - (nextTickProbability * 3));
        }
        
        // --- CLAMP VALUES ---
        
        // Ensure values are within reasonable ranges
        entryStrength = Math.max(0, Math.min(100, entryStrength));
        exitStrength = Math.max(0, Math.min(100, exitStrength));
        optimalPositionSize = Math.max(0, Math.min(1, optimalPositionSize));
        
        // Update composite signals
        this.analytics.compositeSignals = {
            entryStrength,
            exitStrength,
            optimalPositionSize
        };
    }
    
    /**
     * Emit current analytics state
     * @private
     */
    _emitCurrentAnalytics() {
        this.eventBus.emit('analytics:currentState', {
            gameId: this.currentGameId,
            tickCount: this.currentTickCount,
            analytics: this.analytics,
            timestamp: Date.now(),
            category: 'analytics',
            priority: 'normal'
        });
    }
    
    /**
     * Get the current analytics state
     * @returns {Object} The current analytics state
     */
    getCurrentAnalytics() {
        return {
            gameId: this.currentGameId,
            tickCount: this.currentTickCount,
            analytics: this.analytics
        };
    }
}

// Export a singleton instance
const instance = new AnalyticsService();
module.exports = instance; 