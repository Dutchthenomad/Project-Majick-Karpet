/**
 * Live Rugs Dashboard
 * Connects to Rugs.fun websocket and displays data in the dashboard
 */

const WebSocket = require('ws');
const EventBus = require('./core/events/event-bus');
const logger = require('./utils/logger');
const DashboardService = require('./core/services/dashboard-service');
const EnhancedDashboardService = require('./core/services/enhanced-dashboard-service');
const express = require('express');
const http = require('http');
const path = require('path');

// Configuration
const WS_URL = 'wss://api.rugs.fun/socket';
const DASHBOARD_PORT = 3001;
const SIMPLE_MODE = true; // Set to false to use EnhancedDashboardService

/**
 * WebSocket client to connect to Rugs.fun
 */
class RugsWebSocketClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.connected = false;
        this.reconnectInterval = null;
        this.heartbeatInterval = null;
        this.currentGameId = null;
        this.currentTickCount = 0;
        
        // Bind methods
        this.connect = this.connect.bind(this);
        this.handleOpen = this.handleOpen.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);
        this.reconnect = this.reconnect.bind(this);
        this.sendHeartbeat = this.sendHeartbeat.bind(this);
    }
    
    connect() {
        logger.info('Connecting to Rugs.fun WebSocket at ' + this.url);
        
        try {
            this.ws = new WebSocket(this.url);
            
            this.ws.on('open', this.handleOpen);
            this.ws.on('message', this.handleMessage);
            this.ws.on('close', this.handleClose);
            this.ws.on('error', this.handleError);
        } catch (error) {
            logger.error('Failed to connect to WebSocket:', error);
            this.reconnect();
        }
    }
    
    handleOpen() {
        this.connected = true;
        logger.info('Connected to Rugs.fun WebSocket');
        
        // Send system status update
        EventBus.emit('system:status', {
            websocket: {
                status: 'connected',
                message: 'Connected to Rugs.fun',
                lastUpdate: Date.now()
            }
        });
        
        // Clear reconnect interval if it exists
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        
        // Set up heartbeat to keep connection alive
        this.heartbeatInterval = setInterval(this.sendHeartbeat, 30000); // 30 seconds
    }
    
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            logger.debug('Received message from Rugs.fun:', message.type);
            
            // Process different message types
            if (message.type === 'game_update' || message.type === 'game_state') {
                this.handleGameUpdate(message.payload || message.data);
            } else if (message.type === 'price_update') {
                this.handlePriceUpdate(message.payload || message.data);
            } else if (message.type === 'game_start') {
                this.handleGameStart(message.payload || message.data);
            } else if (message.type === 'game_end' || message.type === 'rugged') {
                this.handleGameEnd(message.payload || message.data);
            } else {
                // Forward other messages as-is for debugging
                EventBus.emit('websocket:message', message);
            }
        } catch (error) {
            logger.error('Error processing WebSocket message:', error);
        }
    }
    
    handleGameUpdate(data) {
        // Extract information - handle different possible field names
        const gameId = data.gameId || data.game_id;
        const tickCount = data.tickCount || data.tick || 0;
        const price = data.price || data.currentPrice || 1.0;
        
        // If this is a new game, update our tracking
        if (gameId && this.currentGameId !== gameId) {
            logger.info('New game detected:', gameId);
            this.currentGameId = gameId;
            this.currentTickCount = 0;
        }
        
        // Update current tick count
        if (tickCount > this.currentTickCount) {
            this.currentTickCount = tickCount;
        }
        
        // Create game state object
        const gameState = {
            gameId: gameId,
            tickCount: tickCount,
            price: price,
            timestamp: Date.now()
        };
        
        // Emit game state to EventBus
        EventBus.emit('game:state', gameState);
        
        // Also emit as price update for services that listen specifically to that
        EventBus.emit('game:priceUpdate', {
            gameId: gameId,
            tickCount: tickCount,
            price: price,
            timestamp: Date.now()
        });
        
        logger.debug('Game update - Game: ' + gameId + ', Tick: ' + tickCount + ', Price: ' + price);
    }
    
    handlePriceUpdate(data) {
        // Handle price update
        const price = data.price || data.currentPrice || 1.0;
        
        if (this.currentGameId) {
            EventBus.emit('game:priceUpdate', {
                gameId: this.currentGameId,
                tickCount: this.currentTickCount,
                price: price,
                timestamp: Date.now()
            });
            
            logger.debug('Price update: ' + price);
        }
    }
    
    handleGameStart(data) {
        // Handle game start
        const gameId = data.gameId || data.game_id;
        
        this.currentGameId = gameId;
        this.currentTickCount = 0;
        
        // Emit game state with initial values
        EventBus.emit('game:state', {
            gameId: gameId,
            tickCount: 0,
            price: 1.0,
            timestamp: Date.now()
        });
        
        logger.info('Game started - Game: ' + gameId);
    }
    
    handleGameEnd(data) {
        // Handle game end
        const gameId = data.gameId || data.game_id || this.currentGameId;
        const finalTick = data.finalTick || data.tickCount || this.currentTickCount;
        const finalPrice = data.finalPrice || data.price || 1.0;
        
        // Emit game end event
        EventBus.emit('game:end', {
            gameId: gameId,
            finalTick: finalTick,
            finalPrice: finalPrice,
            timestamp: Date.now()
        });
        
        logger.info('Game ended - Game: ' + gameId + ', Final tick: ' + finalTick + ', Final price: ' + finalPrice);
        
        // Reset current game
        this.currentGameId = null;
        this.currentTickCount = 0;
    }
    
    handleClose() {
        this.connected = false;
        logger.warn('Disconnected from Rugs.fun WebSocket');
        
        // Send system status update
        EventBus.emit('system:status', {
            websocket: {
                status: 'disconnected',
                message: 'Disconnected from Rugs.fun',
                lastUpdate: Date.now()
            }
        });
        
        // Clear heartbeat interval
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        // Reconnect
        this.reconnect();
    }
    
    handleError(error) {
        logger.error('WebSocket error:', error);
        
        // Send system status update
        EventBus.emit('system:status', {
            websocket: {
                status: 'error',
                message: 'WebSocket error: ' + error.message,
                lastUpdate: Date.now()
            }
        });
    }
    
    reconnect() {
        if (!this.reconnectInterval) {
            logger.info('Scheduling reconnect attempt in 5 seconds');
            this.reconnectInterval = setInterval(() => {
                if (!this.connected) {
                    this.connect();
                } else {
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;
                }
            }, 5000);
        }
    }
    
    sendHeartbeat() {
        if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                // Send ping to keep connection alive
                this.ws.send(JSON.stringify({ type: 'ping' }));
                logger.debug('Sent heartbeat ping');
            } catch (error) {
                logger.error('Error sending heartbeat:', error);
                // If we can't send, the connection might be dead
                this.handleClose();
            }
        }
    }
    
    disconnect() {
        logger.info('Disconnecting from Rugs.fun WebSocket');
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        
        if (this.ws) {
            try {
                this.ws.terminate();
            } catch (error) {
                logger.error('Error terminating WebSocket:', error);
            }
            this.ws = null;
        }
        
        this.connected = false;
    }
}

