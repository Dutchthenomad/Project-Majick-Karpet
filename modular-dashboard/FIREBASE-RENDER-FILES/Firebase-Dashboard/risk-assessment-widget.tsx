"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert, TrendingUp, TrendingDown, AlertTriangle, Minus } from "lucide-react";

interface RiskAssessment {
  probability: number;
  trend: 'up' | 'down' | 'stable';
}

export function RiskAssessmentWidget() {
  const [risk, setRisk] = useState<RiskAssessment>({
    probability: 25,
    trend: 'stable',
  });
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRisk(prev => {
        const newProb = Math.min(100, Math.max(0, prev.probability + (Math.random() - 0.45) * 10));
        let newTrend: 'up' | 'down' | 'stable' = 'stable';
        if (newProb > prev.probability + 1) newTrend = 'up';
        else if (newProb < prev.probability - 1) newTrend = 'down';
        return {
          probability: parseFloat(newProb.toFixed(1)),
          trend: newTrend,
        };
      });
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 500);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const getRiskColor = (prob: number): string => {
    if (prob > 75) return 'hsl(var(--destructive))';
    if (prob > 50) return 'hsl(var(--warning))';
    return 'hsl(var(--success))';
  };

  const TrendIcon = risk.trend === 'up' ? TrendingUp : risk.trend === 'down' ? TrendingDown : Minus;
  const trendColor = risk.trend === 'up' ? 'text-[hsl(var(--destructive))]' : risk.trend === 'down' ? 'text-[hsl(var(--success))]' : 'text-muted-foreground';

  const riskLevelText = (prob: number): string => {
    if (prob > 75) return 'High Risk';
    if (prob > 50) return 'Medium Risk';
    return 'Low Risk';
  }

  return (
    <Card className={`shadow-lg ${isPulsing ? 'animate-pulse-subtle' : ''}`}>
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <ShieldAlert className="mr-2 h-5 w-5 text-primary" />
          Risk Assessment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <span className="text-sm text-muted-foreground">Rug Pull Probability</span>
          <div className="flex items-center justify-center my-2">
            <span className="font-mono text-5xl font-bold" style={{ color: getRiskColor(risk.probability) }}>
              {risk.probability}%
            </span>
            <TrendIcon className={`ml-2 h-6 w-6 ${trendColor}`} />
          </div>
          <Progress value={risk.probability} className="h-3" indicatorClassName="transition-all duration-500" style={{ '--tw-progress-indicator': getRiskColor(risk.probability) } as React.CSSProperties} />
           <p className="text-xs mt-1" style={{ color: getRiskColor(risk.probability) }}>{riskLevelText(risk.probability)}</p>
        </div>
        
        {risk.probability > 75 && (
          <Alert variant="destructive" className="border-[hsl(var(--destructive))]">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>High Risk Alert!</AlertTitle>
            <AlertDescription>
              Probability of a rug pull is critically high. Exercise extreme caution.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
