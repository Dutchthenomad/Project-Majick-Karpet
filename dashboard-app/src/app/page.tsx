"use client";

import GameStateWidget from "@/components/GameStateWidget";
import RiskAssessmentWidget from "@/components/RiskAssessmentWidget";
import SignalPanelWidget from "@/components/SignalPanelWidget";
import DebugPanel from "@/components/DebugPanel";
import { useEffect, useState } from "react";
import socketClient from "@/services/socket-client";
import mockDataService from "@/services/mock-data-service";

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [useMockData, setUseMockData] = useState(false); // Default to real connection
  const [serverUrl, setServerUrl] = useState("http://localhost:3000");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // If using mock data, start the mock service
    // Otherwise, try to connect to actual socket server
    if (useMockData) {
      console.log("Using mock data service for testing");
      mockDataService.start(); // This will call socketClient.connect(true) internally
      setConnectionError(null);
    } else {
      connectToServer();
    }

    // Listen for connection status changes
    const unsubscribeConnection = socketClient.on('connection:status', (status: { connected: boolean, message?: string }) => {
      setConnected(status.connected);
      setIsConnecting(false);
      
      if (!status.connected && status.message && !useMockData) {
        setConnectionError(status.message);
      } else {
        setConnectionError(null);
      }
    });

    return () => {
      unsubscribeConnection();
      if (useMockData) {
        mockDataService.stop();
      } else {
        socketClient.disconnect();
      }
    };
  }, [useMockData, serverUrl]);

  // Connect to the specified server
  const connectToServer = () => {
    console.log(`Connecting to Socket.IO server at ${serverUrl}`);
    setIsConnecting(true);
    setConnectionError(null);
    
    // Update the socket client URL and connect
    socketClient.updateUrl(serverUrl);
    socketClient.connect();
    
    // Set a timeout to show an error if connection takes too long
    setTimeout(() => {
      if (!socketClient.isConnected() && !useMockData) {
        setConnectionError("Connection timeout. Please check if the server is running.");
        setIsConnecting(false);
      }
    }, 5000);
  };

  // Toggle between mock data and real connection
  const toggleDataSource = () => {
    if (useMockData) {
      mockDataService.stop();
      setUseMockData(false);
    } else {
      socketClient.disconnect();
      setUseMockData(true);
    }
  };

  // Toggle settings panel
  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  // Update server URL and reconnect
  const handleServerUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setServerUrl(e.target.value);
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!useMockData) {
      socketClient.disconnect();
      connectToServer();
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-primary">Majick Karpet Analytics Dashboard</h1>
          <div className="flex gap-2">
            <button 
              onClick={toggleSettings}
              className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-md text-sm transition-colors"
            >
              {showSettings ? "Hide Settings" : "Settings"}
            </button>
            <button 
              onClick={toggleDataSource}
              className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-md text-sm transition-colors"
            >
              {useMockData ? "Use Real Connection" : "Use Mock Data"}
            </button>
          </div>
        </div>
        <p className="text-muted-foreground flex items-center gap-2">
          Real-time insights into game dynamics
          <span className={`ml-2 inline-block w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-destructive'}`}></span>
          <span className="text-sm">{connected ? `Connected${useMockData ? ' (Mock)' : ''}` : isConnecting ? 'Connecting...' : 'Disconnected'}</span>
        </p>
        
        {showSettings && (
          <div className="mt-4 p-4 bg-card rounded-md">
            <h2 className="text-lg font-semibold mb-2">Connection Settings</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="serverUrl" className="block text-sm mb-1">Socket.IO Server URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="serverUrl"
                    value={serverUrl}
                    onChange={handleServerUrlChange}
                    disabled={useMockData || isConnecting}
                    className="flex-1 px-3 py-2 bg-background border border-primary/30 rounded-md focus:outline-none focus:border-primary"
                  />
                  <button
                    type="submit"
                    disabled={useMockData || isConnecting}
                    className="px-4 py-2 bg-primary text-white rounded-md disabled:opacity-50"
                  >
                    Connect
                  </button>
                </div>
              </div>
              {connectionError && (
                <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-md">
                  <p className="font-semibold">Connection Error:</p>
                  <p>{connectionError}</p>
                  <p className="mt-2 text-xs">
                    Make sure your Socket.IO server is running and accessible at the specified URL.
                    If you don't have a server, use the "Use Mock Data" option instead.
                  </p>
                </div>
              )}
              {useMockData && (
                <div className="text-warning text-sm bg-warning/10 p-3 rounded-md">
                  Using mock data service. Switch to "Use Real Connection" to connect to a real server.
                </div>
              )}
            </form>
          </div>
        )}
      </header>

      <main className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12">
        {/* Row 1 */}
        <div className="lg:col-span-4 md:col-span-6 col-span-12">
          <GameStateWidget />
        </div>
        <div className="lg:col-span-4 md:col-span-6 col-span-12">
          <RiskAssessmentWidget />
        </div>
        <div className="lg:col-span-4 md:col-span-12 col-span-12">
          <SignalPanelWidget />
        </div>

        {/* Row 4 */}
        <div className="col-span-12">
          <DebugPanel />
        </div>
      </main>
      
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Majick Karpet. All rights reserved.</p>
      </footer>
    </div>
  );
}
