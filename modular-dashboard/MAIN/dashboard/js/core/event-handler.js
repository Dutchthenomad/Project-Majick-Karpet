/**
 * Dashboard Event Bus for client-side communication between widgets
 */
class DashboardEventBus {
    constructor() {
      this.events = {};
      this.debugMode = false;
    }
    
    /**
     * Subscribe to an event
     * @param {string} eventName - Name of the event
     * @param {function} callback - Callback function
     */
    on(eventName, callback) {
      if (!this.events[eventName]) {
        this.events[eventName] = [];
      }
      this.events[eventName].push(callback);
      
      if (this.debugMode) {
        console.log(`[EventBus] Subscribed to '${eventName}'`);
      }
      
      return this; // Allow chaining
    }
    
    /**
     * Unsubscribe from an event
     * @param {string} eventName - Name of the event
     * @param {function} callback - Callback function
     */
    off(eventName, callback) {
      if (!this.events[eventName]) return this;
      
      this.events[eventName] = this.events[eventName].filter(cb => cb !== callback);
      
      if (this.debugMode) {
        console.log(`[EventBus] Unsubscribed from '${eventName}'`);
      }
      
      return this; // Allow chaining
    }
    
    /**
     * Emit an event
     * @param {string} eventName - Name of the event
     * @param {*} data - Data to pass to the event handlers
     */
    emit(eventName, data) {
      if (!this.events[eventName]) return;
      
      if (this.debugMode) {
        console.log(`[EventBus] Emitting '${eventName}'`, data);
      }
      
      this.events[eventName].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventBus] Error in '${eventName}' handler:`, error);
        }
      });
      
      return this; // Allow chaining
    }
    
    /**
     * Enable or disable debug mode
     * @param {boolean} enabled - Whether debug mode should be enabled
     */
    setDebugMode(enabled) {
      this.debugMode = enabled;
      return this;
    }
  }
  
  // Create a global instance
  const dashboardEvents = new DashboardEventBus();