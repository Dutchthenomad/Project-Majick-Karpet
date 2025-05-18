/**
 * @file analytics_dashboard.js
 * @description Starts the BotEngine, Analytics Services, and Enhanced Dashboard
 */

const BotEngine = require('./core/bot-engine');
const analyticsService = require('./core/analytics');
const EnhancedDashboardService = require('./core/services/enhanced-dashboard-service');
const logger = require('./utils/logger');
const { getAllConfig } = require('./config/config-service');

// Create dashboard directory if it doesn't exist
require('./create_dashboard_directory');

// Create instances of services
const enhancedDashboardService = new EnhancedDashboardService();

/**
 * Start the Analytics Dashboard
 */
async function startAnalyticsDashboard() {
    try {
        logger.info('===== Starting Analytics Dashboard =====');
        
        // Initialize BotEngine
        logger.info('Initializing BotEngine');
        try {
            await BotEngine.init();
        } catch (error) {
            logger.warn('BotEngine initialization error, using minimal setup for testing: ' + error.message);
            // For testing, we may not need the full BotEngine
        }
        
        // Start analytics service
        logger.info('Starting analytics services');
        await analyticsService.start();
        
        // Start dashboard
        logger.info('Starting dashboard service');
        await enhancedDashboardService.start();
        
        logger.info('===== Analytics Dashboard Started Successfully =====');
        logger.info('Dashboard available at http://localhost:' + enhancedDashboardService.port);
        
        // Handle process termination
        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
        
    } catch (error) {
        logger.error('Error starting Analytics Dashboard:', error);
        process.exit(1);
    }
}

async function gracefulShutdown() {
    logger.info('Shutting down services...');
    
    try {
        // Stop services in reverse order
        await enhancedDashboardService.stop();
        await analyticsService.stop();
        await BotEngine.stop();
        
        logger.info('All services stopped gracefully');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
}

// Start the dashboard
startAnalyticsDashboard(); 