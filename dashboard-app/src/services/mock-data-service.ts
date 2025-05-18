import socketClient, { DashboardState, GameState } from './socket-client';

/**
 * Mock Data Service 
 * 
 * This service provides simulated data for testing the dashboard UI without a backend
 * It periodically emits events that mimic the real Socket.IO server
 */
class MockDataService {
  private interval: NodeJS.Timeout | null = null;
  private gameId = 'MK-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  private tickCount = 0;
  private price = 1.0;
  private rugProbability = 0.05;
  private entryStrength = 60;
  private exitStrength = 30;
  private isStarted = false;

  /**
   * Start the mock data service
   */
  start() {
    if (this.isStarted) return;
    
    // Tell socket client to skip real connection attempts in mock mode
    socketClient.connect(true); // true = mockOnly
    
    // Generate initial state
    const initialState: DashboardState = {
      gameState: {
        gameId: this.gameId,
        tickCount: this.tickCount,
        price: this.price,
      },
      analytics: {
        rugProbability: {
          nextTickProbability: this.rugProbability,
          isHighRiskWindow: false,
          windowStart: 0,
          windowEnd: 0
        },
        compositeSignals: {
          entryStrength: this.entryStrength,
          exitStrength: this.exitStrength,
          optimalPositionSize: 5,
          generatedAt: new Date().toISOString()
        }
      },
      systemStatus: {
        websocket: { status: 'connected', message: 'Mock data service connected' },
        database: { status: 'connected', message: 'Mock database connected' },
        analytics: { status: 'active', message: 'Mock analytics processing' },
        game: { status: 'active', message: 'Mock game running' }
      }
    };

    // Emit connection event
    socketClient.emit('connection:status', { connected: true, message: 'Mock service connected' });
    
    // Emit initial state
    socketClient.emit('dashboard:state', initialState);
    
    // Start interval to emit updates
    this.interval = setInterval(() => this.generateUpdate(), 2000);
    this.isStarted = true;
    
    console.log('[Mock Data Service] Started');
  }

  /**
   * Stop the mock data service
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    socketClient.emit('connection:status', { connected: false, message: 'Mock service disconnected' });
    this.isStarted = false;
    
    console.log('[Mock Data Service] Stopped');
  }

  /**
   * Generate and emit a data update
   */
  private generateUpdate() {
    // Increment tick
    this.tickCount += 1;
    
    // Update price - some randomness with trend based on tick count
    const trend = Math.sin(this.tickCount / 20) * 0.5; // Oscillating trend
    const randomChange = (Math.random() - 0.48 + trend) * 0.05;  // Slightly skewed random
    this.price = Math.max(0.5, this.price * (1 + randomChange));
    
    // Update risk - increases with tick count
    this.rugProbability = 0.05 + (this.tickCount / 400); // max around 0.55 at tick 200
    
    // Is high risk window?
    const isHighRiskWindow = this.rugProbability > 0.3 || (this.tickCount > 150 && Math.random() > 0.7);
    
    // Update signal strengths - inverse relationship
    // As tick count increases, entry strength decreases and exit strength increases
    this.entryStrength = Math.max(5, Math.min(95, 90 - (this.tickCount / 3)));
    this.exitStrength = Math.max(5, Math.min(95, 10 + (this.tickCount / 2)));
    
    // Create update
    const update: DashboardState = {
      gameState: {
        gameId: this.gameId,
        tickCount: this.tickCount,
        price: this.price,
        timestamp: new Date().toISOString()
      },
      analytics: {
        rugProbability: {
          nextTickProbability: this.rugProbability,
          isHighRiskWindow,
          windowStart: isHighRiskWindow ? this.tickCount : 0,
          windowEnd: isHighRiskWindow ? this.tickCount + 20 : 0
        },
        compositeSignals: {
          entryStrength: this.entryStrength,
          exitStrength: this.exitStrength,
          optimalPositionSize: Math.max(1, Math.min(15, Math.round(this.entryStrength / 10))),
          generatedAt: new Date().toISOString()
        }
      }
    };
    
    // Simulate game end and restart
    if (this.tickCount >= 200 || (this.tickCount > 100 && Math.random() > 0.99)) {
      // Game ended - reset
      console.log('[Mock Data Service] Game ended, starting new game');
      this.gameId = 'MK-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      this.tickCount = 0;
      this.price = 1.0;
      this.rugProbability = 0.05;
      
      // Create game end update
      update.gameState = {
        gameId: null,
        tickCount: 0,
        price: 0,
        timestamp: new Date().toISOString()
      };
      
      // Emit end of game
      socketClient.emit('dashboard:update', update);
      
      // After short delay, start new game
      setTimeout(() => {
        const newGameUpdate: DashboardState = {
          gameState: {
            gameId: this.gameId,
            tickCount: this.tickCount,
            price: this.price,
            timestamp: new Date().toISOString()
          },
          analytics: {
            rugProbability: {
              nextTickProbability: this.rugProbability,
              isHighRiskWindow: false,
              windowStart: 0,
              windowEnd: 0
            },
            compositeSignals: {
              entryStrength: 75,
              exitStrength: 10,
              optimalPositionSize: 7,
              generatedAt: new Date().toISOString()
            }
          }
        };
        socketClient.emit('dashboard:update', newGameUpdate);
      }, 3000);
    } else {
      // Emit regular update
      socketClient.emit('dashboard:update', update);
    }
  }
}

// Create a singleton instance
const mockDataService = new MockDataService();

export default mockDataService; 