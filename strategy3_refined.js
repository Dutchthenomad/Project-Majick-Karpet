/**
 * @file strategy3_refined.js
 * @description Contrarian trading strategy for the Rugs.fun bot, with refinements.
 *
 * Core Strategy Philosophy:
 * 1. Buy when others are fearful (significant price drops)
 * 2. Sell when others are greedy (strong upward movements)
 * 3. Scale risk down as the game progresses to avoid rug pulls
 * 4. Use dynamic position sizing based on market conditions
 */

import logger, { gameEventsLogger } from './logger.js';
import {
    ADD_001_BUTTON_XPATH,
    BUY_BUTTON_XPATH,
    SELL_BUTTON_XPATH,
    CLEAR_BUTTON_XPATH,
    // ALL_BUTTON_XPATH, // Not used in this strategy for sell
    SHORT_PAUSE_MS,
    // SELECTORS, // Not directly used
    SESSION_TOTAL_CAPITAL_DEFAULT
} from './config.js';
import { wait, clickButton } from './puppeteer_utils.js'; // setInputValue not directly used

// --- Constants ---
const BASE_BET_AMOUNT = 0.001; // Smallest clickable bet increment
// const MAX_ABSOLUTE_BET_AMOUNT = 0.01; // Max bet per click sequence (overridden by dynamic allocation)
export const LOSING_STREAK_THRESHOLD = 3;
export const AUTO_COOLDOWN_ROUND_COUNT = 2;

// --- NEW: Extreme Multiplier Cooldown Constants ---
export const EXTREME_MULTIPLIER_THRESHOLD = 300; // Price multiplier that triggers cooldown
export const EXTREME_MULTIPLIER_COOLDOWN_ROUNDS = 10; // Rounds to cooldown after trigger
// -------------------------------------------------

// Dip Buying & Entry
export const FIRST_DIP_THRESHOLD = 0.10; // 10% drop from recent peak in early game for first dip
export const CONTRARIAN_DIP_ENTRY_THRESHOLD = 0.25; // Default: Buy when price drops 25% from recent peak
export const EARLY_GAME_CONTRARIAN_DIP_ENTRY_THRESHOLD = 0.15; // Lowered for early game (was 0.25)
export const EXTREME_DIP_THRESHOLD = 0.40; // 40% drop from peak is an "extreme" dip
export const ABSOLUTE_BOTTOM_THRESHOLD = 0.55; // Consider 0.55x or lower as potential absolute bottom
// export const CEILING_THRESHOLD = 1.80; // *** REMOVED - Replaced by Adaptive Ceiling ***

// Profit Taking & Exits
export const BLOW_OFF_TOP_THRESHOLD = 1.75; // Lowered from 2.0x
export const CONTRARIAN_BOUNCE_EXIT_THRESHOLD = 0.20; // Default: Sell when price rises 20% from entry (less used with tiered exits)
export const TAKE_PROFIT_TIERS = [
    { threshold: 1.40, percentToSell: 0.30, reason: 'take_profit_tier_1_40%' }, // Tier 1 @ 40% profit
    { threshold: 1.60, percentToSell: 0.40, reason: 'take_profit_tier_2_60%' }, // Tier 2 @ 60% profit
    { threshold: 1.90, percentToSell: 1.00, reason: 'take_profit_tier_3_90%' }  // Tier 3 @ 90% profit (Sell remaining)
];
export const CONSECUTIVE_RED_EXIT_COUNT = 2; // Exit on 2 consecutive red candles (if in profit)

// Trailing Stops (Dynamic based on game phase)
export const EARLY_GAME_TRAILING_STOP = 0.20; // 20% from peak in early game
export const MID_GAME_TRAILING_STOP = 0.15; // 15% from peak in mid game
export const LATE_GAME_TRAILING_STOP = 0.10; // 10% from peak in late game

// --- NEW: Adaptive Game Phase Thresholds (Candle Index Based) ---
export const EARLY_GAME_MAX_CANDLE_INDEX = 40;  // End of Early Game after candle 40
export const MID_GAME_MAX_CANDLE_INDEX = 180; // End of Mid Game after candle 180
// -------------------------------------------------------------

// Capital Allocation (Percentages remain based on determined phase)
export const EARLY_GAME_CAPITAL_PERCENT = 0.10; // Increased from 0.08
export const MID_GAME_CAPITAL_PERCENT = 0.05;   // Reduced from 0.06
export const LATE_GAME_CAPITAL_PERCENT = 0.02;   // Reduced from 0.03, and further by RE_ENTRY_COOLDOWN
export const FIRST_DIP_ALLOCATION_BOOST = 1.25; // 25% more capital for first dip (applied to base game phase allocation)
export const EXTREME_DIP_CAPITAL_BOOST = 1.5; // Increase position size by 50% for extreme dips

// Cooldown & Re-entry
export const RE_ENTRY_COOLDOWN_AFTER_EXIT = true; // Enable cooldown after profitable exits
export const RE_ENTRY_COOLDOWN_DURATION_MS = 10000; // 10 seconds cooldown

// Pattern Recognition & History
export const CANDLE_HISTORY_LENGTH = 10;
export const MAX_PRICE_HISTORY_LENGTH = 30;
// export const CONSOLIDATION_BREAKOUT_THRESHOLD = 0.08; // Constant defined, logic TBD
// export const CONSECUTIVE_CANDLE_THRESHOLD = 3;      // Constant defined, logic TBD
// export const RELATIVE_VOLUME_THRESHOLD = 2.0;         // Constant defined, logic TBD

// General Capital Management
export const MIN_SESSION_CAPITAL = 0.003;
export const MAX_SESSION_CAPITAL = 999.9999;
export let SESSION_TOTAL_CAPITAL = 0.1; // Default, will be overwritten
// const TYPICAL_GAME_DURATION_MS = 2 * 60 * 1000; // Informational
const MAX_CAPITAL_PER_GAME_PERCENT = 0.25; // Max 25% of total session capital in a single game

// --- Adaptive Ceiling Constants ---
export const PRICE_HISTORY_MAX_LENGTH = 100; // Store up to 100 price points (overrides MAX_PRICE_HISTORY_LENGTH for this calc)
export const MOVING_AVG_WINDOW_SIZE = 20;    // Use 20 most recent points for moving average
export const CEILING_MULTIPLIER = 1.5;       // Default: Allow entries up to 50% above recent moving average
export const LOG_BASE = 2;                   // Log base for scaling
export const LOG_SCALE_FACTOR = 3;           // Factor for log scaling adjustment
export const VOLATILITY_WINDOW_SIZE = 10;    // Window for volatility calculation
export const MIN_ADAPTIVE_CEILING = 1.5;     // Never reject entries below 1.5x
export const MAX_ADAPTIVE_CEILING = 100.0;   // Cap ceiling at 100x even for extreme games
// ----------------------------------

