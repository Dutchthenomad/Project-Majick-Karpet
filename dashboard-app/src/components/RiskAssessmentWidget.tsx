import React, { useEffect, useState } from 'react';
import WidgetBase from './widgets/WidgetBase';
import socketClient, { DashboardState } from '@/services/socket-client';

interface RiskAssessmentWidgetProps {
  id?: string;
  className?: string;
  refreshInterval?: number;
}

interface RiskState {
  rugProbability: number;
  isHighRiskWindow: boolean;
  windowStart?: number;
  windowEnd?: number;
  trend: 'up' | 'down' | 'stable';
}

const RiskAssessmentWidget: React.FC<RiskAssessmentWidgetProps> = ({
  id = 'risk-assessment-widget',
  className = '',
  refreshInterval = 1000
}) => {
  const [riskState, setRiskState] = useState<RiskState>({
    rugProbability: 0.05,
    isHighRiskWindow: false,
    windowStart: 0,
    windowEnd: 0,
    trend: 'stable'
  });
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('Never');
  const [previousProbability, setPreviousProbability] = useState<number>(0.05);

  useEffect(() => {
    // Connect to the socket server if not already connected
    if (!socketClient.isConnected()) {
      socketClient.connect();
    }

    // Listen for dashboard updates
    const unsubscribeUpdate = socketClient.on('dashboard:update', (data: DashboardState) => {
      if (data.analytics?.rugProbability) {
        const newProb = data.analytics.rugProbability.nextTickProbability;
        const oldProb = riskState.rugProbability;
        
        // Determine trend
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (newProb > oldProb + 0.01) trend = 'up';
        else if (newProb < oldProb - 0.01) trend = 'down';
        
        setPreviousProbability(oldProb);
        setRiskState({
          rugProbability: newProb,
          isHighRiskWindow: data.analytics.rugProbability.isHighRiskWindow,
          windowStart: data.analytics.rugProbability.windowStart,
          windowEnd: data.analytics.rugProbability.windowEnd,
          trend
        });
        setLastUpdate(new Date().toLocaleTimeString());
      }
    });

    // Listen for initial state
    const unsubscribeState = socketClient.on('dashboard:state', (data: DashboardState) => {
      if (data.analytics?.rugProbability) {
        setRiskState({
          rugProbability: data.analytics.rugProbability.nextTickProbability,
          isHighRiskWindow: data.analytics.rugProbability.isHighRiskWindow,
          windowStart: data.analytics.rugProbability.windowStart,
          windowEnd: data.analytics.rugProbability.windowEnd,
          trend: 'stable'
        });
        setPreviousProbability(data.analytics.rugProbability.nextTickProbability);
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
    if (initialState.analytics?.rugProbability) {
      setRiskState({
        rugProbability: initialState.analytics.rugProbability.nextTickProbability,
        isHighRiskWindow: initialState.analytics.rugProbability.isHighRiskWindow,
        windowStart: initialState.analytics.rugProbability.windowStart,
        windowEnd: initialState.analytics.rugProbability.windowEnd,
        trend: 'stable'
      });
      setPreviousProbability(initialState.analytics.rugProbability.nextTickProbability);
    }

    // Cleanup function
    return () => {
      unsubscribeUpdate();
      unsubscribeState();
      unsubscribeConnection();
    };
  }, [riskState.rugProbability]);

  // Format probability as percentage
  const formattedProbability = (riskState.rugProbability * 100).toFixed(1) + '%';
  
  // Get risk level color based on probability
  const getRiskLevelColor = () => {
    const prob = riskState.rugProbability;
    if (prob > 0.4) return 'text-destructive bg-destructive/10';
    if (prob > 0.2) return 'text-warning bg-amber-500/10';
    return 'text-success bg-success/10';
  };
  
  // Get risk level text
  const getRiskLevelText = () => {
    const prob = riskState.rugProbability;
    if (prob > 0.4) return 'Extreme Risk';
    if (prob > 0.2) return 'High Risk';
    if (prob > 0.1) return 'Medium Risk';
    return 'Low Risk';
  };
  
  // Get trend indicator
  const TrendIndicator = () => {
    if (riskState.trend === 'up') {
      return <span className="text-destructive">↑</span>;
    } else if (riskState.trend === 'down') {
      return <span className="text-success">↓</span>;
    }
    return <span className="text-muted-foreground">→</span>;
  };

  const handleRefresh = () => {
    // This is a manual refresh - we could request updated data here
    setLastUpdate(new Date().toLocaleTimeString());
  };

  return (
    <WidgetBase
      id={id}
      title="Risk Assessment"
      className={`risk-assessment-widget ${className}`}
      refreshInterval={refreshInterval}
      collapsible={true}
      onRefresh={handleRefresh}
    >
      <div className="flex flex-col items-center justify-center">
        <div className="text-center mb-2">
          <div className="text-sm text-muted-foreground">Rug Pull Probability</div>
          <div className="flex items-center justify-center mt-1">
            <span className={`text-4xl font-bold font-mono ${getRiskLevelColor()}`}>
              {formattedProbability}
            </span>
            <span className="ml-2 text-2xl">
              <TrendIndicator />
            </span>
          </div>
        </div>
        
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
          <div 
            className="h-2.5 rounded-full transition-all duration-500"
            style={{
              width: `${riskState.rugProbability * 100}%`,
              backgroundColor: `var(--${riskState.rugProbability > 0.4 ? 'destructive' : 
                riskState.rugProbability > 0.2 ? 'warning' : 'success'})`
            }}
          ></div>
        </div>
        
        <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getRiskLevelColor()}`}>
          {getRiskLevelText()}
        </div>
        
        {riskState.isHighRiskWindow && (
          <div className="mt-4 p-3 border border-destructive rounded bg-destructive/5 text-destructive">
            <div className="font-bold">⚠️ High Risk Window Alert</div>
            <div className="text-sm">
              Elevated rug probability detected from tick {riskState.windowStart} to {riskState.windowEnd}.
              Exercise extreme caution.
            </div>
          </div>
        )}
        
        <div className="timestamp mt-4 text-right w-full">
          Last updated: {lastUpdate}
        </div>
      </div>
    </WidgetBase>
  );
};

export default RiskAssessmentWidget; 