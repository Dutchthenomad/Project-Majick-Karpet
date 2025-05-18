/**
 * Chart Widget
 * Displays price chart and visualization of game progress
 */
class ChartWidget extends WidgetBase {
    constructor(options = {}) {
      super('chart-widget', 'Price Chart', options);
      
      // Default data
      this.data = {
        priceHistory: [],
        currentPrice: 1.0,
        tickCount: 0,
        gameId: null,
        riskZones: []
      };
      
      // Chart configuration
      this.chartConfig = {
        maxPoints: 100,
        height: 250,
        animationSpeed: 200
      };
      
      // Chart canvas context
      this.ctx = null;
    }
    
    /**
     * Initialize the widget
     */
    initialize() {
      super.initialize();
      
      // For a real implementation, we would initialize a chart library here
      console.log('Chart widget initialized - chart libraries would be initialized here');
    }
    
    /**
     * Update with dashboard data
     * @param {Object} dashboardData - Dashboard data
     */
    update(dashboardData) {
      // Update price and game data
      if (dashboardData.gameState) {
        // If game ID changes, reset the chart
        if (dashboardData.gameState.gameId !== this.data.gameId) {
          this.data.priceHistory = [];
          this.data.gameId = dashboardData.gameState.gameId;
        }
        
        // Update current tick and price
        this.data.tickCount = dashboardData.gameState.tickCount || 0;
        this.data.currentPrice = dashboardData.gameState.price || 1.0;
        
        // Add new price point to history
        if (this.data.currentPrice > 0) {
          this.data.priceHistory.push({
            tick: this.data.tickCount,
            price: this.data.currentPrice,
            timestamp: new Date().getTime()
          });
          
          // Trim history if needed
          if (this.data.priceHistory.length > this.chartConfig.maxPoints) {
            this.data.priceHistory.shift();
          }
        }
      }
      
      // Update risk zones if available
      if (dashboardData.analytics && dashboardData.analytics.rugProbability) {
        if (dashboardData.analytics.rugProbability.highRiskWindows) {
          this.data.riskZones = dashboardData.analytics.rugProbability.highRiskWindows;
        }
      }
      
      // Re-render the chart
      this.render();
    }
    
    /**
     * Render the chart
     */
    render() {
      if (!this.element) return;
      
      this.element.innerHTML = `
        <div class="widget-header">
          <h3>${this.title}</h3>
          <div class="widget-controls">
            ${this.options.refreshInterval ? '<button class="widget-refresh" title="Refresh">⟳</button>' : ''}
            ${this.options.collapsible ? '<button class="widget-minimize" title="Minimize">−</button>' : ''}
          </div>
        </div>
        <div class="widget-content">
          <div class="chart-container">
            <!-- Placeholder: Canvas for chart would go here -->
            <div class="chart-placeholder">
              <div class="chart-info">
                <div class="current-price">${this.data.currentPrice.toFixed(2)}x</div>
                <div class="current-tick">Tick: ${this.data.tickCount}</div>
              </div>
              <div class="placeholder-chart">
                <div class="placeholder-text">Chart Visualization Placeholder</div>
                <div class="placeholder-line" style="--points: ${this.data.priceHistory.length}"></div>
              </div>
            </div>
          </div>
          <div class="chart-controls">
            <button class="chart-option active">Line</button>
            <button class="chart-option">Candles</button>
            <button class="chart-option">Area</button>
            <span class="chart-stat">High: ${this._getHighPrice().toFixed(2)}x</span>
            <span class="chart-stat">Points: ${this.data.priceHistory.length}</span>
          </div>
        </div>
      `;
      
      // Add chart-specific CSS
      if (!document.getElementById('chart-widget-css')) {
        const style = document.createElement('style');
        style.id = 'chart-widget-css';
        style.textContent = `
          .chart-container {
            width: 100%;
            height: ${this.chartConfig.height}px;
            background-color: rgba(0, 0, 0, 0.2);
            border-radius: 4px;
            position: relative;
            overflow: hidden;
          }
          
          .chart-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          
          .chart-info {
            position: absolute;
            top: 10px;
            right: 10px;
            text-align: right;
            z-index: 5;
          }
          
          .current-price {
            font-size: 1.8rem;
            font-weight: bold;
            color: var(--success-color);
          }
          
          .current-tick {
            font-size: 0.9rem;
            color: var(--text-secondary);
          }
          
          .placeholder-text {
            color: var(--text-secondary);
            font-style: italic;
          }
          
          .placeholder-line {
            width: 80%;
            height: 100px;
            margin-top: 20px;
            border-bottom: 2px solid var(--accent-color);
            position: relative;
            opacity: 0.6;
          }
          
          .placeholder-line::before {
            content: '';
            position: absolute;
            top: 30px;
            left: 0;
            width: 100%;
            height: 40px;
            background: linear-gradient(
              90deg,
              transparent 0%,
              var(--accent-color) 20%,
              var(--accent-color) 70%,
              transparent 100%
            );
            opacity: 0.2;
            border-radius: 50%;
          }
          
          .chart-controls {
            display: flex;
            align-items: center;
            margin-top: 10px;
            padding: 5px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .chart-option {
            background: none;
            border: none;
            color: var(--text-secondary);
            padding: 5px 10px;
            margin-right: 10px;
            border-radius: 4px;
            cursor: pointer;
          }
          
          .chart-option.active {
            background-color: rgba(255, 255, 255, 0.1);
            color: var(--text-color);
          }
          
          .chart-stat {
            margin-left: auto;
            font-size: 0.8rem;
            color: var(--text-secondary);
            margin-right: 15px;
          }
        `;
        document.head.appendChild(style);
      }
      
      // Set up event listeners
      this._setupEventListeners();
      
      // Chart-specific event listeners
      const chartOptions = this.element.querySelectorAll('.chart-option');
      chartOptions.forEach(option => {
        option.addEventListener('click', () => {
          // Remove active class from all options
          chartOptions.forEach(opt => opt.classList.remove('active'));
          // Add active class to clicked option
          option.classList.add('active');
          // In a real implementation, we would change the chart type here
        });
      });
    }
    
    /**
     * Get the highest price from price history
     * @returns {number} The highest price
     * @private
     */
    _getHighPrice() {
      if (this.data.priceHistory.length === 0) return 1.0;
      
      return Math.max(...this.data.priceHistory.map(point => point.price));
    }
    
    /**
     * Subscribe to dashboard events
     * @private
     */
    _subscribeToEvents() {
      // Listen for game state updates
      dashboardEvents.on('gameState:updated', (data) => {
        this.update({ gameState: data });
      });
      
      // Listen for risk updates
      dashboardEvents.on('analytics:rugProbability', (data) => {
        this.update({ 
          analytics: { 
            rugProbability: data 
          } 
        });
      });
    }
  }