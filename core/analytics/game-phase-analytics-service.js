const ServiceBase = require('../services/service-base');
const eventBus = require('../events/event-bus');
const logger = require('../../utils/logger');
const dataPersistenceService = require('../services/data-persistence-service');

/**
 * @class GamePhaseAnalyticsService
 * @description Detects algorithmic game phases beyond the basic UI phases.
 * Analyzes historical and current game data to provide deeper insights into
 * the current phase of the game (early accumulation, mid volatility, late risk)
 */
class GamePhaseAnalyticsService extends ServiceBase {
    constructor(options = {}) {
        super('GamePhaseAnalyticsService', options);
        
        // Configuration
        this.gameHistoryLimit = options.gameHistoryLimit || 100; // Number of past games to analyze
        this.updateIntervalMs = options.updateIntervalMs || 5000; // How often to recalculate historical stats
        this.phaseThresholds = {
            // Default phase thresholds as percentages of avg game length
            early: { min: 0, max: 0.33 },  // 0-33% of avg game length
            mid: { min: 0.33, max: 0.75 }, // 33-75% of avg game length
            late: { min: 0.75, max: 1.5 }  // 75-150% of avg game length
        };
        
        // State
        this.currentGameId = null;
        this.currentGamePhase = null;
        this.currentTickCount = 0;
        this.avgGameLength = null;
        this.gameHistoryStats = null;
        this.gameHistoryLoaded = false;
        this.tickPercentile = null;
        this.updateInterval = null;
        
        // Bind methods
        this._handleGameStateUpdate = this._handleGameStateUpdate.bind(this);
        this._handleGameRugged = this._handleGameRugged.bind(this);
        this._updateGameHistoryStats = this._updateGameHistoryStats.bind(this);
        
        logger.info('GamePhaseAnalyticsService initialized');
    }
    
    /**
     * @override
     * Start the service
     */
    async start() {
        await super.start();
        
        try {
            // Load historical game data
            await this._updateGameHistoryStats();
            
            // Subscribe to game events
            this.eventBus.on('game:stateUpdate', this._handleGameStateUpdate);
            this.eventBus.on('game:rugged', this._handleGameRugged);
            
            // Set up interval to periodically update historical stats
            this.updateInterval = setInterval(this._updateGameHistoryStats, this.updateIntervalMs);
            
            logger.info('GamePhaseAnalyticsService started successfully');
        } catch (error) {
            logger.error('Error starting GamePhaseAnalyticsService:', error);
            throw error;
        }
    }
    
    /**
     * @override
     * Stop the service
     */
    async stop() {
        // Unsubscribe from events
        this.eventBus.off('game:stateUpdate', this._handleGameStateUpdate);
        this.eventBus.off('game:rugged', this._handleGameRugged);
        
        // Clear interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        await super.stop();
        logger.info('GamePhaseAnalyticsService stopped');
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
            this.currentGamePhase = null;
            logger.info(`GamePhaseAnalyticsService: New game detected - ${gameId}`);
        }
        
        // Update current tick count
        this.currentTickCount = tickCount;
        