// --- Strategy State Variables ---
let state = {
    // Game tracking
    currentGameId: null,
    roundStartTime: null,
    roundActiveTime: null,
    lastCandleIndex: -1,
    gamePhase: 'WAITING', // WAITING, EARLY_GAME, MID_GAME, LATE_GAME
    previousGamePhase: 'WAITING', // For logging phase transitions
    
    // Position tracking
    isHoldingPosition: false,
    currentTradeDetails: null, // Will store buyPrice, amount, peakPriceInTrade, tiersTaken etc.
    entryPrice: null, // Convenience duplicate of currentTradeDetails.buyPrice
    capitalUsedThisGame: 0,
    
    // Price patterns
    previousCandles: [],
    priceHistory: [], // Stores raw price history (up to PRICE_HISTORY_MAX_LENGTH)
    recentPeakPrice: 1.0,
    recentTroughPrice: 1.0,
    
    // Market conditions (subset from original, can be expanded)
    // volatility: 0, // Not directly used yet
    // priceVelocity: null, // Not directly used yet
    // volumeAverage: 0, // Not directly used yet
    consecutiveRedCandles: 0,
    consecutiveGreenCandles: 0,
    
    // Pattern detections
    firstDipDetected: false,      // Has the first major dip of the game occurred?
    significantDipDetected: false,// General dip detection
    extremeDipDetected: false,    // Deeper dip detection
    blowOffTopDetected: false,    // Parabolic rise detection
    // reversalDetected: false,   // Not explicitly used by this name
    
    // Risk management
    isManuallyCoolingDown: false,
    autoCooldownRoundsRemaining: 0,
    consecutiveLosses: 0,
    currentCapitalAllocationPercent: EARLY_GAME_CAPITAL_PERCENT,
    
    // Re-entry Cooldown
    lastExitWasProfit: false,
    lastExitTime: null,
    
    // Other state tracking
    // sellTriggered: false, // Replaced by checking currentTradeDetails.sold
    currentRoundLoggedAsRugged: false,
    // tookPartialProfit: false // Replaced by currentTradeDetails.tiersTaken logic
    actionInProgress: false, // Flag to prevent concurrent actions
    actedOnFirstDipThisGame: false, // Flag to ensure first dip buy happens only once
    extremeMultiplierCooldownRoundsRemaining: 0, // For extreme price cooldown
    lastCalculatedCeiling: null // Store the last calculated adaptive ceiling for TUI
};

// --- Session Stats Variables ---
let gamePnL = {};
let sessionTrades = [];
let totalWins = 0;
let totalLosses = 0;
let totalProfit = 0;
let initialSessionCapitalValue = SESSION_TOTAL_CAPITAL_DEFAULT;

// --- Helper Functions ---

function getTrailingStopPercent() {
    if (state.gamePhase === 'EARLY_GAME') return EARLY_GAME_TRAILING_STOP;
    if (state.gamePhase === 'MID_GAME') return MID_GAME_TRAILING_STOP;
    return LATE_GAME_TRAILING_STOP; // LATE_GAME
}

async function resetRoundState(page, newGameId) {
    logger.debug(`[State] Resetting round state for new game: ${newGameId}`);
    
    const previousManualCooldown = state.isManuallyCoolingDown;
    let nextAutoCooldownRoundsRemaining = state.autoCooldownRoundsRemaining > 0 ? state.autoCooldownRoundsRemaining - 1 : 0;
    if (state.autoCooldownRoundsRemaining > 0) {
        logger.info(`[State] Auto cooldown round passed. Rounds remaining: ${nextAutoCooldownRoundsRemaining}`);
    }
    const previousConsecutiveLosses = state.consecutiveLosses;

    // --- Decrement Extreme Multiplier Cooldown ---
    let nextExtremeMultiplierCooldown = state.extremeMultiplierCooldownRoundsRemaining > 0 ? state.extremeMultiplierCooldownRoundsRemaining - 1 : 0;
    if (state.extremeMultiplierCooldownRoundsRemaining > 0 && nextExtremeMultiplierCooldown > 0) {
        logger.info(`[State] Extreme multiplier cooldown round passed. Rounds remaining: ${nextExtremeMultiplierCooldown}`);
    } else if (state.extremeMultiplierCooldownRoundsRemaining > 0 && nextExtremeMultiplierCooldown === 0) {
        logger.info(`[State] Extreme multiplier cooldown FINISHED.`);
    }
    // --------------------------------------------

    state = {
        currentGameId: newGameId,
        roundStartTime: Date.now(),
        roundActiveTime: null,
        lastCandleIndex: -1,
        gamePhase: 'WAITING',
        previousGamePhase: 'WAITING',
        isHoldingPosition: false,
        currentTradeDetails: null,
        entryPrice: null,
        capitalUsedThisGame: 0,
        previousCandles: [],
        priceHistory: [],
        recentPeakPrice: 1.0,
        recentTroughPrice: 1.0,
        consecutiveRedCandles: 0,
        consecutiveGreenCandles: 0,
        firstDipDetected: false,
        significantDipDetected: false,
        extremeDipDetected: false,
        blowOffTopDetected: false,
        isManuallyCoolingDown: previousManualCooldown,
        autoCooldownRoundsRemaining: nextAutoCooldownRoundsRemaining,
        extremeMultiplierCooldownRoundsRemaining: nextExtremeMultiplierCooldown, // Apply decremented value
        consecutiveLosses: previousConsecutiveLosses,
        currentCapitalAllocationPercent: EARLY_GAME_CAPITAL_PERCENT,
        lastExitWasProfit: false, 
        lastExitTime: null,       
        currentRoundLoggedAsRugged: false,
        actionInProgress: false, 
        actedOnFirstDipThisGame: false 
    };

    try {
        logger.info('[State] Clicking CLEAR button for new round...');
        await clickButton(page, CLEAR_BUTTON_XPATH, 'CLEAR');
        logger.info('[State] CLEAR button clicked for new round.');
    } catch (error) {
        logger.error('[State] Error clicking CLEAR button during reset:', error);
    }
    
    logger.info(`[State] New round ${newGameId} initialized. Game Phase: ${state.gamePhase}. Initial capital allocation: ${(state.currentCapitalAllocationPercent * 100).toFixed(2)}%`);
}

function updateGamePhase() {
    // const gameTimeMs = state.roundActiveTime ? (Date.now() - state.roundActiveTime) : 0; // REMOVED Time-based logic
    let determinedPhase = state.gamePhase; // Keep current phase if no change
    const currentCandleIndex = state.lastCandleIndex;

    // Determine phase based on candle index
    if (currentCandleIndex === -1) {
        determinedPhase = 'WAITING'; // Before first candle
        // Keep initial capital allocation until first candle processed
    } else if (currentCandleIndex <= EARLY_GAME_MAX_CANDLE_INDEX) {
        determinedPhase = 'EARLY_GAME';
        state.currentCapitalAllocationPercent = EARLY_GAME_CAPITAL_PERCENT;
    } else if (currentCandleIndex <= MID_GAME_MAX_CANDLE_INDEX) {
        determinedPhase = 'MID_GAME';
        state.currentCapitalAllocationPercent = MID_GAME_CAPITAL_PERCENT;
    } else {
        determinedPhase = 'LATE_GAME';
        state.currentCapitalAllocationPercent = LATE_GAME_CAPITAL_PERCENT;
    }
    
    // Override to LATE_GAME if blow-off top detected, but ONLY if we are already past the early game index threshold
    if (state.blowOffTopDetected && currentCandleIndex > EARLY_GAME_MAX_CANDLE_INDEX && determinedPhase !== 'LATE_GAME') {
        logger.info(`[GamePhase] Blow-off top detected after early game (Candle: ${currentCandleIndex}), forcing LATE_GAME phase.`);
        determinedPhase = 'LATE_GAME';
        state.currentCapitalAllocationPercent = LATE_GAME_CAPITAL_PERCENT;
    } else if (state.blowOffTopDetected && currentCandleIndex <= EARLY_GAME_MAX_CANDLE_INDEX) {
        logger.info(`[GamePhase] Blow-off top detected within early game (Candle: ${currentCandleIndex}), NOT forcing LATE_GAME phase yet.`);
    }
    
    // Log only on transition
    if (determinedPhase !== state.previousGamePhase) {
        logger.info(`[GamePhase] Transitioned to ${determinedPhase} (Candle Index: ${currentCandleIndex}). New base capital allocation: ${(state.currentCapitalAllocationPercent * 100).toFixed(2)}%`);
        state.gamePhase = determinedPhase;
        state.previousGamePhase = determinedPhase;
    }
}

