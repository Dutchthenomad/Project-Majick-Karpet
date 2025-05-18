const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const EventBus = require('./core/events/event-bus');
const logger = require('./utils/logger');

// Create a simple dashboard server
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Dashboard state
const dashboardState = {
    gameState: {
        gameId: null,
        tickCount: 0,
        price: 1.0
    },
    analytics: {},
    historyStats: { avgGameLength: 180 },
    systemStatus: {
        websocket: { status: 'connecting', message: 'Initializing connection...', lastUpdate: Date.now() },
        database: { status: 'loading', message: 'Checking database connection...', lastUpdate: Date.now() },
        analytics: { status: 'initializing', message: 'Starting analytics services...', lastUpdate: Date.now() },
        game: { status: 'waiting', message: 'Waiting for game...' }
    }
};

// Create dashboard directory
const dashboardDir = path.join(process.cwd(), 'dashboard');
if (!fs.existsSync(dashboardDir)) {
    fs.mkdirSync(dashboardDir, { recursive: true });
}

// Create a basic HTML template
const htmlPath = path.join(dashboardDir, 'index.html');
const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simple Analytics Dashboard</title>
    <style>
        :root {
            --bg-color: #121212;
            --card-bg: #1e1e1e;
            --text-color: #f0f0f0;
            --accent-color: #6200ea;
            --success-color: #00c853;
            --warning-color: #ffd600;
            --danger-color: #ff3d00;
            --info-color: #2196f3;
            --border-radius: 8px;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            margin: 0;
            padding: 20px;
            overflow-x: hidden;
            overflow-y: auto;
        }
        
        .dashboard {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            grid-auto-rows: minmax(min-content, max-content);
            gap: 20px;
            width: 100%;
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .card {
            background-color: var(--card-bg);
            border-radius: var(--border-radius);
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
            overflow: hidden;
            height: fit-content;
        }
        
        .card-header {
            font-size: 1.3rem;
            font-weight: bold;
            margin-bottom: 15px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 10px;
        }
        
        .status-panel {
            grid-column: 1 / 5;
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 15px;
        }
        
        .status-indicator {
            display: flex;
            align-items: center;
            margin-right: 15px;
        }
        
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 5px;
        }
        
        .status-green {
            background-color: var(--success-color);
            box-shadow: 0 0 5px var(--success-color);
        }
        
        .status-yellow {
            background-color: var(--warning-color);
            box-shadow: 0 0 5px var(--warning-color);
        }
        
        .status-red {
            background-color: var(--danger-color);
            box-shadow: 0 0 5px var(--danger-color);
        }
        
        .status-gray {
            background-color: #666;
        }
        
        .value-large {
            font-size: 2.5rem;
            font-weight: bold;
            margin: 10px 0;
        }
        
        .debug-panel {
            grid-column: 1 / 5;
            grid-row: 3 / 5;
        }
    </style>
