"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LogIn, LogOut, Target, Percent } from "lucide-react";

interface SignalPanel {
  entryStrength: number;
  exitStrength: number;
  optimalPositionSize: number; // as percentage of capital
}

export function SignalPanelWidget() {
  const [signals, setSignals] = useState<SignalPanel>({
    entryStrength: 60,
    exitStrength: 30,
    optimalPositionSize: 5,
  });
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSignals({
        entryStrength: Math.floor(Math.random() * 101),
        exitStrength: Math.floor(Math.random() * 101),
        optimalPositionSize: Math.floor(Math.random() * 15) + 1,
      });
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 500);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const getStrengthColor = (strength: number): string => {
    if (strength > 70) return 'hsl(var(--success))';
    if (strength > 40) return 'hsl(var(--warning))';
    return 'hsl(var(--destructive))';
  };

  return (
    <Card className={`shadow-lg ${isPulsing ? 'animate-pulse-subtle' : ''}`}>
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <Target className="mr-2 h-5 w-5 text-primary" />
          Signal Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center">
              <LogIn className="mr-1.5 h-4 w-4" /> Entry Signal Strength
            </span>
            <span className="font-mono text-sm font-semibold" style={{ color: getStrengthColor(signals.entryStrength) }}>
              {signals.entryStrength}%
            </span>
          </div>
          <Progress value={signals.entryStrength} className="h-2.5" style={{ '--tw-progress-indicator': getStrengthColor(signals.entryStrength) } as React.CSSProperties} />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center">
              <LogOut className="mr-1.5 h-4 w-4" /> Exit Signal Strength
            </span>
            <span className="font-mono text-sm font-semibold" style={{ color: getStrengthColor(signals.exitStrength) }}>
              {signals.exitStrength}%
            </span>
          </div>
          <Progress value={signals.exitStrength} className="h-2.5" style={{ '--tw-progress-indicator': getStrengthColor(signals.exitStrength) } as React.CSSProperties} />
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground flex items-center">
            <Percent className="mr-1.5 h-4 w-4" /> Optimal Position Size
          </span>
          <span className="font-mono text-xl font-bold text-primary">
            {signals.optimalPositionSize}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
