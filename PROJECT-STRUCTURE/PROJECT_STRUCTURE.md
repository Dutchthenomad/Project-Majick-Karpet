# Majick Karpet

**Majick Karpet** is a modular, event-driven Node.js platform that reverse-engineers the Rugs.fun on-chain game, captures every game event in real time, and transforms raw protocol frames into actionable signals. It provides:

1. **Data Capture & Persistence**  
   – Hooks into Chrome via Puppeteer-CDP to listen to WebSocket traffic.  
   – Parses messages into structured events (game state, price updates, trades).  
   – Logs everything into a SQLite database for reliable storage and later analysis.

2. **Strategy Simulation & Backtesting**  
   – A BacktestEngine that replays historical games, runs your strategies in isolation, and measures PnL.  
   – Shared PlayerState and RiskManager modules that enforce the exact same rules in live and backtest modes.

3. **Risk-Managed Trading**  
   – Pluggable strategies (e.g. fixed-tick trader, presale statistical arbitrage) managed by a StrategyManager.  
   – Global and per-strategy risk limits (max exposure, open trades, stop-loss) enforced by RiskManagerService.  
   – TradeExecutionService to submit simulated or live orders via the WebSocket.

4. **Analytics & Dashboard**  
   – GameAnalyticsService computes house profit, player performance, and rug-pull detection.  
   – DashboardService (Express + Socket.IO) + front-end (Chart.js) gives you a live HUD with state, charts, and controls.

5. **Configuration & Logging**  
   – Joi-validated config-service for all parameters (browser, WebSocket, strategies, persistence, backtest).  
   – Winston-based logging with flexible levels and file output.

## Architecture at a Glance

 

```mermaid
BrowserManager ──► WebSocketClient ──► ProtocolAdapter ──► EventBus ──► {Services + Strategies}
                                                │
                                   ┌────────────┴─────────────┐
                                   │    DataPersistenceService│
                                   │    GameAnalyticsService  │
                                   │    RiskManagerService    │
                                   │    …                     │
                                   └──────────────────────────┘
                                             ▲
                         BacktestEngine ─────┘
```

 

## Roadmap

- **Phase 0–2**: Project skeleton, EventBus, browser + WebSocket capture, protocol parsing.
- **Phase 3**: Strategy simulation pipeline & robust risk framework (complete).
- **Phase 4**: DataPersistenceService + BacktestEngine (in progress).
- **Phase 5**: Interactive web dashboard & user profiles.
- **Phase 6**: Advanced analytics (wallet profiling, pattern recognition, Sharpe/Sortino).
- **Phase 7+**: AI-driven strategies, API, spin-off custom Web3 game.

---

**Next Steps:** polish the README with this description, then extend docs around your whale-profiling analytics and integrate an interactive Jupyter/HTML artifact for non-technical stakeholders.

## Purpose

- Define the mapping of all project folders and files.
- Provide a chapter-based documentation plan for Phase 4 and beyond.

## Documentation Methodology

1. **Folder-by-folder walkthrough**
2. For each folder:
   - Role & responsibilities
   - Key files & their functions
   - Interdependencies & data flow
3. **Chapters** correspond to folder levels and major components.

## Table of Contents

1. Introduction
2. Directory Layout Overview
3. Chapter 1: Root-level Files
4. Chapter 2: config/
5. Chapter 3: core/
6. Chapter 4: strategies/
7. Chapter 5: dashboard/
8. Chapter 6: docs/
9. Chapter 7: data/
10. Chapter 8: utils/ & miscellaneous scripts
11. Next Steps

---

## 1. Introduction

Majick Karpet is a modular, event-driven Node.js platform for analyzing Rugs.fun game data, automating trading strategies, and building custom dashboards. Phase 4 focuses on implementing a data persistence layer and backtesting engine against historical game data.

## 2. Directory Layout Overview

```text
Project_Majick_Karpet/
├── PROJECT-STRUCTURE/
├── .gitignore
├── PROJECT_MEMORY.md
├── README.md
├── WEBSOCKET_ANALYZER_README.md
├── analyze-gamedata.js
├── house_dashboard.ipynb
├── house_dashboard.js
├── house_tracker.js
├── logger.js
├── main.js
├── package.json
├── package-lock.json
├── puppeteer_utils.js
├── rugs-websocket-dictionary-combined.html
├── simple_dashboard.js
├── test-backtest.js
├── test-batch-backtest.js
├── test-phase1.js
├── tracker_only.js
├── ws_analyzer.js
├── ws_dashboard.js
├── ws_dataminer.js
├── assets/
├── config/
├── core/
├── dashboard/
├── data/
├── docs/
├── strategies/
├── utils/
└── logs/
```

