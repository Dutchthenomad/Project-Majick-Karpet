import React, { useEffect, useState } from 'react';
import WidgetBase from './widgets/WidgetBase';
import socketClient, { DashboardState } from '@/services/socket-client';

interface DebugPanelProps {
  id?: string;
  className?: string;
}

const DebugPanel: React.FC<DebugPanelProps> = ({
  id = 'debug-panel',
  className = ''
}) => {
  const [lastUpdate, setLastUpdate] = useState<string>('Never');
  const [gameUpdates, setGameUpdates] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Listen for dashboard updates
    const unsubscribeUpdate = socketClient.on('dashboard:update', (data: DashboardState) => {
      const timestamp = new Date().toLocaleTimeString();
      setLastUpdate(timestamp);
      
      // Add to updates queue, keeping only the last 10
      setGameUpdates(prev => {
        const newUpdates = [
          {
            timestamp,
            data: {
              gameState: data.gameState,
              analytics: data.analytics
            }
          },
          ...prev
        ].slice(0, 10);
        return newUpdates;
      });
    });

    return () => {
      unsubscribeUpdate();
    };
  }, []);

  const handleToggleExpanded = () => {
    setExpanded(!expanded);
  };

  return (
    <WidgetBase
      id={id}
      title="Debug Panel"
      className={`debug-panel-widget ${className}`}
      collapsible={true}
    >
      <div className="text-xs">
        <div className="mb-4">
          <button 
            className="px-2 py-1 bg-card hover:bg-opacity-80 rounded text-primary text-xs"
            onClick={handleToggleExpanded}
          >
            {expanded ? 'Show Less' : 'Show Full Data'}
          </button>
          <span className="ml-2 text-muted-foreground">Last update: {lastUpdate}</span>
        </div>
        
        <div className="space-y-3">
          {gameUpdates.map((update, index) => (
            <div key={index} className="border border-card p-2 rounded">
              <div className="text-muted-foreground">{update.timestamp}</div>
              <div className="mt-1">
                {expanded ? (
                  <pre className="overflow-auto max-h-[300px] p-2 bg-black bg-opacity-20 rounded">
                    {JSON.stringify(update.data, null, 2)}
                  </pre>
                ) : (
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-primary">Game ID:</span>
                      <span>{update.data.gameState?.gameId || 'None'}</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-primary">Tick:</span>
                      <span>{update.data.gameState?.tickCount}</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-primary">Price:</span>
                      <span>{update.data.gameState?.price?.toFixed(2)}x</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-primary">Rug Risk:</span>
                      <span>{(update.data.analytics?.rugProbability?.nextTickProbability * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {gameUpdates.length === 0 && (
            <div className="text-muted-foreground">No updates received yet</div>
          )}
        </div>
      </div>
    </WidgetBase>
  );
};

export default DebugPanel; 