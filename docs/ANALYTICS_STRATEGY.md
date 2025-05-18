# Majick Karpet – Analytics & Strategy Insights

## Core Project Goal

This document outlines the strategic objectives and data requirements for developing data-driven trading strategies on Rugs.fun, including statistical arbitrage and live analytics.

- Develop profitable, data-driven trading strategies for Rugs.fun, starting with a “Statistical Arbitrage” approach.
- Enable a live HUD/Dashboard, Discord bot integration, and adaptive strategy capabilities.

## Key Data Points to Collect & Analyze

The following key datasets are captured in the SQLite database ([`majick_karpet.db`](../data/majick_karpet.db)) to support analytics and strategy development.

### Game-Level Data

- Metrics from the `games` table and derived fields:
  - Game duration (ticks)
  - Peak multiplier/price
  - Rug price/multiplier and rug tick
  - Server seeds for integrity checks
  - Core game parameters (e.g., `BIG_MOVE_CHANCE`, `TRADE_FEE`)
  - House P&L per game (`totalSolInvested` – `totalSolReturned`)

### Price & Event Data

- Records in the `price_updates` and `game_events` tables:
  - Tick-by-tick price history
  - Game phase changes (timing and duration)
  - Candle data (OHLC; only close in `currentCandle`, others derived)
  - Price volatility metrics (standard deviation over N ticks, rate of change)

### Trade Data

- Entries in the `trades` table (`is_simulated = 0` for live trades):
  - Player ID & username (from metadata)
  - Trade type (buy/sell), quantity, price, tick, and timestamp
  - Liquidity provided vs. taken
  - Whale identification (e.g., large trade sizes or high token holdings)

### Strategy Performance Data

- Per-game P&L for our strategies
- Trade counts (attempted, executed, rejected)
- Win/Loss rates
- Average Holding Times
- (Future) Max Drawdown, Sharpe/Sortino Ratios, Profit Factor

## Statistical Arbitrage Strategy - Core Factors & Concepts

### House Profit State Factor

- **Concept:** Game dynamics might shift based on the house's recent profitability.
- **Metrics:**
  - Rolling N-game house P&L (e.g., 10-game, 50-game).
  - House profit magnitude vs. average game liquidity.
  - Trend/momentum of house P&L.
- **Potential Strategy Use:** Adjust aggressiveness (entry frequency, position size) based on house state. E.g., more cautious if house is on a losing streak.

### Player Liquidity & Whale Presence Factor

- **Concept:** Concentration of liquidity and actions of large players can influence game trajectory.
- **Metrics:**
  - % of total tokens held by top N players.
  - Count of "whales" (e.g., players with position size > X SOL or trades > Y SOL).
  - Rate of change in total active players or total liquidity.
- **Potential Strategy Use:** Confirmation signal. E.g., avoid entries if whale concentration is excessively high and they appear to be dumping, or favor entries if new whale buying is detected.

### High Multiplier Breakout System / Momentum

- **Concept:** Identify games with strong upward momentum and potentially ride breakouts, with statistically determined exit points.
- **Metrics:**
  - Detection of key multiplier thresholds (e.g., 3x, 5x, 8x, 10x, 15x).
  - Historical probability of reaching next threshold given current level.
  - Optimal hold duration/target multiplier after a breakout is confirmed.
- **Potential Strategy Use:** Scale into positions on confirmed breakouts; timed exits or trailing stops based on historical data for such breakouts.

### Game Dynamics & Timing Factor

- **Concept:** General statistical properties of games.
- **Metrics:**
  - Tick-based rug probability (conditional on current price/tick).
  - P(rug in next N ticks | current_price, current_tick, current_phase)
  - Average game length, distribution of game lengths.
  - Volatility analysis per game phase.
- **Potential Strategy Use:** Inform entry timing (avoid high-probability early rug zones) and exit timing (e.g., exit if approaching statistically common rug tick without reaching profit target).

## Multi-Factor Decision Matrix

