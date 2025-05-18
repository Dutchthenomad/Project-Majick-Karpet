import React, { useEffect, useState } from 'react';
import WidgetBase from './widgets/WidgetBase';
import socketClient, { DashboardState } from '@/services/socket-client';

interface SignalPanelWidgetProps {
  id?: string;
  className?: string;
  refreshInterval?: number;
}

interface SignalState {
  entryStrength: number;
  exitStrength: number;
  optimalPositionSize: number;
  generatedAt?: string;
}

const SignalPanelWidget: React.FC<SignalPanelWidgetProps> = ({
  id = 'signal-panel-widget',
  className = '',
  refreshInterval = 1000
}) => {
  const [signalState, setSignalState] = useState<SignalState>({
    entryStrength: 50,
    exitStrength: 50,
    optimalPositionSize: 5,
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
      if (data.analytics?.compositeSignals) {
        setSignalState({
          entryStrength: data.analytics.compositeSignals.entryStrength,
          exitStrength: data.analytics.compositeSignals.exitStrength,
          optimalPositionSize: data.analytics.compositeSignals.optimalPositionSize,
          generatedAt: data.analytics.compositeSignals.generatedAt
        });
        setLastUpdate(new Date().toLocaleTimeString());
      }
    });

    // Listen for initial state
    const unsubscribeState = socketClient.on('dashboard:state', (data: DashboardState) => {
      if (data.analytics?.compositeSignals) {
        setSignalState({
          entryStrength: data.analytics.compositeSignals.entryStrength,
          exitStrength: data.analytics.compositeSignals.exitStrength,
          optimalPositionSize: data.analytics.compositeSignals.optimalPositionSize,
          generatedAt: data.analytics.compositeSignals.generatedAt
        });
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
    if (initialState.analytics?.compositeSignals) {
      setSignalState({
        entryStrength: initialState.analytics.compositeSignals.entryStrength,
        exitStrength: initialState.analytics.compositeSignals.exitStrength,
        optimalPositionSize: initialState.analytics.compositeSignals.optimalPositionSize,
        generatedAt: initialState.analytics.compositeSignals.generatedAt
      });
    }

    // Cleanup function
    return () => {
      unsubscribeUpdate();
      unsubscribeState();
      unsubscribeConnection();
    };
  }, []);

  // Get signal strength color based on value
  const getStrengthColor = (strength: number, isEntry = true) => {
    // Entry signals: high = good
    if (isEntry) {
      if (strength > 70) return 'text-success';
      if (strength > 40) return 'text-warning';
      return 'text-destructive';
    } 
    // Exit signals: high = danger
    else {
      if (strength > 70) return 'text-destructive';
      if (strength > 40) return 'text-warning';
      return 'text-success';
    }
  };

  const handleRefresh = () => {
    // This is a manual refresh - we could request updated data here
    setLastUpdate(new Date().toLocaleTimeString());
  };

  return (
    <WidgetBase
      id={id}
      title="Signal Panel"
      className={`signal-panel-widget ${className}`}
      refreshInterval={refreshInterval}
      collapsible={true}
      onRefresh={handleRefresh}
    >
      <div className="space-y-6">
        {/* Entry Signal */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Entry Signal Strength</span>
            <span 
              className={`font-mono text-sm font-semibold ${getStrengthColor(signalState.entryStrength, true)}`}
            >
              {signalState.entryStrength}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div 
              className="h-2.5 rounded-full transition-all duration-500"
              style={{
                width: `${signalState.entryStrength}%`,
                backgroundColor: `var(--${signalState.entryStrength > 70 ? 'success' : 
                  signalState.entryStrength > 40 ? 'warning' : 'destructive'})`
              }}
            ></div>
          </div>
        </div>
        
        {/* Exit Signal */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Exit Signal Strength</span>
            <span 
              className={`font-mono text-sm font-semibold ${getStrengthColor(signalState.exitStrength, false)}`}
            >
              {signalState.exitStrength}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div 
              className="h-2.5 rounded-full transition-all duration-500"
              style={{
                width: `${signalState.exitStrength}%`,
                backgroundColor: `var(--${signalState.exitStrength > 70 ? 'destructive' : 
                  signalState.exitStrength > 40 ? 'warning' : 'success'})`
              }}
            ></div>
          </div>
        </div>
        
        {/* Optimal Position Size */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">Optimal Position Size</span>
          <span className="font-mono text-xl font-bold text-primary">
            {signalState.optimalPositionSize}%
          </span>
        </div>
        
        <div className="timestamp mt-4 text-right w-full">
          Last updated: {lastUpdate}
        </div>
      </div>
    </WidgetBase>
  );
};

export default SignalPanelWidget; 