/**
 * Analytics Panel Widget
 * Displays game phase analysis and historical comparisons
 */
class AnalyticsPanelWidget extends WidgetBase {
    constructor(options = {}) {
      super('analytics-panel-widget', 'Game Analytics', options);
      
      // Default data
      this.data = {
        gamePhase: {
          phase: 'UNKNOWN',
          tickPercentile: 0,
          avgGameLength: 180,
          phaseStartTick: 0
        },
        historyStats: {
          avgGameLength: 180,
          percentiles: {
            p10: 20,
            p25: 50,
            p50: 90,
            p75: 150,
            p90: 200
          }
        },
        currentTickCount: 0
      };
      
      // Phase display mappings
      this.phaseDisplayNames = {
        'EARLY_ACCUMULATION': 'Early Accumulation',
        'MID_VOLATILITY': 'Mid Volatility',
        'LATE_RISK_ZONE': 'Late Risk Zone',
        'EXTREME_EXTENSION': 'Extreme Extension',
        'UNKNOWN': 'Unknown Phase'
      };
      
      this.phaseColors = {
        'EARLY_ACCUMULATION': 'var(--success-color)',
        'MID_VOLATILITY': 'var(--info-color)',
        'LATE_RISK_ZONE': 'var(--warning-color)',
        'EXTREME_EXTENSION': 'var(--danger-color)',
        'UNKNOWN': 'var(--text-secondary)'
      };
    }
    
    /**
     * Update with dashboard data
     * @param {Object} dashboardData - Dashboard data
     */
    update(dashboardData) {
      // Update game state info
      if (dashboardData.gameState) {
        this.data.currentTickCount = dashboardData.gameState.tickCount || 0;
      }
      
      // Update game phase data
      if (dashboardData.analytics && dashboardData.analytics.gamePhase) {
        this.data.gamePhase = {
          ...this.data.gamePhase,
          ...dashboardData.analytics.gamePhase
        };
      }
      
      // Update history stats
      if (dashboardData.historyStats) {
        this.data.historyStats = {
          ...this.data.historyStats,
          ...dashboardData.historyStats
        };
      }
      
      this.render();
    }
    