| House State | Whale Presence | Game Phase | Multiplier Level | Volatility |   Action   | Position Size | Exit Target |  Stop-Loss  |
| :---------- | :------------: | :--------: | :--------------: | :--------: | :--------: | :-----------: | :---------: | :---------: |
| Profit      |      Low       |   Early    |       < 2×       |    Low     |   Enter    |   Base (2%)   |    1.8×     | Price-based |
| Profit      |      High      |    Mid     |      5–10×       |    High    |  Scale Up  |   +50% Base   |  Trail 15%  |  Trail 20%  |
| Loss        |      Low       |    Late    |       < 2×       |    Any     | Avoid/Hold |  0% / Reduce  |      –      |      –      |
| Neutral     |     Medium     |   Active   |     >2×, <5×     |   Medium   | Hold/Probe |  Small (1%)   |  1.5× Rel   | Tick-based  |
| ...         |      ...       |    ...     |       ...        |    ...     |    ...     |      ...      |     ...     |     ...     |

## Analysis & Development Roadmap for Statistical Arbitrage PoC

### Level 1: Foundational Data Analysis

- **Goal:** Calculate core metrics for House State, Game Dynamics (rug probability by tick, game length distribution, peak multiplier distribution).
- **Actions:**
  1.  Refine `DataPersistenceService` query methods for these specific aggregations.
  2.  Enhance `analyze-gamedata.js` to compute and log these distributions and probabilities.
  3.  Visually inspect data for initial patterns.

### Level 2: Basic Factor Implementation & Single-Factor Strategy

- **Goal:** Implement one factor (e.g., "Game Dynamics & Timing") into a simple strategy.
- **Actions:**
  1.  Create `StatisticalArbitrageV1Strategy.js`.
  2.  Logic:
      - Entry: Buy early if `current_tick < (avg_rug_tick * 0.3)`.
      - Exit: Sell if `current_multiplier > (avg_peak_multiplier * 0.7)` OR `current_tick > (avg_rug_tick * 0.8)`.
      - (Parameters derived from Level 1 analysis).
  3.  Batch backtest this V1 strategy across many games. Analyze P&L, win rate.

### Level 3: Multi-Factor Integration & Decision Matrix v1

- **Goal:** Integrate a second factor (e.g., "House Profit State") and start building the decision matrix logic.
- **Actions:**
  1.  Develop `HouseStateAnalyzer.js` module (consumes game data, outputs current house state: Profit, Loss, Neutral).
  2.  Modify `StatisticalArbitrageV2Strategy.js` to use signals from `HouseStateAnalyzer` AND Game Dynamics.
  3.  Implement a simple version of the decision matrix within the strategy.
  4.  Batch backtest V2. Compare against V1.

### Level 4: Proof of Concept with Core Factors

- **Goal:** Integrate a third factor (e.g., "High Multiplier Breakout" or simplified "Whale Detection") for a 3-factor PoC.
- **Actions:**
  1.  Develop the third factor analyzer module.
  2.  Integrate into `StatisticalArbitrageV3Strategy.js` with an expanded decision matrix.
  3.  Extensive batch backtesting.
  4.  Detailed performance analysis (P&L, win rate, avg hold, trades per game, ideally Profit Factor & basic Sharpe if P&L per trade is consistently available).
- **Success Metric for PoC:** Achieve consistent (though perhaps small) positive risk-adjusted returns across a large set of backtested games (e.g., >100).

### Future Levels (Beyond Initial PoC)

- Full Whale Detection & Liquidity Analysis module.
- Dynamic position sizing (Kelly, etc.).
- Advanced stop-loss (trailing based on volatility).
- Parameter optimization framework.
- Visualization dashboard.
- Live paper trading, then potentially real trading.

## Open Questions & Concerns

- How to best model/quantify "Whale Presence" from raw trade data? (e.g., rolling volume, distinct large traders).
- Best way to calculate and incorporate dynamic rug probability into the decision matrix.
- Handling potential data noise or outlier games in statistical calculations.
- Balancing complexity of the multi-factor model vs. risk of overfitting.