## 3. Chapter 1: Root-level Files

- [`.gitignore`](../.gitignore): Defines files and folders Git should ignore to keep the repo clean.
- [`PROJECT_MEMORY.md`](../PROJECT_MEMORY.md): Agent-driven snapshot of milestones, context, and current phase decisions.
- [`README.md`](../README.md): High-level project overview and entrypoint linking to this map (no setup details here).
- [`WEBSOCKET_ANALYZER_README.md`](../WEBSOCKET_ANALYZER_README.md): Guide for raw WebSocket traffic analysis; powers data-collection tools.
- [`analyze-gamedata.js`](../analyze-gamedata.js): CLI to replay saved game logs for analytics (see `core/backtest-engines`).
- [`house_dashboard.ipynb`](../house_dashboard.ipynb): Jupyter notebook for prototyping dashboards and ad-hoc data exploration.
- [`house_dashboard.js`](../house_dashboard.js): Express server for the house-edge dashboard; integrates with `dashboard-service.js`.
- [`house_tracker.js`](../house_tracker.js): Terminal-based tracker streaming live game state and PnL.
- [`logger.js`](../logger.js): Core logging utility (Winston) used across all modules.
- [`main.js`](../main.js): CLI orchestration of BrowserManager, WebSocketClient, EventBus, services, and strategies.
- [`package.json`](../package.json) & [`package-lock.json`](../package-lock.json): NPM metadata and exact dependency lock for reproducibility.
- [`puppeteer_utils.js`](../puppeteer_utils.js): Helper functions for Puppeteer CDP browser automation (used by BrowserManager).
- [`rugs-websocket-dictionary-combined.html`](../rugs-websocket-dictionary-combined.html): Reference of decoded protocol messages.
- [`simple_dashboard.js`](../simple_dashboard.js): Minimal web/dashboard server for quick charts.
- [`test-backtest.js`](../test-backtest.js) & [`test-batch-backtest.js`](../test-batch-backtest.js): Scripts for single and batch backtesting runs.
- [`test-phase1.js`](../test-phase1.js): Integration test for data collection and parsing pipeline.
- [`tracker_only.js`](../tracker_only.js): Runs only the WebSocket tracker (no trading logic).
- [`ws_analyzer.js`](../ws_analyzer.js): CLI tool for pattern analysis on raw WebSocket captures.
- [`ws_dashboard.js`](../ws_dashboard.js): Live WebSocket data visualization via browser.
- [`ws_dataminer.js`](../ws_dataminer.js): Exports WebSocket captures to structured data formats.

## 4. Chapter 2: config/

- [`default.json`](../config/default.json): Base configuration schema covering browser, WebSocket, logging, strategies, persistence, and backtest settings.
- [`config-service.js`](../config/config-service.js): Loads and validates config via Joi; provides typed getters across modules.
- [`config.js`](../config/config.js): Merges CLI flag overrides into the validated config-service instance.
  _Interdependencies:_ All core services, `engine.js`, and `strategy-manager.js` import config-service for parameters.

## 5. Chapter 3: core/

**Role:** Core orchestration: browser/CDP connection, WebSocket parsing, event bus, service initialization, strategy execution, and backtesting.

### Subfolders & Key Files

