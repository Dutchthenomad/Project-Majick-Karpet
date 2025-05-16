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
    - `checkTradeRisk` implements detailed strategy-specific limits (`maxBuyAmountSOL`, `maxOpenTradesPerGame`, `maxStrategyExposureSOL`, `minRequiredSafeTickCount`) and global limits (`globalMaxBuyAmountSOL`, `maxTotalExposureSOL`, `globalMaxConcurrentTrades`).
    - Logic for `globalMaxConcurrentTrades` is implemented by summing open trades across strategies; marked for more rigorous testing in Phase 4.
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

**Focus for Phase 4: Data Persistence, Backtesting, and Advanced Analytics**

The primary user goal for Phase 4 is to establish a persistently running system for comprehensive data collection, storage, and analysis. This will be achieved through the following, based on the detailed strategy provided (Source: AI Assistant, [Date of AI's feedback]):

1.  **Data Persistence Layer Implementation (Top Priority):**
    *   **`DataPersistenceService`:** A new dedicated service will be created to handle all database interactions.
    *   **Database Choice:** Initial implementation will use **SQLite** (e.g., via `better-sqlite3` library) for its simplicity and file-based nature.
    *   **Schema Design:** Implement core tables: `games`, `price_updates`, `game_events`, `trades`, `strategy_performance`. Key features include proper indexing, foreign keys, and use of JSON for flexible metadata.
    *   **Integration:** `DataPersistenceService` will subscribe to existing events from `GameStateService`, `PlayerStateService`, `TradeExecutionService`, etc., to capture and store data with minimal changes to these services.
    *   **Write Optimizations:** Employ batched writes (queued and flushed periodically) and transaction management for data integrity and performance.
    *   **Query API:** The service will expose methods to retrieve historical data (e.g., `getGameData`, `getGamePriceHistory`) for backtesting and analysis.

2.  **Simple Backtesting Prototype:**
    *   **`BacktestEngine`:** Develop a basic engine that can:
        *   Load historical game data (prices, events) from the `DataPersistenceService`.
        *   Instantiate strategies and feed them the replayed data via a dedicated backtest event bus.
        *   Control the timing of event replay (e.g., with a speed multiplier).
        *   Collect basic performance metrics from strategies.

3.  **Rigorous Multi-Strategy Testing:**
    *   Thoroughly test `globalMaxConcurrentTradesGlobal` and inter-strategy risk dynamics using the backtesting framework and/or by configuring multiple live-simulated strategies.

4.  **Further Core System Enhancements (Iterative):**
    *   **Schema Versioning:** Plan and implement a strategy for database schema migrations (e.g., using `knex.js` migrations).
    *   **Advanced Query Optimizations & Indexing:** Based on identified access patterns.
    *   **Data Compression/Archival Strategies:** For long-term storage efficiency.
    *   **System Resilience:** Improve memory management (monitoring for leaks), implement more robust crash recovery mechanisms (e.g., heartbeat state persistence for critical in-flight data) for truly long-running unattended operation.
    *   **Error Boundary Strategy:** Enhance containment of errors within individual components to protect the core data collection pipeline.

5.  **Advanced Analytics & Strategy Development:**
    *   Leverage the persistently stored data for deeper quantitative analysis of game mechanics and player behavior patterns.
    *   Develop and rigorously test more sophisticated trading strategies based on these insights.

**Key Considerations from AI Assistant for Phase 4 Data Layer:**
*   Schema Versioning: Plan for migrations.
*   Query Optimization: Design schema and indexes based on access patterns.
*   Batched Writes: Essential for high-frequency data.
*   Transaction Management: Ensure data integrity.
*   Backup Strategy: For valuable historical data.
*   Data Volume Management: Strategies for aggregation/sampling may be needed for very long runs.

**Note for Collaborators (Human or AI):**
This document and the main `README.md` should be consulted for project context. The system is now Phase 3 complete, providing a strong foundation for advanced strategy development and backtesting in Phase 4, with an immediate focus on the data persistence layer as outlined above. 