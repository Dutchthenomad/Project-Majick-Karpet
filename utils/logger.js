const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { getConfig } = require('../config/config-service');

// --- Configuration Retrieval ---
const logLevel = getConfig('logging.level', 'info');
const logToFile = getConfig('logging.logToFile', false);
const logDirectory = getConfig('logging.logDirectory', 'logs');
const logFilename = getConfig('logging.logFile', 'app.log');
const logFilePath = path.join(__dirname, '..', logDirectory, logFilename);

// --- Ensure Log Directory Exists ---
try {
    const absoluteLogDir = path.join(__dirname, '..', logDirectory);
    if (logToFile && !fs.existsSync(absoluteLogDir)) {
        fs.mkdirSync(absoluteLogDir, { recursive: true });
        console.log(`Log directory created: ${absoluteLogDir}`); 
    }
} catch (error) {
    console.error('Error creating log directory:', error);
    // Potentially disable file logging if directory creation fails
}

// --- Constants for simBotUser1 highlighting ---
const SIM_BOT_USER_ID = "simBotUser1";
const BRIGHT_MAGENTA = '\x1b[95m';
const RESET_COLOR = '\x1b[0m';

// --- Custom Winston format to colorize simBotUser1 mentions in messages ---
const colorizeSimBotFormat = winston.format(info => {
  if (typeof info.message === 'string' && info.message.includes(SIM_BOT_USER_ID)) {
    const coloredSimBot = `${BRIGHT_MAGENTA}${SIM_BOT_USER_ID}${RESET_COLOR}`;
    // Replace all occurrences of SIM_BOT_USER_ID with its colored version
    // Using split/join to handle multiple occurrences safely
    info.message = info.message.split(SIM_BOT_USER_ID).join(coloredSimBot);
  }
  return info;
});

// --- Winston Transports Configuration ---
const transports = [
    // Console Transport
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Timestamp first
            winston.format.colorize(), // Standard level colorization (e.g., info, warn, error)
            colorizeSimBotFormat(),    // Custom format to colorize "simBotUser1" in the message
            winston.format.printf(info => `${info.timestamp} [${info.level}]: ${info.message}`)
        ),
    }),
];

if (logToFile) {
    transports.push(
        // File Transport
        new winston.transports.File({
            filename: logFilePath,
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.printf(info => `${info.timestamp} [${info.level}]: ${info.message}`)
                // winston.format.json() // Alternative: log as JSON
            ),
        })
    );
    console.log(`Logging to file enabled: ${logFilePath}`);
} else {
    console.log('Logging to file is disabled via config.');
}

// --- Create Logger Instance ---
const logger = winston.createLogger({
    level: logLevel, // Minimum log level to display
    levels: winston.config.npm.levels, // Standard npm levels (error, warn, info, etc.)
    format: winston.format.combine( // Default format applied if transport doesn't override
        winston.format.errors({ stack: true }), // Log stack traces for errors
        winston.format.splat(), // Interpolate splat (%s, %d) params
        winston.format.simple() // Basic formatting
    ),
    transports: transports,
    exitOnError: false, // Don't exit on handled exceptions
});

// --- Initial Log Message ---
logger.info(`Logger initialized. Level: ${logLevel}. File logging: ${logToFile ? 'Enabled' : 'Disabled'}.`);

// --- Export Logger ---
module.exports = logger;

// --- Example Usage (can be removed) ---
// logger.error('This is an error message');
// logger.warn('This is a warning');
// logger.info('This is an info message');
// logger.verbose('This is verbose');
// logger.debug('This is a debug message');
// logger.silly('This is silly'); 