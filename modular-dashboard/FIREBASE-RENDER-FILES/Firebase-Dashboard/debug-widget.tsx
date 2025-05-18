"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Terminal, FileJson, Activity, BugPlay } from "lucide-react";
import { format } from 'date-fns';

interface EventLog {
  id: string;
  timestamp: Date;
  type: 'gameState:updated' | 'analytics:rugProbability' | 'analytics:compositeSignals' | 'analytics:gamePhase' | 'analytics:patterns' | 'system:info' | 'system:error';
  message: string;
  data?: Record<string, any>;
}

const eventTypes: EventLog['type'][] = [
  'gameState:updated', 'analytics:rugProbability', 'analytics:compositeSignals', 
  'analytics:gamePhase', 'analytics:patterns', 'system:info', 'system:error'
];

const initialSystemStatus = {
  'API Latency': '25ms',
  'Event Queue Size': '12',
  'Database Connection': 'Connected',
  'AI Model Version': 'v2.3.1',
  'Last Error': 'None',
};

export function DebugWidget() {
  const [eventLog, setEventLog] = useState<EventLog[]>([]);
  const [rawEventData, setRawEventData] = useState<Record<string, any> | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [systemStatus, setSystemStatus] = useState(initialSystemStatus);
  const [isPulsing, setIsPulsing] = useState(false);


  useEffect(() => {
    const interval = setInterval(() => {
      const newEventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const newEvent: EventLog = {
        id: `evt-${Date.now()}`,
        timestamp: new Date(),
        type: newEventType,
        message: `Event of type ${newEventType} occurred.`,
        data: { detail: `Random data ${Math.random().toFixed(3)}` }
      };
      if (newEventType === 'system:error') {
        newEvent.message = "Simulated system error: Connection timeout.";
        setSystemStatus(prev => ({...prev, 'Last Error': newEvent.message}));
      }

      setEventLog(prev => [newEvent, ...prev.slice(0, 99)]); // Keep max 100 events
      setSystemStatus(prev => ({...prev, 'Event Queue Size': (parseInt(prev['Event Queue Size']) + 1).toString()}));
      
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 500);
    }, 2000); // New event every 2 seconds
    return () => clearInterval(interval);
  }, []);

  const filteredEvents = eventLog
    .filter(event => filterType === "all" || event.type === filterType)
    .filter(event => event.message.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <Card className={`shadow-lg ${isPulsing ? 'animate-pulse-subtle' : ''}`}>
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <BugPlay className="mr-2 h-5 w-5 text-primary" />
          Debug Panel
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="event-log">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="event-log"><Terminal className="h-4 w-4 mr-1.5" />Event Log</TabsTrigger>
            <TabsTrigger value="raw-data"><FileJson className="h-4 w-4 mr-1.5" />Raw Data</TabsTrigger>
            <TabsTrigger value="system-status"><Activity className="h-4 w-4 mr-1.5" />System Status</TabsTrigger>
          </TabsList>
          
          <TabsContent value="event-log" className="mt-4">
            <div className="flex space-x-2 mb-3">
              <Input 
                placeholder="Filter logs..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-grow"
              />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {eventTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="h-[300px] w-full rounded-md border p-3 bg-[hsl(var(--background))]">
              {filteredEvents.length > 0 ? filteredEvents.map(event => (
                <div key={event.id} className="mb-2 text-xs font-mono p-1.5 rounded hover:bg-[hsl(var(--muted)/0.5)] cursor-pointer" onClick={() => setRawEventData(event.data || { message: "No detailed data for this event." })}>
                  <span className={`font-semibold ${event.type.includes('error') ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--accent))]'}`}>
                    [{format(event.timestamp, 'HH:mm:ss.SSS')}] [{event.type}]
                  </span>
                  <span className="text-muted-foreground ml-1">{event.message}</span>
                </div>
              )) : <p className="text-sm text-muted-foreground text-center">No events match filters.</p>}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="raw-data" className="mt-4">
            <h4 className="text-sm font-medium mb-2">Selected Event Data:</h4>
            <ScrollArea className="h-[300px] w-full rounded-md border p-3 bg-[hsl(var(--background))]">
              <pre className="text-xs font-mono whitespace-pre-wrap">
                {rawEventData ? JSON.stringify(rawEventData, null, 2) : "Click an event in the log to see its raw data."}
              </pre>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="system-status" className="mt-4">
             <ScrollArea className="h-[300px] w-full rounded-md border p-3 bg-[hsl(var(--background))]">
              <ul className="space-y-2 text-sm">
                {Object.entries(systemStatus).map(([key, value]) => (
                  <li key={key} className="flex justify-between">
                    <span className="text-muted-foreground">{key}:</span>
                    <span className={`font-mono ${key === 'Last Error' && value !== 'None' ? 'text-[hsl(var(--destructive))]' : ''}`}>{value}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
