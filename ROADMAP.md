# Master Roadmap: Project Majick Karpet (Modular Rugs.fun Bot Platform)

## Core Principle:
Iterative Development with Clear Milestones. Each milestone should deliver a functional, testable increment of the system.

---

## Phase 0: Setup & Foundational Tools (The Groundwork)

*   **Goal:** Establish the project structure and essential utilities.
*   **Tasks:**
    1.  **[DONE] Project Directory Structure:** Create the full directory tree (core, services, strategies, utils, config, etc.).
    2.  **[DONE] `EventBus` Implementation (`core/events/event-bus.js`):** Implement and unit test the central event bus.
    3.  **`LoggingService` Setup (`utils/logger.js`):** Adapt existing logger to be easily importable and configurable. Ensure different log levels and outputs (console, file) are working.
    4.  **`ConfigService` Stub (`config/`):** Create a basic mechanism to load a default configuration file (e.g., `default.json`).
    5.  **[DONE] `ServiceBase` and `StrategyBase` Skeletons:** Create the base classes.
*   **Milestone 0 Deliverable:** A project skeleton with a working EventBus, Logger, and basic Config loader.
*   **Focus:** Core utilities, no feature creep.

---

## Phase 1: Data Acquisition & Raw Persistence (Seeing the Game)

*   **Goal:** Reliably connect to the game, capture raw WebSocket data, and log it.
*   **Tasks:**
    1.  **`BrowserManager` Implementation (`core/browser/browser.js`):** Implement robust browser connection/launch logic (adapting from `puppeteer_utils.js`).
    2.  **`WebSocketClient` Implementation (`core/communication/websocket.js`):**
        *   Connects via CDP.
        *   Emits raw WebSocket frames (`websocket:rawMessage { payload, timestamp }`) onto the `EventBus`.
        *   Handles connection lifecycle (connect, disconnect, errors).
    3.  **Basic `RugsProtocolAdapter` (`core/communication/protocol.js`):**
        *   Subscribes to `websocket:rawMessage`.
        *   Performs *minimal* initial parsing (e.g., identifying Engine.IO prefixes, attempting JSON.parse).
        *   Emits a very generic `protocol:rawGameData { type, data, timestamp }` event.
        *   **Crucially, identifies and logs `serverSeedHash` when it appears.**
    4.  **`DataCollectionService` - Raw Log (`core/services/data-collection-service.js`):**
        *   Subscribes to `protocol:rawGameData` and `websocket:rawMessage`.
        *   Logs these raw payloads (with timestamps and type if identified) to a simple JSONL file.
    5.  **`BotEngine` - Phase 1 Integration (`core/engine.js`):**
        *   Initializes and starts `BrowserManager`, `WebSocketClient`, `RugsProtocolAdapter` (as part of a conceptual `CommunicationService`), and `DataCollectionService`.
*   **Milestone 1 Deliverable:** The system can connect to the game, capture all WebSocket traffic, and log it raw to a file.
*   **Focus:** Getting raw data reliably.

---

## Phase 2: Standardized Events & Basic Game State (Understanding the Game)

*   **Goal:** Transform raw data into meaningful, standardized game events.
*   **Tasks:**
    1.  **`RugsProtocolAdapter` - Standardization:**
        *   Evolve to parse `protocol:rawGameData` into key standardized events (e.g., `game:newRound`, `game:stateUpdate`, `game:trade`, `game:phaseChange`, `game:finalSummary` including `serverSeed`).
        *   Utilize `rugs-websocket-dictionary-combined.html`.
        *   Capture `verificationVersion`.
    2.  **`DataCollectionService` - Standardized Log:**
        *   Subscribes to and logs standardized events.
    3.  **`BotEngine` - Basic State Update:**
        *   Optionally holds basic current game state.
*   **Milestone 2 Deliverable:** System parses WebSocket data into a structured, understandable stream of game events, logged by `DataCollectionService`.
*   **Focus:** Accurate parsing and event standardization.

---

## Phase 3: Analytics - Game Verification (Validating Our Understanding)

*   **Goal:** Verify understanding of game mechanics by replaying past games.
*   **Tasks:**
    1.  **`AnalyticsService` - Phase 1 (`core/services/analytics-service.js`):**
        *   Implement `verifyGame`, `driftPrice` (v1, v2, v3), and `Math.seedrandom`.
        *   Create `replayGameFromFile(gameLogPath)` to reconstruct and compare games.
        *   Log discrepancies.
    2.  **Command-Line Tool for Analytics:** Script to trigger `replayGameFromFile`.
*   **Milestone 3 Deliverable:** Ability to verify game algorithm implementation against observed outcomes.
*   **Focus:** Accurate implementation of game's PRNG and price logic.

---

## Phase 4: Basic Bot Action, Dashboard Display, & Initial Profile Concepts (Interaction, Visualization, Early Customization)

*   **Goal:** Enable basic bot actions, display core info, and introduce user profiles and strategy parameters via UI.
*   **Tasks:**
    1.  **`PageInteractor` Implementation (`core/browser/page.js`).**
    2.  **`TradeExecutionService` Implementation (`core/services/trade-executor.js`).**
    3.  **Simple `Strategy` Implementation (`strategies/simple-test-strategy.js`) - Parameter Aware.**
    4.  **`DashboardService` - Phase 1.5 (Parameter Display & Input, Session Capital Input).**
    5.  **`ConfigService` - Profile Aware (Stub).**
    6.  **`BotEngine` - Parameterized Strategy Loading.**
*   **Milestone 4 Deliverable:** Bot executes trades based on simple, configurable parameters. Dashboard displays live data, current strategy parameters, and allows session capital input.
*   **Focus:** End-to-end flow, basic parameterization, initial UI for profile management.

---

## Phase 5: Advanced Analytics, Dashboard Enrichment, & Profile Management (Intelligence, HUD, User Control)

*   **Goal:** Implement advanced analytics, HUD features, and allow users to manage profiles and strategy settings via UI.
*   **Tasks (Iterative):**
    1.  **`AnalyticsService` - Phase 2 (Real-time & PRNG Study).**
    2.  **`DashboardService` - HUD Features & Profile Management UI ("Super Nintendo Menu").**
        *   Round tracking, God candles, Instant rugs, Risk/Reward, Martingale, Aggression, Max Drawdown, Cooldowns.
    3.  **`RugsProtocolAdapter` - Event Enrichment (God Candle, Instant Rug).**
    4.  **`ProfileService` / `SessionManagerService` (New - `core/services/profile-service.js`) - Manages profiles, P&L, parameters.**
    5.  **`BotEngine` - Profile Integration.**
    6.  **Strategies - Advanced Parameterization.**
*   **Milestone 5 Deliverable (Iterative):** Dashboard with profile management, strategy parameter editing, advanced HUD data. `ProfileService` manages user settings. Strategies respond to advanced parameters.
*   **Focus:** User control, persistent settings, advanced risk management.

---

## Phase 6: Strategy Development & Optimization (Profitability)

*   **Goal:** Develop and test sophisticated trading strategies, leveraging profiles and advanced parameters.
*   **Tasks:**
    1.  Develop new `Strategy` modules (highly configurable).
    2.  Use `AnalyticsService` for backtesting with different profile parameters.
    3.  Refine strategies and default parameter sets.
*   **Milestone 6 Deliverable:** A suite of configurable, analytics-driven trading strategies.
*   **Focus:** Maximizing platform utility for effective trading.

---

## Phase X: Custom Game Development (The Ultimate Goal)
*   Leverage understanding gained to build a custom game/Web3 site.
