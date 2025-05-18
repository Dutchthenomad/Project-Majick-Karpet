"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Play, Gauge, History, BarChartHorizontalBig } from "lucide-react";

interface AnalyticsPanelData {
  gamePhase: string;
  phaseDescription: string;
  progressPercentile: number;
  avgGameLength: number; // in minutes
  currentGameLength: number; // in minutes
}

const phases = [
  { name: "Accumulation", description: "Market preparing for a potential move." },
  { name: "Expansion", description: "Price moving decisively in one direction." },
  { name: "Distribution", description: "Market consolidating after a move, potential reversal." },
  { name: "Contraction", description: "Low volatility, market indecisive." },
];

export function AnalyticsPanelWidget() {
  const [analytics, setAnalytics] = useState<AnalyticsPanelData>({
    gamePhase: "Accumulation",
    phaseDescription: "Market preparing for a potential move.",
    progressPercentile: 30,
    avgGameLength: 45,
    currentGameLength: 15,
  });
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const randomPhase = phases[Math.floor(Math.random() * phases.length)];
      setAnalytics(prev => ({
        gamePhase: randomPhase.name,
        phaseDescription: randomPhase.description,
        progressPercentile: Math.floor(Math.random() * 101),
        avgGameLength: prev.avgGameLength, // Keep avg stable for demo
        currentGameLength: Math.min(prev.avgGameLength + 10, prev.currentGameLength + Math.floor(Math.random() * 5)),
      }));
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 500);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className={`shadow-lg ${isPulsing ? 'animate-pulse-subtle' : ''}`}>
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary" />
          Game Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1 flex items-center">
            <Play className="mr-1.5 h-4 w-4" /> Current Game Phase
          </h3>
          <Badge variant="default" className="text-md mb-1 bg-primary/80">{analytics.gamePhase}</Badge>
          <p className="text-xs text-muted-foreground">{analytics.phaseDescription}</p>
        </div>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1 flex items-center">
            <Gauge className="mr-1.5 h-4 w-4" /> Game Progress (vs Average)
          </h3>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-0.5">
            <span>0%</span>
            <span>{analytics.progressPercentile}%</span>
            <span>100%</span>
          </div>
          <Progress value={analytics.progressPercentile} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-1 text-center">You are in the {analytics.progressPercentile}th percentile of typical game duration.</p>
        </div>
        
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center">
            <History className="mr-1.5 h-4 w-4" /> Game Length Comparison
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs">Current Game Length:</span>
              <Badge variant="outline" className="font-mono">{analytics.currentGameLength} mins</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs">Average Game Length:</span>
              <Badge variant="outline" className="font-mono">{analytics.avgGameLength} mins</Badge>
            </div>
            {analytics.currentGameLength > analytics.avgGameLength && (
              <p className="text-xs text-[hsl(var(--warning-foreground))] bg-[hsl(var(--warning))] p-1.5 rounded-sm text-center">
                This game is running longer than average.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