</head>
<body>
    <div class="dashboard">
        <!-- System Status Panel -->
        <div class="card status-panel">
            <div class="card-header">System Status</div>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; width: 100%;">
                <div class="status-indicator">
                    <div id="websocket-status" class="status-dot status-gray"></div>
                    <span>WebSocket: <span id="websocket-status-text">Connecting...</span></span>
                </div>
                <div class="status-indicator">
                    <div id="analytics-status" class="status-dot status-gray"></div>
                    <span>Analytics: <span id="analytics-status-text">Initializing...</span></span>
                </div>
                <div class="status-indicator">
                    <div id="game-status" class="status-dot status-gray"></div>
                    <span>Active Game: <span id="game-status-text">Waiting...</span></span>
                </div>
                <div class="status-indicator">
                    <div id="last-update-status" class="status-dot status-gray"></div>
                    <span>Last Update: <span id="last-update-text">Never</span></span>
                </div>
            </div>
        </div>
        
        <!-- Simple Game Info -->
        <div class="card game-info" style="grid-column: 1 / 5; grid-row: 2;">
            <div class="card-header">Game Information</div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                <div>
                    <h3>Game ID:</h3>
                    <div id="game-id" class="value-large" style="color: #ff9800; font-family: monospace;">-</div>
                </div>
                <div>
                    <h3>Tick Count:</h3>
                    <div id="tick-count" class="value-large" style="color: #ff9800;">0</div>
                </div>
                <div>
                    <h3>Current Price:</h3>
                    <div id="current-price" class="value-large">1.00x</div>
                </div>
                <div>
                    <h3>Last Update:</h3>
                    <div id="data-timestamp" class="value-large">Never</div>
                </div>
            </div>
        </div>

        <!-- Debug Output -->
        <div class="card debug-panel" style="grid-column: 1 / 5; grid-row: 3;">
            <div class="card-header">Debug Information</div>
            <div>
                <h3>Raw Data Received:</h3>
                <pre id="debug-output" style="background: #333; padding: 10px; max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; color: #8f8;">Waiting for data...</pre>
            </div>
        </div>
    </div>
    
    <script src="/socket.io/socket.io.js"></script>
    <script>
        // Connect to the server
        const socket = io();
        
        // Dashboard elements
        const elements = {
            gameId: document.getElementById('game-id'),
            tickCount: document.getElementById('tick-count'),
            currentPrice: document.getElementById('current-price'),
            dataTimestamp: document.getElementById('data-timestamp'),
            debugOutput: document.getElementById('debug-output'),
            
            // Status elements
            websocketStatus: document.getElementById('websocket-status'),
            websocketStatusText: document.getElementById('websocket-status-text'),
            analyticsStatus: document.getElementById('analytics-status'),
            analyticsStatusText: document.getElementById('analytics-status-text'),
            gameStatus: document.getElementById('game-status'),
            gameStatusText: document.getElementById('game-status-text'),
            lastUpdateStatus: document.getElementById('last-update-status'),
            lastUpdateText: document.getElementById('last-update-text')
        };
        
        // Debug log function
        function debugLog(message, data) {
            const timestamp = new Date().toISOString();
            const logMsg = '[' + timestamp + '] ' + message;
            
            console.log(logMsg, data);
            
            // Update debug panel
            const debugPanel = elements.debugOutput;
            const formattedData = data ? JSON.stringify(data, null, 2) : '';
            debugPanel.innerHTML = logMsg + (formattedData ? '\\n' + formattedData : '') + '\\n\\n' + debugPanel.innerHTML;
            
            // Keep only last entries
            if (debugPanel.innerHTML.length > 5000) {
                debugPanel.innerHTML = debugPanel.innerHTML.substring(0, 5000) + '... (truncated)';
            }
        }
        
        // Update the dashboard with new state
        function updateDashboard(state) {
            // First log the full state for debugging
            debugLog('Received dashboard update', {
                gameId: state.gameState?.gameId,
                tickCount: state.gameState?.tickCount,
                price: state.gameState?.price,
                hasAnalytics: !!state.analytics?.gamePhase
            });
            
            // Update timestamp
            const now = new Date();
            elements.dataTimestamp.textContent = now.toLocaleTimeString();
            elements.lastUpdateText.textContent = 'Just now';
            elements.lastUpdateStatus.className = 'status-dot status-green';
            
            // Game info
            if (state.gameState) {
                if (state.gameState.gameId) {
                    elements.gameId.textContent = state.gameState.gameId || '-';
                    elements.gameStatus.className = 'status-dot status-green';
                    elements.gameStatusText.textContent = 'Active: ' + state.gameState.gameId;
                }
                
                if (state.gameState.tickCount !== undefined) {
                    elements.tickCount.textContent = state.gameState.tickCount || '0';
                }
                
                if (state.gameState.price !== undefined) {
                    elements.currentPrice.textContent = state.gameState.price ? 
                        state.gameState.price.toFixed(2) + 'x' : '1.00x';
                }
            }
            
            // Update system status
            if (state.systemStatus) {
                updateStatusIndicators(state.systemStatus);
            }
        }
        
        // Update status indicators
        function updateStatusIndicators(statusData) {
            for (const [type, data] of Object.entries(statusData)) {
                const statusDot = elements[type + 'Status'];
                const statusText = elements[type + 'StatusText'];
                
                if (!statusDot || !statusText) continue;
                
                // Update status dot class
                statusDot.className = 'status-dot';
                
                switch (data.status) {
                    case 'active':
                    case 'connected':
                    case 'ready':
                        statusDot.classList.add('status-green');
                        break;
                    case 'connecting':
                    case 'loading':
                    case 'initializing':
                    case 'waiting':
                        statusDot.classList.add('status-yellow');
                        break;
                    case 'error':
                    case 'disconnected':
                        statusDot.classList.add('status-red');
                        break;
                    default:
                        statusDot.classList.add('status-gray');
                }
                
                // Update status text
                statusText.textContent = data.message || data.status;
            }
        }
        
        // Socket.IO event handlers
        socket.on('connect', () => {
            debugLog('Connected to server');
            elements.websocketStatus.className = 'status-dot status-green';
            elements.websocketStatusText.textContent = 'Connected';
        });
        
        socket.on('disconnect', () => {
            debugLog('Disconnected from server');
            elements.websocketStatus.className = 'status-dot status-red';
            elements.websocketStatusText.textContent = 'Disconnected';
        });
        
        socket.on('dashboard:state', (state) => {
            debugLog('Received initial state', state);
            updateDashboard(state);
        });
        
        socket.on('dashboard:update', (state) => {
            updateDashboard(state);
        });
        
        socket.on('status:update', (statusUpdate) => {
            debugLog('Received status update', statusUpdate);
            
            if (statusUpdate.type && statusUpdate.status) {
                const statusData = {};
                statusData[statusUpdate.type] = {
                    status: statusUpdate.status,
                    message: statusUpdate.message,
                    lastUpdate: statusUpdate.timestamp
                };
                
                updateStatusIndicators(statusData);
            }
        });
        
        // Initialize
        debugLog('Dashboard initialized, waiting for initial data');
    </script>
