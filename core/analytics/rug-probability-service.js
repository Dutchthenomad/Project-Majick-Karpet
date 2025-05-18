const ServiceBase = require('../services/service-base');
const eventBus = require('../events/event-bus');
const logger = require('../../utils/logger');
const dataPersistenceService = require('../services/data-persistence-service');
const gamePhaseAnalyticsService = require('./game-phase-analytics-service');

/**
 * @class RugProbabilityService
 * @description Analyzes historical rug patterns and calculates real-time rug probability
 * at different tick ranges based on statistical analysis of past games.
 */
class RugProbabilityService extends ServiceBase {
    constructor(options = {}) {
        super('RugProbabilityService', options);
        
        // Configuration
        this.historyLimit = options.historyLimit || 200; // Number of games to use for analysis
        this.updateIntervalMs = options.updateIntervalMs || 10000; // How often to recalculate historical stats
        this.tickWindowSize = options.tickWindowSize || 10; // Size of tick windows for probability calculation
        this.confidenceThreshold = options.confidenceThreshold || 0.1; // Minimum sample size for confident predictions
        
        // State
        this.currentGameId = null;
        this.currentTickCount = 0;
        this.rugDistribution = null; // Histogram of rug counts by tick window
        this.rugProbability = null; // Calculated probabilities by tick window
        this.rugCumulativeProbability = null; // Cumulative probabilities
        this.updateInterval = null;
        this.highRiskWindows = []; // Windows with significantly higher rug probability
        this.nextTickProbability = 0; // Probability of rug in the next tick
        this.currentWindowProbability = 0; // Probability of rug in the current window
        this.houseProfitableLastNGames = 0; // Whether the house was profitable in last N games
        
        // Bind methods
        this._handleGameStateUpdate = this._handleGameStateUpdate.bind(this);
        this._handleGameRugged = this._handleGameRugged.bind(this);
        this._updateRugDistribution = this._updateRugDistribution.bind(this);
        
        logger.info('RugProbabilityService initialized');
    }
    
    /**
     * @override
     * Start the service
     */
    async start() {
        await super.start();
        
        try {
            // Load historical game data
            await this._updateRugDistribution();
            
            // Subscribe to game events
            this.eventBus.on('game:stateUpdate', this._handleGameStateUpdate);
            this.eventBus.on('game:rugged', this._handleGameRugged);
            
            // Set up interval to periodically update historical stats
            this.updateInterval = setInterval(this._updateRugDistribution, this.updateIntervalMs);
            
            logger.info('RugProbabilityService started successfully');
        } catch (error) {
            logger.error('Error starting RugProbabilityService:', error);
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
        logger.info('RugProbabilityService stopped');
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
            logger.info(`RugProbabilityService: New game detected - ${gameId}`);
        }
        
        // Update current tick count
        this.currentTickCount = tickCount;
        
        // Calculate current rug probability
        this._calculateCurrentRugProbability();
    }
    
    /**
     * Handle rugged game events
     * @param {Object} eventData - The rugged event data
     * @private
     */
    _handleGameRugged(eventData) {
        // Update rug distribution when a new game is rugged
        this._updateRugDistribution();
    }
    
    /**
     * Update the rug distribution based on historical data
     * @private
     */
    async _updateRugDistribution() {
        if (!dataPersistenceService || !dataPersistenceService.db) {
            logger.warn('RugProbabilityService: DataPersistenceService not available, cannot update rug distribution');
            return;
        }
        
        try {
            // Query for all rugged games, limited to our history limit
            const completedGames = await dataPersistenceService.getAllGamesSummary(this.historyLimit, 0);
            
            if (!completedGames || completedGames.length === 0) {
                logger.warn('RugProbabilityService: No completed games found in database');
                return;
            }
            
            // Filter for games with valid tick counts
            const validGames = completedGames.filter(game => 
                game.tick_count !== null && 
                game.tick_count !== undefined && 
                game.tick_count > 0
            );
            
            if (validGames.length === 0) {
                logger.warn('RugProbabilityService: No valid games with tick count found');
                return;
            }
            
            // Count house profitable games
            const recentGames = validGames.slice(0, 20); // Last 20 games
            this.houseProfitableLastNGames = recentGames.filter(game => 
                game.house_profit_sol !== null && 
                game.house_profit_sol !== undefined && 
                game.house_profit_sol > 0
            ).length / recentGames.length; // Percentage of profitable games
            
            // Calculate the max tick count to determine our histogram size
            const maxTickCount = Math.max(...validGames.map(game => game.tick_count));
            const numWindows = Math.ceil(maxTickCount / this.tickWindowSize) + 1;
            
            // Initialize rug distribution histogram
            const rugDistribution = Array(numWindows).fill(0);
            const totalGamesByWindow = Array(numWindows).fill(0);
            
            // Fill the histogram
            for (const game of validGames) {
                const tickCount = game.tick_count;
                const windowIndex = Math.floor(tickCount / this.tickWindowSize);
                
                // Increment the count for this window
                rugDistribution[windowIndex]++;
                
                // For each window up to this game's end, increment the total games counter
                for (let i = 0; i <= windowIndex; i++) {
                    totalGamesByWindow[i]++;
                }
            }
            
            // Calculate probabilities for each window
            const rugProbability = rugDistribution.map((count, index) => {
                const total = totalGamesByWindow[index];
                return total > 0 ? count / total : 0;
            });
            
            // Calculate cumulative probability
            const rugCumulativeProbability = Array(numWindows).fill(0);
            let cumulativeRugged = 0;
            let cumulativeTotal = 0;
            
            for (let i = 0; i < numWindows; i++) {
                cumulativeRugged += rugDistribution[i];
                cumulativeTotal = totalGamesByWindow[i];
                rugCumulativeProbability[i] = cumulativeTotal > 0 ? cumulativeRugged / cumulativeTotal : 0;
            }
            
            // Find windows with significantly higher rug probability
            const meanProbability = rugProbability.reduce((sum, p) => sum + p, 0) / rugProbability.filter(p => p > 0).length;
            const highRiskWindows = rugProbability
                .map((prob, index) => ({ window: index, probability: prob }))
                .filter(item => 
                    item.probability > meanProbability * 1.5 && // 50% higher than mean
                    totalGamesByWindow[item.window] >= validGames.length * this.confidenceThreshold // Enough samples
                )
                .sort((a, b) => b.probability - a.probability);
            
            // Store the results
            this.rugDistribution = rugDistribution;
            this.rugProbability = rugProbability;
            this.rugCumulativeProbability = rugCumulativeProbability;
            this.highRiskWindows = highRiskWindows;
            
            logger.info(`RugProbabilityService: Updated rug distribution from ${validGames.length} games. Identified ${highRiskWindows.length} high-risk windows.`);
            
            // After updating distribution, recalculate current probability
            this._calculateCurrentRugProbability();
            
            // Emit updated rug distribution event
            this.eventBus.emit('analytics:rugDistributionUpdated', {
                rugDistribution: this.rugDistribution,
                rugProbability: this.rugProbability,
                rugCumulativeProbability: this.rugCumulativeProbability,
                highRiskWindows: this.highRiskWindows,
                totalGamesAnalyzed: validGames.length,
                houseProfitablePercent: this.houseProfitableLastNGames,
                timestamp: Date.now(),
                category: 'analytics',
                priority: 'normal'
            });
            
        } catch (error) {
            logger.error('Error updating rug distribution:', error);
        }
    }
    
