import React, { useState, useEffect, ReactNode } from 'react';

export interface WidgetProps {
  id: string;
  title: string;
  children?: ReactNode;
  className?: string;
  refreshInterval?: number; // ms, null = no auto-refresh
  collapsible?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  onRefresh?: () => void;
}

const WidgetBase: React.FC<WidgetProps> = ({
  id,
  title,
  children,
  className = '',
  refreshInterval,
  collapsible = true,
  removable = false,
  onRemove,
  onRefresh
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Handle refresh timer
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || !onRefresh) return;

    const timer = setInterval(() => {
      setIsLoading(true);
      
      // Call the refresh function
      onRefresh();
      
      // Set loading to false after a brief delay to show the refresh animation
      setTimeout(() => setIsLoading(false), 300);
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [refreshInterval, onRefresh]);

  // Toggle minimized state
  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  // Handle manual refresh
  const handleRefresh = () => {
    if (!onRefresh) return;
    
    setIsLoading(true);
    onRefresh();
    setTimeout(() => setIsLoading(false), 300);
  };

  return (
    <div 
      id={id} 
      className={`widget ${className} ${isMinimized ? 'minimized' : ''} ${isLoading ? 'loading' : ''}`}
      data-testid={`widget-${id}`}
    >
      <div className="widget-header">
        <h3 className="widget-title">{title}</h3>
        <div className="widget-controls">
          {onRefresh && (
            <button 
              className="widget-refresh" 
              title="Refresh" 
              onClick={handleRefresh}
              aria-label="Refresh widget"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                fill="currentColor" 
                viewBox="0 0 16 16"
                className={`refresh-icon ${isLoading ? 'rotating' : ''}`}
              >
                <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
              </svg>
            </button>
          )}
          {collapsible && (
            <button 
              className="widget-minimize" 
              title={isMinimized ? "Expand" : "Minimize"} 
              onClick={toggleMinimize}
              aria-label={isMinimized ? "Expand widget" : "Minimize widget"}
            >
              {isMinimized ? '+' : '−'}
            </button>
          )}
          {removable && onRemove && (
            <button 
              className="widget-remove" 
              title="Remove" 
              onClick={onRemove}
              aria-label="Remove widget"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="widget-content">
        {children}
      </div>
    </div>
  );
};

export default WidgetBase; 