const BotEngine = require('./core/engine');
const logger = require('./utils/logger');
const { getAllConfig } = require('./config/config-service');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'data_pipeline_output';
const OUTPUT_FILE = 'game_summaries.csv';
const GAMES_TO_FETCH = 500;

/**
 * Converts an array of objects to a CSV string.
 * @param {Array<object>} data - The array of objects to convert.
 * @returns {string} The CSV string.
 */
function convertToCSV(data) {
    if (!data || data.length === 0) {
        return '';
    }

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')]; // Header row

    for (const row of data) {
        const values = headers.map(header => {
            let value = row[header];
            // Handle null or undefined values as empty strings
            if (value === null || value === undefined) {
                value = '';
            }
            // Escape commas and quotes in values
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                value = `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
}

async function generateGameSummaryCSV() {
    logger.info('===== Starting Game Summary CSV Generation =====');
    const engine = new BotEngine(getAllConfig());
    let dataPersistenceService;

    try {
        logger.info('Initializing BotEngine to access DataPersistenceService...');
        await engine.start();
        dataPersistenceService = engine.dataPersistenceService;

        if (!dataPersistenceService || !dataPersistenceService.db) {
            logger.error('DataPersistenceService not available or DB not initialized. Cannot generate CSV.');
            if (engine) await engine.stop();
            return;
        }
        logger.info('DataPersistenceService ready.');

        logger.info(`Fetching up to ${GAMES_TO_FETCH} game summaries...`);
        // Fetching most recent games typically means ordering by a descending ID or timestamp.
        // Assuming getAllGamesSummary fetches in a way that 'limit' gets the latest if not otherwise specified,
        // or that the default ordering is sufficient for a sample.
        // For a true "latest N", the SQL query in DataPersistenceService would need an ORDER BY and LIMIT.
        const gamesSummary = await dataPersistenceService.getAllGamesSummary(GAMES_TO_FETCH, 0);

        if (!gamesSummary || gamesSummary.length === 0) {
            logger.warn('No game summaries found to generate CSV.');
            if (engine) await engine.stop();
            return;
        }
        logger.info(`Fetched ${gamesSummary.length} game summaries.`);

        const csvData = convertToCSV(gamesSummary);
        if (!csvData) {
            logger.warn('CSV data is empty after conversion.');
            if (engine) await engine.stop();
            return;
        }

        const outputDirPath = path.join(__dirname, OUTPUT_DIR);
        const outputFilePath = path.join(outputDirPath, OUTPUT_FILE);

        // Ensure output directory exists
        if (!fs.existsSync(outputDirPath)) {
            logger.info(`Creating output directory: ${outputDirPath}`);
            fs.mkdirSync(outputDirPath, { recursive: true });
        }

        logger.info(`Writing CSV data to ${outputFilePath}...`);
        fs.writeFileSync(outputFilePath, csvData);
        logger.info(`Successfully wrote ${gamesSummary.length} game summaries to ${outputFilePath}`);

    } catch (error) {
        logger.error('Error during Game Summary CSV generation:', error);
    } finally {
        if (engine && engine.state.running) {
            logger.info('Shutting down BotEngine...');
            await engine.stop();
        }
        logger.info('===== Game Summary CSV Generation Finished =====');
    }
}

generateGameSummaryCSV().catch(err => {
    logger.error('Unhandled error in generateGameSummaryCSV script:', err);
    process.exit(1);
}); 