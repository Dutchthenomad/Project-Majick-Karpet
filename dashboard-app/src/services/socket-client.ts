import { io, Socket } from 'socket.io-client';

interface SystemStatus {
  websocket: { status: string; message: string };
  database: { status: string; message: string };
  analytics: { status: string; message: string };
  game: { status: string; message: string };
}

interface GameState {
  gameId: string | null;
  tickCount: number;
  price: number;
  candle?: {
    index: number;
    open: number;
    close: number;
    high: number;
    low: number;
  };
  timestamp?: string;
}

interface Analytics {
  gamePhase?: {
    phase: string;
    tickPercentile: number;
    avgGameLength: number;
    phaseStartTick: number;
  };
  rugProbability?: {
    nextTickProbability: number;
    isHighRiskWindow: boolean;
    windowStart: number;
    windowEnd: number;
  };
  patterns?: string[];
  patternMetadata?: Record<string, { confidence: number; detectedAt: number }>;
  compositeSignals?: {
    entryStrength: number;
    exitStrength: number;
    optimalPositionSize: number;
    generatedAt: string;
  };
  risk?: any;
}

interface DashboardState {
  gameState: GameState;
  analytics: Analytics;
  historyStats?: any;
  housePosition?: any;
  playerPosition?: any;
  playerBehavior?: any;
  trades?: any[];
  performance?: any;
  systemStatus: SystemStatus;
}

// Default dashboard state
const defaultDashboardState: DashboardState = {
  gameState: {
    gameId: null,
    tickCount: 0,
    price: 1.0
  },
  analytics: {},
  systemStatus: {
    websocket: { status: 'disconnected', message: 'Not connected' },
    database: { status: 'unknown', message: 'Unknown status' },
    analytics: { status: 'initializing', message: 'Initializing' },
    game: { status: 'waiting', message: 'Waiting for game' }
  }
};

// Event handler type
type EventHandler<T = any> = (data: T) => void;

class SocketClient {
  private socket: Socket | null = null;
  private url: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectInterval: number = 2000; // 2 seconds
  private reconnectTimer: NodeJS.Timeout | null = null;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private dashboardState: DashboardState = { ...defaultDashboardState };
  private connected: boolean = false;

  constructor(url: string = 'http://localhost:3000') {
    this.url = url;
  }

  /**
   * Update the Socket.IO server URL
   * @param {string} url - The new server URL
   */
  updateUrl(url: string): void {
    this.url = url;
  }

