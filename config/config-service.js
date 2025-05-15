const fs = require('fs');
const path = require('path');
const Joi = require('joi'); // Import Joi

const CONFIG_FILE_PATH = path.join(__dirname, 'default.json');

// --- Joi Schemas Definition ---
const globalRiskLimitsSchema = Joi.object({
    maxTotalExposureSOL: Joi.number().min(0).required(),
    maxConcurrentTradesGlobal: Joi.number().integer().min(0).required(),
    globalMaxBuyAmountSOL: Joi.number().min(0).required()
});

const strategyRiskConfigSchema = Joi.object({
    maxBuyAmountSOL: Joi.number().min(0).default(Infinity),
    maxOpenTradesPerGame: Joi.number().integer().min(0).default(Infinity),
    maxStrategyExposureSOL: Joi.number().min(0).default(Infinity),
    minRequiredSafeTickCount: Joi.number().integer().min(0).default(0)
}).unknown(true); // Allow other strategy-specific risk params

const strategyConfigSchema = Joi.object({
    presaleBuyAmount: Joi.number().min(0),
    tickBuyAmount: Joi.number().min(0),
    buyTickModulus: Joi.number().integer().min(1),
    buyTickOffset: Joi.number().integer().min(0),
    sellTickModulus: Joi.number().integer().min(1),
    sellTickOffset: Joi.number().integer().min(0),
    sellPercentage: Joi.number().min(0).max(100),
    riskConfig: strategyRiskConfigSchema.required() // Risk config is mandatory for each strategy config
}).unknown(true); // Allow other strategy-specific general config params

const strategySchema = Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    modulePath: Joi.string().required(),
    enabled: Joi.boolean().required(),
    config: strategyConfigSchema.required() // General config is mandatory
});

const mainConfigSchema = Joi.object({
    appName: Joi.string().required(),
    version: Joi.string().required(),
    logging: Joi.object({
        level: Joi.string().valid('error', 'warn', 'info', 'verbose', 'debug', 'silly').required(),
        logToFile: Joi.boolean().required(),
        logDirectory: Joi.string().required(),
        logFile: Joi.string().required()
    }).required(),
    eventBus: Joi.object({
        debug: Joi.boolean()
    }),
    browser: Joi.object({
        executablePath: Joi.string(),
        userDataDir: Joi.string(),
        remoteDebuggingUrl: Joi.string().uri().required(),
        headless: Joi.boolean(),
        defaultViewport: Joi.object({
            width: Joi.number().integer().min(1),
            height: Joi.number().integer().min(1)
        }),
        protocolTimeout: Joi.number().integer().min(0),
        launchArgs: Joi.array().items(Joi.string())
    }).required(),
    riskManagement: Joi.object({
        globalLimits: globalRiskLimitsSchema.required()
    }).required(),
    webSocketClient: Joi.object({
        targetUrlPattern: Joi.string().required(),
        retryConnectionDelayMs: Joi.number().integer().min(0).required()
    }).required(),
    strategies: Joi.array().items(strategySchema).required()
});
// --- End Joi Schemas Definition ---

let config = {};

try {
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    const configFileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
    const parsedConfig = JSON.parse(configFileContent);
    
    // Validate the parsed configuration
    const { error, value } = mainConfigSchema.validate(parsedConfig, { abortEarly: false, allowUnknown: true, stripUnknown: false });

    if (error) {
      console.error('Error: Configuration validation failed! Details:');
      error.details.forEach(detail => console.error(`- ${detail.message} (Path: ${detail.path.join('.')})`));
      throw new Error('Configuration validation failed. Halting application.');
    }

    config = value; // Use the validated and potentially defaulted value
    console.log('Configuration loaded and validated successfully from:', CONFIG_FILE_PATH);

  } else {
    console.error('Error: Configuration file not found at:', CONFIG_FILE_PATH);
    throw new Error('Configuration file not found. Halting application.');
  }
} catch (error) {
  // Catch errors from file reading, JSON parsing, or validation
  console.error('Fatal Error loading or validating configuration:', error.message);
  // In a real app, might re-throw or process.exit(1) to ensure halt
  // For this script, if it's a validation error, we've already logged details.
  // If it's file not found or JSON parse error, the message will be from those.
  throw error; // Re-throw to ensure the calling process (like engine startup) knows it failed.
}

/**
 * Retrieves a configuration value by its key.
 * If the key contains dots, it will attempt to retrieve a nested value.
 * e.g., 'logging.level' will retrieve config.logging.level
 *
 * @param {string} key - The configuration key (e.g., 'appName', 'logging.level').
 * @param {*} [defaultValue=undefined] - The value to return if the key is not found.
 * @returns {*} The configuration value or the defaultValue if not found.
 */
function getConfig(key, defaultValue = undefined) {
  if (!key) {
    return defaultValue; // Or return a copy of the whole config if desired
  }

  const keys = key.split('.');
  let current = config;

  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = current[k];
    } else {
      return defaultValue;
    }
  }
  return current;
}

/**
 * Retrieves the entire configuration object.
 * Consider returning a deep copy if you want to prevent modification of the loaded config.
 *
 * @returns {object} The entire configuration object.
 */
function getAllConfig() {
  return { ...config }; // Return a shallow copy
}

module.exports = {
  getConfig,
  getAllConfig,
  // Expose the raw config if direct access is ever needed, though getConfig is preferred
  // rawConfig: config 
};

// Example usage (can be removed or kept for testing during development)
// console.log('App Name:', getConfig('appName'));
// console.log('Logging Level:', getConfig('logging.level'));
// console.log('Non-existent key:', getConfig('database.host', 'localhost'));
// console.log('Full config:', getAllConfig()); 