/**
 * Pattern Recognition Widget
 * Displays detected price patterns and their confidence levels
 */
class PatternRecognitionWidget extends WidgetBase {
    constructor(options = {}) {
      super('pattern-recognition-widget', 'Pattern Recognition', options);
      
      // Default data
      this.data = {
        patterns: [],
        patternMetadata: {}
      };
      
      // Pattern descriptions
      this.patternDescriptions = {
        'PRICE_REVERSAL': 'Significant change in price direction',
        'MAJOR_DIP': 'Sharp price decrease followed by recovery',
        'EXTREME_VOLATILITY': 'Rapid and large price movements',
        'ACCUMULATION': 'Steady price increase with minimal volatility',
        'DISTRIBUTION': 'Price consolidation before potential rug',
        'BREAKOUT': 'Price breaking through key resistance level',
        'PRE_RUG_PATTERN': 'Common pattern observed before rugs'
      };
      
      // Pattern icons (would use actual icons in real implementation)
      this.patternIcons = {
        'PRICE_REVERSAL': '↩️',
        'MAJOR_DIP': '📉',
        'EXTREME_VOLATILITY': '📊',
        'ACCUMULATION': '📈',
        'DISTRIBUTION': '⏸️',
        'BREAKOUT': '🚀',
        'PRE_RUG_PATTERN': '⚠️'
      };
    }
    
    /**
     * Update with dashboard data
     * @param {Object} dashboardData - Dashboard data
     */
    update(dashboardData) {
      if (dashboardData.analytics) {
        // Update patterns data
        if (dashboardData.analytics.patterns) {
          this.data.patterns = dashboardData.analytics.patterns;
        }
        
        // Update pattern metadata
        if (dashboardData.analytics.patternMetadata) {
          this.data.patternMetadata = dashboardData.analytics.patternMetadata;
        }
        
        this.render();
      }
    }
    
    /**
     * Render the widget
     */
    render() {
      if (!this.element) return;
      
      // Generate pattern list HTML
      let patternsHtml = '';
      
      if (this.data.patterns && this.data.patterns.length > 0) {
        patternsHtml = this.data.patterns.map(pattern => {
          const metadata = this.data.patternMetadata[pattern] || {};
          const confidence = metadata.confidence || 0;
          const detectedAt = metadata.detectedAt || 0;
          const description = this.patternDescriptions[pattern] || 'Unknown pattern';
          const icon = this.patternIcons[pattern] || '🔍';
          
          // Determine confidence class
          let confidenceClass = 'low';
          if (confidence >= 80) confidenceClass = 'high';
          else if (confidence >= 50) confidenceClass = 'medium';
          
          return `
            <div class="pattern-item">
              <div class="pattern-icon">${icon}</div>
              <div class="pattern-details">
                <div class="pattern-name">${pattern}</div>
                <div class="pattern-description">${description}</div>
                <div class="pattern-meta">
                  <span class="meta-item">Detected at tick ${detectedAt}</span>
                  <span class="confidence-badge ${confidenceClass}">${confidence}% confidence</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
      } else {
        patternsHtml = `
          <div class="no-patterns">
            <p>No patterns detected in current game</p>
          </div>
        `;
      }
      
      this.element.innerHTML = `
        <div class="widget-header">
          <h3>${this.title}</h3>
          <div class="widget-controls">
            ${this.options.refreshInterval ? '<button class="widget-refresh" title="Refresh">⟳</button>' : ''}
            ${this.options.collapsible ? '<button class="widget-minimize" title="Minimize">−</button>' : ''}
          </div>
        </div>
        <div class="widget-content">
          <div class="patterns-list">
            ${patternsHtml}
          </div>
        </div>
      `;
      
      // Add pattern recognition specific CSS
      if (!document.getElementById('pattern-recognition-css')) {
        const style = document.createElement('style');
        style.id = 'pattern-recognition-css';
        style.textContent = `
          .patterns-list {
            max-height: 300px;
            overflow-y: auto;
          }
          
          .pattern-item {
            display: flex;
            align-items: flex-start;
            padding: 10px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .pattern-icon {
            font-size: 1.5rem;
            margin-right: 10px;
            min-width: 30px;
            text-align: center;
          }
          
          .pattern-details {
            flex: 1;
          }
          
          .pattern-name {
            font-weight: bold;
            margin-bottom: 5px;
          }
          
          .pattern-description {
            font-size: 0.9rem;
            color: var(--text-secondary);
            margin-bottom: 5px;
          }
          
          .pattern-meta {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          align-items: center;
        }
        
        .meta-item {
          color: var(--text-secondary);
        }
        
        .confidence-badge {
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 0.7rem;
          font-weight: bold;
        }
        
        .confidence-badge.high {
          background-color: var(--success-color);
          color: #fff;
        }
        
        .confidence-badge.medium {
          background-color: var(--warning-color);
          color: #000;
        }
        
        .confidence-badge.low {
          background-color: var(--danger-color);
          color: #fff;
        }
        
        .no-patterns {
          padding: 20px;
          text-align: center;
          color: var(--text-secondary);
          font-style: italic;
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
    // Listen for pattern recognition updates
    dashboardEvents.on('analytics:patterns', (data) => {
      this.update({ analytics: { 
        patterns: data.patterns,
        patternMetadata: data.metadata
      }});
    });
  }
}