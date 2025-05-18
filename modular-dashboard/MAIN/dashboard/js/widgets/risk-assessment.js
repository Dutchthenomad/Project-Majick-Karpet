/**
 * Risk Assessment Widget
 * Displays the rug probability and risk assessment
 */
class RiskAssessmentWidget extends WidgetBase {
    constructor(options = {}) {
      super('risk-assessment-widget', 'Risk Assessment', options);
      
      // Risk data
      this.data = {
        nextTickProbability: 0.01,
        isHighRiskWindow: false,
        windowStart: 0,
        windowEnd: 0,
        riskTrend: 'stable' // 'increasing', 'decreasing', 'stable'
      };
      
      // Risk thresholds
      this.thresholds = {
        low: 0.1,
        medium: 0.2, 
        high: 0.35
      };
      
      // History for trend detection
      this.history = [];
      this.historyLimit = 10;
    }
    
    /**
     * Update the widget with new data
     * @param {Object} dashboardData - Dashboard data
     */
    update(dashboardData) {
      if (dashboardData.analytics && dashboardData.analytics.rugProbability) {
        const newData = dashboardData.analytics.rugProbability;
        
        // Add current probability to history for trend analysis
        if (newData.nextTickProbability !== undefined) {
          this.history.push(newData.nextTickProbability);
          // Keep history within limit
          if (this.history.length > this.historyLimit) {
            this.history.shift();
          }
        }
        
        // Update our data
        this.data = {
          ...this.data,
          nextTickProbability: newData.nextTickProbability !== undefined ? 
            newData.nextTickProbability : this.data.nextTickProbability,
          isHighRiskWindow: newData.isHighRiskWindow !== undefined ?
            newData.isHighRiskWindow : this.data.isHighRiskWindow,
          windowStart: newData.windowStart || this.data.windowStart,
          windowEnd: newData.windowEnd || this.data.windowEnd
        };
        
        // Calculate trend
        this.data.riskTrend = this._calculateTrend();
        
        // Re-render
        this.render();
      }
    }
    
    /**
     * Calculate the trend from history
     * @returns {string} Trend ('increasing', 'decreasing', 'stable')
     * @private
     */
    _calculateTrend() {
      if (this.history.length < 3) return 'stable';
      
      const recent = this.history.slice(-3);
      const oldest = recent[0];
      const middle = recent[1];
      const newest = recent[2];
      
      if (newest > middle && middle > oldest) {
        return 'increasing';
      } else if (newest < middle && middle < oldest) {
        return 'decreasing';
      } else {
        return 'stable';
      }
    }
    
    /**
     * Get risk level class based on probability
     * @returns {string} CSS class for risk level
     * @private
     */
    _getRiskLevelClass() {
      const prob = this.data.nextTickProbability;
      
      if (prob >= this.thresholds.high) return 'danger';
      if (prob >= this.thresholds.medium) return 'warning';
      if (prob >= this.thresholds.low) return 'info';
      return 'success';
    }
    
    /**
     * Get risk level text
     * @returns {string} Risk level text
     * @private
     */
    _getRiskLevelText() {
      const prob = this.data.nextTickProbability;
      
      if (prob >= this.thresholds.high) return 'High Risk';
      if (prob >= this.thresholds.medium) return 'Medium Risk';
      if (prob >= this.thresholds.low) return 'Low Risk';
      return 'Safe';
    }
    
    /**
     * Get trend indicator HTML
     * @returns {string} HTML for trend indicator
     * @private
     */
    _getTrendIndicator() {
      switch (this.data.riskTrend) {
        case 'increasing':
          return '<span class="trend-indicator increasing" title="Risk Increasing">↑</span>';
        case 'decreasing':
          return '<span class="trend-indicator decreasing" title="Risk Decreasing">↓</span>';
        default:
          return '<span class="trend-indicator stable" title="Risk Stable">→</span>';
      }
    }
    
    /**
     * Render the widget
     */
    render() {
      if (!this.element) return;
      
      // Calculate percentage for display
      const probPercent = (this.data.nextTickProbability * 100).toFixed(2);
      const riskLevelClass = this._getRiskLevelClass();
      const riskLevelText = this._getRiskLevelText();
      const trendIndicator = this._getTrendIndicator();
      
      // Create a progress bar for risk visualization
      const progressPercent = Math.min(100, Math.max(0, this.data.nextTickProbability * 100 * 2)); // Scale for better visibility
      
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
            <div class="metric-label">Rug Probability</div>
            <div class="metric-value ${riskLevelClass}">
              ${probPercent}% ${trendIndicator}
            </div>
          </div>
          
          <div class="risk-meter">
            <div class="risk-meter-bar">
              <div class="risk-meter-fill ${riskLevelClass}" style="width: ${progressPercent}%"></div>
            </div>
            <div class="risk-meter-label ${riskLevelClass}">${riskLevelText}</div>
          </div>
          
          ${this.data.isHighRiskWindow ? `
            <div class="high-risk-alert">
              <span class="alert-icon">⚠️</span>
              <span>High Risk Window: Ticks ${this.data.windowStart} - ${this.data.windowEnd}</span>
            </div>
          ` : ''}
          
          <div class="metric small-metric">
            <div class="metric-label">Risk Trend</div>
            <div class="metric-value small">${this.data.riskTrend.charAt(0).toUpperCase() + this.data.riskTrend.slice(1)}</div>
          </div>
        </div>
      `;
      
      // Add CSS for this widget if not already in main CSS
      if (!document.getElementById('risk-assessment-css')) {
        const style = document.createElement('style');
        style.id = 'risk-assessment-css';
        style.textContent = `
          .risk-meter {
            margin: 15px 0;
          }
          .risk-meter-bar {
            height: 10px;
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 5px;
            overflow: hidden;
          }
          .risk-meter-fill {
            height: 100%;
            transition: width 0.3s ease;
          }
          .risk-meter-fill.success { background-color: var(--success-color); }
          .risk-meter-fill.info { background-color: var(--info-color); }
          .risk-meter-fill.warning { background-color: var(--warning-color); }
          .risk-meter-fill.danger { background-color: var(--danger-color); }
          
          .risk-meter-label {
            font-size: 0.8rem;
            margin-top: 5px;
            text-align: right;
          }
          
          .high-risk-alert {
            background-color: rgba(255, 61, 0, 0.2);
            border-left: 3px solid var(--danger-color);
            padding: 10px;
            margin: 15px 0;
            display: flex;
            align-items: center;
            border-radius: 4px;
          }
          
          .alert-icon {
            margin-right: 8px;
          }
          
          .trend-indicator {
            display: inline-block;
            margin-left: 5px;
            font-weight: bold;
          }
          .trend-indicator.increasing { color: var(--danger-color); }
          .trend-indicator.decreasing { color: var(--success-color); }
          .trend-indicator.stable { color: var(--info-color); }
          
          .small-metric {
            margin-top: 15px;
          }
        `;
        document.head.appendChild(style);
      }
      
      // Set up event listeners
      this._setupEventListeners();
    }
    
    /**
     * Subscribe to dashboard events
     * @private
     */
    _subscribeToEvents() {
      // Listen for rug probability updates specifically
      dashboardEvents.on('analytics:rugProbability', (data) => {
        this.update({ analytics: { rugProbability: data } });
      });
    }
  }