  /**
   * Connect to the Socket.IO server
   * @param {boolean} mockOnly - If true, skip the actual socket connection attempt
   */
  connect(mockOnly: boolean = false): void {
    if (mockOnly) {
      // In mock-only mode, we don't attempt a real connection
      console.log(`Mock-only mode enabled, skipping real connection`);
      return;
    }

    if (this.socket) {
      return; // Already connected or connecting
    }

    console.log(`Connecting to Socket.IO server at ${this.url}`);
    
    try {
      this.socket = io(this.url, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });

      // Setup event listeners
      this.socket.on('connect', this.handleConnect.bind(this));
      this.socket.on('disconnect', this.handleDisconnect.bind(this));
      this.socket.on('connect_error', this.handleError.bind(this));
      this.socket.on('dashboard:state', this.handleDashboardState.bind(this));
      this.socket.on('dashboard:update', this.handleDashboardUpdate.bind(this));
      this.socket.on('status:update', this.handleStatusUpdate.bind(this));
    } catch (error) {
      console.error('Error connecting to Socket.IO server:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the Socket.IO server
   */
  disconnect(): void {
    if (!this.socket) return;

    this.socket.disconnect();
    this.socket = null;
    this.connected = false;
    this.emitEvent('connection:status', { connected: false, message: 'Disconnected' });
  }

  /**
   * Handle successful connection
   */
  private handleConnect(): void {
    console.log('Connected to Socket.IO server');
    this.connected = true;
    this.reconnectAttempts = 0;
    
    // Update system status
    this.dashboardState.systemStatus.websocket = {
      status: 'connected',
      message: 'Connected to server'
    };
    
    // Emit connection status event
    this.emitEvent('connection:status', { 
      connected: true, 
      message: 'Connected to server' 
    });
    
    // Request initial state
    if (this.socket) {
      this.socket.emit('dashboard:requestState');
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    console.log('Disconnected from Socket.IO server');
    this.connected = false;
    
    // Update system status
    this.dashboardState.systemStatus.websocket = {
      status: 'disconnected',
      message: 'Disconnected from server'
    };
    
    // Emit connection status event
    this.emitEvent('connection:status', { 
      connected: false, 
      message: 'Disconnected from server' 
    });
    
    this.scheduleReconnect();
  }

  /**
   * Handle connection error
   */
  private handleError(error: Error): void {
    console.error('Socket.IO connection error:', error);
    this.connected = false;
    
    // Update system status
    this.dashboardState.systemStatus.websocket = {
      status: 'error',
      message: `Connection error: ${error.message}`
    };
    
    // Emit connection status event
    this.emitEvent('connection:status', { 
      connected: false, 
      message: `Connection error: ${error.message}` 
    });
    
    this.scheduleReconnect();
  }

  /**
   * Handle dashboard state updates
   */
  private handleDashboardState(state: DashboardState): void {
    console.log('Received initial dashboard state');
    this.dashboardState = { ...this.dashboardState, ...state };
    this.emitEvent('dashboard:state', this.dashboardState);
  }

  /**
   * Handle dashboard updates
   */
  private handleDashboardUpdate(state: Partial<DashboardState>): void {
    // Update the dashboard state with new data
    if (state.gameState) {
      this.dashboardState.gameState = {
        ...this.dashboardState.gameState,
        ...state.gameState
      };
    }
    
    if (state.analytics) {
      this.dashboardState.analytics = {
        ...this.dashboardState.analytics,
        ...state.analytics
      };
    }
    
    if (state.systemStatus) {
      this.dashboardState.systemStatus = {
        ...this.dashboardState.systemStatus,
        ...state.systemStatus
      };
    }
    
    // Handle other state updates
    if (state.historyStats) this.dashboardState.historyStats = state.historyStats;
    if (state.housePosition) this.dashboardState.housePosition = state.housePosition;
    if (state.playerPosition) this.dashboardState.playerPosition = state.playerPosition;
    if (state.playerBehavior) this.dashboardState.playerBehavior = state.playerBehavior;
    if (state.trades) this.dashboardState.trades = state.trades;
    if (state.performance) this.dashboardState.performance = state.performance;
    
    // Emit dashboard update event
    this.emitEvent('dashboard:update', this.dashboardState);
  }

  /**
   * Handle system status updates
   */
  private handleStatusUpdate(status: { type: string; status: string; message: string }): void {
    if (!status || !status.type) return;
    
    // Update the system status
    if (this.dashboardState.systemStatus && this.dashboardState.systemStatus[status.type as keyof SystemStatus]) {
      (this.dashboardState.systemStatus[status.type as keyof SystemStatus] as any) = {
        status: status.status,
        message: status.message
      };
      
      // Emit status update event
      this.emitEvent('status:update', {
        type: status.type,
        status: status.status,
        message: status.message
      });
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectInterval * Math.min(this.reconnectAttempts, 5);
      
      console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
      
      this.reconnectTimer = setTimeout(() => {
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.connect();
      }, delay);
    } else {
      console.log('Max reconnect attempts reached');
      this.emitEvent('connection:status', { 
        connected: false, 
        message: 'Max reconnect attempts reached' 
      });
    }
  }

  /**
   * Subscribe to an event
   */
  on<T = any>(event: string, handler: EventHandler<T>): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    
    this.eventHandlers.get(event)!.add(handler as EventHandler);
    
    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler as EventHandler);
      }
    };
  }

  /**
   * Emit an event to all subscribers
   */
  private emitEvent(event: string, data: any): void {
    if (!this.eventHandlers.has(event)) return;
    
    this.eventHandlers.get(event)!.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Get the current dashboard state
   */
  getDashboardState(): DashboardState {
    return this.dashboardState;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Emit an event (for mock data service)
   * This allows the mock data service to emit events that simulate the Socket.IO server
   */
  emit(event: string, data: any): void {
    // Skip actual socket emission if not connected (we're in mock mode)
    // Just emit the local event to all subscribers
    this.emitEvent(event, data);
    
    // Handle special events
    if (event === 'connection:status') {
      this.connected = data.connected;
    } else if (event === 'dashboard:state') {
      this.dashboardState = { ...this.dashboardState, ...data };
    } else if (event === 'dashboard:update') {
      this.handleDashboardUpdate(data);
    }
  }
}

// Create a singleton instance
const socketClient = new SocketClient();

export default socketClient;
export type { DashboardState, GameState, Analytics, SystemStatus }; 