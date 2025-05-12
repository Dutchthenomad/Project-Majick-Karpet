/**
 * @file ws_dashboard.js
 * @description Simple dashboard for WebSocket data visualization.
 * 
 * This module provides a simple web-based dashboard for visualizing the WebSocket data
 * captured by the bot. It includes real-time visualization of WebSocket messages,
 * data structure analysis, and pattern detection.
 */

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs';
import path from 'path';
import logger from './logger.js';
import { connectToBrowser, wait } from './puppeteer_utils.js';
import { setupWebSocketListener, getWsDataStatistics, getWsDataDictionary } from './websocket_handler.js';
import { generateWsDataReport, analyzeEventPatterns, exportAllData } from './ws_analyzer.js';
import { URL } from './config.js';

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

// Directory for static files
const STATIC_DIR = './ws_dashboard';
const DATA_DIR = './ws_data_capture';

// Ensure static directory exists
function ensureStaticDirectory() {
    try {
        if (!fs.existsSync(STATIC_DIR)) {
            fs.mkdirSync(STATIC_DIR, { recursive: true });
        }
    } catch (error) {
        logger.error(`[WS Dashboard] Error creating static directory: ${error.message}`);
    }
}

// Create the dashboard HTML
function createDashboardHTML() {
    ensureStaticDirectory();
    
    const htmlPath = path.join(STATIC_DIR, 'index.html');
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebSocket Data Analyzer Dashboard</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #1e1e1e;
            color: #e0e0e0;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: #2d2d2d;
            padding: 10px 20px;
            border-bottom: 1px solid #444;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 {
            margin: 0;
            font-size: 1.5rem;
            color: #61dafb;
        }
        .stats-panel {
            background-color: #2d2d2d;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
        }
        .stat-box {
            background-color: #383838;
            padding: 10px;
            border-radius: 5px;
            text-align: center;
        }
        .stat-value {
            font-size: 1.8rem;
            font-weight: bold;
            color: #61dafb;
            margin: 10px 0;
        }
        .stat-label {
            font-size: 0.9rem;
            color: #a0a0a0;
        }
        .panels {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        .panel {
            background-color: #2d2d2d;
            padding: 15px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
        }
        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #444;
            padding-bottom: 10px;
            margin-bottom: 15px;
        }
        .panel-title {
            margin: 0;
            font-size: 1.2rem;
            color: #61dafb;
        }
        .messages-container {
            height: 400px;
            overflow-y: auto;
            background-color: #1e1e1e;
            border-radius: 5px;
            padding: 10px;
            font-family: monospace;
        }
        .message {
            margin-bottom: 8px;
            padding: 8px;
            border-radius: 3px;
            word-break: break-all;
        }
        .message-time {
            font-size: 0.8rem;
            color: #888;
        }
        .message-type {
            font-weight: bold;
            margin-right: 5px;
        }
        .message-content {
            white-space: pre-wrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .type-gameStateUpdate { background-color: #264c59; }
        .type-engine-io-control { background-color: #3a2e58; }
        .type-error { background-color: #5e2d2d; }
        .type-unknown { background-color: #3b3b3b; }
        .button {
            background-color: #2979ff;
            color: white;
            border: none;
            border-radius: 3px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 0.9rem;
        }
        .button:hover {
            background-color: #2196f3;
        }
        .chart-container {
            width: 100%;
            height: 300px;
            margin: 20px 0;
        }
        .toolbar {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }
        .nav-tabs {
            display: flex;
            border-bottom: 1px solid #444;
            margin-bottom: 15px;
        }
        .nav-tab {
            padding: 8px 15px;
            cursor: pointer;
            border-bottom: 3px solid transparent;
        }
        .nav-tab.active {
            border-bottom-color: #61dafb;
            color: #61dafb;
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>WebSocket Data Analyzer Dashboard</h1>
        <div id="connection-status">Connecting...</div>
    </div>
    
    <div class="container">
        <div class="stats-panel">
            <div class="stats-grid">
                <div class="stat-box">
                    <div class="stat-value" id="stat-message-types">0</div>
                    <div class="stat-label">Unique Message Types</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value" id="stat-total-messages">0</div>
                    <div class="stat-label">Total Messages</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value" id="stat-raw-messages">0</div>
                    <div class="stat-label">Stored Raw Messages</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value" id="stat-event-history">0</div>
                    <div class="stat-label">Event History Length</div>
                </div>
            </div>
        </div>
        
        <div class="toolbar">
            <button class="button" id="btn-generate-report">Generate Report</button>
            <button class="button" id="btn-analyze-patterns">Analyze Patterns</button>
            <button class="button" id="btn-export-data">Export All Data</button>
            <button class="button" id="btn-clear-messages">Clear Messages</button>
        </div>
        
        <div class="panels">
            <div class="panel">
                <div class="panel-header">
                    <h2 class="panel-title">Live WebSocket Messages</h2>
                    <div>
                        <label>
                            <input type="checkbox" id="pause-messages" />
                            Pause
                        </label>
                    </div>
                </div>
                <div class="messages-container" id="messages-container"></div>
            </div>
            
            <div class="panel">
                <div class="panel-header">
                    <h2 class="panel-title">Data Analysis</h2>
                </div>
                
                <div class="nav-tabs">
                    <div class="nav-tab active" data-tab="message-types">Message Types</div>
                    <div class="nav-tab" data-tab="patterns">Patterns</div>
                    <div class="nav-tab" data-tab="structure">Structure</div>
                </div>
                
                <div class="tab-content active" id="tab-message-types">
                    <div id="message-types-chart" class="chart-container"></div>
                    <div id="message-types-list"></div>
                </div>
                
                <div class="tab-content" id="tab-patterns">
                    <div id="patterns-container">
                        <p>Click "Analyze Patterns" to generate pattern analysis.</p>
                    </div>
                </div>
                
                <div class="tab-content" id="tab-structure">
                    <div id="structure-container">
                        <p>Select a message type:</p>
                        <select id="structure-select"></select>
                        <div id="structure-details"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let messagesContainer = document.getElementById('messages-container');
        let pauseMessages = document.getElementById('pause-messages');
        let connectionStatus = document.getElementById('connection-status');
        let messageTypesList = document.getElementById('message-types-list');
        let structureSelect = document.getElementById('structure-select');
        let structureDetails = document.getElementById('structure-details');
        
        // Stats elements
        let statMessageTypes = document.getElementById('stat-message-types');
        let statTotalMessages = document.getElementById('stat-total-messages');
        let statRawMessages = document.getElementById('stat-raw-messages');
        let statEventHistory = document.getElementById('stat-event-history');
        
        // Button handlers
        document.getElementById('btn-generate-report').addEventListener('click', () => {
            socket.emit('generate-report');
        });
        
        document.getElementById('btn-analyze-patterns').addEventListener('click', () => {
            socket.emit('analyze-patterns');
        });
        
        document.getElementById('btn-export-data').addEventListener('click', () => {
            socket.emit('export-data');
        });
        
        document.getElementById('btn-clear-messages').addEventListener('click', () => {
            messagesContainer.innerHTML = '';
        });
        
        // Tab handling
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                // Remove active class from all tabs
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                
                // Add active class to clicked tab
                this.classList.add('active');
                
                // Show corresponding tab content
                const tabId = this.getAttribute('data-tab');
                document.getElementById('tab-' + tabId).classList.add('active');
            });
        });
        
        // Socket events
        socket.on('connect', () => {
            connectionStatus.textContent = 'Connected';
            connectionStatus.style.color = '#4caf50';
        });
        
        socket.on('disconnect', () => {
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.style.color = '#f44336';
        });
        
        socket.on('stats-update', (stats) => {
            statMessageTypes.textContent = stats.totalUniqueMessageTypes;
            statTotalMessages.textContent = stats.totalMessages;
            statRawMessages.textContent = stats.storedRawMessages;
            statEventHistory.textContent = stats.eventHistoryLength;
            
            // Update message types list
            messageTypesList.innerHTML = '<h3>Top Message Types</h3><ul>';
            stats.topMessageTypes.forEach(({ type, count }) => {
                messageTypesList.innerHTML += \`<li>\${type}: \${count} messages</li>\`;
            });
            messageTypesList.innerHTML += '</ul>';
            
            // Update structure select
            if (stats.messageTypes) {
                structureSelect.innerHTML = '<option value="">Select a message type</option>';
                Object.keys(stats.messageTypes).forEach(type => {
                    structureSelect.innerHTML += \`<option value="\${type}">\${type}</option>\`;
                });
            }
        });
        
        socket.on('new-message', (message) => {
            if (pauseMessages.checked) return;
            
            const messageEl = document.createElement('div');
            messageEl.className = \`message type-\${getMessageTypeClass(message.type)}\`;
            
            const time = new Date().toLocaleTimeString();
            messageEl.innerHTML = \`
                <div class="message-time">\${time}</div>
                <span class="message-type">\${message.type}</span>
                <div class="message-content">\${JSON.stringify(message.data).slice(0, 200)}...</div>
            \`;
            
            messagesContainer.appendChild(messageEl);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            // Limit displayed messages to 100
            while (messagesContainer.children.length > 100) {
                messagesContainer.removeChild(messagesContainer.children[0]);
            }
        });
        
        socket.on('report-generated', (reportPath) => {
            alert(\`Report generated: \${reportPath}\`);
        });
        
        socket.on('patterns-analyzed', (patterns) => {
            if (patterns.error) {
                document.getElementById('patterns-container').innerHTML = \`<p>Error: \${patterns.error}</p>\`;
                return;
            }
            
            let html = '<h3>Event Patterns</h3>';
            
            // Display sequence patterns
            if (patterns.sequencePatterns) {
                html += '<h4>Sequence Patterns</h4><ul>';
                Object.entries(patterns.sequencePatterns).forEach(([length, patterns]) => {
                    html += \`<li>\${length}:</li><ul>\`;
                    patterns.forEach(pattern => {
                        html += \`<li>\${pattern.pattern} (Count: \${pattern.count}, Frequency: \${pattern.frequency})</li>\`;
                    });
                    html += '</ul>';
                });
                html += '</ul>';
            }
            
            // Display event distribution
            if (patterns.eventTypeDistribution) {
                html += '<h4>Event Type Distribution</h4><ul>';
                Object.entries(patterns.eventTypeDistribution)
                    .slice(0, 10)
                    .forEach(([type, count]) => {
                        html += \`<li>\${type}: \${count}</li>\`;
                    });
                html += '</ul>';
            }
            
            document.getElementById('patterns-container').innerHTML = html;
        });
        
        socket.on('data-exported', (exportPath) => {
            alert(\`Data exported: \${exportPath}\`);
        });
        
        socket.on('structure-details', (details) => {
            structureDetails.innerHTML = \`
                <h3>\${details.type}</h3>
                <p>First seen: \${details.firstSeen}</p>
                <h4>Structure:</h4>
                <pre>\${JSON.stringify(details.structure, null, 2)}</pre>
                <h4>Example:</h4>
                <pre>\${JSON.stringify(details.example, null, 2)}</pre>
            \`;
        });
        
        // Utility functions
        function getMessageTypeClass(type) {
            if (!type) return 'unknown';
            if (type === 'gameStateUpdate') return 'gameStateUpdate';
            if (type === 'engine.io.control') return 'engine-io-control';
            if (type.includes('error')) return 'error';
            return 'unknown';
        }
        
        // Structure select event
        structureSelect.addEventListener('change', function() {
            if (this.value) {
                socket.emit('get-structure', this.value);
            } else {
                structureDetails.innerHTML = '';
            }
        });
        
        // Request initial stats
        socket.emit('get-stats');
    </script>
</body>
</html>`;
    
    fs.writeFileSync(htmlPath, html);
    logger.info(`[WS Dashboard] Created dashboard HTML: ${htmlPath}`);
    return htmlPath;
}

// Create and start the dashboard
async function startDashboard() {
    try {
        // Create the dashboard HTML
        createDashboardHTML();
        
        // Set up Express routes
        app.use(express.static(STATIC_DIR));
        app.use('/data', express.static(DATA_DIR));
        
        // Set up Socket.IO
        io.on('connection', (socket) => {
            logger.info('[WS Dashboard] Client connected to dashboard');
            
            // Send initial stats
            socket.on('get-stats', () => {
                const stats = getWsDataStatistics();
                socket.emit('stats-update', stats);
            });
            
            // Handle report generation
            socket.on('generate-report', async () => {
                const reportPath = generateWsDataReport();
                socket.emit('report-generated', reportPath);
            });
            
            // Handle pattern analysis
            socket.on('analyze-patterns', async () => {
                const patterns = analyzeEventPatterns();
                socket.emit('patterns-analyzed', patterns);
            });
            
            // Handle data export
            socket.on('export-data', async () => {
                // This would be implemented in ws_analyzer.js
                const exportPath = 'Not implemented yet'; // Replace with actual export function
                socket.emit('data-exported', exportPath);
            });
            
            // Handle structure details request
            socket.on('get-structure', (type) => {
                const dictionary = getWsDataDictionary();
                if (dictionary.eventStructure[type]) {
                    socket.emit('structure-details', {
                        type,
                        ...dictionary.eventStructure[type]
                    });
                }
            });
            
            socket.on('disconnect', () => {
                logger.info('[WS Dashboard] Client disconnected from dashboard');
            });
        });
        
        // Start the server
        const PORT = 3002; // Use a different port than other dashboards
        server.listen(PORT, () => {
            logger.info(`[WS Dashboard] Server running at http://localhost:${PORT}`);
        });
        
        return true;
    } catch (error) {
        logger.error(`[WS Dashboard] Error starting dashboard: ${error.message}`);
        return false;
    }
}

// Start the browser and connect to WebSocket
async function startBrowserAndConnect() {
    try {
        logger.info('[WS Dashboard] Starting browser connection...');
        const browser = await connectToBrowser();
        if (!browser) throw new Error('Failed to connect to or launch browser.');
        
        const pages = await browser.pages();
        const page = pages.length > 0 ? pages[0] : await browser.newPage();
        logger.info(`[WS Dashboard] Navigating to: ${URL}`);
        
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(URL, { waitUntil: 'networkidle2' });
        logger.info('[WS Dashboard] Page navigated successfully.');
        await wait(1000);
        
        const ws = await setupWebSocketListener(page);
        if (!ws) throw new Error('Failed to set up WebSocket listener.');
        logger.info('[WS Dashboard] WebSocket listener attached.');
        
        // Forward WebSocket messages to dashboard clients
        ws.on('message', (parsedData) => {
            // Send to all connected clients
            io.emit('new-message', parsedData);
            
            // Update stats periodically (every 10 messages)
            if (Math.random() < 0.1) {
                const stats = getWsDataStatistics();
                io.emit('stats-update', stats);
            }
        });
        
        ws.on('close', () => {
            logger.error('[WS Dashboard] WebSocket connection closed unexpectedly.');
            process.exit(1);
        });
        
        return { browser, page, ws };
    } catch (error) {
        logger.error(`[WS Dashboard] Error connecting to browser: ${error.message}`);
        return null;
    }
}

// Main function
async function main() {
    try {
        // Start the dashboard
        const dashboardStarted = await startDashboard();
        if (!dashboardStarted) {
            throw new Error('Failed to start dashboard.');
        }
        
        // Connect to browser and WebSocket
        const connection = await startBrowserAndConnect();
        if (!connection) {
            throw new Error('Failed to connect to browser or WebSocket.');
        }
        
        logger.info('[WS Dashboard] Dashboard is running. Open http://localhost:3002 in your browser.');
        logger.info('[WS Dashboard] Press Ctrl+C to exit.');
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            logger.info('[WS Dashboard] Shutting down...');
            
            if (connection && connection.browser) {
                await connection.browser.close();
            }
            
            process.exit(0);
        });
        
        // Keep the process running
        await new Promise(() => {});
    } catch (error) {
        logger.error(`[WS Dashboard] Fatal error: ${error.message}`);
        process.exit(1);
    }
}

// Start the dashboard
main(); 