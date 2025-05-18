/**
 * Chart utility functions for the dashboard
 */
const ChartUtilities = {
    /**
     * Generate placeholder data for testing
     * @param {number} points - Number of data points
     * @param {number} [min=1] - Minimum value
     * @param {number} [max=3] - Maximum value
     * @returns {Array} Array of data points
     */
    generatePlaceholderData(points, min = 1, max = 3) {
      const data = [];
      let value = min;
      const range = max - min;
      
      for (let i = 0; i < points; i++) {
        // Random walk with trend
        value += (Math.random() - 0.45) * 0.1 * range;
        
        // Ensure within bounds
        value = Math.max(min, Math.min(max, value));
        
        data.push({
          tick: i,
          price: value,
          timestamp: Date.now() - (points - i) * 250 // Assuming 250ms per tick
        });
      }
      
      return data;
    },
    
    /**
     * Calculate moving average
     * @param {Array} data - Array of data points
     * @param {string} field - Field to calculate average for
     * @param {number} [period=5] - Period for moving average
     * @returns {Array} Moving average data
     */
    calculateMovingAverage(data, field, period = 5) {
      if (!data || !data.length) return [];
      
      const result = [];
      let sum = 0;
      
      for (let i = 0; i < data.length; i++) {
        sum += data[i][field];
        
        if (i >= period) {
          sum -= data[i - period][field];
        }
        
        if (i >= period - 1) {
          result.push({
            tick: data[i].tick,
            value: sum / period
          });
        }
      }
      
      return result;
    },
    
    /**
     * Get min and max values from data series
     * @param {Array} data - Array of data points
     * @param {string} field - Field to find min/max for
     * @returns {Object} Object with min and max values
     */
    getDataRange(data, field) {
      if (!data || !data.length) return { min: 0, max: 1 };
      
      let min = data[0][field];
      let max = data[0][field];
      
      for (let i = 1; i < data.length; i++) {
        min = Math.min(min, data[i][field]);
        max = Math.max(max, data[i][field]);
      }
      
      // Add a small padding to the range
      const padding = (max - min) * 0.1;
      
      return {
        min: min - padding,
        max: max + padding
      };
    }
  };