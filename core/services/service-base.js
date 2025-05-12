const logger = require('../../utils/logger');
const eventBus = require('../events/event-bus');

/**
 * @class ServiceBase
 * @description Base class for all services in the application.
 *              Provides common functionality like logging and event bus access.
 */
class ServiceBase {
    /**
     * Constructor for ServiceBase.
     * @param {string} serviceName - The name of the service (for logging).
     * @param {object} options - Configuration options for the service.
     * @param {object} [dependencies={}] - Dependencies like logger and eventBus.
     * @param {object} [dependencies.logger=logger] - Logger instance.
     * @param {object} [dependencies.eventBus=eventBus] - EventBus instance.
     */
    constructor(serviceName, options = {}, dependencies = {}) {
        this.serviceName = serviceName || this.constructor.name;
        this.options = options;
        this.logger = dependencies.logger || logger;
        this.eventBus = dependencies.eventBus || eventBus;

        this.logger.info(`Service initializing: ${this.serviceName}`);
    }

    /**
     * Placeholder for service initialization logic.
     * Subclasses should override this method.
     * @returns {Promise<void>}
     */
    async initialize() {
        this.logger.debug(`${this.serviceName}: Base initialize() called.`);
        // Subclasses implement their initialization logic here
    }

    /**
     * Placeholder for service start logic.
     * Subclasses should override this method.
     * @returns {Promise<void>}
     */
    async start() {
        this.logger.info(`${this.serviceName} starting...`);
        // Subclasses implement their start logic here
    }

    /**
     * Placeholder for service stop logic.
     * Subclasses should override this method.
     * @returns {Promise<void>}
     */
    async stop() {
        this.logger.info(`${this.serviceName} stopping...`);
        // Subclasses implement their stop logic here
    }
}

module.exports = ServiceBase; 