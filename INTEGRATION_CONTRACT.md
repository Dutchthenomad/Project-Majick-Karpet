# Majick Karpet Modular Dashboard Integration Contract

_Last updated: 2025-05-17_

This document defines the contract between the backend (`enhanced-dashboard-service.js`) and frontend dashboard widgets for real-time analytics and actionable intelligence events.

---

## Event Overview

Each event is emitted via Socket.IO from the backend. Payloads are structured as documented below. All widgets should subscribe only to relevant events.

### Event List

| Event Name                  | Payload Schema (TypeScript-style) | Emission Frequency | Intended Widget(s)                  |
|-----------------------------|------------------------------------|--------------------|-------------------------------------|
| `dashboard:state`           | `DashboardState`                   | ~250ms (batched)   | All widgets                         |
| `trade:executed`            | `TradeEvent`                       | On trade           | Trade feed, analytics               |
| `player:position`           | `PlayerPosition`                   | On change          | Player stats                        |
| `player:behavior`           | `PlayerBehavior`                   | On change          | Player analytics                    |
| `house:position`            | `HousePosition`                    | On change          | House stats                         |
| `performance:session`       | `PerformanceSession`               | On game/session    | Performance tracking                |
| `analytics:rugProbability`   | `RugProbability`                   | On update          | Rug risk widget                     |
| `analytics:patterns`        | `PatternAnalytics`                 | On update          | Pattern recognition                 |
| `analytics:compositeSignals` | `CompositeSignals`                 | On update          | Composite/technical indicators      |
| `risk:update`               | `RiskAnalytics`                    | On update          | Risk dashboard                      |
| ...                         | ...                                | ...                | ...                                 |

---

## Payload Schemas

### DashboardState
```ts
interface DashboardState {
  gameState: {
    gameId: string | null;
    tickCount: number;
    price: number;
    candle?: object;
    timestamp: string;
  };
  analytics: object;
  historyStats: object;
  housePosition: object;
  systemStatus: object;
  trades?: TradeEvent[];
  playerPosition?: PlayerPosition;
  playerBehavior?: PlayerBehavior;
  performance?: PerformanceSession;
}
```

### TradeEvent
```ts
interface TradeEvent {
  tradeId: string;
  playerId: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  timestamp: string;
}
```

### PlayerPosition
```ts
interface PlayerPosition {
  playerId: string;
  balance: number;
  openPositions: number;
  metrics?: object;
}
```

### PlayerBehavior
```ts
interface PlayerBehavior {
  playerId: string;
  behaviorType: string;
  details: object;
  timestamp: string;
}
```

### HousePosition
```ts
interface HousePosition {
  totalBets: number;
  totalAmount: number;
  activeBets: number;
  activeAmount: number;
  settledBets: number;
  payout: number;
  profit: number;
}
```

### PerformanceSession
```ts
interface PerformanceSession {
  sessionId: string;
  startTime: string;
  endTime?: string;
  profit: number;
  trades: TradeEvent[];
}
```

### RugProbability
```ts
interface RugProbability {
  nextTickProbability: number;
  confidence: number;
  updatedAt: string;
}
```

### PatternAnalytics
```ts
interface PatternAnalytics {
  patterns: string[];
  metadata?: object;
  detectedAt: string;
}
```

### CompositeSignals
```ts
interface CompositeSignals {
  signals: object;
  updatedAt: string;
}
```

### RiskAnalytics
```ts
interface RiskAnalytics {
  riskScore: number;
  details: object;
  updatedAt: string;
}
```

---

## Notes
- All timestamps are ISO8601 strings.
- All payloads are subject to minor extension; breaking changes will be versioned.
- Widgets should validate payloads before rendering.
- For any new event or schema, update this contract and notify all stakeholders.

---

For questions or updates, contact the Majick Karpet engineering team.
