// Simple test Socket.IO client for Majick Karpet dashboard backend
// Usage: node dashboard-socketio-client.js

const io = require('socket.io-client');

const SOCKET_URL = 'http://localhost:3001'; // Adjust if needed
const socket = io(SOCKET_URL, { transports: ['websocket'] });

console.log('Connecting to', SOCKET_URL);

socket.on('connect', () => {
    console.log('Connected to dashboard backend. Socket ID:', socket.id);
});

// Listen to main dashboard state
socket.on('dashboard:state', (data) => {
    console.log('[dashboard:state]', JSON.stringify(data, null, 2));
});

// Listen to all actionable events (add more as needed)
socket.on('trade:executed', (data) => {
    console.log('[trade:executed]', data);
});
socket.on('player:position', (data) => {
    console.log('[player:position]', data);
});
socket.on('player:behavior', (data) => {
    console.log('[player:behavior]', data);
});
socket.on('house:position', (data) => {
    console.log('[house:position]', data);
});
socket.on('performance:session', (data) => {
    console.log('[performance:session]', data);
});
socket.on('analytics:rugProbability', (data) => {
    console.log('[analytics:rugProbability]', data);
});
socket.on('analytics:patterns', (data) => {
    console.log('[analytics:patterns]', data);
});
socket.on('analytics:compositeSignals', (data) => {
    console.log('[analytics:compositeSignals]', data);
});
socket.on('risk:update', (data) => {
    console.log('[risk:update]', data);
});

// Handle disconnects
socket.on('disconnect', () => {
    console.log('Disconnected from dashboard backend.');
});
