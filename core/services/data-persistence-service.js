const ServiceBase = require('./service-base');
const Database = require('better-sqlite3'); // better-sqlite3
const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');
const eventBus = require('../events/event-bus');

const DB_FILE_PATH = path.join(__dirname, '..', '..', 'data', 'majick_karpet.db');

class DataPersistenceService extends ServiceBase {
    constructor(config = {}) { // Removed eventBus from constructor, will use singleton
        super('DataPersistenceService');
        this.config = config; // Store full config if parts are needed later
        this.db = null;
        this.writeQueue = {
            priceUpdates: [],
            gameEvents: [],
            trades: []
        };
        this.flushInterval = null;
        this.isShuttingDown = false;
        this.FLUSH_INTERVAL_MS = 1000; // Example: Flush every 1 second
        this.MAX_QUEUE_SIZE_PRICE_UPDATES = 1000; // Example limit
        this.MAX_QUEUE_SIZE_GAME_EVENTS = 500; // Example limit for game events
        this.MAX_QUEUE_SIZE_TRADES = 500; // Example limit for trades

        logger.info('DataPersistenceService instantiated.');
    }

    async initialize() {
        await super.initialize();
        try {
            this.db = await this._setupDatabase();
            if (this.db) {
                this.setupEventListeners();
                this.flushInterval = setInterval(() => this.flushWriteQueues(), this.FLUSH_INTERVAL_MS);
                this.logger.info('DataPersistenceService initialized successfully and listening for events.');
                return true;
            }
            return false;
        } catch (error) {
            this.logger.error(`DataPersistenceService initialization failed: ${error.message}`, error);
            return false;
        }
    }