</body>
</html>`;

fs.writeFileSync(htmlPath, html);
logger.info('Created dashboard HTML at ' + htmlPath);

// Serve static files
app.use(express.static(dashboardDir));

// API endpoints
app.get('/api/state', (req, res) => {
    res.json(dashboardState);
});

// Socket.IO connection
io.on('connection', (socket) => {
    logger.info('New client connected: ' + socket.id);
    
    // Send initial state
    socket.emit('dashboard:state', dashboardState);
    
    // Handle disconnection
    socket.on('disconnect', () => {
        logger.info('Client disconnected: ' + socket.id);
    });
});

// Subscribe to events
EventBus.on('game:state', (payload) => {
    logger.debug('Received game:state event');
    
    // Update dashboard state
    dashboardState.gameState = {
        ...dashboardState.gameState,
        gameId: payload.gameId !== undefined ? payload.gameId : dashboardState.gameState?.gameId,
        tickCount: payload.tickCount !== undefined ? payload.tickCount : dashboardState.gameState?.tickCount,
        price: payload.price !== undefined ? payload.price : dashboardState.gameState?.price,
        timestamp: new Date().toISOString()
    };
    
    // Update game status
    dashboardState.systemStatus.game = {
        status: 'active',
        message: 'Active: Game #' + dashboardState.gameState.gameId,
        lastUpdate: Date.now()
    };
    
    // Emit update to all clients
    io.emit('dashboard:update', dashboardState);
    logger.debug('Emitted dashboard update after game state change');
});

EventBus.on('analytics:gamePhase', (payload) => {
    logger.debug('Received analytics:gamePhase event');
    
    if (!dashboardState.analytics) {
        dashboardState.analytics = {};
    }
    
    dashboardState.analytics.gamePhase = payload;
    
    // Update analytics status
    dashboardState.systemStatus.analytics = {
        status: 'active',
        message: 'Processing analytics data',
        lastUpdate: Date.now()
    };
    
    // Emit update to all clients
    io.emit('dashboard:update', dashboardState);
});

// Start the server
const PORT = 3001;
server.listen(PORT, () => {
    logger.info('Simple dashboard server running on http://localhost:' + PORT);
    logger.info('Open this URL in your browser to view the dashboard');
});

// Handle process termination
process.on('SIGINT', () => {
    logger.info('Simple dashboard shutting down');
    server.close(() => {
        process.exit(0);
    });
});

// Log that we're ready
logger.info('Simple dashboard server ready and waiting for events'); 