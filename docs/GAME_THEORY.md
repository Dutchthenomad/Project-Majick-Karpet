# Rugs.fun Game Theory & Mechanics Analysis

## Introduction

This document summarizes Rugs.fun mechanics, observed patterns, manipulation theories, and strategic insights.

## Core Game Mechanics

### Game Structure

- **Round Start**: Multiplier begins at `1.00×`.
- **Ticks**: Discrete 250 ms intervals.
- **Price Evolution**:
  - **Drift**: Random change between `DRIFT_MIN` (-0.02) and `DRIFT_MAX` (0.03).
  - **Big Moves**: 12.5% chance per tick of ±15–25% change.
  - **God Candles**: 0.001% chance of a ×10 spike.
- **Rug Event**: 0.5% chance per tick (via `RUG_PROB`) to crash.
- **Candles**: Groups of 5 ticks (~1.25 s) for charting.

### Player Actions

- **Buy**: Enter at current multiplier.
- **Sell**: Exit manually or via auto-sell.
- **Outcome**: Sell before rug multiplies bet; rug equals total loss.

## Market Manipulation Theory

### House Position Influence

- Algorithm adjusts price to rebalance house exposure:
  - **Player Profit**: Adverse moves to recoup losses.
  - **Player Loss**: Dips created for house edge.

### Solvency Maintenance

- Monitors total liability (`positions × multiplier`).
- Triggers rug when liability > threshold.

### Signal Generation

- **Buy**: House profitable + falling price.
- **Sell**: House losing + rising price.

### Psychological Exploitation

- Fast ticks drive instinctive behavior.
- Familiar candles induce FOMO/panic.

## House Bot Intervention Hypothesis

Coordination by house “Anon” accounts:

- Emergency liquidity injections.
- Counter-balancing extreme states.
- Precise, synchronized trades.

## Player Engagement Maintenance

Bots sustain activity by:

- Preventing dead periods.
- Generating artificial volatility.
- Baiting player reactions.

## Case Study: Game #20250429-f14e8e51c9b44c09

### Game Overview

- **Duration**: 97 s (07:47:32 – 07:49:09).
- **Range**: 0.50× – 1.59× (219% amplitude).
- **Players**: 12.
- **Outcome**: Rug at tick 388.

### Phases & Psychology

1. **Presale (0–10 ticks)**: Naïve entries at 1.00×.
2. **Expansion (11–30)**: BIG_MOVE to 1.24×; FOMO buys; dips for contrarians.
3. **Depression (31–60)**: Crash to 0.50×; contrarian bottom buys.
4. **Volatility & Rug**: Swings to 1.59×; final rug at 388 liquidates many.

### Player Archetypes

- **Contrarians**: Esk (+60–70% ROI).
- **Strategists**: Herbertonic (+40–50% ROI).
- **FOMO Victims**: Diane (–40–45% ROI).
- **Hyperactives**: Shankles (–30–40% ROI).
- **Rug Victims**: Late buyers.

## Research Questions

1. House position threshold for intervention?
2. Exact liability calculation for rug risk?
3. Separating bots from real players statistically?
4. Optimal signal indicator combinations?
5. Dynamic parameter adjustments over time?
6. Signal accuracy across game samples?

## Practical Strategy Applications

- **Counter-Cyclical**: Buy dips, sell surges.
- **Liquidity Monitoring**: Watch exposure thresholds.
- **Pattern Recognition**: Distribution vs. accumulation.
- **Psych Exploitation**: Capitalize on FOMO and panic.
