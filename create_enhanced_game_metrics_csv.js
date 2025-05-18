const BotEngine = require('./core/engine');
const logger = require('./utils/logger');
const { getAllConfig } = require('./config/config-service');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'data_pipeline_output';
const OUTPUT_FILE = 'enhanced_game_metrics.csv';
const GAMES_TO_FETCH = 1000; // Fetching a slightly larger sample for better category analysis

// Dynamic thresholds will be calculated later
let SHORT_GAME_THRESHOLD;
let LONG_GAME_THRESHOLD;

/**
 * Converts an array of objects to a CSV string.
 * (Identical to the one in create_game_summary_csv.js)
 */
function convertToCSV(data) {
    if (!data || data.length === 0) {
        return '';
    }
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    for (const row of data) {
        const values = headers.map(header => {
            let value = row[header];
            if (value === null || value === undefined) {
                value = '';
            }
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                value = `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
}

/**
 * Adds game length category to each game summary based on dynamic thresholds.
 */
function addGameLengthCategory(gameSummaries) {
    return gameSummaries.map(game => {
        let category = 'Unknown';
        const tickCount = game.tick_count;

        if (tickCount !== null && tickCount !== undefined) {
            if (tickCount <= SHORT_GAME_THRESHOLD) {
                category = 'Short';
            } else if (tickCount <= LONG_GAME_THRESHOLD) {
                category = 'Medium'; // Between Short and Long thresholds
            } else {
                category = 'Long';
            }
        }
        return { ...game, game_length_category: category };
    });
}

async function generateEnhancedGameMetricsCSV() {
    logger.info('===== Starting Enhanced Game Metrics CSV Generation (Dynamic Thresholds) =====');
    const engine = new BotEngine(getAllConfig());
    let dataPersistenceService;

    try {
        logger.info('Initializing BotEngine...');
        await engine.start();
        dataPersistenceService = engine.dataPersistenceService;

        if (!dataPersistenceService || !dataPersistenceService.db) {
            logger.error('DataPersistenceService not available. Cannot generate CSV.');
            if (engine) await engine.stop();
            return;
        }
        logger.info('DataPersistenceService ready.');

        logger.info(`Fetching up to ${GAMES_TO_FETCH} game summaries...`);
        const gamesSummaryRaw = await dataPersistenceService.getAllGamesSummary(GAMES_TO_FETCH, 0);

        if (!gamesSummaryRaw || gamesSummaryRaw.length === 0) {
            logger.warn('No game summaries found.');
            if (engine) await engine.stop();
            return;
        }
        logger.info(`Fetched ${gamesSummaryRaw.length} raw game summaries.`);

        // Calculate average tick_count for games with valid positive tick_count
        const validTickCounts = gamesSummaryRaw
            .map(g => g.tick_count)
            .filter(tc => tc !== null && tc !== undefined && tc > 0);

        if (validTickCounts.length === 0) {
            logger.warn('No games with valid tick_counts found to calculate average. Using default thresholds.');
            // Fallback to arbitrary defaults if no valid ticks are found
            SHORT_GAME_THRESHOLD = 49;
            LONG_GAME_THRESHOLD = 200;
        } else {
            const sumOfTicks = validTickCounts.reduce((sum, tc) => sum + tc, 0);
            const averageTickCount = sumOfTicks / validTickCounts.length;
            logger.info(`Calculated Average Game Length (from ${validTickCounts.length} valid games): ${averageTickCount.toFixed(2)} ticks`);

            SHORT_GAME_THRESHOLD = Math.floor(averageTickCount * 0.5);
            LONG_GAME_THRESHOLD = Math.floor(averageTickCount * 1.5);
            logger.info(`Dynamic Thresholds: SHORT < ${SHORT_GAME_THRESHOLD} ticks, MEDIUM <= ${LONG_GAME_THRESHOLD} ticks, LONG > ${LONG_GAME_THRESHOLD} ticks`);
        }

        const gamesSummaryWithCategory = addGameLengthCategory(gamesSummaryRaw);
        logger.info('Added game length category to summaries using dynamic thresholds.');

        const csvData = convertToCSV(gamesSummaryWithCategory);
        if (!csvData) {
            logger.warn('CSV data is empty after conversion.');
            if (engine) await engine.stop();
            return;
        }

        const outputDirPath = path.join(__dirname, OUTPUT_DIR);
        const outputFilePath = path.join(outputDirPath, OUTPUT_FILE);

        if (!fs.existsSync(outputDirPath)) {
            logger.info(`Creating output directory: ${outputDirPath}`);
            fs.mkdirSync(outputDirPath, { recursive: true });
        }

        logger.info(`Writing CSV data to ${outputFilePath}...`);
        fs.writeFileSync(outputFilePath, csvData);
        logger.info(`Successfully wrote ${gamesSummaryWithCategory.length} enhanced game summaries to ${outputFilePath}`);

    } catch (error) {
        logger.error('Error during Enhanced Game Metrics CSV generation:', error);
    } finally {
        if (engine && engine.state.running) {
            logger.info('Shutting down BotEngine...');
            await engine.stop();
        }
        logger.info('===== Enhanced Game Metrics CSV Generation Finished =====');
    }
}

generateEnhancedGameMetricsCSV().catch(err => {
    logger.error('Unhandled error in generateEnhancedGameMetricsCSV script:', err);
    process.exit(1);
}); 