    _ensureDataDirectoryExists() {
        const dir = path.dirname(DB_FILE_PATH);
        if (!fs.existsSync(dir)) {
            this.logger.info(`Data directory ${dir} does not exist, creating...`);
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    async _setupDatabase() {
        this._ensureDataDirectoryExists();
        try {
            const db = new Database(DB_FILE_PATH, { verbose: logger.debug.bind(logger), timeout: 10000 }); // Pass logger for verbose output if desired
            logger.info(`SQLite database opened successfully at ${DB_FILE_PATH} with busy_timeout set to 10000ms.`);

            // Use PRAGMA for better performance and integrity
            db.pragma('journal_mode = WAL');
            db.pragma('synchronous = NORMAL');

            // Schema Creation
            const createGamesTable = `
                CREATE TABLE IF NOT EXISTS games (
                    game_id TEXT PRIMARY KEY,
                    start_time INTEGER NOT NULL,
                    end_time INTEGER,
                    peak_multiplier REAL,
                    rug_price REAL,
                    server_seed_hash TEXT,
                    server_seed TEXT,
                    game_version TEXT,
                    is_rugged BOOLEAN DEFAULT 0,
                    tick_count INTEGER,
                    house_profit_sol REAL, -- Added for house P&L per game
                    metadata TEXT
                );
            `;

            const createPriceUpdatesTable = `
                CREATE TABLE IF NOT EXISTS price_updates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id TEXT NOT NULL,
                    tick INTEGER NOT NULL,
                    price REAL NOT NULL,
                    timestamp INTEGER NOT NULL,
                    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
                    UNIQUE (game_id, tick)
                );
            `;
            const createPriceUpdatesIndex = `CREATE INDEX IF NOT EXISTS idx_price_game_tick ON price_updates(game_id, tick);`;

            const createGameEventsTable = `
                CREATE TABLE IF NOT EXISTS game_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    tick INTEGER,
                    timestamp INTEGER NOT NULL,
                    data TEXT NOT NULL,
                    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE
                );
            `;
            const createGameEventsIndex = `CREATE INDEX IF NOT EXISTS idx_events_game_time ON game_events(game_id, timestamp);`;

            const createTradesTable = `
                CREATE TABLE IF NOT EXISTS trades (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id TEXT NOT NULL,
                    trade_id TEXT, 
                    player_id TEXT NOT NULL,
                    is_simulated BOOLEAN NOT NULL,
                    action TEXT NOT NULL, -- 'buy' or 'sell'
                    currency_sold TEXT, -- For sells: what currency of token was sold (e.g. SOL-token, FREE-token)
                    currency_received TEXT, -- For sells: what currency was received (e.g. SOL)
                    amount_tokens REAL NOT NULL, -- Token quantity
                    amount_currency REAL, -- Currency amount (e.g. SOL spent for buy, SOL received for sell)
                    price REAL NOT NULL,
                    tick INTEGER,
                    timestamp INTEGER NOT NULL,
                    cost_basis REAL, 
                    realized_pnl REAL,
                    strategy_id TEXT,
                    metadata TEXT, 
                    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE
                );
            `;
            // Note: Renamed 'amount' to 'amount_tokens' and 'cost' to 'amount_currency' for clarity
            // Added currency_sold and currency_received for sells
            const createTradesGamePlayerIndex = `CREATE INDEX IF NOT EXISTS idx_trades_game_player ON trades(game_id, player_id);`;
            const createTradesStrategyIndex = `CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy_id, game_id);`;

            const createStrategyPerformanceTable = `
                CREATE TABLE IF NOT EXISTS strategy_performance (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    strategy_id TEXT NOT NULL,
                    game_id TEXT NOT NULL,
                    trades_attempted INTEGER DEFAULT 0,
                    trades_executed INTEGER DEFAULT 0,
                    trades_rejected INTEGER DEFAULT 0,
                    total_spent_sol REAL DEFAULT 0, -- Renamed from total_bought for clarity
                    total_received_sol REAL DEFAULT 0, -- Renamed from total_sold for clarity
                    realized_pnl_sol REAL DEFAULT 0, -- Clarified PnL is in SOL
                    end_exposure_sol REAL DEFAULT 0,
                    end_status TEXT, 
                    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
                    UNIQUE (strategy_id, game_id)
                );
            `;
            
            db.exec(createGamesTable);
            db.exec(createPriceUpdatesTable);
            db.exec(createPriceUpdatesIndex);
            db.exec(createGameEventsTable);
            db.exec(createGameEventsIndex);
            db.exec(createTradesTable);
            db.exec(createTradesGamePlayerIndex);
            db.exec(createTradesStrategyIndex);
            db.exec(createStrategyPerformanceTable);

            logger.info('Database schema ensured.');
            return db;
        } catch (error) {
            logger.error(`Failed to setup SQLite database: ${error.message}`, error);
            this.db = null; // Ensure db is null on failure
            throw error; // Re-throw to be caught by initialize
        }
    }

    // Placeholder for event listeners
    setupEventListeners() {
        this.logger.info('DataPersistenceService: Setting up event listeners...');
        eventBus.on('game:newGame', this.handleNewGame.bind(this));
        eventBus.on('game:rugged', this.handleGameRugged.bind(this));
        eventBus.on('game:priceUpdate', this.queuePriceUpdate.bind(this));
        eventBus.on('game:phaseChange', (payload) => this.queueGameEvent(payload, 'game:phaseChange'));
        eventBus.on('game:newCandle', (payload) => this.queueGameEvent(payload, 'game:newCandle'));
        
        // Listen for simulated trades
        eventBus.on('trade:simulatedBuy', (payload) => this.queueTrade(payload, true));
        eventBus.on('trade:simulatedSell', (payload) => this.queueTrade(payload, true));
        eventBus.on('protocol:tradeEvent', (payload) => this.queueTrade(payload, false)); // Listen for actual game trades
        
        eventBus.on('strategy:gamePerformanceReport', this.handleStrategyPerformanceReport.bind(this));
    }

    queuePriceUpdate(payload) {
        if (!this.db) return; // Don't queue if DB is not ready

        const gameId = payload.gameId;
        const tick = payload.tickCount; // game:priceUpdate provides tickCount
        const price = payload.price;
        const timestamp = payload.gameTimestamp; // game:priceUpdate provides gameTimestamp

        if (gameId === undefined || tick === undefined || price === undefined || timestamp === undefined) {
            this.logger.warn('DataPersistenceService: game:priceUpdate event missing critical data. Skipping queue.', payload);
            return;
        }

        if (this.writeQueue.priceUpdates.length < this.MAX_QUEUE_SIZE_PRICE_UPDATES) {
            this.writeQueue.priceUpdates.push({
                game_id: gameId,
                tick: tick,
                price: price,
                timestamp: timestamp
            });
        } else {
            this.logger.warn(`DataPersistenceService: Price update queue full (${this.MAX_QUEUE_SIZE_PRICE_UPDATES}). Discarding update for game ${gameId}, tick ${tick}. Consider increasing MAX_QUEUE_SIZE_PRICE_UPDATES or decreasing FLUSH_INTERVAL_MS.`);
            // Optionally, could trigger an emergency flush here instead of discarding
        }
    }

    queueGameEvent(payload, eventType) {
        if (!this.db) return;

        const gameId = payload.gameId;
        const timestamp = payload.gameTimestamp;
        let tick = null;
        let eventData = {};

        if (eventType === 'game:phaseChange') {
            tick = payload.data?.tickCount; // tickCount is in payload.data for phaseChange
            eventData = { 
                previousPhase: payload.previousPhase,
                currentPhase: payload.currentPhase,
                tickCount: tick // Also store tickCount directly in data for context
                // Consider if full payload.data is needed or just key parts
            };
        } else if (eventType === 'game:newCandle') {
            // For newCandle, tick might be inferred from candle.index or a general tick from GameStateService if available
            // Let's assume candle.index can serve as a form of tick/sequence for candles
            tick = payload.candle?.index; 
            eventData = payload.candle; // Store the whole candle object
        }

        if (gameId === undefined || timestamp === undefined) {
            this.logger.warn(`DataPersistenceService: ${eventType} event missing gameId or timestamp. Skipping queue.`, payload);
            return;
        }
        
        const jsonData = JSON.stringify(eventData);

        if (this.writeQueue.gameEvents.length < this.MAX_QUEUE_SIZE_GAME_EVENTS) {
            this.writeQueue.gameEvents.push({
                game_id: gameId,
                event_type: eventType,
                tick: tick, // Can be null if not applicable to the event type
                timestamp: timestamp,
                data: jsonData
            });
        } else {
            this.logger.warn(`DataPersistenceService: Game event queue full (${this.MAX_QUEUE_SIZE_GAME_EVENTS}). Discarding ${eventType} for game ${gameId}.`);
        }
    }

    queueTrade(payload, isSimulated) {
        if (!this.db) return;

        // Adapt to different payload structures
        const tradeDetails = isSimulated ? payload.details : payload.trade;
        const eventTimestamp = isSimulated ? (payload.details?.simulationTimestamp || payload.timestamp) : payload.originalTimestamp;

        if (!tradeDetails) {
            this.logger.warn('DataPersistenceService: Trade event missing details/trade object. Skipping queue.', payload);
            return;
        }

        const game_id = tradeDetails.gameId;
        const player_id = tradeDetails.playerId;
        const action = tradeDetails.type; // 'buy' or 'sell'
        const price = tradeDetails.price;
        const timestamp = eventTimestamp;
        const strategy_id = isSimulated ? tradeDetails.strategyName : null;
        const tick = tradeDetails.tickCount || tradeDetails.tick || null;

        let currency_sold = null;
        let currency_received = null;
        let amount_tokens = 0;
        let amount_currency = 0;

        if (action === 'buy') {
            amount_tokens = isSimulated ? tradeDetails.tokensBought : tradeDetails.qty;
            amount_currency = isSimulated ? tradeDetails.amountSpent : tradeDetails.cost;
            currency_sold = tradeDetails.currency; // Currency spent (e.g., SOL)
            // For game tokens, their type is often tied to the currency spent or a specific ticker
            currency_received = tradeDetails.coinTicker || (tradeDetails.currency ? tradeDetails.currency + '-token' : 'unknown-token'); 
        } else if (action === 'sell') {
            amount_tokens = isSimulated ? tradeDetails.tokensSold : tradeDetails.qty;
            amount_currency = isSimulated ? tradeDetails.proceedsNet : tradeDetails.proceeds;
            // currencySold for simulated sell is the token type. For protocol:tradeEvent, trade.currency might be the token type if not coinTicker.
            currency_sold = tradeDetails.currencySold || tradeDetails.coinTicker || (tradeDetails.currency ? tradeDetails.currency + '-token' : 'unknown-token');
            currency_received = 'SOL'; // Typically proceeds from game token sells are SOL. If FREE tokens sell for FREE, this needs adjustment.
                                     // The original protocol adapter sets trade.currency to SOL if realPortion > 0 for sells.
                                     // For simulated sells, TradeExecutionService sets currencySold for the token type.
            if (tradeDetails.currency === 'FREE' && !isSimulated) { // if protocol event was for FREE tokens being sold
                currency_received = 'FREE';
            }
        }

        if (!game_id || !player_id || !action || amount_tokens === undefined || price === undefined || timestamp === undefined) {
            this.logger.warn('DataPersistenceService: Trade event missing critical data. Skipping queue.', tradeDetails);
            return;
        }

        // Ensure player_id is a string, especially for non-simulated trades where it might be an object
        const final_player_id = (typeof player_id === 'object' && player_id !== null) ? JSON.stringify(player_id) : player_id;
        const final_strategy_id = (typeof strategy_id === 'object' && strategy_id !== null) ? JSON.stringify(strategy_id) : strategy_id;

        if (this.writeQueue.trades.length < this.MAX_QUEUE_SIZE_TRADES) {
            this.writeQueue.trades.push({
                game_id,
                trade_id: tradeDetails.tradeId || null, // Use tradeId if available (e.g. from protocol event)
                player_id: final_player_id,
                is_simulated: isSimulated ? 1 : 0,
                action,
                currency_sold,
                currency_received,
                amount_tokens,
                amount_currency,
                price,
                tick,
                timestamp,
                cost_basis: null, 
                realized_pnl: null, 
                strategy_id: final_strategy_id,
                metadata: isSimulated ? null : JSON.stringify(tradeDetails) // Store full protocol trade as metadata
            });
        } else {
            this.logger.warn(`DataPersistenceService: Trades queue full (${this.MAX_QUEUE_SIZE_TRADES}). Discarding trade for game ${game_id}, player ${player_id}.`);
        }
    }

    // Placeholder for handling new game (example of immediate write)
    async handleNewGame(payload) { // Changed parameter name to payload for clarity
        if (!this.db) {
            this.logger.error('DataPersistenceService: Database not initialized. Cannot handle new game event.');
            return;
        }
        this.logger.info('DataPersistenceService: Handling new game event for persistence...', payload);

        const gameId = payload.gameId;
        // The event from GameStateService has gameTimestamp, and initialState which contains the original update timestamp
        // Let's use gameTimestamp from the game:newGame event as the primary start_time
        const startTime = payload.gameTimestamp; 
        const serverSeedHash = payload.initialState?.provablyFair?.serverSeedHash;
        const gameVersion = payload.initialState?.gameVersion;
        const gameParameters = payload.initialState?.gameParameters; // Get gameParameters

        if (!gameId || startTime === undefined) {
            this.logger.warn('DataPersistenceService: game:newGame event missing gameId or gameTimestamp. Skipping DB insert.', payload);
            return;
        }

        const insertStmt = `
            INSERT INTO games (game_id, start_time, server_seed_hash, game_version, metadata)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(game_id) DO NOTHING; 
        `;

        try {
            const metadataJson = gameParameters ? JSON.stringify(gameParameters) : null; // Define metadataJson here
            const runTransaction = this.db.transaction((gameData) => {
                const stmt = this.db.prepare(insertStmt);
                // Pass gameData.metadataJson which is now correctly scoped
                stmt.run(gameData.gameId, gameData.startTime, gameData.serverSeedHash, gameData.gameVersion, gameData.metadataJson);
            });
            
            // Pass metadataJson in the object to the transaction
            runTransaction({ gameId, startTime, serverSeedHash, gameVersion, metadataJson });
            this.logger.info(`DataPersistenceService: New game ${gameId} recorded successfully (with metadata).`);

        } catch (error) {
            this.logger.error(`DataPersistenceService: Failed to record new game ${gameId}: ${error.message}`, error);
            // If using db.transaction, errors should automatically rollback. No explicit rollback needed here if error is re-thrown or handled.
        }
    }

    async handleGameRugged(payload) {
        if (!this.db) {
            this.logger.error('DataPersistenceService: Database not initialized. Cannot handle game rugged event.');
            return;
        }
        this.logger.info('DataPersistenceService: Handling game rugged event for persistence...', payload);

        const gameId = payload.gameId;
        const endTime = payload.gameTimestamp; // Timestamp of the rugged event
        const rugPrice = payload.finalPrice;
        const finalTickCount = payload.tickCount;
        const isRugged = true; // Game is rugged
        const serverSeed = payload.data?.provablyFair?.serverSeed;
        const peakPrice = payload.peakPrice; // Get peakPrice from payload

        if (!gameId || endTime === undefined || rugPrice === undefined || finalTickCount === undefined /* peakPrice can be 0 */) {
            this.logger.warn('DataPersistenceService: game:rugged event missing critical data (gameId, endTime, rugPrice, finalTickCount). Skipping DB update.', payload);
            return;
        }

        const updateStmt = `
            UPDATE games 
            SET end_time = ?, rug_price = ?, is_rugged = ?, tick_count = ?, server_seed = ?, peak_multiplier = ?
            WHERE game_id = ?;
        `;

        try {
            const runTransaction = this.db.transaction((gameData) => {
                const stmt = this.db.prepare(updateStmt);
                const info = stmt.run(
                    gameData.endTime,
                    gameData.rugPrice,
                    gameData.isRugged ? 1 : 0, 
                    gameData.finalTickCount,
                    gameData.serverSeed, 
                    gameData.peakPrice, // Add peakPrice to be stored
                    gameData.gameId
                );
                if (info.changes === 0) {
                    this.logger.warn(`DataPersistenceService: No game found with game_id ${gameData.gameId} to update on rugged event. This might happen if the newGame event was missed or data was cleared.`);
                }
            });

            runTransaction({ gameId, endTime, rugPrice, isRugged, finalTickCount, serverSeed, peakPrice });
            this.logger.info(`DataPersistenceService: Game ${gameId} updated with rugged information (including peak price: ${peakPrice}) successfully.`);

        } catch (error) {
            this.logger.error(`DataPersistenceService: Failed to update game ${gameId} on rugged event: ${error.message}`, error);
        }
    }

    async handleStrategyPerformanceReport(payload) {
        this.logger.info(`DataPersistenceService: RECEIVED strategy:gamePerformanceReport. Payload:`, payload);
        if (!this.db) {
            this.logger.error('DataPersistenceService: Database not initialized. Cannot handle strategy performance report.');
            return;
        }

        const report = payload.performanceReport;
        if (!report) {
            this.logger.warn('DataPersistenceService: strategy:gamePerformanceReport event missing performanceReport data. Skipping.', payload);
            return;
        }

        const { 
            strategyId, gameId, tradesAttempted, tradesExecuted, tradesRejectedByRisk,
            totalSpentSOL, totalReceivedSOL, realizedPnLSOL, endStatus 
            // endExposureSOL is not yet reliably passed, so we'll omit it from DB insert for now or use a default
        } = report;

        if (!strategyId || !gameId) {
            this.logger.warn('DataPersistenceService: Strategy performance report missing strategyId or gameId. Skipping DB insert.', report);
            return;
        }
        
        this.logger.info(`DataPersistenceService: Handling strategy performance report for Strategy ${strategyId}, Game ${gameId}...`, report);

        // Simplified UPSERT using INSERT OR REPLACE
        const insertOrReplaceStmt = `
            INSERT OR REPLACE INTO strategy_performance (
                strategy_id, game_id, trades_attempted, trades_executed, trades_rejected, 
                total_spent_sol, total_received_sol, realized_pnl_sol, end_status
            ) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;

        try {
            const runTransaction = this.db.transaction(() => {
                const stmt = this.db.prepare(insertOrReplaceStmt);
                const params = [
                    strategyId, gameId, 
                    tradesAttempted || 0, 
                    tradesExecuted || 0, 
                    tradesRejectedByRisk || 0,
                    totalSpentSOL || 0,
                    totalReceivedSOL || 0,
                    realizedPnLSOL || 0,
                    endStatus || 'unknown'
                ];
                this.logger.info('DataPersistenceService: Executing SQL for strategy_performance with params:', params);
                stmt.run(...params);
            });
            
            runTransaction();
            this.logger.info(`DataPersistenceService: Strategy performance for ${strategyId}, Game ${gameId} recorded/updated successfully.`);

        } catch (error) {
            this.logger.error(`DataPersistenceService: Failed to record strategy performance for ${strategyId}, Game ${gameId}: ${error.message}`, error);
        }
    }

    // Placeholder for flushing queues
    async flushWriteQueues() {
        if (this.isShuttingDown || !this.db) return;
        // this.logger.debug('Flushing write queues...'); // Can be too verbose

        // Process Price Updates
        if (this.writeQueue.priceUpdates.length > 0) {
            const updatesToFlush = [...this.writeQueue.priceUpdates]; // Copy a snapshot of the queue
            this.writeQueue.priceUpdates = []; // Clear the queue immediately
            
            this.logger.info(`DataPersistenceService: Flushing ${updatesToFlush.length} price updates...`);
            try {
                const insertStmt = this.db.prepare(
                    'INSERT OR IGNORE INTO price_updates (game_id, tick, price, timestamp) VALUES (?, ?, ?, ?)'
                );
                const runTransaction = this.db.transaction((updates) => {
                    for (const update of updates) {
                        try {
                            insertStmt.run(update.game_id, update.tick, update.price, update.timestamp);
                        } catch (indivError) {
                            this.logger.error(`DataPersistenceService: Error inserting individual price update (game: ${update.game_id}, tick: ${update.tick}): ${indivError.message}`);
                        }
                    }
                });
                runTransaction.immediate(updatesToFlush);
                this.logger.info(`DataPersistenceService: Successfully flushed ${updatesToFlush.length} price updates.`);
            } catch (error) {
                this.logger.error(`DataPersistenceService: Error flushing price updates batch: ${error.message}`, error);
                // Potentially re-queue failed updates if a recoverable error, or log loss.
                // For now, if the transaction fails, these updates are lost from this batch.
            }
        }

        // Process Game Events
        if (this.writeQueue.gameEvents.length > 0) {
            const eventsToFlush = [...this.writeQueue.gameEvents];
            this.writeQueue.gameEvents = [];

            this.logger.info(`DataPersistenceService: Flushing ${eventsToFlush.length} game events...`);
            try {
                const insertStmt = this.db.prepare(
                    'INSERT INTO game_events (game_id, event_type, tick, timestamp, data) VALUES (?, ?, ?, ?, ?)'
                );
                const runTransaction = this.db.transaction((events) => {
                    for (const event of events) {
                        try {
                            insertStmt.run(event.game_id, event.event_type, event.tick, event.timestamp, event.data);
                        } catch (indivError) {
                            this.logger.error(`DataPersistenceService: Error inserting individual game event (game: ${event.game_id}, type: ${event.event_type}): ${indivError.message}`);
                        }
                    }
                });
                runTransaction.immediate(eventsToFlush);
                this.logger.info(`DataPersistenceService: Successfully flushed ${eventsToFlush.length} game events.`);
            } catch (error) {
                this.logger.error(`DataPersistenceService: Error flushing game events batch: ${error.message}`, error);
            }
        }

        // Process Trades
        if (this.writeQueue.trades.length > 0) {
            const tradesToFlush = [...this.writeQueue.trades];
            this.writeQueue.trades = [];

            this.logger.info(`DataPersistenceService: Flushing ${tradesToFlush.length} trades...`);
            try {
                const insertStmt = this.db.prepare(`
                    INSERT INTO trades (game_id, trade_id, player_id, is_simulated, action, 
                                      currency_sold, currency_received, amount_tokens, amount_currency, 
                                      price, tick, timestamp, cost_basis, realized_pnl, strategy_id, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                // Use .immediate for the transaction
                const runTransaction = this.db.transaction((trades) => {
                    for (const trade of trades) {
                        try {
                            insertStmt.run(
                                trade.game_id, trade.trade_id, trade.player_id, trade.is_simulated,
                                trade.action, trade.currency_sold, trade.currency_received, 
                                trade.amount_tokens, trade.amount_currency, trade.price, trade.tick, 
                                trade.timestamp, trade.cost_basis, trade.realized_pnl, 
                                trade.strategy_id, trade.metadata
                            );
                        } catch (indivError) {
                            this.logger.error(`DataPersistenceService: Error inserting individual trade (game: ${trade.game_id}, player: ${trade.player_id}): ${indivError.message}`);
                        }
                    }
                });
                runTransaction.immediate(tradesToFlush);
                this.logger.info(`DataPersistenceService: Successfully flushed ${tradesToFlush.length} trades.`);
            } catch (error) {
                this.logger.error(`DataPersistenceService: Error flushing trades batch: ${error.message}`, error);
            }
        }
    }

    // Placeholder for query methods
    async getGameDetails(gameId) {
        if (!this.db) {
            this.logger.error('DataPersistenceService: Database not initialized. Cannot get game details.');
            return null;
        }
        if (!gameId) {
            this.logger.warn('DataPersistenceService: getGameDetails called with no gameId.');
            return null;
        }
        this.logger.debug(`DataPersistenceService: Getting game details for ${gameId}`);
        try {
            const stmt = this.db.prepare('SELECT * FROM games WHERE game_id = ?');
            const game = stmt.get(gameId);
            return game || null; // Return the game object or null if not found
        } catch (error) {
            this.logger.error(`DataPersistenceService: Error fetching game details for ${gameId}: ${error.message}`, error);
            return null;
        }
    }

    async getGamePriceHistory(gameId) {
        if (!this.db) {
            this.logger.error('DataPersistenceService: Database not initialized. Cannot get game price history.');
            return [];
        }
        if (!gameId) {
            this.logger.warn('DataPersistenceService: getGamePriceHistory called with no gameId.');
            return [];
        }
        this.logger.debug(`DataPersistenceService: Getting price history for ${gameId}`);
        try {
            const stmt = this.db.prepare('SELECT tick, price, timestamp FROM price_updates WHERE game_id = ? ORDER BY tick ASC');
            const priceHistory = stmt.all(gameId);
            return priceHistory || []; // Return array of price updates or empty array if none found
        } catch (error) {
            this.logger.error(`DataPersistenceService: Error fetching price history for ${gameId}: ${error.message}`, error);
            return [];
        }
    }

    async getGameEvents(gameId, eventTypeFilter = null) {
        if (!this.db) {
            this.logger.error('DataPersistenceService: Database not initialized. Cannot get game events.');
            return [];
        }
        if (!gameId) {
            this.logger.warn('DataPersistenceService: getGameEvents called with no gameId.');
            return [];
        }
        this.logger.debug(`DataPersistenceService: Getting game events for ${gameId}${eventTypeFilter ? ' (type: ' + eventTypeFilter + ')' : ''}`);
        
        let query = 'SELECT * FROM game_events WHERE game_id = ?';
        const params = [gameId];

        if (eventTypeFilter) {
            query += ' AND event_type = ?';
            params.push(eventTypeFilter);
        }
        query += ' ORDER BY timestamp ASC';

        try {
            const stmt = this.db.prepare(query);
            const events = stmt.all(...params);
            return events || [];
        } catch (error) {
            this.logger.error(`DataPersistenceService: Error fetching game events for ${gameId}: ${error.message}`, error);
            return [];
        }
    }

    async getTradesForGame(gameId, options = {}) {
        if (!this.db) {
            this.logger.error('DataPersistenceService: Database not initialized. Cannot get trades for game.');
            return [];
        }
        if (!gameId) {
            this.logger.warn('DataPersistenceService: getTradesForGame called with no gameId.');
            return [];
        }
        
        const { playerId, isSimulated } = options;
        let query = 'SELECT * FROM trades WHERE game_id = ?';
        const params = [gameId];

        if (playerId !== undefined) {
            query += ' AND player_id = ?';
            params.push(playerId);
        }
        if (isSimulated !== undefined) {
            query += ' AND is_simulated = ?';
            params.push(isSimulated ? 1 : 0);
        }
        query += ' ORDER BY timestamp ASC';
        
        this.logger.debug(`DataPersistenceService: Getting trades for game ${gameId} with options: ${JSON.stringify(options)}`);

        try {
            const stmt = this.db.prepare(query);
            const trades = stmt.all(...params);
            return trades || [];
        } catch (error) {
            this.logger.error(`DataPersistenceService: Error fetching trades for game ${gameId}: ${error.message}`, error);
            return [];
        }
    }

    async getAllGamesSummary(limit = 100, offset = 0) {
        if (!this.db) {
            this.logger.error('DataPersistenceService: Database not initialized. Cannot get all games summary.');
            return [];
        }
        this.logger.debug(`DataPersistenceService: Getting all games summary (limit: ${limit}, offset: ${offset})`);
        try {
            const stmt = this.db.prepare(
                'SELECT game_id, start_time, end_time, rug_price, peak_multiplier, tick_count, is_rugged FROM games ORDER BY start_time DESC LIMIT ? OFFSET ?'
            );
            const games = stmt.all(limit, offset);
            return games || [];
        } catch (error) {
            this.logger.error(`DataPersistenceService: Error fetching all games summary: ${error.message}`, error);
            return [];
        }
    }

    async updateGameHouseProfit(gameId, houseProfitSol) {
        if (!this.db) {
            this.logger.error('DataPersistenceService: Database not initialized. Cannot update game house profit.');
            return false;
        }
        if (gameId === undefined || houseProfitSol === undefined) {
            this.logger.warn('DataPersistenceService: updateGameHouseProfit called with missing gameId or houseProfitSol.', { gameId, houseProfitSol });
            return false;
        }

        this.logger.info(`DataPersistenceService: Updating house_profit_sol for game ${gameId} to ${houseProfitSol}.`);
        const stmt = this.db.prepare('UPDATE games SET house_profit_sol = ? WHERE game_id = ?');
        try {
            const info = stmt.run(houseProfitSol, gameId);
            if (info.changes > 0) {
                this.logger.info(`DataPersistenceService: Successfully updated house_profit_sol for game ${gameId}.`);
                return true;
            } else {
                this.logger.warn(`DataPersistenceService: No game found with game_id ${gameId} to update house_profit_sol. Might be called before game record is created or gameId is incorrect.`);
                return false;
            }
        } catch (error) {
            this.logger.error(`DataPersistenceService: Failed to update house_profit_sol for game ${gameId}: ${error.message}`, error);
            return false;
        }
    }

    async shutdown() {
        // await super.shutdown(); // StrategyBase.shutdown is too specific, DataPersistenceService handles its own.
        this.logger.info('DataPersistenceService shutting down...');
        this.isShuttingDown = true;
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        await this.flushWriteQueues(); // Final flush

        if (this.db) {
            try {
                this.db.close();
                logger.info('SQLite database connection closed.');
            } catch (error) {
                logger.error(`Error closing SQLite database: ${error.message}`, error);
            }
            this.db = null;
        }
        logger.info('DataPersistenceService shutdown complete.');
        return true;
    }
}

module.exports = DataPersistenceService; 