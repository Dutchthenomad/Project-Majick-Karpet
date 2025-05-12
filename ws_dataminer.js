/**
 * @file ws_dataminer.js
 * @description Command line tool for accessing WebSocket data for reverse engineering.
 * 
 * This module provides a command-line interface to interact with the WebSocket data
 * collected during the bot's operation. It allows generating reports, analyzing patterns,
 * and exporting data for offline analysis.
 * 
 * Usage:
 * Run this file directly using Node.js after you've collected WebSocket data:
 * `node ws_dataminer.js [command]`
 * 
 * Available commands:
 * - stats: Show basic statistics about collected WebSocket data
 * - report: Generate a comprehensive Markdown report
 * - analyze: Analyze patterns in the WebSocket data
 * - export: Export all data for offline analysis
 * - monitor: Start a live monitor for incoming WebSocket messages
 */

import fs from 'fs';
import path from 'path';
import logger from './logger.js';
import { getWsDataStatistics, forceSaveWsData } from './websocket_handler.js';
import { generateWsDataReport, analyzeEventPatterns, exportAllData } from './ws_analyzer.js';
import { createInterface } from 'readline';

// Directory for storing WebSocket data
const DATA_DIR = './ws_data_capture';

/**
 * Displays command usage information
 */
function showUsage() {
    console.log(`
WebSocket Data Miner - Reverse Engineering Tool
===============================================

Usage: node ws_dataminer.js [command]

Available commands:
  stats    - Show statistics about collected WebSocket data
  report   - Generate a comprehensive Markdown report
  analyze  - Analyze patterns in the WebSocket data
  export   - Export all data for offline analysis
  monitor  - Start a live monitor for incoming WebSocket messages
  help     - Show this help message

Examples:
  node ws_dataminer.js stats
  node ws_dataminer.js report
  node ws_dataminer.js export
    `);
}

/**
 * Shows statistics about collected WebSocket data
 */
function showStats() {
    try {
        const stats = getWsDataStatistics();
        
        console.log('\n=== WebSocket Data Statistics ===\n');
        console.log(`Total unique message types: ${stats.totalUniqueMessageTypes}`);
        console.log(`Total messages processed: ${stats.totalMessages}`);
        console.log(`Stored raw messages: ${stats.storedRawMessages}`);
        console.log(`Event history length: ${stats.eventHistoryLength}`);
        
        console.log('\nTop message types:');
        stats.topMessageTypes.forEach(({ type, count }, index) => {
            console.log(`  ${index + 1}. ${type}: ${count} messages`);
        });
        
        console.log('\nLast save time:', stats.lastSaveTime);
        
        // Check if data directory exists and list files
        if (fs.existsSync(DATA_DIR)) {
            const files = fs.readdirSync(DATA_DIR).filter(file => file.endsWith('.json'));
            console.log(`\nData files available (${files.length}):`);
            files.forEach(file => {
                const filePath = path.join(DATA_DIR, file);
                const stats = fs.statSync(filePath);
                console.log(`  - ${file} (${formatFileSize(stats.size)}, ${new Date(stats.mtime).toLocaleString()})`);
            });
        } else {
            console.log('\nNo data directory found. Run the bot to collect WebSocket data.');
        }
    } catch (error) {
        console.error('Error showing statistics:', error.message);
    }
}

/**
 * Formats file size in human-readable format
 * @param {number} bytes File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Generates a report of WebSocket data
 */
function generateReport() {
    console.log('Generating comprehensive WebSocket data report...');
    
    const reportFile = generateWsDataReport();
    
    if (reportFile) {
        console.log(`Report generated successfully: ${reportFile}`);
        console.log('You can open this Markdown file in a text editor or viewer.');
    } else {
        console.error('Failed to generate report.');
    }
}

/**
 * Analyzes patterns in WebSocket data
 */
function analyzePatterns() {
    console.log('Analyzing patterns in WebSocket data...');
    
    const analysis = analyzeEventPatterns();
    
    if (analysis.error) {
        console.error(`Analysis error: ${analysis.error}`);
        return;
    }
    
    console.log(`\nAnalysis complete! Results saved to: ${analysis.analysisFile}`);
    console.log(`\nTotal events analyzed: ${analysis.totalEventsAnalyzed}`);
    
    // Show event type distribution
    console.log('\nEvent type distribution:');
    Object.entries(analysis.eventTypeDistribution)
        .slice(0, 10) // Show top 10
        .forEach(([type, count], index) => {
            console.log(`  ${index + 1}. ${type}: ${count} occurrences`);
        });
    
    // Show top sequence patterns
    if (analysis.sequencePatterns.length_2 && analysis.sequencePatterns.length_2.length > 0) {
        console.log('\nTop sequence patterns (length 2):');
        analysis.sequencePatterns.length_2.forEach(({ pattern, count }, index) => {
            console.log(`  ${index + 1}. ${pattern}: ${count} occurrences`);
        });
    }
}

/**
 * Exports all data for offline analysis
 */
function exportData() {
    console.log('Exporting all WebSocket data for offline analysis...');
    
    const exportFile = exportAllData();
    
    if (exportFile) {
        console.log(`Export completed successfully: ${exportFile}`);
        console.log(`File size: ${formatFileSize(fs.statSync(exportFile).size)}`);
    } else {
        console.error('Failed to export data.');
    }
}

/**
 * Creates a simple interactive monitor (placeholder - would be replaced by an actual bot instance)
 */
function startMonitor() {
    console.log('WebSocket Data Monitor');
    console.log('=====================');
    console.log('This is a placeholder for a live WebSocket monitor.');
    console.log('To see live WebSocket data, run the actual bot and it will collect data automatically.');
    console.log('\nPress Ctrl+C to exit.');
    
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    rl.question('\nDo you want to check the stats of previously collected data? (y/n) ', (answer) => {
        if (answer.toLowerCase() === 'y') {
            showStats();
        }
        
        rl.close();
        console.log('\nExiting monitor. Run the bot to collect real-time WebSocket data.');
    });
}

/**
 * Main function that processes the command line arguments
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    
    switch (command.toLowerCase()) {
        case 'stats':
            showStats();
            break;
        case 'report':
            generateReport();
            break;
        case 'analyze':
            analyzePatterns();
            break;
        case 'export':
            exportData();
            break;
        case 'monitor':
            startMonitor();
            break;
        case 'help':
        default:
            showUsage();
            break;
    }
}

// Execute the main function
main(); 