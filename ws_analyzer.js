/**
 * @file ws_analyzer.js
 * @description Utilities for analyzing and visualizing WebSocket data for reverse engineering.
 * 
 * This module provides tools for analyzing and visualizing the WebSocket data captured
 * by the websocket_handler.js module. It includes functions for generating reports,
 * visualizing data patterns, and helping with reverse engineering the algorithm.
 */

import fs from 'fs';
import path from 'path';
import logger from './logger.js';
import { getWsDataDictionary, forceSaveWsData, getWsDataStatistics } from './websocket_handler.js';

// Directory for storing WebSocket data
const DATA_DIR = './ws_data_capture';
const REPORTS_DIR = path.join(DATA_DIR, 'reports');

/**
 * Ensures the reports directory exists
 */
function ensureReportsDirectory() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (!fs.existsSync(REPORTS_DIR)) {
            fs.mkdirSync(REPORTS_DIR, { recursive: true });
        }
    } catch (error) {
        logger.error(`[WS Analyzer] Error creating reports directory: ${error.message}`);
    }
}

/**
 * Generates a comprehensive report of the WebSocket data captured
 * @returns {string} Path to the generated report file
 */
export function generateWsDataReport() {
    ensureReportsDirectory();
    
    try {
        // Get current data
        const dictionary = getWsDataDictionary();
        const stats = getWsDataStatistics();
        
        // Generate a timestamp for the filename
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const reportFilename = path.join(REPORTS_DIR, `ws_report_${timestamp}.md`);
        
        // Build the report content
        let reportContent = `# WebSocket Data Analysis Report\n\n`;
        reportContent += `**Generated:** ${new Date().toISOString()}\n\n`;
        
        // Add statistics
        reportContent += `## Statistics\n\n`;
        reportContent += `- Total unique message types: ${stats.totalUniqueMessageTypes}\n`;
        reportContent += `- Total messages processed: ${stats.totalMessages}\n`;
        reportContent += `- Currently stored raw messages: ${stats.storedRawMessages}\n`;
        reportContent += `- Event history length: ${stats.eventHistoryLength}\n\n`;
        
        // Add top message types
        reportContent += `## Top Message Types\n\n`;
        reportContent += `| Type | Count |\n|------|-------|\n`;
        stats.topMessageTypes.forEach(({ type, count }) => {
            reportContent += `| ${type} | ${count} |\n`;
        });
        reportContent += `\n`;
        
        // Add event structure details
        reportContent += `## Event Structures\n\n`;
        
        for (const [eventType, details] of Object.entries(dictionary.eventStructure)) {
            reportContent += `### ${eventType}\n\n`;
            reportContent += `- First seen: ${details.firstSeen}\n\n`;
            
            // Structure representation
            reportContent += `#### Structure\n\n`;
            reportContent += '```json\n';
            reportContent += JSON.stringify(details.structure, null, 2);
            reportContent += '\n```\n\n';
            
            // Example
            reportContent += `#### Example\n\n`;
            reportContent += '```json\n';
            reportContent += JSON.stringify(details.example, null, 2);
            reportContent += '\n```\n\n';
        }
        
        // Add some recent raw messages as examples
        reportContent += `## Recent Raw Messages (Sample)\n\n`;
        
        // Take last 10 messages
        const recentMessages = dictionary.rawMessages.slice(-10);
        recentMessages.forEach((message, index) => {
            reportContent += `### Message ${index + 1} (${message.timestamp})\n\n`;
            reportContent += '```\n';
            reportContent += message.payload;
            reportContent += '\n```\n\n';
        });
        
        // Write the report to file
        fs.writeFileSync(reportFilename, reportContent);
        logger.info(`[WS Analyzer] Generated report: ${reportFilename}`);
        
        return reportFilename;
    } catch (error) {
        logger.error(`[WS Analyzer] Error generating report: ${error.message}`);
        return null;
    }
}

/**
 * Analyzes patterns in event sequences to help reverse engineer the algorithm
 * @returns {Object} Analysis results
 */
export function analyzeEventPatterns() {
    try {
        const dictionary = getWsDataDictionary();
        const eventHistory = dictionary.eventHistory;
        
        // Skip if not enough events
        if (eventHistory.length < 10) {
            return { error: 'Not enough events to analyze patterns' };
        }
        
        // Analyze event type sequences
        const eventTypeSequence = eventHistory.map(event => event.type);
        const sequencePatterns = findSequencePatterns(eventTypeSequence);
        
        // Analyze gameStateUpdate events if available
        const gameStateUpdates = eventHistory.filter(event => event.type === 'gameStateUpdate');
        let gameStateAnalysis = null;
        
        if (gameStateUpdates.length > 5) {
            gameStateAnalysis = analyzeGameStateUpdates(gameStateUpdates);
        }
        
        // Compile results
        const results = {
            sequencePatterns,
            gameStateAnalysis,
            eventTypeDistribution: countOccurrences(eventTypeSequence),
            totalEventsAnalyzed: eventHistory.length
        };
        
        // Save analysis to file
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const analysisFilename = path.join(REPORTS_DIR, `pattern_analysis_${timestamp}.json`);
        ensureReportsDirectory();
        fs.writeFileSync(analysisFilename, JSON.stringify(results, null, 2));
        
        logger.info(`[WS Analyzer] Event pattern analysis saved to: ${analysisFilename}`);
        
        return {
            ...results,
            analysisFile: analysisFilename
        };
    } catch (error) {
        logger.error(`[WS Analyzer] Error analyzing event patterns: ${error.message}`);
        return { error: error.message };
    }
}

