/**
 * Debug Widget
 * Displays debug information about the dashboard and data flow
 */
class DebugWidget extends WidgetBase {
    constructor(options = {}) {
      super('debug-widget', 'Debug Console', options);
      
      // Log history
      this.logs = [];
      this.maxLogs = 100;
      this.filterLevel = 'all'; // 'error', 'warn', 'info', 'debug', 'all'
      
      // Last data received
      this.lastData = null;
    }
    
    /**
     * Initialize widget
     */
    initialize() {
      super.initialize();
      
      // Subscribe to all dashboard events
      this._subscribeToEvents();
      
      // Add log message
      this.addLog('info', 'Debug console initialized');
    }
    
    /**
     * Update widget with dashboard data
     * @param {Object} data - Dashboard data
     */
    update(data) {
      // Store last data received
      this.lastData = data;
      
      // Add log
      this.addLog('debug', `Dashboard update received: ${JSON.stringify(data).substring(0, 100)}...`);
      
      // Re-render
      this.render();
    }
    
    /**
     * Add a log message
     * @param {string} level - Log level ('error', 'warn', 'info', 'debug')
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    addLog(level, message, data = null) {
      const timestamp = new Date().toISOString();
      this.logs.unshift({
        level,
        message,
        data,
        timestamp
      });
      
      // Trim logs if over limit
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(0, this.maxLogs);
      }
      
      // Re-render if element exists
      if (this.element) {
        this.render();
      }
    }
    
    /**
     * Clear all logs
     */
    clearLogs() {
      this.logs = [];
      this.render();
    }
    
    /**
     * Set log filter level
     * @param {string} level - Filter level
     */
    setFilterLevel(level) {
      this.filterLevel = level;
      this.render();
    }
    
    /**
     * Get HTML for logs based on current filter
     * @returns {string} HTML for logs
     * @private
     */
    _getLogsHtml() {
      const filteredLogs = this.logs.filter(log => {
        if (this.filterLevel === 'all') return true;
        return log.level === this.filterLevel;
      });
      
      if (filteredLogs.length === 0) {
        return '<div class="empty-logs">No logs to display</div>';
      }
      
      return filteredLogs.map(log => {
        const levelClass = `log-${log.level}`;
        const timestamp = log.timestamp.split('T')[1].substring(0, 8);
        
        let dataHtml = '';
        if (log.data) {
          try {
            // Create collapsible data display
            const dataStr = JSON.stringify(log.data, null, 2);
            dataHtml = `
              <div class="log-data-toggle">+ Data</div>
              <pre class="log-data">${dataStr}</pre>
            `;
          } catch (e) {
            dataHtml = `<div class="log-data-error">Error stringifying data: ${e.message}</div>`;
          }
        }
        
        return `
          <div class="log-entry ${levelClass}">
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-level">[${log.level.toUpperCase()}]</span>
            <span class="log-message">${log.message}</span>
            ${dataHtml}
          </div>
        `;
      }).join('');
    }
    