    /**
     * Calculate the current rug probability based on the current tick count
     * @private
     */
    _calculateCurrentRugProbability() {
        if (!this.rugProbability || !this.currentTickCount) return;
        
        // Get the current window index
        const currentWindowIndex = Math.floor(this.currentTickCount / this.tickWindowSize);
        
        // Check if we're in a valid range
        if (currentWindowIndex >= this.rugProbability.length) {
            // We're beyond our historical data range
            this.currentWindowProbability = 0.99; // Very high probability when beyond historical data
            this.nextTickProbability = 0.3; // High probability for next tick
        } else {
            // Get the probability for the current window
            this.currentWindowProbability = this.rugProbability[currentWindowIndex];
            
            // Calculate probability for the next tick
            // This is a simple approximation: window probability / ticks in window
            this.nextTickProbability = this.currentWindowProbability / this.tickWindowSize;
            
            // Adjust based on game phase
            const phaseInfo = gamePhaseAnalyticsService.getCurrentPhaseInfo();
            if (phaseInfo && phaseInfo.phase) {
                // Increase probability in late game phases
                if (phaseInfo.phase === 'LATE_RISK_ZONE') {
                    this.nextTickProbability *= 1.5;
                } else if (phaseInfo.phase === 'EXTREME_EXTENSION') {
                    this.nextTickProbability *= 2.5;
                }
            }
            
            // Adjust based on house profitability
            if (this.houseProfitableLastNGames < 0.4) { // House is losing money in most recent games
                this.nextTickProbability *= 1.75; // Much higher rug probability when house is losing
            }
            
            // Cap the probability at 1.0
            this.nextTickProbability = Math.min(this.nextTickProbability, 1.0);
        }
        
        // Check if we're in a high-risk window
        const inHighRiskWindow = this.highRiskWindows.some(w => w.window === currentWindowIndex);
        
        // Emit the current probability
        this.eventBus.emit('analytics:currentRugProbability', {
            gameId: this.currentGameId,
            tickCount: this.currentTickCount,
            currentWindow: currentWindowIndex,
            currentWindowProbability: this.currentWindowProbability,
            nextTickProbability: this.nextTickProbability,
            isHighRiskWindow: inHighRiskWindow,
            houseProfitablePercent: this.houseProfitableLastNGames,
            timestamp: Date.now(),
            category: 'analytics',
            priority: 'normal'
        });
        
        // Log high-risk situations
        if (inHighRiskWindow && this.nextTickProbability > 0.05) {
            logger.warn(`RugProbabilityService: HIGH RISK WINDOW DETECTED at tick ${this.currentTickCount}. Rug probability: ${(this.nextTickProbability * 100).toFixed(2)}% per tick`);
        }
    }
    
    /**
     * Get the current rug probability information
     * @returns {Object} The current rug probability information
     */
    getCurrentRugProbability() {
        return {
            gameId: this.currentGameId,
            tickCount: this.currentTickCount,
            currentWindowProbability: this.currentWindowProbability,
            nextTickProbability: this.nextTickProbability,
            highRiskWindows: this.highRiskWindows
        };
    }
    
    /**
     * Get the heat map data for visualization
     * @returns {Object} Heat map data for tick-by-tick rug probability
     */
    getRugHeatMapData() {
        if (!this.rugProbability) return null;
        
        return {
            tickWindows: Array.from({ length: this.rugProbability.length }, (_, i) => i * this.tickWindowSize),
            probabilities: this.rugProbability,
            highRiskWindows: this.highRiskWindows
        };
    }
}

// Export a singleton instance
const instance = new RugProbabilityService();
module.exports = instance; 