        // Determine current game phase
        this._determineCurrentPhase();
    }
    
    /**
     * Handle rugged game events
     * @param {Object} eventData - The rugged event data
     * @private
     */
    _handleGameRugged(eventData) {
        // When a game rugs, update our historical stats
        this._updateGameHistoryStats();
    }
    
    /**
     * Update historical game stats from the database
     * @private
     */
    async _updateGameHistoryStats() {
        if (!dataPersistenceService || !dataPersistenceService.db) {
            logger.warn('GamePhaseAnalyticsService: DataPersistenceService not available, cannot update game history stats');
            return;
        }
        
        try {
            // Query for completed games, ordered by end time descending, limited to our history limit
            const completedGames = await dataPersistenceService.getAllGamesSummary(this.gameHistoryLimit, 0);
            
            if (!completedGames || completedGames.length === 0) {
                logger.warn('GamePhaseAnalyticsService: No completed games found in database');
                return;
            }
            
            // Calculate average game length
            const validGames = completedGames.filter(game => 
                game.tick_count !== null && 
                game.tick_count !== undefined && 
                game.tick_count > 0
            );
            
            if (validGames.length === 0) {
                logger.warn('GamePhaseAnalyticsService: No valid games with tick count found');
                return;
            }
            
            const totalTicks = validGames.reduce((sum, game) => sum + game.tick_count, 0);
            this.avgGameLength = totalTicks / validGames.length;
            
            // Get tick count distribution
            const tickCounts = validGames.map(game => game.tick_count).sort((a, b) => a - b);
            
            // Calculate percentiles
            const percentiles = {};
            [10, 25, 50, 75, 90].forEach(percentile => {
                const index = Math.floor(tickCounts.length * (percentile / 100));
                percentiles[`p${percentile}`] = tickCounts[index];
            });
            
            // Calculate dynamic phase thresholds based on the percentiles
            this.phaseThresholds = {
                early: { min: 0, max: percentiles.p33 || this.avgGameLength * 0.33 },
                mid: { min: percentiles.p33 || this.avgGameLength * 0.33, 
                       max: percentiles.p75 || this.avgGameLength * 0.75 },
                late: { min: percentiles.p75 || this.avgGameLength * 0.75, 
                        max: percentiles.p90 * 1.5 || this.avgGameLength * 1.5 }
            };
            
            // Save results
            this.gameHistoryStats = {
                avgGameLength: this.avgGameLength,
                percentiles,
                totalGamesAnalyzed: validGames.length,
                timestamp: Date.now()
            };
            
            this.gameHistoryLoaded = true;
            
            logger.info(`GamePhaseAnalyticsService: Updated game history stats. Avg length: ${this.avgGameLength.toFixed(2)} ticks from ${validGames.length} games.`);
            
            // After updating stats, redetermine current phase
            this._determineCurrentPhase();
            
            // Emit updated game history stats event
            this.eventBus.emit('analytics:gameHistoryStats', {
                stats: this.gameHistoryStats,
                phaseThresholds: this.phaseThresholds,
                category: 'analytics',
                priority: 'normal'
            });
            
        } catch (error) {
            logger.error('Error updating game history stats:', error);
        }
    }
    
    /**
     * Determine the current game phase based on tick count and historical data
     * @private
     */
    _determineCurrentPhase() {
        // If we haven't loaded history or don't have a current game, we can't determine phase
        if (!this.gameHistoryLoaded || !this.currentGameId || this.currentTickCount === undefined) {
            return;
        }
        
        let newPhase = null;
        let confidence = 0;
        
        // Determine phase based on tick count relative to historical averages
        if (this.currentTickCount <= this.phaseThresholds.early.max) {
            newPhase = 'EARLY_ACCUMULATION';
            confidence = 100 - ((this.currentTickCount / this.phaseThresholds.early.max) * 100);
        } else if (this.currentTickCount <= this.phaseThresholds.mid.max) {
            newPhase = 'MID_VOLATILITY';
            const phaseProgress = (this.currentTickCount - this.phaseThresholds.mid.min) / 
                                 (this.phaseThresholds.mid.max - this.phaseThresholds.mid.min);
            confidence = 100 - (Math.abs(0.5 - phaseProgress) * 200); // Highest confidence in middle of the phase
        } else if (this.currentTickCount <= this.phaseThresholds.late.max) {
            newPhase = 'LATE_RISK_ZONE';
            const phaseProgress = (this.currentTickCount - this.phaseThresholds.late.min) / 
                                 (this.phaseThresholds.late.max - this.phaseThresholds.late.min);
            confidence = 100 - (phaseProgress * 100); // Higher confidence at beginning of late phase
        } else {
            newPhase = 'EXTREME_EXTENSION';
            confidence = 95; // High confidence we're beyond normal game length
        }
        
        // Calculate tick percentile (what percentage of historical games have ended by this tick)
        let tickPercentile = 0;
        if (this.gameHistoryStats && this.gameHistoryStats.totalGamesAnalyzed > 0) {
            const percentiles = this.gameHistoryStats.percentiles;
            if (this.currentTickCount <= percentiles.p10) {
                tickPercentile = (this.currentTickCount / percentiles.p10) * 10;
            } else if (this.currentTickCount <= percentiles.p25) {
                tickPercentile = 10 + ((this.currentTickCount - percentiles.p10) / (percentiles.p25 - percentiles.p10)) * 15;
            } else if (this.currentTickCount <= percentiles.p50) {
                tickPercentile = 25 + ((this.currentTickCount - percentiles.p25) / (percentiles.p50 - percentiles.p25)) * 25;
            } else if (this.currentTickCount <= percentiles.p75) {
                tickPercentile = 50 + ((this.currentTickCount - percentiles.p50) / (percentiles.p75 - percentiles.p50)) * 25;
            } else if (this.currentTickCount <= percentiles.p90) {
                tickPercentile = 75 + ((this.currentTickCount - percentiles.p75) / (percentiles.p90 - percentiles.p75)) * 15;
            } else {
                tickPercentile = 90 + ((this.currentTickCount - percentiles.p90) / (percentiles.p90 * 0.5)) * 10;
                tickPercentile = Math.min(tickPercentile, 100);
            }
        }
        
        this.tickPercentile = tickPercentile;
        
        // If phase has changed, emit an event
        if (newPhase !== this.currentGamePhase) {
            const oldPhase = this.currentGamePhase;
            this.currentGamePhase = newPhase;
            
            logger.info(`GamePhaseAnalyticsService: Phase change detected - from ${oldPhase || 'UNKNOWN'} to ${newPhase} (confidence: ${confidence.toFixed(2)}%, percentile: ${this.tickPercentile.toFixed(2)}%)`);
            
            // Emit phase change event
            this.eventBus.emit('analytics:gamePhaseChange', {
                previousPhase: oldPhase,
                currentPhase: newPhase,
                confidence: confidence,
                tickCount: this.currentTickCount,
                tickPercentile: this.tickPercentile,
                gameId: this.currentGameId,
                avgGameLength: this.avgGameLength,
                timestamp: Date.now(),
                category: 'analytics',
                priority: 'normal'
            });
        }
        
        // Regularly emit current phase status
        if (this.currentTickCount % 5 === 0) { // Every 5 ticks
            this.eventBus.emit('analytics:gamePhaseStatus', {
                currentPhase: this.currentGamePhase,
                confidence: confidence,
                tickCount: this.currentTickCount,
                tickPercentile: this.tickPercentile,
                gameId: this.currentGameId,
                avgGameLength: this.avgGameLength,
                phaseThresholds: this.phaseThresholds,
                timestamp: Date.now(),
                category: 'analytics',
                priority: 'normal'
            });
        }
    }
    
    /**
     * Get the current phase information
     * @returns {Object} The current phase information
     */
    getCurrentPhaseInfo() {
        return {
            gameId: this.currentGameId,
            tickCount: this.currentTickCount,
            phase: this.currentGamePhase,
            tickPercentile: this.tickPercentile,
            avgGameLength: this.avgGameLength,
            phaseThresholds: this.phaseThresholds
        };
    }
}

// Export a singleton instance
const instance = new GamePhaseAnalyticsService();
module.exports = instance; 