    /**
     * Render the widget
     */
    render() {
      if (!this.element) return;
      
      // Create tabs for different views
      this.element.innerHTML = `
        <div class="widget-header">
          <h3>${this.title}</h3>
          <div class="widget-controls">
            <button class="debug-clear" title="Clear Logs">🗑️</button>
            ${this.options.collapsible ? '<button class="widget-minimize" title="Minimize">−</button>' : ''}
          </div>
        </div>
        <div class="widget-content">
          <div class="debug-tabs">
            <button class="debug-tab active" data-tab="logs">Logs</button>
            <button class="debug-tab" data-tab="data">Latest Data</button>
            <button class="debug-tab" data-tab="events">Event Bus</button>
          </div>
          
          <div class="debug-tab-content active" data-tab="logs">
            <div class="debug-filters">
              <label>
                Filter:
                <select class="log-filter">
                  <option value="all" ${this.filterLevel === 'all' ? 'selected' : ''}>All</option>
                  <option value="error" ${this.filterLevel === 'error' ? 'selected' : ''}>Error</option>
                  <option value="warn" ${this.filterLevel === 'warn' ? 'selected' : ''}>Warning</option>
                  <option value="info" ${this.filterLevel === 'info' ? 'selected' : ''}>Info</option>
                  <option value="debug" ${this.filterLevel === 'debug' ? 'selected' : ''}>Debug</option>
                </select>
              </label>
            </div>
            
            <div class="debug-logs">
              ${this._getLogsHtml()}
            </div>
          </div>
          
          <div class="debug-tab-content" data-tab="data">
            <pre class="debug-data">${this.lastData ? JSON.stringify(this.lastData, null, 2) : 'No data received yet'}</pre>
          </div>
          
          <div class="debug-tab-content" data-tab="events">
            <div class="debug-event-metrics">
              <p>Event metrics will be displayed here.</p>
            </div>
          </div>
        </div>
      `;
      
      // Add CSS for debug widget
      if (!document.getElementById('debug-widget-css')) {
        const style = document.createElement('style');
        style.id = 'debug-widget-css';
        style.textContent = `
          .debug-tabs {
            display: flex;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: 10px;
          }
          
          .debug-tab {
            padding: 8px 12px;
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            border-bottom: 2px solid transparent;
          }
          
          .debug-tab.active {
            color: var(--text-color);
            border-bottom-color: var(--accent-color);
          }
          
          .debug-tab-content {
            display: none;
          }
          
          .debug-tab-content.active {
            display: block;
          }
          
          .debug-filters {
            margin-bottom: 10px;
            display: flex;
            justify-content: flex-end;
          }
          
          .log-filter {
            background-color: var(--card-bg);
            color: var(--text-color);
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 4px 8px;
            border-radius: 4px;
            margin-left: 5px;
          }
          
          .debug-logs {
            max-height: 300px;
            overflow-y: auto;
            font-family: var(--font-mono);
            font-size: 12px;
          }
          
          .log-entry {
            padding: 4px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            line-height: 1.4;
          }
          
          .log-timestamp {
            color: var(--text-secondary);
            margin-right: 6px;
          }
          
          .log-level {
            font-weight: bold;
            margin-right: 6px;
          }
          
          .log-error .log-level { color: var(--danger-color); }
          .log-warn .log-level { color: var(--warning-color); }
          .log-info .log-level { color: var(--info-color); }
          .log-debug .log-level { color: var(--text-secondary); }
          
          .log-message {
            word-break: break-all;
          }
          
          .log-data-toggle {
            cursor: pointer;
            color: var(--accent-color);
            margin-top: 3px;
            font-size: 10px;
          }
          
          .log-data {
            display: none;
            margin: 5px 0 5px 20px;
            padding: 5px;
            background-color: rgba(0, 0, 0, 0.2);
            border-radius: 4px;
            white-space: pre-wrap;
            font-size: 10px;
          }
          
          .log-data-toggle.expanded + .log-data {
            display: block;
          }
          
          .debug-data {
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            font-family: var(--font-mono);
            font-size: 12px;
            background-color: rgba(0, 0, 0, 0.2);
            padding: 10px;
            border-radius: 5px;
          }
          
          .empty-logs {
            color: var(--text-secondary);
            font-style: italic;
            text-align: center;
            padding: 20px;
          }
        `;
        document.head.appendChild(style);
      }
      
      // Set up event listeners
      this._setupEventListeners();
      
      // Set up additional event listeners for debug widget
      const tabs = this.element.querySelectorAll('.debug-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // Remove active class from all tabs
          tabs.forEach(t => t.classList.remove('active'));
          // Add active class to clicked tab
          tab.classList.add('active');
          
          // Hide all tab content
          const tabContents = this.element.querySelectorAll('.debug-tab-content');
          tabContents.forEach(content => content.classList.remove('active'));
          
          // Show selected tab content
          const tabName = tab.getAttribute('data-tab');
          const selectedContent = this.element.querySelector(`.debug-tab-content[data-tab="${tabName}"]`);
          if (selectedContent) {
            selectedContent.classList.add('active');
          }
        });
      });
      
      // Set up filter listener
      const filterSelect = this.element.querySelector('.log-filter');
      if (filterSelect) {
        filterSelect.addEventListener('change', () => {
          this.setFilterLevel(filterSelect.value);
        });
      }
      
      // Set up clear button
      const clearButton = this.element.querySelector('.debug-clear');
      if (clearButton) {
        clearButton.addEventListener('click', () => {
          this.clearLogs();
        });
      }
      
      // Set up log data toggles
      const dataToggles = this.element.querySelectorAll('.log-data-toggle');
      dataToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
          toggle.classList.toggle('expanded');
          toggle.textContent = toggle.classList.contains('expanded') ? '- Data' : '+ Data';
        });
      });
    }
    
    /**
     * Subscribe to dashboard events
     * @private
     */
    _subscribeToEvents() {
      // Subscribe to connection status updates
      dashboardEvents.on('connection:status', (status) => {
        this.addLog('info', `Connection status: ${status.status} - ${status.message}`);
      });
      
      // Subscribe to dashboard updates
      dashboardEvents.on('dashboard:updated', (data) => {
        // Already handled in update method
      });
      
      // Subscribe to widget events
      dashboardEvents.on('widget:minimized', (data) => {
        this.addLog('debug', `Widget '${data.id}' ${data.minimized ? 'minimized' : 'expanded'}`);
      });
      
      dashboardEvents.on('widget:removed', (data) => {
        this.addLog('info', `Widget '${data.id}' removed`);
      });
    }
  }