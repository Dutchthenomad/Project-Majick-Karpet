const EventEmitter = require('events');
const logger = require('../../utils/logger'); // Assuming logger is available

/**
 * @class EventBus
 * @description An enhanced event bus extending Node.js EventEmitter for pub/sub.
 *              Provides a central point for decoupled communication between modules,
 *              with support for structured event payloads, filtering, and metrics.
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    // Optional: Increase listener limit if expecting many subscribers
    // this.setMaxListeners(50); 

    this.metrics = {
      emittedEvents: {},
      activeListeners: {},
      totalEventsEmitted: 0,
      totalListenersRegistered: 0,
      totalListenersRemoved: 0,
    };

    logger.info('Enhanced EventBus initialized with metrics tracking.');
  }

  /**
   * Emits an event with the given name and a structured payload.
   * The payload can be enriched with category and priority.
   *
   * @param {string} eventName - The name of the event to emit.
   * @param {object} payload - The event data. Must be an object.
   * @param {string} [payload.category='default'] - Category of the event.
   * @param {string} [payload.priority='normal'] - Priority of the event.
   */
  emit(eventName, payload = {}) {
    if (typeof payload !== 'object' || payload === null) {
      logger.error(`EventBus: Payload for event '${eventName}' must be an object. Received: ${typeof payload}`);
      // Optionally, could throw an error or attempt to wrap non-object payloads
      return false; // Indicate failure
    }

    // Enrich payload with default category/priority if not present
    const finalPayload = {
      category: 'default',
      priority: 'normal',
      timestamp: Date.now(), // Automatically add a timestamp
      ...payload, // User-provided payload overrides defaults
    };

    // Update metrics
    this.metrics.totalEventsEmitted++;
    this.metrics.emittedEvents[eventName] = (this.metrics.emittedEvents[eventName] || 0) + 1;
    if (finalPayload.category) {
        const catKey = `category:${finalPayload.category}`;
        this.metrics.emittedEvents[catKey] = (this.metrics.emittedEvents[catKey] || 0) + 1;
    }

    logger.debug(`EventBus: Emitting event '${eventName}'. Listener count: ${this.listenerCount(eventName)}. Payload category: ${finalPayload.category}, priority: ${finalPayload.priority}`, finalPayload);
    
    const result = super.emit(eventName, finalPayload);
    if (!result) {
        logger.debug(`EventBus: No listeners for event '${eventName}' (Category: ${finalPayload.category}).`);
    }
    return result;
  }

  /**
   * Registers a listener for a specific event, with optional filtering.
   *
   * @param {string} eventName - The name of the event to listen for.
   * @param {Function} listener - The callback function to execute. Expects a single payload object.
   * @param {object} [filterOptions] - Optional filters to apply before invoking the listener.
   * @param {string} [filterOptions.category] - Only call listener if event payload.category matches.
   * @param {string} [filterOptions.priority] - Only call listener if event payload.priority matches.
   * @param {Function} [filterOptions.customFilter] - A custom function (payload) => boolean for advanced filtering.
   */
  on(eventName, listener, filterOptions = null) {
    let listenerToRegister = listener;
    let originalListener = listener; // Keep a reference to the original for 'off'

    if (filterOptions && Object.keys(filterOptions).length > 0) {
      listenerToRegister = (payload) => {
        // 1. Category filter
        if (filterOptions.category && payload.category !== filterOptions.category) {
          return; // Filtered out
        }
        // 2. Priority filter
        if (filterOptions.priority && payload.priority !== filterOptions.priority) {
          return; // Filtered out
        }
        // 3. Custom filter function
        if (filterOptions.customFilter && typeof filterOptions.customFilter === 'function') {
          if (!filterOptions.customFilter(payload)) {
            return; // Filtered out by custom logic
          }
        }
        // If all filters pass (or no relevant filters are set), call the original listener
        listener(payload);
      };
      // Store mapping for 'off' method to find the wrapper by the original listener
      if (!this._listenerWrappers) this._listenerWrappers = new Map();
      if (!this._listenerWrappers.has(originalListener)) this._listenerWrappers.set(originalListener, []);
      this._listenerWrappers.get(originalListener).push({eventName, wrapper: listenerToRegister});
    }

    super.on(eventName, listenerToRegister);

    // Update metrics
    this.metrics.totalListenersRegistered++;
    this.metrics.activeListeners[eventName] = (this.metrics.activeListeners[eventName] || 0) + 1;
    logger.debug(`EventBus: Listener registered for '${eventName}'. New count: ${this.listenerCount(eventName)}. ${filterOptions ? 'With filters: ' + JSON.stringify(filterOptions) : 'No filters.'}`);
  }

  /**
   * Registers a one-time listener for a specific event, with optional filtering.
   *
   * @param {string} eventName - The name of the event to listen for.
   * @param {Function} listener - The callback function to execute. Expects a single payload object.
   * @param {object} [filterOptions] - Optional filters to apply before invoking the listener.
   */
  once(eventName, listener, filterOptions = null) {
    // For 'once', the wrapping logic is similar, but super.once handles the one-time nature.
    // The wrapper itself will only execute once. If 'off' is called before it executes,
    // we still need to handle the _listenerWrappers map correctly.
    let listenerToRegister = listener;
    let originalListener = listener;

    if (filterOptions && Object.keys(filterOptions).length > 0) {
      listenerToRegister = (payload) => {
        if (filterOptions.category && payload.category !== filterOptions.category) return;
        if (filterOptions.priority && payload.priority !== filterOptions.priority) return;
        if (filterOptions.customFilter && typeof filterOptions.customFilter === 'function' && !filterOptions.customFilter(payload)) return;
        
        // Since it's a 'once' listener, we should clean up its specific wrapper from our map after execution or removal.
        // However, direct cleanup here is tricky if 'off' is called before execution.
        // 'off' will need to handle wrappers for 'once' listeners too.
        listener(payload);
      };
      if (!this._listenerWrappers) this._listenerWrappers = new Map();
      if (!this._listenerWrappers.has(originalListener)) this._listenerWrappers.set(originalListener, []);
      this._listenerWrappers.get(originalListener).push({eventName, wrapper: listenerToRegister, once: true });
    }

    super.once(eventName, listenerToRegister);

    this.metrics.totalListenersRegistered++;
    this.metrics.activeListeners[eventName] = (this.metrics.activeListeners[eventName] || 0) + 1;
    logger.debug(`EventBus: One-time listener registered for '${eventName}'. New count: ${this.listenerCount(eventName)}. ${filterOptions ? 'With filters: ' + JSON.stringify(filterOptions) : 'No filters.'}`);
  }

  /**
   * Removes a specific listener for a specific event.
   * Handles removing wrapped listeners correctly.
   *
   * @param {string} eventName - The name of the event.
   * @param {Function} listener - The original listener function that was registered.
   */
  off(eventName, listener) {
    let removed = false;
    if (this._listenerWrappers && this._listenerWrappers.has(listener)) {
      const wrappers = this._listenerWrappers.get(listener);
      const remainingWrappers = [];
      for (const w of wrappers) {
        if (w.eventName === eventName) {
          super.off(eventName, w.wrapper);
          removed = true;
        } else {
          remainingWrappers.push(w);
        }
      }
      if (remainingWrappers.length === 0) {
        this._listenerWrappers.delete(listener);
      } else {
        this._listenerWrappers.set(listener, remainingWrappers);
      }
    }
    
    // If no wrapper was found, or if the listener was registered without filters
    if (!removed) {
        super.off(eventName, listener);
    }

    // Update metrics if a listener was actually removed (Node's 'off' doesn't give feedback)
    // This requires knowing if the listener was indeed registered. A more robust way
    // is to check listenerCount before/after, but for now, we'll decrement if called.
    // This might lead to negative counts if 'off' is called for a non-existent listener.
    // A better approach would be for `on` to return a subscription object with an `unsubscribe` method.
    if (this.metrics.activeListeners[eventName] && this.metrics.activeListeners[eventName] > 0) {
        this.metrics.activeListeners[eventName]--;
    }
    this.metrics.totalListenersRemoved++;
    // logger.debug(`EventBus: Listener removed for '${eventName}'.`);
  }

  /**
   * Removes all listeners for a specific event, or all listeners if no event name is provided.
   *
   * @param {string} [eventName] - The name of the event to remove listeners from.
   */
  removeAllListeners(eventName) {
    // logger.debug(`EventBus: Removing all listeners ${eventName ? 'for ' + eventName : ''}`);
    super.removeAllListeners(eventName);
    // TODO: Update metrics comprehensively for removeAllListeners
    // This would involve iterating through _listenerWrappers and clearing relevant entries,
    // and resetting activeListeners counts for the specified eventName or all events.
    if (eventName) {
        this.metrics.activeListeners[eventName] = 0;
    } else {
        // Reset all active listener counts
        Object.keys(this.metrics.activeListeners).forEach(key => {
            this.metrics.activeListeners[key] = 0;
        });
        if (this._listenerWrappers) this._listenerWrappers.clear();
    }
  }

  /**
   * Retrieves the current metrics tracked by the EventBus.
   * @returns {object} The metrics object.
   */
  getMetrics() {
    // Return a deep copy to prevent external modification of the internal metrics object
    return JSON.parse(JSON.stringify(this.metrics));
  }
}

// Export a single instance (Singleton pattern)
const instance = new EventBus();

module.exports = instance; 