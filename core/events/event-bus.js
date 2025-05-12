const EventEmitter = require('events');

/**
 * @class EventBus
 * @description A simple event bus extending Node.js EventEmitter for pub/sub.
 *              Provides a central point for decoupled communication between modules.
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    // Optional: Increase listener limit if expecting many subscribers
    // this.setMaxListeners(20);
    console.log('EventBus initialized.');
  }

  /**
   * Emits an event with the given name and arguments.
   * Adds logging for debugging purposes.
   *
   * @param {string} eventName - The name of the event to emit.
   * @param {...*} args - Arguments to pass to the listeners.
   */
  emit(eventName, ...args) {
    // TODO: Integrate with LoggingService later for better logging
    // console.log(`Event emitted: ${eventName}`, args.length > 0 ? args : ''); 
    super.emit(eventName, ...args);
  }

  /**
   * Registers a listener for a specific event.
   *
   * @param {string} eventName - The name of the event to listen for.
   * @param {Function} listener - The callback function to execute.
   */
  on(eventName, listener) {
    // console.log(`Listener registered for: ${eventName}`);
    super.on(eventName, listener);
  }

  /**
   * Registers a one-time listener for a specific event.
   *
   * @param {string} eventName - The name of the event to listen for.
   * @param {Function} listener - The callback function to execute.
   */
  once(eventName, listener) {
    // console.log(`One-time listener registered for: ${eventName}`);
    super.once(eventName, listener);
  }

  /**
   * Removes a specific listener for a specific event.
   *
   * @param {string} eventName - The name of the event.
   * @param {Function} listener - The listener function to remove.
   */
  off(eventName, listener) {
    // console.log(`Listener removed for: ${eventName}`);
    super.off(eventName, listener);
  }

  /**
   * Removes all listeners for a specific event, or all listeners if no event name is provided.
   *
   * @param {string} [eventName] - The name of the event to remove listeners from.
   */
  removeAllListeners(eventName) {
    // console.log(`Removing all listeners ${eventName ? 'for ' + eventName : ''}`);
    super.removeAllListeners(eventName);
  }
}

// Export a single instance (Singleton pattern)
const instance = new EventBus();

module.exports = instance; 