/**
 * Simple Dashboard - fallback if enhanced dashboard has issues
 */
class SimpleDashboard {
    constructor(port) {
        this.port = port;
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = require('socket.io')(this.server);
        this.dashboardDir = path.join(process.cwd(), 'dashboard');
        
        // State
        this.state = {
            gameState: {
                gameId: null,
                tickCount: 0,
                price: 1.0,
                timestamp: null
            },
            analytics: {},
            systemStatus: {
                websocket: { status: 'connecting', message: 'Initializing...' },
                analytics: { status: 'waiting', message: 'Waiting for data...' },
                game: { status: 'waiting', message: 'Waiting for game...' }
            }
        };
        
        // Setup
        this.setupExpress();
        this.setupSocketIO();
        this.setupEventListeners();
    }
    
    setupExpress() {
        // Serve static files
        this.app.use(express.static(this.dashboardDir));
        
        // API routes
        this.app.get('/api/state', (req, res) => {
            res.json(this.state);
        });
    }
    
    setupSocketIO() {
        this.io.on('connection', (socket) => {
            logger.info('New client connected:', socket.id);
            
            // Send initial state
            socket.emit('dashboard:state', this.state);
            
            socket.on('disconnect', () => {
                logger.info('Client disconnected:', socket.id);
            });
        });
    }
    
    setupEventListeners() {
        // Listen for game state updates
        EventBus.on('game:state', (data) => {
            this.state.gameState = {
                ...data,
                timestamp: data.timestamp || Date.now()
            };
            
            // Update game status
            this.state.systemStatus.game = {
                status: 'active',
                message: 'Active Game: ' + data.gameId,
                lastUpdate: Date.now()
            };
            
            this.io.emit('dashboard:update', this.state);
        });
        
        // Listen for system status updates
        EventBus.on('system:status', (data) => {
            this.state.systemStatus = {
                ...this.state.systemStatus,
                ...data
            };
            
            this.io.emit('dashboard:update', this.state);
        });
        
        // Listen for analytics updates
        EventBus.on('analytics:update', (data) => {
            this.state.analytics = data;
            this.io.emit('dashboard:update', this.state);
        });
    }
    
    start() {
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, (err) => {
                if (err) {
                    logger.error('Error starting simple dashboard:', err);
                    reject(err);
                    return;
                }
                
                logger.info('Simple dashboard running on http://localhost:' + this.port);
                resolve();
            });
        });
    }
    
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.info('Simple dashboard stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

/**
 * Main function
 */
async function main() {
    try {
        logger.info('===== Starting Live Rugs Dashboard =====');
        
        // Start dashboard service
        let dashboardService;
        if (SIMPLE_MODE) {
            logger.info('Starting simple dashboard...');
            dashboardService = new SimpleDashboard(DASHBOARD_PORT);
        } else {
            logger.info('Starting enhanced dashboard service...');
            dashboardService = new EnhancedDashboardService();
        }
        
        await dashboardService.start();
        
        // Connect to Rugs.fun WebSocket
        logger.info('Connecting to Rugs.fun WebSocket...');
        const wsClient = new RugsWebSocketClient(WS_URL);
        wsClient.connect();
        
        logger.info('===== Live Rugs Dashboard Started =====');
        logger.info('Dashboard available at http://localhost:' + DASHBOARD_PORT);
        
        // Handle shutdown
        process.on('SIGINT', async () => {
            logger.info('Shutting down...');
            
            wsClient.disconnect();
            await dashboardService.stop();
            
            logger.info('Shutdown complete');
            process.exit(0);
        });
        
    } catch (error) {
        logger.error('Error starting Live Rugs Dashboard:', error);
        process.exit(1);
    }
}

// Start everything
main(); 