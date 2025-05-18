/**
 * Base Widget Class that all dashboard widgets extend
 */
class WidgetBase {
    /**
     * Create a new widget
     * @param {string} id - DOM ID of the widget
     * @param {string} title - Widget title
     * @param {Object} options - Widget options
     */
    constructor(id, title, options = {}) {
      this.id = id;
      this.title = title;
      this.options = {
        refreshInterval: null,  // ms, null = no auto-refresh
        collapsible: true,      // Can the widget be minimized
        removable: false,       // Can the widget be removed
        ...options
      };
      
      this.element = null;
      this.isMinimized = false;
      this.refreshTimer = null;
      this.widgetControls = [];
    }
    
    /**
     * Initialize the widget
     */
    initialize() {
      // Get widget element
      this.element = document.getElementById(this.id);
      
      // Create element if it doesn't exist
      if (!this.element) {
        this._createDOMElement();
      }
      
      // Initialize with empty data
      this.render();
      
      // Set up refresh interval if specified
      if (this.options.refreshInterval) {
        this.startRefreshTimer();
      }
      
      // Subscribe to dashboard events
      this._subscribeToEvents();
      
      console.log(`Widget '${this.title}' initialized`);
      return this;
    }
    
    /**
     * Creates the DOM element for this widget
     * @private
     */
    _createDOMElement() {
      const widget = document.createElement('div');
      widget.id = this.id;
      widget.classList.add('widget');
      
      if (this.options.class) {
        widget.classList.add(this.options.class);
      }
      
      // Set grid position if provided
      if (this.options.gridColumn) {
        widget.style.gridColumn = this.options.gridColumn;
      }
      
      if (this.options.gridRow) {
        widget.style.gridRow = this.options.gridRow;
      }
      
      // Add to dashboard grid
      const dashboardGrid = document.querySelector('.dashboard-grid');
      if (dashboardGrid) {
        dashboardGrid.appendChild(widget);
        this.element = widget;
      } else {
        console.error(`Could not find dashboard grid for widget '${this.id}'`);
      }
    }
    
    /**
     * Set up event listeners for widget controls
     * @private
     */
    _setupEventListeners() {
      if (!this.element) return;
      
      // Find minimize button
      const minimizeBtn = this.element.querySelector('.widget-minimize');
      if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => this.toggleMinimize());
      }
      
      // Find settings button
      const settingsBtn = this.element.querySelector('.widget-settings');
      if (settingsBtn) {
        settingsBtn.addEventListener('click', () => this.openSettings());
      }
      
      // Find refresh button
      const refreshBtn = this.element.querySelector('.widget-refresh');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.refresh());
      }
      
      // Find remove button
      const removeBtn = this.element.querySelector('.widget-remove');
      if (removeBtn && this.options.removable) {
        removeBtn.addEventListener('click', () => this.remove());
      }
    }
    
    /**
     * Subscribe to dashboard events
     * @private
     */
    _subscribeToEvents() {
      // Override in subclasses
    }
    
    /**
     * Start the refresh timer
     */
    startRefreshTimer() {
      if (!this.options.refreshInterval) return;
      
      this.stopRefreshTimer(); // Clear any existing timer
      
      this.refreshTimer = setInterval(() => {
        this.refresh();
      }, this.options.refreshInterval);
    }
    
    /**
     * Stop the refresh timer
     */
    stopRefreshTimer() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }
    }
    
    /**
     * Refresh the widget data
     */
    refresh() {
      // Override in subclasses
      console.log(`Widget '${this.title}' refreshed`);
      this.render();
    }
    
    /**
     * Update the widget with new data
     * @param {Object} data - The new data
     */
    update(data) {
      // Override in subclasses
      console.log(`Widget '${this.title}' updated with:`, data);
      this.render();
    }
    
    /**
     * Render the widget
     */
    render() {
      if (!this.element) return;
      
      // Basic render that subclasses will override
      this.element.innerHTML = `
        <div class="widget-header">
          <h3>${this.title}</h3>
          <div class="widget-controls">
            ${this.options.refreshInterval ? '<button class="widget-refresh" title="Refresh">⟳</button>' : ''}
            ${this.options.collapsible ? '<button class="widget-minimize" title="Minimize">−</button>' : ''}
            ${this.options.removable ? '<button class="widget-remove" title="Remove">×</button>' : ''}
          </div>
        </div>
        <div class="widget-content">
          <p>Widget content will appear here.</p>
        </div>
      `;
      
      this._setupEventListeners();
    }
    
    /**
     * Toggle the minimized state of the widget
     */
    toggleMinimize() {
      if (!this.element || !this.options.collapsible) return;
      
      this.isMinimized = !this.isMinimized;
      this.element.classList.toggle('minimized', this.isMinimized);
      
      const minimizeBtn = this.element.querySelector('.widget-minimize');
      if (minimizeBtn) {
        minimizeBtn.textContent = this.isMinimized ? '+' : '−';
        minimizeBtn.title = this.isMinimized ? 'Expand' : 'Minimize';
      }
      
      // Emit event
      dashboardEvents.emit('widget:minimized', {
        id: this.id,
        minimized: this.isMinimized
      });
    }
    
    /**
     * Open widget settings
     */
    openSettings() {
      // Override in subclasses
      console.log(`Settings for widget '${this.title}'`);
    }
    
    /**
     * Remove the widget
     */
    remove() {
      if (!this.options.removable) return;
      
      // Stop refresh timer
      this.stopRefreshTimer();
      
      // Remove DOM element
      if (this.element) {
        this.element.remove();
      }
      
      // Emit event
      dashboardEvents.emit('widget:removed', { id: this.id });
      
      console.log(`Widget '${this.title}' removed`);
    }
  }