function detectFirstMajorDip(currentPrice) {
    if (state.gamePhase !== 'EARLY_GAME' || state.firstDipDetected || state.priceHistory.length < 8) {
        return false;
    }
    const recentPrices = state.priceHistory.slice(-8); // Look at last 8 price ticks
    const recentPeak = Math.max(...recentPrices.filter(p => typeof p === 'number' && isFinite(p)));
    if (recentPeak === -Infinity) return false;


    const dropPercent = (recentPeak - currentPrice) / recentPeak;
    const isFirstMajorDip = dropPercent >= FIRST_DIP_THRESHOLD;
    
    if (isFirstMajorDip) {
        state.firstDipDetected = true; // Mark as detected so it only triggers once
        logger.info(`[PatternDetect] FIRST MAJOR DIP detected in EARLY_GAME! Current: ${currentPrice.toFixed(4)}, Peak: ${recentPeak.toFixed(4)}, Drop: ${(dropPercent * 100).toFixed(2)}%`);
    }
    return isFirstMajorDip;
}

function detectSignificantDip(currentPrice) {
    if (state.priceHistory.length < 5) return false;
    
    const lookbackPeriod = Math.min(15, state.priceHistory.length);
    const recentPrices = state.priceHistory.slice(-lookbackPeriod);
    const recentPeak = Math.max(...recentPrices.filter(p => typeof p === 'number' && isFinite(p)));
     if (recentPeak === -Infinity) return false;

    const dropPercent = (recentPeak - currentPrice) / recentPeak;
    
    state.recentPeakPrice = Math.max(state.recentPeakPrice, currentPrice); // Keep track of overall peak this round
    state.recentTroughPrice = Math.min(state.recentTroughPrice, currentPrice); // Keep track of overall trough

    let currentDipThreshold = CONTRARIAN_DIP_ENTRY_THRESHOLD;
    if (state.gamePhase === 'EARLY_GAME') {
        currentDipThreshold = EARLY_GAME_CONTRARIAN_DIP_ENTRY_THRESHOLD;
    }
    
    const isSignificantDip = dropPercent >= currentDipThreshold;
    state.extremeDipDetected = dropPercent >= EXTREME_DIP_THRESHOLD; // Always check for extreme dip
    
    if (isSignificantDip && !state.significantDipDetected) { // Log only on first detection of this dip magnitude
        logger.info(`[PatternDetect] Significant dip detected! Current: ${currentPrice.toFixed(4)}, Recent Peak in window: ${recentPeak.toFixed(4)}, Drop: ${(dropPercent * 100).toFixed(2)}% vs threshold ${currentDipThreshold*100}%`);
        if (state.extremeDipDetected) {
            logger.info(`[PatternDetect] This is an EXTREME dip.`);
        }
    }
    state.significantDipDetected = isSignificantDip; // Update state for current tick
    return isSignificantDip;
}

function detectBlowOffTop(currentPrice) {
    if (state.priceHistory.length < 10) return false; // Need some history
    
    const aboveThreshold = currentPrice >= BLOW_OFF_TOP_THRESHOLD;
    // Basic check: If price rapidly accelerates (e.g., >50% jump in last 5 ticks)
    const last5Prices = state.priceHistory.slice(-5);
    let rapidAcceleration = false;
    if (last5Prices.length === 5 && last5Prices[0] > 0) {
        if ((last5Prices[4] - last5Prices[0]) / last5Prices[0] > 0.50) { // 50% increase in 5 ticks
            rapidAcceleration = true;
        }
    }

    const isBlowOff = aboveThreshold || rapidAcceleration;
    if (isBlowOff && !state.blowOffTopDetected) { // Log only once
        logger.warn(`[PatternDetect] BLOW-OFF TOP detected! Current: ${currentPrice.toFixed(4)}. AboveThreshold: ${aboveThreshold}, RapidAccel: ${rapidAcceleration}`);
    }
    state.blowOffTopDetected = isBlowOff; // Update state for current tick
    return isBlowOff;
}

function updateConsecutiveCandleCount() {
    if (state.previousCandles.length < 1) return;
    
    let redCount = 0;
    for (let i = state.previousCandles.length - 1; i >= 0; i--) {
        const candle = state.previousCandles[i];
        if (typeof candle.open !== 'number' || typeof candle.close !== 'number') break;
        if (candle.close < candle.open) redCount++;
        else break;
    }
    state.consecutiveRedCandles = redCount;

    let greenCount = 0;
    if (redCount === 0) { // Only count green if no preceding red streak
        for (let i = state.previousCandles.length - 1; i >= 0; i--) {
            const candle = state.previousCandles[i];
            if (typeof candle.open !== 'number' || typeof candle.close !== 'number') break;
            if (candle.close > candle.open) greenCount++;
            else break;
        }
    }
    state.consecutiveGreenCandles = greenCount;
    // logger.debug(`[Strategy] Consecutive candles - Red: ${state.consecutiveRedCandles}, Green: ${state.consecutiveGreenCandles}`);
}

// --- Adaptive Ceiling Calculation Functions ---

function updatePriceHistory(currentPrice) {
    if (typeof currentPrice !== 'number' || !isFinite(currentPrice)) return; // Ignore invalid prices
    state.priceHistory.push(currentPrice);
    if (state.priceHistory.length > PRICE_HISTORY_MAX_LENGTH) {
        state.priceHistory.shift(); // Remove oldest price
    }
}

function calculateMovingAverage() {
    if (state.priceHistory.length === 0) return 1.0; // Default to 1.0 if no history
    
    const windowSize = Math.min(MOVING_AVG_WINDOW_SIZE, state.priceHistory.length);
    const recentPrices = state.priceHistory.slice(-windowSize);
    const sum = recentPrices.reduce((total, price) => total + price, 0);
    return sum / windowSize;
}

function getMovingAverageCeiling() {
    const movingAvg = calculateMovingAverage();
    return movingAvg * CEILING_MULTIPLIER;
}

function getLogarithmicCeiling(basePrice) {
    // Use logarithmic scaling only for significantly high base prices
    if (basePrice > 10) {
        // Formula: basePrice * (1 + factor / log_base(basePrice))
        const logScaling = 1 + (LOG_SCALE_FACTOR / (Math.log(basePrice) / Math.log(LOG_BASE)));
        // Ensure scaling doesn't become excessively large or small due to edge cases
        const effectiveScaling = Math.max(1.0, Math.min(logScaling, 5.0)); // Cap scaling factor e.g., between 1x and 5x
        return basePrice * effectiveScaling;
    }
    // For lower multipliers, use the standard linear multiplier
    return basePrice * CEILING_MULTIPLIER;
}

