import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import io from 'socket.io-client';

// If you already have a shared socket, pass it as a prop. Otherwise, create here for demo:
const SOCKET_URL = 'http://localhost:3001';
const defaultSocket = io(SOCKET_URL);

/**
 * GameStateWidget
 * Displays core live game metrics: Game ID, Tick Count, Candle/Index, Price, Timestamp
 * Listens to 'dashboard:state' event from backend
 */
export function GameStateWidget({ socket = defaultSocket }) {
  const [gameState, setGameState] = useState({});

  useEffect(() => {
    // Listen to dashboard:state event
    function handleDashboardState(data) {
      if (data && data.gameState) {
        setGameState(data.gameState);
      }
    }
    socket.on('dashboard:state', handleDashboardState);
    // Cleanup
    return () => socket.off('dashboard:state', handleDashboardState);
  }, [socket]);

  return (
    <div className="widget game-state-widget">
      <h3>Game State</h3>
      <div><strong>Game ID:</strong> {gameState.gameId || '—'}</div>
      <div><strong>Tick Count:</strong> {gameState.tickCount ?? '—'}</div>
      <div><strong>Candle/Index:</strong> {gameState.candle?.index ?? '—'}</div>
      <div><strong>Price:</strong> {gameState.price !== undefined ? gameState.price : '—'}</div>
      <div className="timestamp">
        <small>Last updated: {gameState.timestamp ? new Date(gameState.timestamp).toLocaleTimeString() : '—'}</small>
      </div>
    </div>
  );
}

GameStateWidget.propTypes = {
  socket: PropTypes.object,
};
