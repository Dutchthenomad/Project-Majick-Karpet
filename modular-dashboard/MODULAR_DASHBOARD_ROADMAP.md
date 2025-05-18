# Majick Karpet Modular Dashboard: Roadmap & Phased Delivery Plan

## Guiding Principle
**A working, real-time dashboard with essential data outputs is the only acceptable milestone for phase completion.**  
No phase is considered done until it’s tested and delivers the required functionality end-to-end.

---

## Phase 1: Backend Event Emission & Aggregation

### Requirements
- `enhanced-dashboard-service.js` subscribes to all critical EventBus events:
  - Game state updates
  - Analytics outputs
  - Risk signals
  - System/debug status
  - Trade events
  - Player position updates
- Emits these as Socket.IO events with stable, documented payloads.
- **Event Sampling Rate:** Specify and document per-event emission frequency (e.g., tick updates every 100ms, aggregated stats every 1s).
- **Event Batching/Aggregation:** Implement a buffer/aggregation layer between EventBus and Socket.IO to batch high-frequency events (e.g., send tick updates in 100ms windows).
- **Complete Event Schema:** Expand the integration contract to include all relevant events:

| Event Name               | Payload Example                                      | Frequency    | Consumed By           |
|--------------------------|------------------------------------------------------|--------------|-----------------------|
| `gameState:update`       | `{ gameId, tickCount, currentPrice, priceChange }`   | 100ms        | GameStateWidget       |
| `analytics:update`       | `{ ... }`                                            | 1s           | AnalyticsPanelWidget  |
| `risk:update`            | `{ ... }`                                            | 1s           | RiskAssessmentWidget  |
| `system:status`          | `{ ... }`                                            | 5s           | DebugWidget           |
| `trade:executed`         | `{ ... }`                                            | on event     | DebugWidget           |
| `player:position`        | `{ ... }`                                            | on update    | PlayerPositionWidget  |
| ...                      | ...                                                  | ...          | ...                   |

- For each, document: name, payload structure, frequency, and estimated size.

#### Exit Criteria
- Socket.IO emits all documented events at specified rates.
- Aggregation layer is in place for high-frequency data.
- Integration contract includes all event types, with frequency and payload size estimates.
- Test client receives and logs all events.

---

## Phase 2: Socket Client & Resilience

### Requirements
- Implement `socket-client.js`:
  - Establishes Socket.IO connection.
  - Listens for all contract events.
  - Dispatches custom DOM events or calls widget update hooks.
  - **Resilience:** Add auto-reconnection logic and offline caching for recent data/events.
  - **Flexible Event Handling:** Support both DOM events and callback hooks for widget updates.

#### Exit Criteria
- Socket client reconnects automatically and restores state.
- Widgets can choose between DOM events or direct callbacks.
- Offline scenarios are handled gracefully.

---

## Phase 3: Widget State Management & Performance

### Requirements
- Each widget maintains local state and only re-renders on meaningful changes.
- Support for initial state hydration (e.g., on reconnect).
- **Performance:** Throttle or debounce high-frequency updates. Use requestAnimationFrame or similar for smooth rendering.

#### Exit Criteria
- Widgets display live data from backend.
- No simulated data remains.
- Manual test: change backend data, see widget update.
- Stress-test with simulated high-frequency data.

---

## Phase 4: Widget Configuration & Layout

### Requirements
- Allow users to customize widget layout, visibility, and update frequency.
- Store configuration in localStorage or backend.
- **WebComponents Consideration:** Evaluate using WebComponents for encapsulation and interoperability.
- Verify widgets can be added/removed/configured at runtime.

#### Exit Criteria
- Widgets can be added/removed/configured by the user.
- Configuration persists across reloads.

---

## Phase 5: Full Integration & Validation

### Requirements
- Full end-to-end test: backend → socket → dashboard → widgets.
- Add basic error handling and fallback states.
- Maintain a living integration contract and architecture notes.

#### Exit Criteria
- All required data outputs function in real time.
- Dashboard is usable for core analytics and monitoring.

---

## Phase 6: Operability, UX, and Advanced Features (Post-MVP)
- UI/UX improvements, advanced analytics, user profiles, etc., only after MVP is proven robust.

---

## Additional Notes & Commitments
- **Continuous Documentation:** Detailed notes and integration contract will be updated as we progress.
- **Configurable & Decoupled:** Where possible, avoid tight coupling to EventBus, allowing for future backend changes.
- **Explicit, Testable Exit Criteria:** Each phase will have explicit, testable exit criteria. We only move forward when requirements are met and tested.

---

## Appendage: Actionable Intelligence Data Points for Rugs.fun

### Game State Metrics
- Current tick count with visual game phase indication
- Candle index counter (shows aggregate of 5 ticks)
- Time elapsed in current game
- Tick rate consistency monitor (detects server lag)
- Game phase classification (early/mid/late game based on tick thresholds)
- Current price vs. baseline (1.0x) percentage

### Game Length Statistics
- Average game length (in ticks) over customizable lookback period
- Short/medium/long game classification boundaries
- Current game position relative to average length
- Statistical distribution of game endings by tick ranges
- Median game length (more robust than average for outliers)
- Quartile indicators (25%/50%/75% of games end by these ticks)

### Rug Risk Assessment
- Current tick rug probability based on historical distribution
- Risk increase/decrease trend indicator
- Post-high-multiplier game rug probability adjustment
- Rug risk heat map showing danger zones by tick range
- Recent-games rug frequency tracker
- Consecutive game pattern detection (clusters of short/long games)

### Price Pattern Recognition
- First major dip detector (10-15% drop from recent peak)
- Extreme dip detector (25%+ drop from recent peak)
- Absolute bottom proximity alert (approaching 0.55x)
- Consecutive red/green candle counter
- Big move detection with direction indication
- God candle probability estimator
- Blow-off top warning detector (parabolic price movement)

### Entry/Exit Optimization
- Dynamic take-profit targets (1.4x, 1.6x, 1.9x multipliers)
- Distance to next profit tier (% away from next target)
- Trailing stop recommendation based on current game phase
- Entry opportunity score (0-100 based on multiple factors)
- Buy amount recommendation based on game phase and dip type
- Risk-adjusted position sizing calculator
- Phase-based allocation percentages (early: 10%, mid: 5%, late: 2%)

### Player Behavior Analytics
- Top player action tracker (when skilled players enter/exit)
- Total liquidity gauge (total value of active positions)
- Player sentiment indicator (buying/selling pressure)
- "Smart money" vs "retail" positioning comparison
- Whale activity detection (large position entries/exits)
- Player clustering analysis (herding behavior detection)

### House Position Estimation
- Estimated current house position (winning/losing)
- House position trend over recent games
- House position as predictor of algorithm aggressiveness
- Correlation between house position and rug timing
- Historical house take percentage by game phase

### Technical Indicators
- Price relative to moving averages (5-tick, 20-tick)
- Current volatility vs. average volatility
- Support/resistance level identification
- Price momentum indicators with inflection points
- Adaptive ceiling calculator (max safe multiplier)

### Performance Tracking
- Personal win/loss record in current session
- Strategy performance vs. baseline comparison
- Missed opportunity calculator
- Decision quality score (rates your timing decisions)
- P&L tracker with visualization

### Composite Signals
- Buy signal strength with contributing factors
- Sell signal strength with contributing factors
- Overall game risk assessment (combines multiple metrics)
- Current game anomaly detector (identifies unusual patterns)
- Sweet spot identifier (optimal risk/reward ratio points)
