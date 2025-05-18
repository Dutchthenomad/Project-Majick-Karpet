/**
 * Data formatting utilities for the dashboard
 */
const DataFormatter = {
    /**
     * Format a number to a price display (e.g. 1.25x)
     * @param {number} price - The price to format
     * @param {number} [decimals=2] - Number of decimal places
     * @returns {string} Formatted price string
     */
    formatPrice(price, decimals = 2) {
      if (typeof price !== 'number' || isNaN(price)) return '1.00x';
      return price.toFixed(decimals) + 'x';
    },
    
    /**
     * Format a timestamp to a readable time
     * @param {number|string|Date} timestamp - The timestamp to format
     * @param {boolean} [includeSeconds=true] - Whether to include seconds
     * @returns {string} Formatted time string
     */
    formatTime(timestamp, includeSeconds = true) {
      if (!timestamp) return 'Unknown';
      
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      
      if (includeSeconds) {
        return date.toLocaleTimeString();
      } else {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    },
    
    /**
     * Format an elapsed time in milliseconds to a readable duration
     * @param {number} ms - Milliseconds
     * @returns {string} Formatted duration string
     */
    formatDuration(ms) {
      if (typeof ms !== 'number' || isNaN(ms)) return 'Unknown';
      
      if (ms < 1000) return ms + 'ms';
      if (ms < 60000) return Math.floor(ms / 1000) + 's';
      
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      
      return `${minutes}m ${seconds}s`;
    },
    
    /**
     * Format a percentage value
     * @param {number} value - The decimal value (0-1)
     * @param {number} [decimals=0] - Number of decimal places
     * @returns {string} Formatted percentage string
     */
    formatPercent(value, decimals = 0) {
      if (typeof value !== 'number' || isNaN(value)) return '0%';
      return (value * 100).toFixed(decimals) + '%';
    }
  };