    /**
     * Render the widget
     */
    render() {
      if (!this.element) return;
      
      const phase = this.data.gamePhase.phase;
      const displayPhase = this.phaseDisplayNames[phase] || phase;
      const phaseColor = this.phaseColors[phase] || 'var(--text-color)';
      const percentile = Math.round(this.data.gamePhase.tickPercentile);
      const avgGameLength = this.data.historyStats.avgGameLength;
      
      this.element.innerHTML = `
        <div class="widget-header">
          <h3>${this.title}</h3>
          <div class="widget-controls">
            ${this.options.refreshInterval ? '<button class="widget-refresh" title="Refresh">⟳</button>' : ''}
            ${this.options.collapsible ? '<button class="widget-minimize" title="Minimize">−</button>' : ''}
          </div>
        </div>
        <div class="widget-content">
          <div class="game-phase-info">
            <div class="phase-badge" style="background-color: ${phaseColor}">
              ${displayPhase}
            </div>
            <div class="phase-description">
              ${this._getPhaseDescription(phase)}
            </div>
          </div>
          
          <div class="progress-container">
            <div class="progress-label">
              <span>Game Progress</span>
              <span>${percentile}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${percentile}%; background-color: ${phaseColor}"></div>
              
              <!-- Phase markers -->
              <div class="phase-marker early" style="left: 25%" title="Early Phase End"></div>
              <div class="phase-marker mid" style="left: 50%" title="Mid Phase"></div>
              <div class="phase-marker late" style="left: 75%" title="Late Phase Start"></div>
            </div>
          </div>
          
          <div class="analytics-metrics">
            <div class="analytic-metric">
              <div class="metric-label">Current Tick</div>
              <div class="metric-value">${this.data.currentTickCount}</div>
            </div>
            <div class="analytic-metric">
              <div class="metric-label">Avg Game Length</div>
              <div class="metric-value">${Math.round(avgGameLength)} ticks</div>
            </div>
            <div class="analytic-metric">
              <div class="metric-label">Phase Start</div>
              <div class="metric-value">${this.data.gamePhase.phaseStartTick} ticks</div>
            </div>
          </div>
          
          <div class="percentile-info">
            <h4>Historical Percentiles</h4>
            <div class="percentile-markers">
              <!-- Placeholder for percentile visualization -->
              <div class="percentile-marker p10" style="left: 10%" title="10th Percentile"></div>
              <div class="percentile-marker p25" style="left: 25%" title="25th Percentile"></div>
              <div class="percentile-marker p50" style="left: 50%" title="50th Percentile"></div>
              <div class="percentile-marker p75" style="left: 75%" title="75th Percentile"></div>
              <div class="percentile-marker p90" style="left: 90%" title="90th Percentile"></div>
              
              <!-- Current tick marker -->
              <div class="current-tick-marker" style="left: ${percentile}%" title="Current Tick"></div>
            </div>
          </div>
        </div>
      `;
      
      // Add analytics-specific CSS
      if (!document.getElementById('analytics-panel-css')) {
        const style = document.createElement('style');
        style.id = 'analytics-panel-css';
        style.textContent = `
          .game-phase-info {
            margin-bottom: 15px;
          }
          
          .phase-badge {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 4px;
            color: #fff;
            font-weight: bold;
            margin-bottom: 10px;
          }
          
          .phase-description {
            color: var(--text-secondary);
            font-size: 0.9rem;
            line-height: 1.4;
          }
          
          .progress-container {
            margin: 15px 0;
          }
          
          .progress-label {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 0.9rem;
          }
          
          .progress-bar {
            height: 12px;
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            overflow: hidden;
            position: relative;
          }
          
          .progress-fill {
            height: 100%;
            transition: width 0.3s ease;
          }
          
          .phase-marker {
            position: absolute;
            width: 2px;
            height: 12px;
            background-color: rgba(255, 255, 255, 0.5);
            top: 0;
            z-index: 2;
          }
          
          .analytics-metrics {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin: 15px 0;
          }
          
          .analytic-metric {
            text-align: center;
          }
          
          .analytic-metric .metric-label {
            font-size: 0.8rem;
            margin-bottom: 5px;
          }
          
          .analytic-metric .metric-value {
            font-size: 1.3rem;
            font-weight: bold;
          }
          
          .percentile-info {
            margin-top: 20px;
          }
          
          .percentile-info h4 {
            margin: 0 0 10px 0;
            font-size: 1rem;
            color: var(--text-secondary);
          }
          
          .percentile-markers {
            height: 30px;
            background-color: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            position: relative;
          }
          
          .percentile-marker {
            position: absolute;
            width: 2px;
            height: 10px;
            background-color: rgba(255, 255, 255, 0.3);
            bottom: 0;
          }
          
          .percentile-marker::after {
            content: attr(title);
            position: absolute;
            bottom: 12px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.7rem;
            color: var(--text-secondary);
            white-space: nowrap;
          }
          
          .current-tick-marker {
            position: absolute;
            width: 3px;
            height: 30px;
            background-color: var(--accent-color);
            bottom: 0;
            z-index: 3;
          }
        `;
        document.head.appendChild(style);
      }
      
      // Set up event listeners
      this._setupEventListeners();
    }
    
    /**
     * Get description text for a game phase
     * @param {string} phase - The game phase
     * @returns {string} Description of the phase
     * @private
     */
    _getPhaseDescription(phase) {
      switch(phase) {
        case 'EARLY_ACCUMULATION':
          return 'Early game stage with relatively low risk. Price typically increases steadily as players accumulate positions.';
        case 'MID_VOLATILITY':
          return 'Middle game stage with increasing volatility. Price movements may become more erratic with occasional dips.';
        case 'LATE_RISK_ZONE':
          return 'Late game stage with significantly higher risk. Rug probability increases as the game approaches typical ending points.';
        case 'EXTREME_EXTENSION':
          return 'Game has extended beyond typical length. Extremely high risk of rugging at any moment.';
        default:
          return 'Current game phase is undetermined.';
      }
    }
    
    /**
     * Subscribe to dashboard events
     * @private
     */
    _subscribeToEvents() {
      // Listen for game phase updates
      dashboardEvents.on('analytics:gamePhase', (data) => {
        this.update({ analytics: { gamePhase: data } });
      });
      
      // Listen for history stats updates
      dashboardEvents.on('analytics:gameHistoryStats', (data) => {
        this.update({ historyStats: data });
      });
      
      // Listen for game state updates
      dashboardEvents.on('gameState:updated', (data) => {
        this.update({ gameState: data });
      });
    }
  }