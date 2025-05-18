/**
 * @file index.js
 * @description Exports all analytics services from a single entry point
 */

const analyticsService = require('./analytics-service');
const patternRecognitionService = require('./pattern-recognition-service');
const gamePhaseAnalyticsService = require('./game-phase-analytics-service');
const rugProbabilityService = require('./rug-probability-service');

// Export main analytics service as default
module.exports = analyticsService;

// Export individual services
module.exports.analyticsService = analyticsService;
module.exports.patternRecognitionService = patternRecognitionService;
module.exports.gamePhaseAnalyticsService = gamePhaseAnalyticsService;
module.exports.rugProbabilityService = rugProbabilityService; 