/**
 * Finds common sequences/patterns in an array of event types
 * @param {Array} sequence Array of event types
 * @returns {Object} Detected patterns
 */
function findSequencePatterns(sequence) {
    const patterns = {};
    
    // Look for sequences of length 2-4
    for (let len = 2; len <= 4; len++) {
        const seqCounts = {};
        
        for (let i = 0; i <= sequence.length - len; i++) {
            const seq = sequence.slice(i, i + len).join('->');
            seqCounts[seq] = (seqCounts[seq] || 0) + 1;
        }
        
        // Filter to frequent patterns (occurred more than once)
        const frequentPatterns = Object.entries(seqCounts)
            .filter(([_, count]) => count > 1)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5); // Top 5 most frequent
        
        patterns[`length_${len}`] = frequentPatterns.map(([pattern, count]) => ({
            pattern,
            count,
            frequency: (count / (sequence.length - len + 1)).toFixed(4)
        }));
    }
    
    return patterns;
}

/**
 * Analyzes gameStateUpdate events to extract patterns
 * @param {Array} updates Array of gameStateUpdate events
 * @returns {Object} Analysis results
 */
function analyzeGameStateUpdates(updates) {
    // This is a placeholder for more detailed analysis
    // Customize this based on what you discover about the data
    
    try {
        // Extract price data if available
        const priceData = updates
            .filter(update => update.data && update.data.price)
            .map(update => ({
                timestamp: update.timestamp,
                price: parseFloat(update.data.price)
            }));
        
        // Extract tick counts if available
        const tickData = updates
            .filter(update => update.data && update.data.tickCount !== undefined)
            .map(update => ({
                timestamp: update.timestamp,
                tick: parseInt(update.data.tickCount, 10)
            }));
        
        // Detect state transitions
        const stateTransitions = [];
        let lastState = null;
        
        for (let i = 0; i < updates.length; i++) {
            const update = updates[i];
            let currentState = 'unknown';
            
            // Determine state based on available fields
            // This is just a guess - you'll need to adapt based on actual data
            if (update.data) {
                if (update.data.rugged === true) {
                    currentState = 'rugged';
                } else if (update.data.active === false) {
                    currentState = 'inactive';
                } else if (update.data.active === true) {
                    currentState = 'active';
                }
            }
            
            if (lastState !== null && lastState !== currentState) {
                stateTransitions.push({
                    from: lastState,
                    to: currentState,
                    timestamp: update.timestamp
                });
            }
            
            lastState = currentState;
        }
        
        return {
            priceDataPoints: priceData.length,
            tickDataPoints: tickData.length,
            stateTransitions,
            // Calculate price changes if we have enough data
            priceChanges: calculatePriceChanges(priceData)
        };
    } catch (error) {
        logger.error(`[WS Analyzer] Error in gameStateUpdate analysis: ${error.message}`);
        return { error: error.message };
    }
}

/**
 * Calculates statistics about price changes
 * @param {Array} priceData Array of price data points
 * @returns {Object} Price change statistics
 */
function calculatePriceChanges(priceData) {
    if (priceData.length < 2) return { insufficientData: true };
    
    const changes = [];
    const percentChanges = [];
    
    for (let i = 1; i < priceData.length; i++) {
        const prev = priceData[i - 1].price;
        const curr = priceData[i].price;
        const change = curr - prev;
        const percentChange = (change / prev) * 100;
        
        changes.push(change);
        percentChanges.push(percentChange);
    }
    
    return {
        changes: {
            min: Math.min(...changes),
            max: Math.max(...changes),
            avg: average(changes),
            median: median(changes),
        },
        percentChanges: {
            min: Math.min(...percentChanges),
            max: Math.max(...percentChanges),
            avg: average(percentChanges),
            median: median(percentChanges),
        }
    };
}

/**
 * Counts occurrences of each unique value in an array
 * @param {Array} arr Array of values
 * @returns {Object} Counts of each value
 */
function countOccurrences(arr) {
    const counts = {};
    
    for (const val of arr) {
        counts[val] = (counts[val] || 0) + 1;
    }
    
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .reduce((obj, [key, value]) => {
            obj[key] = value;
            return obj;
        }, {});
}

/**
 * Calculates the average of an array
 * @param {Array} arr Array of numbers
 * @returns {number} Average value
 */
function average(arr) {
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Calculates the median of an array
 * @param {Array} arr Array of numbers
 * @returns {number} Median value
 */
function median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

/**
 * Exports all collected data for offline analysis
 * @returns {string} Path to the exported data file
 */
export function exportAllData() {
    try {
        // Force save current data
        forceSaveWsData();
        
        // Create a comprehensive export with all available data
        const dictionary = getWsDataDictionary();
        const stats = getWsDataStatistics();
        
        const exportData = {
            statistics: stats,
            messageTypes: dictionary.messageTypes,
            eventStructure: dictionary.eventStructure,
            allRawMessages: dictionary.rawMessages,
            eventHistory: dictionary.eventHistory,
            analysisTimestamp: new Date().toISOString(),
            patternAnalysis: analyzeEventPatterns()
        };
        
        // Create export directory if needed
        ensureReportsDirectory();
        
        // Generate export filename
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const exportFilename = path.join(REPORTS_DIR, `complete_export_${timestamp}.json`);
        
        // Write export file
        fs.writeFileSync(exportFilename, JSON.stringify(exportData, null, 2));
        logger.info(`[WS Analyzer] Exported all data to: ${exportFilename}`);
        
        return exportFilename;
    } catch (error) {
        logger.error(`[WS Analyzer] Error exporting data: ${error.message}`);
        return null;
    }
} 