/**
 * Game State Widget
 * Displays the basic game state information
 */
class GameStateWidget extends WidgetBase {
    constructor(options = {}) {
      super('game-state-widget', 'Game State', options);
      
      // Game state data
      this.data = {
        gameId: null,
        tickCount: 0,
        price: 1.00,
        status: 'waiting'
      };
      
      // Formatting options
      this.formatOptions = {
        price: { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        }
      };
    }
    
    /**
     * Update the widget with new data
     * @param {Object} dashboardData - Dashboard data
     */
    update(dashboardData) {
      // Extract game state from dashboard data
      if (dashboardData.gameState) {
        // Update our internal state
        this.data = {
          ...this.data,
          gameId: dashboardData.gameState.gameId || this.data.gameId,
          tickCount: dashboardData.gameState.tickCount !== undefined ? 
            dashboardData.gameState.tickCount : this.data.tickCount,
          price: dashboardData.gameState.price !== undefined ? 
            dashboardData.gameState.price : this.data.price
        };
        
        // Determine game status
        if (dashboardData.gameState.gameId) {
          this.data.status = 'active';
        } else {
          this.data.status = 'waiting';
        }
        
        // Re-render with new data
        this.render();
      }
    }
    
    /**
     * Render the widget
     */
    render() {
      if (!this.element) return;
      
      // Format price
      const formattedPrice = this.data.price ? 
        `${this.data.price.toFixed(2)}x` : '1.00x';
      
      // Set content
      this.element.innerHTML = `
        <div class="widget-header">
          <h3>${this.title}</h3>
          <div class="widget-controls">
            ${this.options.refreshInterval ? '<button class="widget-refresh" title="Refresh">⟳</button>' : ''}
            ${this.options.collapsible ? '<button class="widget-minimize" title="Minimize">−</button>' : ''}
          </div>
        </div>
        <div class="widget-content">
          <div class="metric">
            <div class="metric-label">Game ID</div>
            <div class="metric-value">${this.data.gameId || '-'}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Tick Count</div>
            <div class="metric-value">${this.data.tickCount || '0'}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Current Price</div>
            <div class="metric-value ${this._getPriceClass()}">${formattedPrice}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Status</div>
            <div class="metric-value status-indicator ${this.data.status}">${this._getStatusText()}</div>
          </div>
        </div>
      `;
      
      // Set up event listeners
      this._setupEventListeners();
    }
    
    /**
     * Get CSS class for price based on value
     * @returns {string} CSS class
     * @private
     */
    _getPriceClass() {
      if (this.data.price > 2) return 'success';
      if (this.data.price > 1.5) return 'info';
      if (this.data.price < 1) return 'danger';
      return '';
    }
    
    /**
     * Get human-readable status text
     * @returns {string} Status text
     * @private
     */
    _getStatusText() {
      switch (this.data.status) {
        case 'active': return 'Active';
        case 'waiting': return 'Waiting';
        case 'rugged': return 'Rugged';
        case 'ended': return 'Ended';
        default: return this.data.status;
      }
    }
    
    /**
     * Subscribe to dashboard events
     * @private
     */
    _subscribeToEvents() {
      // Listen for game state events specifically
      dashboardEvents.on('gameState:updated', (gameState) => {
        this.update({ gameState });
      });
    }
}