- **backtest/**
  - [`backtest-engine.js`](../core/backtest/backtest-engine.js): Replays historical game events against strategies; measures PnL and metrics.
  - [`backtest-player-state-service.js`](../core/backtest/backtest-player-state-service.js): Tracks player positions and cost-basis during backtests.
  - [`backtest-risk-manager-service.js`](../core/backtest/backtest-risk-manager-service.js): Applies risk limits in simulated environments.
- **browser/**
  - [`browser.js`](../core/browser/browser.js): Manages Puppeteer CDP sessions and target page lifecycle.
- **communication/**
  - [`websocket.js`](../core/communication/websocket.js): Hooks into CDP, streams raw frames into EventBus.
  - [`protocol.js`](../core/communication/protocol.js): Decodes raw frames (`gameStateUpdate`, `tradeEvent`, etc.) into structured events.
- **events/**
  - [`event-bus.js`](../core/events/event-bus.js): Central emitter, tracks metrics, filters, and targeted subscriptions.
- **services/**
  - [`data-collection-service.js`](../core/services/data-collection-service.js): Buffers raw events for persistence and replay.
  - [`data-persistence-service.js`](../core/services/data-persistence-service.js): Writes events and performance records to SQLite.
  - [`game-analytics-service.js`](../core/services/game-analytics-service.js): Computes game-level stats (house PnL, trades, players).
  - [`game-state-service.js`](../core/services/game-state-service.js): Maintains live game state machine and emits phase events.
  - [`player-state-service.js`](../core/services/player-state-service.js): Tracks per-player balances and real-time PnL.
  - [`risk-manager-service.js`](../core/services/risk-manager-service.js): Enforces global and per-strategy risk limits.
  - [`trade-execution-service.js`](../core/services/trade-execution-service.js): Sends buy/sell commands via WebSocket.
  - [`dashboard-service.js`](../core/services/dashboard-service.js): Serves data to UI; see Chapter 5 for dashboard.
  - [`service-base.js`](../core/services/service-base.js): Standard lifecycle hooks (`start`, `stop`).
- [`engine.js`](../core/engine.js): Boots browser, WebSocket, EventBus, services, then `strategy-manager.js`.
- [`strategy-manager.js`](../core/strategy-manager.js): Dynamically loads strategies per config; orchestrates strategy lifecycle.
  _Interdependencies:_ All components connected via EventBus; `engine.js` ensures proper init order.

## 6. Chapter 4: strategies/

- [`simple-fixed-tick-trader-strategy.js`](../strategies/simple-fixed-tick-trader-strategy.js): Buys at fixed tick offsets; sells at configured profit tick; integrates with `risk-manager-service.js`.
- [`statistical-arbitrage-v1-presale-strategy.js`](../strategies/statistical-arbitrage-v1-presale-strategy.js): Presale analytics-based entry/exit; enforces custom risk parameters.
  _Interdependencies:_ Loaded by `strategy-manager.js`; subscribes to `protocol` events; executes via `trade-execution-service.js`.

## 7. Chapter 5: dashboard/

- [`index.html`](../dashboard/index.html): Single-page app using Chart.js and Socket.IO to display live metrics.
  _Interdependencies:_ Connects to `dashboard-service.js` via `/socket.io`; initial state from `GET /api/state`.

## 8. Chapter 6: docs/

- [`ANALYTICS_STRATEGY.md`](../docs/ANALYTICS_STRATEGY.md): Deep dive on analytics modules, metrics, and interpretation.
- [`GAME_THEORY.md`](../docs/GAME_THEORY.md): Theoretical underpinnings of Rugs.fun mechanics and manipulation patterns.
- [`README.md`](../docs/README.md): Overview of docs folder standards and contribution guidelines.
- [`REVERSE_ENGINEERING_FRAMEWORK.md`](../docs/REVERSE_ENGINEERING_FRAMEWORK.md): Comprehensive reverse-engineering framework for uncovering game mechanics, hypothesis management, and model validation.
  _Interdependencies:_ Strategy and analytics modules reference these docs for parameterization and design rationale.

## 9. Chapter 7: data/

- [`majick_karpet.db`](../data/majick_karpet.db): SQLite DB schema for games, events, trades, and performance.
- [`risk_manager_state.json`](../data/risk_manager_state.json): Serialized snapshots of live risk state for crash recovery.
  _Interdependencies:_ `data-persistence-service.js` reads/writes; `backtest-engine.js` replays data here.

## 10. Chapter 8: utils/ & miscellaneous scripts

- **assets/** ([link](../assets/)): Static images, icons, and branding used by dashboards and docs.
- **utils/**:
  - [`logger.js`](../utils/logger.js): Wrapper around Winston providing module-scoped loggers.
- [`puppeteer_utils.js`](../puppeteer_utils.js): Cross-folder utility for Puppeteer scripts.
  _Interdependencies:_ Used by BrowserManager, core services, and front-end assets.

## 11. Next Steps

- Review cross-links for accuracy; ensure all referenced files exist.
- Fill in remaining one-sentence summaries where marked.
- Consider generating an HTML or notebook outline for interactive navigation.
