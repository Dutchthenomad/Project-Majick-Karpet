/**
 * Main Dashboard Controller
 * Manages widgets and Socket.IO communication
 */
class DashboardController {
    constructor() {
      this.widgets = {};
      this.socket = null;
      this.connected = false;
      this.lastUpdateTime = null;
      
      // Default settings
      this.settings = this._loadSettings() || {
        widgetLayout: 'default',
        refreshRate: 250, // ms
        debug: false
      };
      
      // Status elements
      this.statusIndicator = document.getElementById('status-indicator');
      this.statusText = document.getElementById('status-text');
    }
    
    /**
     * Initialize the dashboard
     */
    initialize() {
      console.log('Initializing Dashboard...');
      
      // Set up debug mode
      dashboardEvents.setDebugMode(this.settings.debug);
      
      // Connect to Socket.IO
      this._setupSocketConnection();
      
      // Initialize the widgets
      this._initializeWidgets();
      
      // Set up event listeners
      this._setupEventListeners();
      
      console.log('Dashboard initialized');
    }
    
    /**
     * Set up Socket.IO connection
     * @private
     */
    _setupSocketConnection() {
      try {
        // Connect to the enhanced dashboard service
        this.socket = io();
        
        // Connection events
        this.socket.on('connect', () => {
          console.log('Connected to server');
          this.connected = true;
          this._updateConnectionStatus('connected', 'Connected');
          
          // Request initial state
          this.socket.emit('dashboard:requestState');
        });
        
        this.socket.on('disconnect', () => {
          console.log('Disconnected from server');
          this.connected = false;
          this._updateConnectionStatus('disconnected', 'Disconnected');
        });
        
        // Dashboard events
        this.socket.on('dashboard:state', (state) => {
          console.log('Received initial dashboard state:', state);
          this._updateWidgets(state);
        });
        
        this.socket.on('dashboard:update', (state) => {
          this.lastUpdateTime = new Date();
          this._updateWidgets(state);
        });
        
        // Status updates
        this.socket.on('status:update', (status) => {
          console.log('Received status update:', status);
          // Handle status updates
        });
        
      } catch (error) {
        console.error('Error setting up Socket.IO connection:', error);
        this._updateConnectionStatus('disconnected', 'Connection Error');
      }
    }
    
    /**
     * Initialize all dashboard widgets
     * @private
     */
    _initializeWidgets() {
      // Create and initialize widgets
      this.addWidget('game-state-widget', new GameStateWidget({
        refreshInterval: this.settings.refreshRate,
        class: 'third-width'
      }));
      
      this.addWidget('risk-assessment-widget', new RiskAssessmentWidget({
        refreshInterval: this.settings.refreshRate,
        class: 'third-width'
      }));
      
      this.addWidget('signal-panel-widget', new SignalPanelWidget({
        refreshInterval: this.settings.refreshRate,
        class: 'third-width'
      }));
      
      this.addWidget('chart-widget', new ChartWidget({
        refreshInterval: this.settings.refreshRate,
        class: 'full-width'
      }));
      
      this.addWidget('analytics-panel-widget', new AnalyticsPanelWidget({
        refreshInterval: this.settings.refreshRate,
        class: 'half-width'
      }));
      
      this.addWidget('pattern-recognition-widget', new PatternRecognitionWidget({
        refreshInterval: this.settings.refreshRate,
        class: 'half-width'
      }));
      
      this.addWidget('debug-widget', new DebugWidget({
        refreshInterval: null, // No auto-refresh for debug
        class: 'full-width',
        collapsible: true
      }));
    }
    
    /**
     * Set up dashboard event listeners
     * @private
     */
    _setupEventListeners() {
      // Handle widget events
      dashboardEvents.on('widget:minimized', (data) => {
        this._saveWidgetState(data.id, { minimized: data.minimized });
      });
      
      dashboardEvents.on('widget:removed', (data) => {
        delete this.widgets[data.id];
        this._saveSettings();
      });
      
      // Handle window events
      window.addEventListener('beforeunload', () => {
        this._saveSettings();
      });
    }
    
    /**
     * Add a widget to the dashboard
     * @param {string} id - Widget ID
     * @param {WidgetBase} widget - Widget instance
     */
    addWidget(id, widget) {
      this.widgets[id] = widget;
      widget.initialize();
    }
    
    /**
     * Get a widget by ID
     * @param {string} id - Widget ID
     * @returns {WidgetBase} The widget instance
     */
    getWidget(id) {
      return this.widgets[id];
    }
    
    /**
     * Update all widgets with new data
     * @param {Object} data - The dashboard data
     * @private
     */
    _updateWidgets(data) {
      // Update last update time display
      if (this.lastUpdateTime) {
        const elapsed = new Date() - this.lastUpdateTime;
        if (elapsed > 1000) {
          // If it's been more than a second, update the time
          this._updateLastUpdateTime();
        }
      }
      
      // Update each widget
      Object.values(this.widgets).forEach(widget => {
        widget.update(data);
      });
      
      // Emit dashboard updated event
      dashboardEvents.emit('dashboard:updated', data);
    }
    
    /**
     * Update connection status indicator
     * @param {string} status - Status class (connected, disconnected)
     * @param {string} message - Status message
     * @private
     */
    _updateConnectionStatus(status, message) {
      if (this.statusIndicator) {
        this.statusIndicator.className = '';
        this.statusIndicator.classList.add('status-' + status);
      }
      
      if (this.statusText) {
        this.statusText.textContent = message;
      }
      
      // Emit connection status event
      dashboardEvents.emit('connection:status', { status, message });
    }
    
    /**
     * Update the last update time display
     * @private
     */
    _updateLastUpdateTime() {
      const timeDisplay = document.getElementById('last-update-text');
      if (timeDisplay && this.lastUpdateTime) {
        const now = new Date();
        const diff = now - this.lastUpdateTime;
        
        let timeText = '';
        if (diff < 1000) {
          timeText = 'Just now';
        } else if (diff < 60000) {
          timeText = `${Math.floor(diff / 1000)}s ago`;
        } else {
          timeText = this.lastUpdateTime.toLocaleTimeString();
        }
        
        timeDisplay.textContent = timeText;
      }
    }
    
    /**
     * Save widget state
     * @param {string} id - Widget ID
     * @param {Object} state - Widget state
     * @private
     */
    _saveWidgetState(id, state) {
      const widgetStates = this.settings.widgetStates || {};
      widgetStates[id] = { 
        ...(widgetStates[id] || {}),
        ...state
      };
      
      this.settings.widgetStates = widgetStates;
      this._saveSettings();
    }
    
    /**
     * Load dashboard settings from localStorage
     * @returns {Object} Dashboard settings
     * @private
     */
    _loadSettings() {
      try {
        const settings = localStorage.getItem('dashboard_settings');
        return settings ? JSON.parse(settings) : null;
      } catch (error) {
        console.error('Error loading dashboard settings:', error);
        return null;
      }
    }
    
    /**
     * Save dashboard settings to localStorage
     * @private
     */
    _saveSettings() {
      try {
        localStorage.setItem('dashboard_settings', JSON.stringify(this.settings));
      } catch (error) {
        console.error('Error saving dashboard settings:', error);
      }
    }
    
    /**
     * Get default settings
     * @returns {Object} Default settings
     * @private
     */
    _defaultSettings() {
      return {
        widgetLayout: 'default',
        refreshRate: 250,
        debug: false,
        widgetStates: {}
      };
    }
  }