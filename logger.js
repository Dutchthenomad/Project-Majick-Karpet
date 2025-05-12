/**
 * @file logger.js
 * @description Configures the Winston logger for the application.
 */

import winston from 'winston';
import path from 'path';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }), // Log stack traces for errors
  winston.format.splat(), // Interpolate splat values (e.g., %s, %d)
  winston.format.json() // Log in JSON format to files
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      // Print stack trace for errors
      return `[${timestamp}] ${level}: ${message}\n${stack}`;
    }
    // Handle potential objects passed as message
    if (typeof message === 'object') {
        message = JSON.stringify(message, null, 2);
    }
    return `[${timestamp}] ${level}: ${message}`;
  })
);

// Ensure logs directory exists (optional, good practice)
// Note: If running in an environment where fs/promises isn't standard, 
// you might need a sync check or ensure the dir exists manually.
// import fs from 'fs/promises';
// const logsDir = path.resolve('logs');
// fs.mkdir(logsDir, { recursive: true }).catch(console.error);

// Create the logger instance
const logger = winston.createLogger({
  level: 'debug', // Log everything from debug level upwards
  format: logFormat,
  transports: [
    // Console transport - conditionally added
    // File transport for all logs
    new winston.transports.File({
      filename: path.join('logs', 'app.log'),
      level: 'debug', // Log debug and above to app.log
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true,
    }),
    // File transport for error logs only
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error', // Only log errors to error.log
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
  exitOnError: false, // Do not exit on handled exceptions
});

// Conditionally add Console transport
// If TUI_ACTIVE is set globally, we assume the TUI will handle necessary console feedback,
// and we don't want standard console logs interfering with the TUI rendering.
if (!global.TUI_ACTIVE) {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'info', // Show info, warn, error on console by default
  }));
} else {
  // Optionally, log a message to the file log indicating console is suppressed for TUI
  logger.info('[Logger] Console transport suppressed due to TUI mode.');
}

// If we're not in production AND TUI is not active, log to the console more verbosely
// if (process.env.NODE_ENV !== 'production' && !global.TUI_ACTIVE) {
// logger.add(new winston.transports.Console({
// format: consoleFormat, // Use readable format for console
// level: 'debug' // Show debug on console during development
// }));
// }

// --- Game Event Logger ---
// This logger is specifically for game events, outputting raw JSON lines.
export const gameEventsLogger = winston.createLogger({
    level: 'info', // We'll only call .info() on this logger
    format: winston.format.printf(info => JSON.stringify(info.message)), // Output only the message object as JSON
    transports: [
        new winston.transports.File({
            filename: path.join('logs', 'game_events.jsonl'),
            maxsize: 10485760, // 10MB, adjust as needed
            maxFiles: 10,       // Keep more files for game events if desired
            tailable: true,
        }),
    ],
});

// --- Puppeteer Actions Logger ---
// This logger is specifically for puppeteer_utils.js, outputting to its own file.
export const puppeteerLogger = winston.createLogger({
    level: 'debug', // Capture debug and above for this logger
    format: logFormat, // Use the same primary logFormat (includes timestamp, json)
    transports: [
        new winston.transports.File({
            filename: path.join('logs', 'puppeteer_actions.log'),
            level: 'debug', // Log debug and above to this specific file
            maxsize: 5242880, // 5MB
            maxFiles: 3,
            tailable: true,
        }),
    ],
    exitOnError: false,
});

// If TUI is not active, also add console output for puppeteerLogger for immediate visibility
if (!global.TUI_ACTIVE) {
    puppeteerLogger.add(new winston.transports.Console({
        format: consoleFormat, // Use the same readable console format
        level: 'debug', // Show debug from puppeteer utils on console when not in TUI
    }));
} else {
    // Log to the main logger that puppeteerLogger console is suppressed for TUI
    logger.info('[Logger] PuppeteerLogger console transport suppressed due to TUI mode. Check logs/puppeteer_actions.log.');
}

export default logger;