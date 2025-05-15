# Majick Karpet Project Memory (for Agentic AI Collaboration)

## Project Context & Architecture (End of Phase 3)

- **Phase 3 Status: COMPLETE.**
- **Overall Architecture:** Modular, event-driven Node.js system for Rugs.fun analytics and trading automation. Core services manage game state, player data, raw data collection, analytics, risk management, and trade execution (simulated).
- **EventBus (`core/events/event-bus.js`):
  - Robust implementation with structured payloads (timestamp, category, priority).
  - Supports targeted subscriptions with filtering.
  - Basic metrics collection in place.
- **Strategy Framework (`StrategyBase`, `StrategyManager`):
  - Strategies are isolated, configurable, extend `StrategyBase`.
  - Full lifecycle management: `initialize`, `start`, `stop`, `shutdown`, `validateConfiguration`, `analyzePerformance`, `adjustParameters`.
  - `StrategyManager` validates configurations before initialization.
- **Risk Management (`RiskManagerService` - `core/services/risk-manager-service.js`):
  - Central service for enforcing risk parameters.
  - Loads global risk limits and strategy-specific `riskConfig` from validated `default.json`.
  - Persistence for `activeExposure` to `data/risk_manager_state.json` (save/load).
  - **Exposure Updates:** Event-driven; subscribes to `trade:simulatedBuy`/`Sell`.
    - Correctly uses **cost basis** (via `PlayerStateService.getCostBasisAndPositionDetailsForSell`) for reducing `capitalAtRisk` on sells.
    - Accurately decrements `openTradesCount` based on the number of buy positions closed by a sell (FIFO via `PlayerStateService`).
  - **Pre-Trade Checks:** `StrategyBase.executeBuy/Sell` methods call `RiskManagerService.checkTradeRisk`.
    - `checkTradeRisk` implements detailed strategy-specific limits (`maxBuyAmountSOL`, `maxOpenTradesPerGame`, `maxStrategyExposureSOL`, `minRequiredSafeTickCount`) and global limits (`globalMaxBuyAmountSOL`, `maxTotalExposureSOL`).
    - Logic for `globalMaxConcurrentTrades` is implemented by summing open trades across strategies but will be more rigorously tested in Phase 4 with multiple active strategies.
  - Emits `risk:limitReached` events with detailed context.
- **PlayerStateService (`core/services/player-state-service.js`):
  - Tracks player/strategy balances for actual and simulated trades.
  - Provides `getCostBasisAndPositionDetailsForSell` using FIFO logic for accurate cost basis and position closing counts.
- **Configuration System (`config/config-service.js`, `config/default.json`):
  - Centralized configuration with global and strategy-specific sections.
  - **Joi schema validation implemented** for `default.json`, ensuring structural integrity and valid data types for all critical configurations at startup. Application halts on validation errors.
- **Buffer Queue (`RugsProtocolAdapter.js`):
  - Implemented for `newTrade` events arriving before `currentGameId` is set, preventing data loss.
- **Simulated Trade Handling:**
  - `TradeExecutionService` simulates trades, emitting `trade:simulatedBuy`/`Sell` events.
  - These events are consumed by `PlayerStateService` and `RiskManagerService`.

**Key Phase 3 Accomplishments:**
- Full modular refactor of core services.
- Robust, event-driven risk management framework with accurate exposure tracking using cost basis.
- Comprehensive configuration validation at startup.
- Stable data pipeline for game events and simulated trades.

**Focus for Early Phase 4:**
- Rigorous testing of `globalMaxConcurrentTradesGlobal` with multiple concurrent strategies.
- Begin work on data storage architecture for historical data and backtesting.
- Design and implement the backtesting framework.
- Further refinement of telemetry and advanced analytics.

**Note for Collaborators (Human or AI):**
This document and the main `README.md` should be consulted for project context. The system is now Phase 3 complete, providing a strong foundation for advanced strategy development and backtesting in Phase 4. 