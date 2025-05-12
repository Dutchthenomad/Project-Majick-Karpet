const fs = require('fs');
const path = require('path');

const CONFIG_FILE_PATH = path.join(__dirname, 'default.json');

let config = {};

try {
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    const configFileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
    config = JSON.parse(configFileContent);
    console.log('Configuration loaded successfully from:', CONFIG_FILE_PATH);
  } else {
    console.error('Error: Configuration file not found at:', CONFIG_FILE_PATH);
    // Fallback to empty config or default if necessary, or throw an error
  }
} catch (error) {
  console.error('Error loading configuration:', error);
  // Fallback or error handling
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