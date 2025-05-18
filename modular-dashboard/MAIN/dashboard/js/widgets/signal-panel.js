/**
 * Signal Panel Widget
 * Displays entry/exit signals and recommended position sizes
 */
class SignalPanelWidget extends WidgetBase {
    constructor(options = {}) {
      super('signal-panel-widget', 'Trading Signals', options);
      
      // Default data
      this.data = {
        entryStrength: 0,
        exitStrength: 0,
        optimalPositionSize: 0,
        generatedAt: null
      };
    }
    
    /**
     * Update the widget with new data
     * @param {Object} dashboardData - Dashboard data
     */
    update(dashboardData) {
      if (dashboardData.analytics && dashboardData.analytics.compositeSignals) {
        this.data = {
          ...this.data,
          ...dashboardData.analytics.compositeSignals
        };
        this.render();
      }
    }
    
    /**
     * Render the widget
     */
    render() {
      if (!this.element) return;
      
      // Format values
      const entryPercent = Math.round(this.data.entryStrength);
      const exitPercent = Math.round(this.data.exitStrength);
      const positionSize = (this.data.optimalPositionSize * 100).toFixed(0);
      
      // Determine signal strength classes
      const entryClass = entryPercent > 75 ? 'success' : 
                         entryPercent > 50 ? 'info' : 
                         entryPercent > 25 ? 'warning' : 'danger';
                         
      const exitClass = exitPercent > 75 ? 'danger' : 
                       exitPercent > 50 ? 'warning' : 
                       exitPercent > 25 ? 'info' : 'success';
      
      this.element.innerHTML = `
        <div class="widget-header">
          <h3>${this.title}</h3>
          <div class="widget-controls">
            ${this.options.refreshInterval ? '<button class="widget-refresh" title="Refresh">⟳</button>' : ''}
            ${this.options.collapsible ? '<button class="widget-minimize" title="Minimize">−</button>' : ''}
          </div>
        </div>
        <div class="widget-content">
          <!-- Placeholder: Signal strength meters would go here -->
          <div class="metric">
            <div class="metric-label">Entry Signal</div>
            <div class="metric-value ${entryClass}">${entryPercent}%</div>
            <div class="signal-meter">
              <div class="signal-meter-bar">
                <div class="signal-meter-fill ${entryClass}" style="width: ${entryPercent}%"></div>
              </div>
            </div>
          </div>
          
          <div class="metric">
            <div class="metric-label">Exit Signal</div>
            <div class="metric-value ${exitClass}">${exitPercent}%</div>
            <div class="signal-meter">
              <div class="signal-meter-bar">
                <div class="signal-meter-fill ${exitClass}" style="width: ${exitPercent}%"></div>
              </div>
            </div>
          </div>
          
          <div class="metric">
            <div class="metric-label">Recommended Position</div>
            <div class="metric-value">${positionSize}%</div>
          </div>
          
          <div class="signal-updated-at">
            Last updated: ${this.data.generatedAt ? new Date(this.data.generatedAt).toLocaleTimeString() : 'Never'}
          </div>
        </div>
      `;
      
      // Add widget-specific CSS
      if (!document.getElementById('signal-panel-css')) {
        const style = document.createElement('style');
        style.id = 'signal-panel-css';
        style.textContent = `
          .signal-meter {
            margin: 5px 0 15px 0;
          }
          .signal-meter-bar {
            height: 8px;
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            overflow: hidden;
          }
          .signal-meter-fill {
            height: 100%;
            transition: width 0.3s ease;
          }
          .signal-meter-fill.success { background-color: var(--success-color); }
          .signal-meter-fill.info { background-color: var(--info-color); }
          .signal-meter-fill.warning { background-color: var(--warning-color); }
          .signal-meter-fill.danger { background-color: var(--danger-color); }
          
          .signal-updated-at {
            font-size: 0.8rem;
            color: var(--text-secondary);
            text-align: right;
            margin-top: 10px;
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
      // Listen for composite signals updates
      dashboardEvents.on('analytics:compositeSignals', (data) => {
        this.update({ analytics: { compositeSignals: data } });
      });
    }
  }