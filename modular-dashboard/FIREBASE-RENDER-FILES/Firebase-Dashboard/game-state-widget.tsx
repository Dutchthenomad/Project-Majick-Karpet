"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hash, Repeat, DollarSign, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface GameState {
  gameId: string;
  tickCount: number;
  currentPrice: number;
  priceChange: 'up' | 'down' | 'neutral';
}

export function GameStateWidget() {
  const [gameState, setGameState] = useState<GameState>({
    gameId: "MKG-007X",
    tickCount: 0,
    currentPrice: 150.75,
    priceChange: 'neutral',
  });
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setGameState(prev => {
        const newPrice = parseFloat((prev.currentPrice + (Math.random() - 0.5) * 5).toFixed(2));
        let priceChange: 'up' | 'down' | 'neutral' = 'neutral';
        if (newPrice > prev.currentPrice) priceChange = 'up';
        else if (newPrice < prev.currentPrice) priceChange = 'down';
        
        return {
          gameId: prev.gameId,
          tickCount: prev.tickCount + 1,
          currentPrice: newPrice,
          priceChange,
        };
      });
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 500); // Duration of pulse animation
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const PriceChangeIcon = gameState.priceChange === 'up' ? TrendingUp : gameState.priceChange === 'down' ? TrendingDown : Minus;
  const priceChangeColor = gameState.priceChange === 'up' ? 'text-[hsl(var(--success))]' : gameState.priceChange === 'down' ? 'text-[hsl(var(--destructive))]' : 'text-muted-foreground';

  return (
    <Card className={`shadow-lg ${isPulsing ? 'animate-pulse-subtle' : ''}`}>
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <Hash className="mr-2 h-5 w-5 text-primary" />
          Game State
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Game ID</span>
          <Badge variant="secondary" className="font-mono text-sm">{gameState.gameId}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Tick Count</span>
          <span className="font-mono text-lg font-semibold">
            <Repeat className="mr-1 inline-block h-4 w-4 text-muted-foreground" />
            {gameState.tickCount.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Current Price</span>
          <div className="flex items-center">
            <DollarSign className={`mr-1 h-5 w-5 ${priceChangeColor}`} />
            <span className={`font-mono text-2xl font-bold ${priceChangeColor}`}>
              {gameState.currentPrice.toFixed(2)}
            </span>
            <PriceChangeIcon className={`ml-2 h-5 w-5 ${priceChangeColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
