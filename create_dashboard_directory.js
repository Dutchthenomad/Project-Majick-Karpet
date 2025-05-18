const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

/**
 * Create the dashboard directory for the enhanced dashboard
 */
function createDashboardDirectory() {
    const dashboardDir = path.join(__dirname, 'dashboard');
    
    if (!fs.existsSync(dashboardDir)) {
        logger.info(`Creating dashboard directory at ${dashboardDir}`);
        fs.mkdirSync(dashboardDir, { recursive: true });
        logger.info('Dashboard directory created successfully.');
    } else {
        logger.info(`Dashboard directory already exists at ${dashboardDir}`);
    }
}

createDashboardDirectory(); 