function calculateVolatility() {
    if (state.priceHistory.length < VOLATILITY_WINDOW_SIZE) {
        return 0.1; // Default moderate volatility if not enough data
    }
    
    const recentPrices = state.priceHistory.slice(-VOLATILITY_WINDOW_SIZE);
    const avg = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
    
    if (avg === 0) return 0.1; // Avoid division by zero

    // Calculate standard deviation
    const squaredDiffs = recentPrices.map(price => Math.pow(price - avg, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / squaredDiffs.length;
    const stdDev = Math.sqrt(avgSquaredDiff);
    
    // Normalized volatility (relative to average price)
    return stdDev / avg;
}

function getVolatilityAdjustedCeiling(baseCeiling) {
    const volatility = calculateVolatility();
    
    // Higher volatility = lower ceiling (more conservative)
    // Lower volatility = allow up to base ceiling
    // Example: Reduce ceiling multiplicatively based on volatility. 1.0 = no reduction, higher vol reduces multiplier.
    const volatilityAdjustment = 1 / (1 + volatility * 2.0); // Example: Inverse relationship, dampened (tune the factor '2.0')
    const adjustedCeiling = baseCeiling * Math.max(0.5, Math.min(volatilityAdjustment, 1.0)); // Apply adjustment, floor at 50%, cap at 100%
    
    logger.debug(`[CeilingCalc] Volatility: ${(volatility * 100).toFixed(2)}%, AdjustmentFactor: ${volatilityAdjustment.toFixed(2)}, AdjustedCeiling: ${adjustedCeiling.toFixed(2)}x`);
    
    return adjustedCeiling;
}

function getAdaptiveCeiling() {
    const movingAvg = calculateMovingAverage(); // Use the *current* moving average as base for both
    const movingAvgCeiling = movingAvg * CEILING_MULTIPLIER; // Standard calculation
    const logScaledCeiling = getLogarithmicCeiling(movingAvg); // Log scale based on the current MA
    
    let phaseMultiplier = 1.0;
    if (state.gamePhase === 'EARLY_GAME') {
        phaseMultiplier = 1.2; // 20% higher ceiling allowance in early game
    } else if (state.gamePhase === 'LATE_GAME') {
        phaseMultiplier = 0.8; // 20% lower ceiling allowance in late game
    }
    
    // Choose the more permissive base ceiling (usually log-scaled for high prices)
    const baseCeiling = Math.max(movingAvgCeiling, logScaledCeiling);
    const phaseAdjustedCeiling = baseCeiling * phaseMultiplier;
    
    logger.debug(`[CeilingCalc] MA: ${movingAvg.toFixed(2)}x, MACeiling: ${movingAvgCeiling.toFixed(2)}x, LogCeiling: ${logScaledCeiling.toFixed(2)}x, PhaseFactor: ${phaseMultiplier}, PhaseAdjusted: ${phaseAdjustedCeiling.toFixed(2)}x`);
    
    return phaseAdjustedCeiling;
}

function calculateEntryCeiling() {
    // No need to call updatePriceHistory here, it's called every tick in handleGameStateUpdate
    
    const adaptiveCeiling = getAdaptiveCeiling(); // Includes phase adjustments
    const volatilityAdjustedCeiling = getVolatilityAdjustedCeiling(adaptiveCeiling);
    
    // Apply absolute min/maximum constraints
    const finalCeiling = Math.min(Math.max(volatilityAdjustedCeiling, MIN_ADAPTIVE_CEILING), MAX_ADAPTIVE_CEILING);
    logger.debug(`[CeilingCalc] Final Ceiling: ${finalCeiling.toFixed(4)}x (Min: ${MIN_ADAPTIVE_CEILING}, Max: ${MAX_ADAPTIVE_CEILING})`);
    state.lastCalculatedCeiling = finalCeiling; // Store for TUI
    return finalCeiling;
}

// --- End Adaptive Ceiling Functions ---

function shouldAvoidEntry(currentPrice) {
    /* Old Check:
    if (currentPrice >= CEILING_THRESHOLD) {
        logger.info(`[ContrarianBuy] Entry AVOIDED: Price ${currentPrice.toFixed(4)} is at or above CEILING_THRESHOLD ${CEILING_THRESHOLD}.`);
        return true;
    }
    */
    // New Adaptive Ceiling Check
    const currentCeiling = calculateEntryCeiling(); 
    if (currentPrice >= currentCeiling) {
        logger.info(`[ContrarianBuy] Entry AVOIDED: Price ${currentPrice.toFixed(4)} is at or above Adaptive Ceiling ${currentCeiling.toFixed(4)}.`);
        return true;
    }

    // Re-entry Cooldown Check (remains the same)
    if (RE_ENTRY_COOLDOWN_AFTER_EXIT && state.lastExitWasProfit && state.lastExitTime) {
        const timeSinceLastExit = Date.now() - state.lastExitTime;
        if (timeSinceLastExit < RE_ENTRY_COOLDOWN_DURATION_MS) {
            logger.info(`[ContrarianBuy] Entry AVOIDED: On ${RE_ENTRY_COOLDOWN_DURATION_MS / 1000}s re-entry cooldown after profitable exit. ${((RE_ENTRY_COOLDOWN_DURATION_MS - timeSinceLastExit)/1000).toFixed(1)}s remaining.`);
            return true;
        }
    }
    return false;
}

async function executeContrarianBuy(page, gameId, currentPrice, reason) {
    // --- Prevent Concurrent Actions ---
    if (state.actionInProgress) {
        logger.warn(`[ContrarianBuy] Aborted: Another action is already in progress.`);
        return false;
    }
    // --------------------------------
    
    // --- DEBUG LOGGING START ---
    logger.debug(`[BuyCalcDebug] Entering executeContrarianBuy. SESSION_TOTAL_CAPITAL: ${SESSION_TOTAL_CAPITAL}, Reason: ${reason}`);
    // --- DEBUG LOGGING END ---
    logger.info(`[ContrarianBuy] Evaluating buy for game ${gameId} (Reason: ${reason}). Price: ${currentPrice.toFixed(4)}`);
    
    if (state.isHoldingPosition) {
        logger.warn(`[ContrarianBuy] Aborted: Already holding a position.`);
        return false;
    }
    if (shouldAvoidEntry(currentPrice)) { // Uses the new refined check
        return false;
    }

    let effectiveCapitalPercent = state.currentCapitalAllocationPercent; // Base for current game phase

    if (reason === 'first_major_dip') {
        effectiveCapitalPercent *= FIRST_DIP_ALLOCATION_BOOST;
        logger.info(`[ContrarianBuy] Applying FIRST_DIP_ALLOCATION_BOOST (${FIRST_DIP_ALLOCATION_BOOST}x). New target: ${(effectiveCapitalPercent * 100).toFixed(2)}%`);
    } else if (state.extremeDipDetected && reason !== 'first_major_dip') { // Don't double boost if first dip was also extreme
        effectiveCapitalPercent *= EXTREME_DIP_CAPITAL_BOOST;
        logger.info(`[ContrarianBuy] Applying EXTREME_DIP_CAPITAL_BOOST (${EXTREME_DIP_CAPITAL_BOOST}x). New target: ${(effectiveCapitalPercent * 100).toFixed(2)}%`);
    }
    
    // --- DEBUG LOGGING START ---
    const term1 = SESSION_TOTAL_CAPITAL * effectiveCapitalPercent;
    const term2 = SESSION_TOTAL_CAPITAL * MAX_CAPITAL_PER_GAME_PERCENT - state.capitalUsedThisGame;
    logger.debug(`[BuyCalcDebug] Calculating betAmount: Math.min(SESSION_TOTAL_CAPITAL(${SESSION_TOTAL_CAPITAL}) * effectiveCapitalPercent(${effectiveCapitalPercent}), SESSION_TOTAL_CAPITAL(${SESSION_TOTAL_CAPITAL}) * MAX_CAPITAL_PER_GAME_PERCENT(${MAX_CAPITAL_PER_GAME_PERCENT}) - capitalUsedThisGame(${state.capitalUsedThisGame}))`);
    logger.debug(`[BuyCalcDebug] Term1 (Target Allocation): ${term1.toFixed(8)}, Term2 (Max Remaining Game Capital): ${term2.toFixed(8)}`);
    // --- DEBUG LOGGING END ---

    const betAmount = Math.min(term1, term2);
    // --- DEBUG LOGGING START ---
    logger.debug(`[BuyCalcDebug] Calculated betAmount (before check): ${betAmount.toFixed(8)}`);
    // --- DEBUG LOGGING END ---

    if (betAmount <= 0) {
        logger.warn(`[ContrarianBuy] Aborted: Calculated bet amount (${betAmount.toFixed(8)}) is zero or negative, or exceeds game capital limit.`);
        return false;
    }
    if (state.capitalUsedThisGame + betAmount > SESSION_TOTAL_CAPITAL * MAX_CAPITAL_PER_GAME_PERCENT) {
      // This secondary check might be redundant if term2 in Math.min is calculated correctly, but kept for safety.
      logger.warn(`[ContrarianBuy] Aborted (Secondary Check): Proposed bet ${betAmount.toFixed(8)} SOL plus capital already used ${state.capitalUsedThisGame.toFixed(8)} would exceed max capital per game (${(MAX_CAPITAL_PER_GAME_PERCENT * 100).toFixed(0)}%).`);
      return false;
    }

    const numClicks = Math.max(1, Math.round(betAmount / BASE_BET_AMOUNT));
    const actualBetAmount = numClicks * BASE_BET_AMOUNT;
    
    logger.info(`[ContrarianBuy] Executing BUY. Target: ${betAmount.toFixed(8)} SOL. Actual: ${actualBetAmount.toFixed(8)} SOL (${numClicks} clicks). Phase: ${state.gamePhase}.`);
    
    // --- Set Action Flag --- 
    state.actionInProgress = true;
    // ---------------------
    try {
        await clickButton(page, CLEAR_BUTTON_XPATH, 'CLEAR');
        for (let i = 0; i < numClicks; i++) {
            await clickButton(page, ADD_001_BUTTON_XPATH, `+${BASE_BET_AMOUNT} (${i+1}/${numClicks})`);
        }
        await clickButton(page, BUY_BUTTON_XPATH, 'BUY');
        
        // --- Update state AFTER successful clicks --- 
        state.isHoldingPosition = true;
        state.entryPrice = currentPrice; // Store entry price
        state.capitalUsedThisGame += actualBetAmount;
        state.currentTradeDetails = {
            buyPrice: currentPrice,
            buyTime: new Date().toISOString(),
            buyReason: reason,
            amount: actualBetAmount,
            sold: false,
            sellPrice: null,
            sellTime: null,
            sellReason: null,
            profit: null,
            isWin: null,
            lastKnownPrice: currentPrice,
            currentPrice: currentPrice,
            currentPnL: 0,
            peakPriceInTrade: currentPrice, // Initialize peak price at entry
            tiersTaken: TAKE_PROFIT_TIERS.map(() => false) // Initialize tiersTaken array
        };
        
        logger.info(`[ContrarianBuy] BUY successful. Entry: ${state.entryPrice.toFixed(4)}. Capital used this game: ${state.capitalUsedThisGame.toFixed(8)}`);
        return true;
    } catch (error) {
        logger.error(`[ContrarianBuy] Error during BUY action:`, error);
        return false;
    } finally {
        // --- Reset Action Flag ---
        state.actionInProgress = false;
        logger.debug(`[BuyActionDebug] Reset actionInProgress flag.`);
        // ---------------------
    }
}

function checkTakeProfitTiers(currentPrice) {
    if (!state.isHoldingPosition || !state.currentTradeDetails || !state.entryPrice) return null;
    
    const currentMultiplier = currentPrice / state.entryPrice;
    let highestTierReached = null;

    for (let i = TAKE_PROFIT_TIERS.length - 1; i >= 0; i--) {
        const tier = TAKE_PROFIT_TIERS[i];
        if (currentMultiplier >= tier.threshold && !state.currentTradeDetails.tiersTaken[i]) {
            highestTierReached = tier; // This is the highest unmet tier
            // Mark this tier as "pending" to be taken. The sell action will confirm it.
            // Actual selling of partial amounts is simplified to full exit in this version.
            // The 'percentToSell' is informational for this simplified model.
            logger.info(`[TakeProfit] Eligible for ${tier.reason} (Multiplier ${currentMultiplier.toFixed(2)} >= ${tier.threshold}).`);
            return tier; // Return the tier object
        }
    }
    return null; // No new tier reached or all eligible tiers taken
}


async function executeContrarianSell(page, gameId, currentPrice, sellReason) {
    // --- Prevent Concurrent Actions ---
    if (state.actionInProgress) {
        logger.warn(`[ContrarianSell] Aborted: Another action is already in progress.`);
        return false;
    }
    // --------------------------------
    
    // Determine the string reason for logging early
    const sellReasonString = (sellReason && typeof sellReason === 'object' && sellReason.reason) ? sellReason.reason : sellReason;

    logger.info(`[ContrarianSell] Evaluating sell for game ${gameId} (Reason: ${sellReasonString}). Price: ${currentPrice.toFixed(4)}`);
    
    if (!state.isHoldingPosition || !state.currentTradeDetails || state.currentTradeDetails.sold) {
        logger.warn(`[ContrarianSell] Aborted: No active position or already sold.`);
        return false;
    }
    
    // Store details before potentially modifying state
    const tradeToLog = { ...state.currentTradeDetails }; 
    const entryPriceForLog = state.entryPrice;

    // If the sellReason was a take-profit tier object, mark the tier as taken (on the main state)
    if (sellReason && typeof sellReason === 'object' && sellReason.reason && sellReason.reason.startsWith('take_profit_tier')) {
        const tierIndex = TAKE_PROFIT_TIERS.findIndex(t => t.reason === sellReason.reason);
        if (tierIndex !== -1 && state.currentTradeDetails) { // Check state.currentTradeDetails still exists
             state.currentTradeDetails.tiersTaken[tierIndex] = true;
        }
        // sellReason = sellReason.reason; // No longer needed as we use sellReasonString
    }

    logger.info(`[ContrarianSell] Executing SELL. Entry: ${entryPriceForLog?.toFixed(4)}, Current: ${currentPrice.toFixed(4)}, Reason: ${sellReasonString}`);
    
    // --- Set Action Flag --- 
    state.actionInProgress = true;
    // ---------------------
    try {
        await clickButton(page, SELL_BUTTON_XPATH, 'SELL'); // Assuming SELL sells the whole position
        
        // --- Update state AFTER successful click --- 
        // Mark the trade as sold *before* logging it
        tradeToLog.sold = true;
        tradeToLog.sellTime = new Date().toISOString();
        tradeToLog.sellPrice = currentPrice;
        tradeToLog.sellReason = sellReasonString; // Use the string reason
        
        // Log the trade using the captured details
        logTrade(gameId, tradeToLog, currentPrice);

        // Reset position state ONLY AFTER logging and AFTER successful click
        // This is now handled by logTrade itself setting isHoldingPosition = false etc.
        
        // Update re-entry cooldown state (needs profit info from the logged trade)
        // logTrade should handle this, but let's ensure profit is accessible
        if (tradeToLog.profit > 0) { 
            state.lastExitWasProfit = true;
            state.lastExitTime = Date.now(); // Use sell time from tradeToLog? No, use actual exit time.
            logger.info(`[ContrarianSell] Profitable exit. Re-entry cooldown active for ${RE_ENTRY_COOLDOWN_DURATION_MS/1000}s.`);
        } else {
            state.lastExitWasProfit = false;
            state.lastExitTime = null;
        }

        return true;
    } catch (error) {
        logger.error(`[ContrarianSell] Error during SELL action:`, error);
        return false;
    } finally {
        // --- Reset Action Flag --- 
        state.actionInProgress = false;
        logger.debug(`[SellActionDebug] Reset actionInProgress flag.`);
        // ---------------------
    }
}

function logTrade(gameId, trade, currentPriceOnSell) {
    if (!trade || typeof trade.buyPrice !== 'number' || typeof trade.amount !== 'number') {
        logger.warn(`[LogTrade] Skipping log for incomplete trade data for game ${gameId}`, {trade});
        return;
    }

    trade.sellPrice = typeof trade.sellPrice === 'number' ? trade.sellPrice : currentPriceOnSell;
    if (typeof trade.sellPrice !== 'number') {
        logger.error(`[LogTrade] Critical: Sell price is not a number for game ${gameId}. Using buy price as placeholder.`);
        trade.sellPrice = trade.buyPrice;
    }

    trade.profit = trade.amount * (trade.sellPrice - trade.buyPrice);
    trade.isWin = trade.profit > 0;

    if (!gamePnL[gameId]) gamePnL[gameId] = { trades: [], cumulative: 0 };
    gamePnL[gameId].trades.push({...trade}); // Log a copy
    gamePnL[gameId].cumulative += trade.profit;
    sessionTrades.push({ ...trade, gameId }); // Log a copy
    totalProfit += trade.profit;

    if (trade.isWin) {
        totalWins++;
        state.consecutiveLosses = 0;
        // --- Capital Recycling Logic --- 
        if (gameId === state.currentGameId) { // Ensure it's the current game we're tracking state for
            logger.info(`[CapitalMgmt] Profitable trade in game ${gameId}. Resetting capitalUsedThisGame from ${state.capitalUsedThisGame.toFixed(8)} to 0.`);
            state.capitalUsedThisGame = 0;
        }
        // ----------------------------- 
    } else {
        totalLosses++;
        state.consecutiveLosses++;
        if (state.consecutiveLosses >= LOSING_STREAK_THRESHOLD && !state.isManuallyCoolingDown) {
            state.autoCooldownRoundsRemaining = AUTO_COOLDOWN_ROUND_COUNT;
            logger.warn(`[LogTrade] Losing streak of ${state.consecutiveLosses} reached! Activating auto-cooldown for ${AUTO_COOLDOWN_ROUND_COUNT} rounds.`);
        }
    }

    const profitPercentage = (trade.buyPrice !== 0) ? (trade.profit / (trade.amount * trade.buyPrice)) * 100 : 0;
    let durationSec = null;
    if (trade.buyTime && trade.sellTime) {
        try {
            durationSec = ((new Date(trade.sellTime).getTime() - new Date(trade.buyTime).getTime()) / 1000).toFixed(2);
        } catch (e) { /* ignore date parsing error */ }
    }
    
    logger.info(`[TRADE_SUMMARY] ${trade.isWin ? 'WIN' : 'LOSS'} | Game: ${gameId} | Buy: ${trade.buyPrice.toFixed(4)} (${trade.buyReason || 'N/A'}) | Sell: ${trade.sellPrice.toFixed(4)} (${trade.sellReason || 'N/A'}) | Amt: ${trade.amount.toFixed(8)} | PnL: ${trade.profit.toFixed(8)} SOL (${profitPercentage.toFixed(2)}%) | Duration: ${durationSec ? durationSec + 's' : 'N/A'}`);
    
    const currentSessionCapital = initialSessionCapitalValue + totalProfit;
    const sessionStopLossThreshold = initialSessionCapitalValue * 0.70; // 30% drawdown from initial
    if (currentSessionCapital < sessionStopLossThreshold && !state.isManuallyCoolingDown) {
        logger.warn(`[SESSION_STOP_LOSS] Global session stop-loss triggered! Initial: ${initialSessionCapitalValue.toFixed(4)}, Current: ${currentSessionCapital.toFixed(4)}, Threshold: ${sessionStopLossThreshold.toFixed(4)}. Activating indefinite manual cooldown.`);
        state.isManuallyCoolingDown = true;
    }

    // Reset position-specific state after logging
    state.isHoldingPosition = false;
    state.currentTradeDetails = null;
    state.entryPrice = null;
    logger.debug(`[LogTrade] Reset position state for game ${gameId}.`);
}


// --- Main Game State Handler ---
export async function handleGameStateUpdate(page, gameStateData) {
    if (!gameStateData || typeof gameStateData.gameId === 'undefined') {
        logger.warn('[Strategy] Received invalid gameStateData:', gameStateData);
        return;
    }
    
    const { gameId, active, price, rugged, candles: newCandlesArray } = gameStateData;
    const currentPrice = typeof price === 'number' ? price : (state.currentTradeDetails?.lastKnownPrice || 1.0); // Fallback for currentPrice

    // --- New Round Detection (Must happen first) ---
    if (gameId !== state.currentGameId) {
        if (state.isHoldingPosition && state.currentTradeDetails && !state.currentTradeDetails.sold) {
            logger.warn(`[Strategy] New round ${gameId} started while holding in ${state.currentGameId}. Marking as loss.`);
            await executeContrarianSell(page, state.currentGameId, state.currentTradeDetails.lastKnownPrice || currentPrice, 'round_ended_holding');
        }
        await resetRoundState(page, gameId);
        logger.info(`[Strategy] --- New Round Detected: ${gameId} ---`);
        return;
    }

    // Log key game state (reduced frequency if needed, or keep for debug)
    // logger.info(`[Strategy Tick] Game: ${gameId} | Active: ${active} | Rugged: ${rugged} | Price: ${currentPrice?.toFixed(4)} | Phase: ${state.gamePhase} | Holding: ${state.isHoldingPosition}`);
    
    // Game event logging (can be verbose, consider sampling if performance is an issue)
    // gameEventsLogger.info({...}); // Simplified for brevity

    if (state.isHoldingPosition && state.currentTradeDetails && !state.currentTradeDetails.sold && typeof currentPrice === 'number') {
        state.currentTradeDetails.lastKnownPrice = currentPrice;
        state.currentTradeDetails.currentPrice = currentPrice;
        state.currentTradeDetails.currentPnL = state.currentTradeDetails.amount * (currentPrice - state.currentTradeDetails.buyPrice);
        if (currentPrice > state.currentTradeDetails.peakPriceInTrade) {
            state.currentTradeDetails.peakPriceInTrade = currentPrice;
        }
    }
    
    // --- Update Price History (Must happen early every valid tick) ---
    if (typeof currentPrice === 'number') {
        updatePriceHistory(currentPrice);
    }
    // ---------------------------------------------------------------
    
    // --- Extreme Multiplier Cooldown Trigger ---
    if (active && typeof currentPrice === 'number' && 
        currentPrice >= EXTREME_MULTIPLIER_THRESHOLD && 
        state.extremeMultiplierCooldownRoundsRemaining === 0 && 
        !state.isManuallyCoolingDown) { // Don't trigger if already manually cooling down
        
        logger.warn(`[RiskMgmt] EXTREME MULTIPLIER DETECTED (${currentPrice.toFixed(2)}x >= ${EXTREME_MULTIPLIER_THRESHOLD}x)! Activating cooldown for ${EXTREME_MULTIPLIER_COOLDOWN_ROUNDS} rounds.`);
        state.extremeMultiplierCooldownRoundsRemaining = EXTREME_MULTIPLIER_COOLDOWN_ROUNDS;
        
        // Optional: Force sell if holding a position when this triggers
        if (state.isHoldingPosition && state.currentTradeDetails && !state.currentTradeDetails.sold) {
            logger.warn(`[RiskMgmt] Forcing sell due to extreme multiplier detection.`);
            await executeContrarianSell(page, gameId, currentPrice, 'extreme_multiplier_exit');
            // If sell action was taken, its finally block will reset actionInProgress.
            // We should return here to not process other logic this tick if we forced a sell.
            return; 
        }
    }
    // -----------------------------------------

    // --- Cooldown Checks (Amended) ---
    if (state.isManuallyCoolingDown || state.autoCooldownRoundsRemaining > 0 || state.extremeMultiplierCooldownRoundsRemaining > 0) {
        if (state.isManuallyCoolingDown) {
            logger.info(`[Strategy] Manual cooldown is active. Skipping trade logic.`);
        } else if (state.autoCooldownRoundsRemaining > 0) {
            logger.info(`[Strategy] Auto-cooldown active. ${state.autoCooldownRoundsRemaining} rounds remaining.`);
        } else if (state.extremeMultiplierCooldownRoundsRemaining > 0) {
            logger.info(`[Strategy] Extreme multiplier cooldown active. ${state.extremeMultiplierCooldownRoundsRemaining} rounds remaining.`);
        }
        return; 
    }
    // -----------------------------------

    if (rugged && gameId === state.currentGameId) {
        if (!state.currentRoundLoggedAsRugged) { 
            logger.warn(`[Strategy] Game ${gameId} is RUGGED!`);
            state.currentRoundLoggedAsRugged = true;
        }
        
        if (state.isHoldingPosition && state.currentTradeDetails && !state.currentTradeDetails.sold) {
            logger.warn(`[Strategy] Marking held position in ${gameId} as loss due to RUG state (no click attempt).`);
            
            // Conceptual Sell - No click attempt because UI button is likely disabled
            // Clone currentTradeDetails to avoid modifying it while iterating or if logTrade is async in a way
            const tradeToLog = { ...state.currentTradeDetails }; 

            tradeToLog.sold = true;
            // Use last known price for sellPrice, or a nominal tiny value if unavailable
            tradeToLog.sellPrice = (tradeToLog.lastKnownPrice !== null && tradeToLog.lastKnownPrice !== undefined && tradeToLog.lastKnownPrice > 0) 
                                    ? tradeToLog.lastKnownPrice 
                                    : 0.00000001; 
            tradeToLog.sellTime = new Date().toISOString();
            tradeToLog.sellReason = 'rugged_no_click';
            
            // Ensure profit is calculated based on this conceptual sell price
            if (typeof tradeToLog.buyPrice === 'number' && typeof tradeToLog.amount === 'number') {
                tradeToLog.profit = tradeToLog.amount * (tradeToLog.sellPrice - tradeToLog.buyPrice);
                tradeToLog.isWin = tradeToLog.profit > 0;
            }
            
            logTrade(gameId, tradeToLog, tradeToLog.sellPrice); 
            // logTrade will set isHoldingPosition = false, currentTradeDetails = null, etc.

            // DO NOT call executeContrarianSell here as we are bypassing the click
        }
        return; // Stop further processing for rugged round
    }
    
    if (active) {
        if (!state.roundActiveTime) state.roundActiveTime = Date.now();
        updateGamePhase(); // Update game phase based on time

        if (typeof currentPrice === 'number') {
            state.priceHistory.push(currentPrice);
            if (state.priceHistory.length > MAX_PRICE_HISTORY_LENGTH) state.priceHistory.shift();
            
            // Update pattern detections based on new price
            detectSignificantDip(currentPrice); // This also updates state.extremeDipDetected
            detectBlowOffTop(currentPrice);    // This updates state.blowOffTopDetected
            if (!state.firstDipDetected) detectFirstMajorDip(currentPrice); // Check for first dip if not yet seen
        }

        // --- Calculate Patterns (using updated price history) ---
        if (typeof currentPrice === 'number') {
            // These functions now use state.priceHistory updated above
            detectSignificantDip(currentPrice); 
            detectBlowOffTop(currentPrice);    
            if (!state.firstDipDetected) detectFirstMajorDip(currentPrice); 
        }
        // -----------------------------------------------------

        // --- Critical Exit Checks (Every Tick if Holding) ---
        if (state.isHoldingPosition && state.currentTradeDetails && !state.currentTradeDetails.sold) {
            let criticalExitReason = null;
            const trailingStopThreshold = state.currentTradeDetails.peakPriceInTrade * (1 - getTrailingStopPercent());

            if (currentPrice <= trailingStopThreshold) {
                criticalExitReason = `trailing_stop (${(getTrailingStopPercent()*100).toFixed(0)}%)`;
            } else if (state.blowOffTopDetected) {
                criticalExitReason = 'blow_off_top_exit';
            } else if (state.gamePhase === 'LATE_GAME' && currentPrice > state.entryPrice * 1.05) { // Modest profit target in late game
                // criticalExitReason = 'late_game_modest_profit'; // This can be aggressive, consider combining with other signals
            }
            
            if (criticalExitReason) {
                logger.info(`[Strategy] CRITICAL EXIT for ${criticalExitReason}. Price: ${currentPrice.toFixed(4)}, Entry: ${state.entryPrice?.toFixed(4)}, Peak: ${state.currentTradeDetails.peakPriceInTrade.toFixed(4)}, TrailAt: ${trailingStopThreshold.toFixed(4)}`);
                await executeContrarianSell(page, gameId, currentPrice, criticalExitReason);
                return; // Exit after critical sell
            }

            // Tiered Take Profit Check (also acts as an exit)
            const takeProfitTier = checkTakeProfitTiers(currentPrice);
            if (takeProfitTier) {
                logger.info(`[Strategy] TAKE PROFIT TIER EXIT: ${takeProfitTier.reason}. Price: ${currentPrice.toFixed(4)}`);
                await executeContrarianSell(page, gameId, currentPrice, takeProfitTier); // Pass tier object as reason
                return; // Exit after tiered take profit
            }
        }

        // --- Candle-Based Logic (Runs on new candle index) ---
        const latestCandle = Array.isArray(newCandlesArray) && newCandlesArray.length > 0 ? newCandlesArray[newCandlesArray.length - 1] : null;
        if (latestCandle && typeof latestCandle.index === 'number' && latestCandle.index > state.lastCandleIndex) {
            state.lastCandleIndex = latestCandle.index;
            if (typeof latestCandle.open === 'number' && typeof latestCandle.close === 'number') { // Ensure candle has data
                 state.previousCandles.push({open: latestCandle.open, close: latestCandle.close, high: latestCandle.high, low: latestCandle.low, volume: latestCandle.volume || 0, index: latestCandle.index});
                 if (state.previousCandles.length > CANDLE_HISTORY_LENGTH) state.previousCandles.shift();
                 updateConsecutiveCandleCount();
            }
            logger.debug(`[Strategy] New candle ${latestCandle.index}. Price: ${currentPrice?.toFixed(4)}. Red:${state.consecutiveRedCandles}, Green:${state.consecutiveGreenCandles}. Phase: ${state.gamePhase}.`);

            // --- MOVED BUY LOGIC TO TICK-BASED SECTION BELOW ---

            // --- Contrarian Sell Logic (Candle-Timed, Non-Critical) ---
            if (state.isHoldingPosition && state.currentTradeDetails && !state.currentTradeDetails.sold) {
                let sellReason = null;
                if (state.consecutiveRedCandles >= CONSECUTIVE_RED_EXIT_COUNT && currentPrice > state.entryPrice) {
                    sellReason = `consecutive_${CONSECUTIVE_RED_EXIT_COUNT}_red_candles_profit`;
                }
                // Add other candle-based sell reasons if needed
                
                if (sellReason) {
                     logger.info(`[Strategy] Candle-based SELL SIGNAL: ${sellReason}. Price: ${currentPrice.toFixed(4)}`);
                    await executeContrarianSell(page, gameId, currentPrice, sellReason);
                }
            }
        }
        
         // --- CONSOLIDATED Buy Logic (Tick-Based) ---
        if (!state.isHoldingPosition && typeof currentPrice === 'number') {
            let buyReason = null; // Determine buy reason based on current state

            // Prioritize First Major Dip (using state flag updated by tick-based detection)
            if (state.firstDipDetected && !state.actedOnFirstDipThisGame) { 
                 buyReason = 'first_major_dip';
                 // Logic to set actedOnFirstDipThisGame happens *after* successful buy
            }
            // Else, check for regular significant dip (also updated on tick)
            else if (state.significantDipDetected && state.gamePhase !== 'LATE_GAME') {
                 buyReason = 'significant_dip'; // General dip reason
            }
            // Add other tick-based buy conditions here if needed (e.g., absolute bottom threshold)
            else if (currentPrice <= ABSOLUTE_BOTTOM_THRESHOLD && state.gamePhase !== 'LATE_GAME' && !state.blowOffTopDetected) {
                buyReason = 'absolute_bottom';
            }

            // If a reason was found, attempt the buy
            if (buyReason) {
                const success = await executeContrarianBuy(page, gameId, currentPrice, buyReason);
                if (success) {
                    // If buy succeeded, immediately reset dip flags to prevent instant re-buy on next tick
                    logger.debug(`[Strategy] Buy successful for ${buyReason}, resetting significantDipDetected flag.`);
                    state.significantDipDetected = false; 
                    
                    // Mark that we acted on the first dip if this was the reason
                    if (buyReason === 'first_major_dip') {
                        logger.debug(`[Strategy] Marking actedOnFirstDipThisGame = true.`);
                        state.actedOnFirstDipThisGame = true;
                    }
                }
                // No return here, allow rest of tick logic to proceed if needed
            }
        }

    } // End if(active)
}


// --- Export API Functions ---
export function getStrategyStats() {
    const totalTrades = totalWins + totalLosses;
    return {
        wins: Number(totalWins) || 0,
        losses: Number(totalLosses) || 0,
        totalProfit: (Number(totalProfit) || 0).toFixed(6),
        winRate: (totalTrades > 0 ? (totalWins / totalTrades * 100) : 0).toFixed(2),
        sessionTrades: [...sessionTrades], // Return a copy
        gamePnL: {...gamePnL} // Return a copy
    };
}

export function getCurrentStrategyState() {
    // Clone currentTradeDetails to avoid external modification issues
    const tradeDetailsClone = state.currentTradeDetails ? {
        ...state.currentTradeDetails,
        tiersTaken: state.currentTradeDetails.tiersTaken ? [...state.currentTradeDetails.tiersTaken] : [] 
    } : null;

    // Calculate potential next bet amount for display
    const potentialNextBet = SESSION_TOTAL_CAPITAL * state.currentCapitalAllocationPercent;

    return {
        currentGameId: state.currentGameId,
        isHoldingPosition: state.isHoldingPosition,
        currentTradeDetails: tradeDetailsClone,
        entryPrice: state.entryPrice,
        gamePhase: state.gamePhase,
        lastCandleIndex: state.lastCandleIndex, // Added for TUI
        recentPeakPrice: state.recentPeakPrice,
        recentTroughPrice: state.recentTroughPrice,
        firstDipDetected: state.firstDipDetected,
        actedOnFirstDipThisGame: state.actedOnFirstDipThisGame, // Added for TUI
        significantDipDetected: state.significantDipDetected,
        extremeDipDetected: state.extremeDipDetected,
        blowOffTopDetected: state.blowOffTopDetected,
        consecutiveRedCandles: state.consecutiveRedCandles,
        consecutiveGreenCandles: state.consecutiveGreenCandles,
        currentCapitalAllocationPercent: state.currentCapitalAllocationPercent,
        capitalUsedThisGame: state.capitalUsedThisGame,
        isManuallyCoolingDown: state.isManuallyCoolingDown,
        autoCooldownRoundsRemaining: state.autoCooldownRoundsRemaining,
        extremeMultiplierCooldownRoundsRemaining: state.extremeMultiplierCooldownRoundsRemaining, // Added for TUI
        lastExitWasProfit: state.lastExitWasProfit,
        lastExitTime: state.lastExitTime,
        adaptiveCeiling: state.lastCalculatedCeiling, // Added for TUI
        currentBetAmountDisplay: potentialNextBet.toFixed(8), // Added for TUI (formerly nextBetAmount)
        
        // Nested strategyState can be simplified or removed if TUI uses root directly
        strategyState: { 
            botOperationalState: state.isHoldingPosition ? 'HOLDING' : 'WAITING', 
            gamePhase: state.gamePhase,
            firstDipDetected: state.firstDipDetected,
            blowOffTopDetected: state.blowOffTopDetected,
            currentCapitalAllocationPercent: state.currentCapitalAllocationPercent,
            peakPriceInTrade: tradeDetailsClone?.peakPriceInTrade,
            lastCandleIndex: state.lastCandleIndex, // Also in nested for convenience if used
            adaptiveCeiling: state.lastCalculatedCeiling // Also in nested
        }
    };
}

export function toggleManualCooldown() {
    state.isManuallyCoolingDown = !state.isManuallyCoolingDown;
    logger.warn(`[Strategy] Manual cooldown ${state.isManuallyCoolingDown ? 'ENABLED' : 'DISABLED'}.`);
    return state.isManuallyCoolingDown;
}

export function initializeSessionCapital(userProvidedCapital) {
    const capital = parseFloat(userProvidedCapital);
    let validCapitalSet = false;
    
    if (userProvidedCapital === undefined || userProvidedCapital === null || String(userProvidedCapital).trim() === '') {
        logger.info('[StrategySetup] No user provided capital, using default.');
    } else if (!isNaN(capital)) {
        if (capital >= MIN_SESSION_CAPITAL && capital <= MAX_SESSION_CAPITAL) {
            SESSION_TOTAL_CAPITAL = capital;
            logger.info(`[StrategySetup] Session total capital initialized to: ${SESSION_TOTAL_CAPITAL.toFixed(4)} SOL by user input.`);
            validCapitalSet = true;
        } else {
            logger.warn(`[StrategySetup] User provided capital ${capital.toFixed(4)} SOL is out of bounds (${MIN_SESSION_CAPITAL.toFixed(4)} - ${MAX_SESSION_CAPITAL.toFixed(4)} SOL).`);
        }
    } else {
        logger.warn(`[StrategySetup] Invalid capital provided by user ('${userProvidedCapital}').`);
    }
    
    if (!validCapitalSet) {
        SESSION_TOTAL_CAPITAL = SESSION_TOTAL_CAPITAL_DEFAULT;
        logger.warn(`[StrategySetup] Using default session capital: ${SESSION_TOTAL_CAPITAL.toFixed(4)} SOL.`);
    }
    
    initialSessionCapitalValue = SESSION_TOTAL_CAPITAL;
    logger.info(`[StrategySetup] Initial session capital for global stop-loss tracking: ${initialSessionCapitalValue.toFixed(4)} SOL.`);
    
    state.currentCapitalAllocationPercent = EARLY_GAME_CAPITAL_PERCENT;
    logger.info(`[StrategySetup] Base capital allocation for trades set to: ${(state.currentCapitalAllocationPercent * 100).toFixed(2)}% of session capital (${(SESSION_TOTAL_CAPITAL * state.currentCapitalAllocationPercent).toFixed(4)} SOL).`);
}

// Ensure all exports are at the end or clearly marked if interspersed.
// All functions intended for export (handleGameStateUpdate, getStrategyStats, getCurrentStrategyState, toggleManualCooldown, initializeSessionCapital)
// and constants (LOSING_STREAK_THRESHOLD, AUTO_COOLDOWN_ROUND_COUNT, etc.) are already marked with 'export'. 