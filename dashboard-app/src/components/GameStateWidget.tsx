import React, { useEffect, useState } from 'react';
import WidgetBase from './widgets/WidgetBase';
import socketClient, { GameState, DashboardState } from '@/services/socket-client';

interface GameStateWidgetProps {
  id?: string;
  className?: string;
  refreshInterval?: number;
}

const GameStateWidget: React.FC<GameStateWidgetProps> = ({
  id = 'game-state-widget',
  className = '',
  refreshInterval = 1000
}) => {
  const [gameState, setGameState] = useState<GameState>({
    gameId: null,
    tickCount: 0,
    price: 1.0
  });
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('Never');

  useEffect(() => {
    // Connect to the socket server if not already connected
    if (!socketClient.isConnected()) {
      socketClient.connect();
    }

    // Listen for dashboard updates
    const unsubscribeUpdate = socketClient.on('dashboard:update', (data: DashboardState) => {
      if (data.gameState) {
        setGameState(data.gameState);
        setLastUpdate(new Date().toLocaleTimeString());
      }
    });

    // Listen for initial state
    const unsubscribeState = socketClient.on('dashboard:state', (data: DashboardState) => {
      if (data.gameState) {
        setGameState(data.gameState);
        setLastUpdate(new Date().toLocaleTimeString());
      }
    });

    // Listen for connection status changes
    const unsubscribeConnection = socketClient.on('connection:status', (status: { connected: boolean }) => {
      setConnected(status.connected);
    });

    // Initial state
    setConnected(socketClient.isConnected());
    const initialState = socketClient.getDashboardState();
    if (initialState.gameState) {
      setGameState(initialState.gameState);
    }

    // Cleanup function
    return () => {
      unsubscribeUpdate();
      unsubscribeState();
      unsubscribeConnection();
    };
  }, []);

  // Format price with 2 decimal places
  const formattedPrice = gameState.price ? `${gameState.price.toFixed(2)}x` : '1.00x';

  // Get price CSS class based on value
  const getPriceClass = () => {
    if (gameState.price > 2) return 'text-success';
    if (gameState.price > 1.5) return 'text-info';
    if (gameState.price < 1) return 'text-destructive';
    return '';
  };

  const handleRefresh = () => {
    // This is a manual refresh - we could request updated data here if needed
    // For now, just update the timestamp to show the widget responded
    setLastUpdate(new Date().toLocaleTimeString());
  };

  return (
    <WidgetBase
      id={id}
      title="Game State"
      className={`game-state-widget ${className}`}
      refreshInterval={refreshInterval}
      collapsible={true}
      onRefresh={handleRefresh}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="metric">
          <div className="metric-label">Game ID</div>
          <div className="metric-value font-mono">{gameState.gameId || '—'}</div>
        </div>
        
        <div className="metric">
          <div className="metric-label">Tick Count</div>
          <div className="metric-value">{gameState.tickCount ?? '0'}</div>
        </div>
        
        <div className="metric">
          <div className="metric-label">Current Price</div>
          <div className={`metric-value ${getPriceClass()}`}>{formattedPrice}</div>
        </div>
        
        <div className="metric">
          <div className="metric-label">Status</div>
          <div className="metric-value">
            <span className={`badge ${connected ? 'bg-success' : 'bg-destructive'}`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
      
      <div className="timestamp mt-4 text-right">
        Last updated: {lastUpdate}
      </div>
    </WidgetBase>
  );
};

export default GameStateWidget; 