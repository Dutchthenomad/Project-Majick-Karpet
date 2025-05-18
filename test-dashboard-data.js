const EventBus = require('./core/events/event-bus');
const logger = require('./utils/logger');

/**
 * A script to generate test game data to help debug the dashboard
 */

// Initialize EventBus
logger.info('Initializing EventBus for test data generation');

// Game ID counter
let gameId = 1;
let tickCount = 0;
let price = 1.0;
let isGameActive = false;

// Start a fake game
function startGame() {
    gameId = Math.floor(Math.random() * 10000);
    tickCount = 0;
    price = 1.0;
    isGameActive = true;
    
    logger.info('Starting fake game #' + gameId);
    
    // Emit game state event
    EventBus.emit('game:state', {
        gameId: gameId.toString(),
        tickCount,
        price,
        timestamp: Date.now()
    });
    
    // Emit analytics events
    emitAnalyticsEvents();
}

// End the current game
function endGame() {
    if (!isGameActive) return;
    
    logger.info('Ending fake game #' + gameId);
    isGameActive = false;
    
    // Publish game end event
    EventBus.emit('game:end', {
        gameId: gameId.toString(),
        finalTick: tickCount,
        finalPrice: price,
        timestamp: Date.now()
    });
    
    // Schedule next game
    setTimeout(startGame, 3000);
}

// Update the current game state
function updateGameState() {
    if (!isGameActive) return;
    
    // Increment tick
    tickCount++;
    
    // Random price movement
    const priceChange = (Math.random() - 0.3) * 0.05;
    price = Math.max(0.2, price + priceChange);
    
    logger.debug('Game #' + gameId + ' tick: ' + tickCount + ', price: ' + price.toFixed(2));
    
    // Emit game state event
    EventBus.emit('game:state', {
        gameId: gameId.toString(),
        tickCount,
        price,
        timestamp: Date.now()
    });
    
    // Emit analytics events randomly
    if (tickCount % 5 === 0) {
        emitAnalyticsEvents();
    }
    
    // 1% chance to end the game on each tick after tick 50
    if (tickCount > 50 && Math.random() < 0.01) {
        endGame();
    }
    
    // Always end game after 300 ticks
    if (tickCount >= 300) {
        endGame();
    }
}

// Emit various analytics events
function emitAnalyticsEvents() {
    // Game phase analytics
    let phase = 'EARLY_ACCUMULATION';
    let percentile = 0;
    
    if (tickCount > 50) {
        phase = 'MID_VOLATILITY';
        percentile = 35;
    }
    if (tickCount > 100) {
        phase = 'LATE_RISK_ZONE';
        percentile = 70;
    }
    if (tickCount > 150) {
        phase = 'EXTREME_EXTENSION';
        percentile = 90;
    }
    
    EventBus.emit('analytics:gamePhase', {
        gameId: gameId.toString(),
        phase,
        tickPercentile: percentile,
        avgGameLength: 180,
        phaseStartTick: Math.max(0, tickCount - 20)
    });
    
    // Rug probability
    let probability = 0.01;
    let isHighRisk = false;
    
    if (tickCount > 120) {
        probability = 0.1;
    }
    if (tickCount > 150) {
        probability = 0.2;
        isHighRisk = true;
    }
    if (tickCount > 180) {
        probability = 0.4;
        isHighRisk = true;
    }
    
    EventBus.emit('analytics:rugProbability', {
        gameId: gameId.toString(),
        nextTickProbability: probability,
        isHighRiskWindow: isHighRisk,
        windowStart: tickCount,
        windowEnd: tickCount + 20
    });
    
    // Patterns
    const patterns = [];
    const patternMetadata = {};
    
    // Add patterns based on tick count
    if (tickCount > 30 && tickCount < 60) {
        patterns.push('PRICE_REVERSAL');
        patternMetadata['PRICE_REVERSAL'] = { confidence: 70, detectedAt: tickCount - 5 };
    }
    
    if (tickCount > 80 && tickCount < 120) {
        patterns.push('MAJOR_DIP');
        patternMetadata['MAJOR_DIP'] = { confidence: 85, detectedAt: tickCount - 10 };
    }
    
    if (tickCount > 140) {
        patterns.push('EXTREME_VOLATILITY');
        patternMetadata['EXTREME_VOLATILITY'] = { confidence: 90, detectedAt: tickCount - 5 };
    }
    
    EventBus.emit('analytics:patterns', {
        gameId: gameId.toString(),
        patterns,
        metadata: patternMetadata
    });
    
    // Composite signals
    let entryStrength = 0;
    let exitStrength = 0;
    let positionSize = 0;
    
    if (tickCount < 50) {
        entryStrength = 75;
        exitStrength = 10;
        positionSize = 0.5;
    } else if (tickCount < 100) {
        entryStrength = 40;
        exitStrength = 30;
        positionSize = 0.3;
    } else if (tickCount < 150) {
        entryStrength = 20;
        exitStrength = 60;
        positionSize = 0.1;
    } else {
        entryStrength = 5;
        exitStrength = 90;
        positionSize = 0;
    }
    
    EventBus.emit('analytics:compositeSignals', {
        gameId: gameId.toString(),
        entryStrength,
        exitStrength,
        optimalPositionSize: positionSize,
        generatedAt: new Date().toISOString()
    });
    
    // Combined analytics update (for services that might listen to this)
    EventBus.emit('analytics:update', {
        gameId: gameId.toString(),
        tickCount,
        analytics: {
            gamePhase: {
                phase,
                tickPercentile: percentile
            },
            rugProbability: {
                nextTickProbability: probability,
                isHighRiskWindow: isHighRisk
            },
            patterns,
            patternMetadata,
            compositeSignals: {
                entryStrength,
                exitStrength,
                optimalPositionSize: positionSize
            }
        }
    });
    
    logger.debug('Emitted analytics events for game #' + gameId + ', tick: ' + tickCount);
}

// Start generating data
logger.info('Starting test data generator');
startGame();

// Update game state every 200ms
setInterval(updateGameState, 200);

// Handle process termination
process.on('SIGINT', () => {
    logger.info('Test data generator shutting down');
    process.exit(0);
});

logger.info('Test data generator running. Press Ctrl+C to stop.'); 