# Rugs.fun Game Theory and Mechanics Analysis

## Introduction

This document compiles our current understanding of Rugs.fun game mechanics, observed patterns, market manipulation theories, and practical strategies. It serves as both a reference and a starting point for further research and strategy development.

## Core Game Mechanics

### Game Structure (From Official Docs)

- **Round Start:** Each game round begins with the price multiplier at `1.00x`.
- **Tick System:** The game advances in discrete time steps (ticks) every 250 milliseconds.
- **Price Evolution:** Price multiplier changes each tick based on:
  - **Regular Drift:** Small fluctuations based on `DRIFT_MIN` (-0.02) to `DRIFT_MAX` (0.03) plus volatility
  - **Big Moves:** 12.5% chance per tick of a larger move (15-25% in either direction)
  - **God Candles:** 0.001% chance of a massive 10x multiplier increase
- **Rug Event:** At the start of each tick, there's a 0.5% probability (`RUG_PROB`) that the game "rugs" (crashes), ending the round.
- **Visual Representation:** Every 5 ticks form a "candle" (`index` field, roughly 1.25 seconds), providing a familiar chart interface at an accelerated pace.

### Player Actions

- **Buy:** Players enter positions at the current price multiplier.
- **Sell:** Players can exit positions manually or via auto-sell targets.
- **Outcomes:** Players who sell before a rug multiply their bet by the exit multiplier. Players who don't sell before a rug lose their entire bet.

## Market Manipulation Theory

### Core Hypothesis

The Rugs.fun game appears random but operates on a sophisticated internal balancing algorithm that manipulates price movements based on the aggregate position of players relative to the house. This creates predictable (and exploitable) patterns despite the seemingly chaotic price action.

### Key Mechanics

1. **House Position Influence:**
   - When players are collectively in profit (house position negative), the algorithm tends to create adverse price movements to recoup losses
   - When players are collectively at a loss (house position positive), the algorithm may create buying opportunities through dips that are likely to reverse

2. **Solvency Maintenance:**
   - The "price" is simply a multiplier on players' buy-in amounts
   - The game algorithm continuously monitors total potential liability (sum of all positions × current price)
   - When this liability exceeds a certain threshold, the game is programmed to "rug" (crash the price) to ensure long-term solvency
   - This creates a predictable end-game once certain liability thresholds are reached

3. **Signal Generation:**
   - Strong BUY signals occur when: House is winning (positive position) AND price is dropping
   - Strong SELL signals occur when: House is losing (negative position) AND price is rising
   - These contrarian signals capitalize on the game's tendency to balance its risk exposure

4. **Psychological Exploitation:**
   - The 250ms tick rate operates at "the bleeding edge of human detection"
   - This rapid pace forces players into instinctive rather than analytical decision-making
   - Visual candles form approximately every 5 ticks ("index" in the game data), creating a familiar but accelerated chart pattern
   - Most players fall into predictable behavioral traps (FOMO buying, panic selling) that the algorithm can exploit

### House Bot Intervention Hypothesis

There appears to be coordinated intervention by house-controlled "Anon" accounts that:
1. **Provide Emergency Liquidity:** Enter the market in clusters when the game needs additional liquidity
2. **Balance Game States:** Counteract extreme positions that might crash the game prematurely
3. **Execute Impossibly Precise Trades:** Use oddly specific amounts that would be mathematically impossible for humans to calculate and execute at the game's 250ms tick rate
4. **Buy/Sell in Coordinated Patterns:** Show unusually synchronized trading behavior suggesting algorithmic control

### Player Engagement Maintenance Theory

The "Anon" accounts don't just provide market stabilization - they actively drive engagement by:
1. **Preventing Dead Periods:** Injecting activity during lulls when natural player interaction wanes
2. **Creating Artificial Excitement:** Generating price volatility to prevent the game from becoming stale
3. **Baiting Player Reactions:** Making provocative trades designed to trigger emotional responses
4. **Maintaining Game Tempo:** Ensuring the game maintains a certain rhythm of activity

## Case Study: Game #20250429-f14e8e51c9b44c09

### Game Overview
- **Duration:** 97 seconds (from 07:47:32 to 07:49:09)
- **Price Range:** 0.50x to 1.59x (219% amplitude)
- **Players:** 12 traders
- **Ending:** Terminal "rug pull" at tick 388

### Key Phases and Player Psychology

#### Act I: The Naive Presale (Ticks 0-10)
- Five players bought at the standard 1.0x entry
- Esk entered at tick 4 with 0.019 SOL, then quickly sold at 1.04x for a 0.7% profit

#### Act II: First Major Expansion (Ticks 11-30)
- Price accelerated upward via BIG_MOVE event (1.05x to 1.24x)
- Classic FOMO behavior: Diane bought at 1.25x near the top
- Market reversed to 0.94x, where contrarians (Esk) bought the dip
- Market bounced to 1.32x, allowing Esk to exit with 31% profit

#### Act III: The Great Depression (Ticks 31-60)
- Market plunged to 0.50x (absolute bottom)
- Esk made brilliant contrarian trade, buying at 0.65x near bottom
- Price immediately reversed to 0.98x in just 1.25 seconds

#### Act IV-VII: Volatility and Terminal Rug
- Extreme whipsaw conditions (0.65x to 1.42x swings)
- Final parabolic rise to 1.59x
- Classic top-buying by Scriptjerk and herbertonic at 1.55x
- Terminal rug at tick 388, liquidating 7 players

### Player Archetypes
- **Contrarian Masters:** Esk (+60-70% ROI) - Multiple perfect bottom entries
- **Patient Strategists:** Herbertonic (+40-50% ROI) - Value buying, excellent exits
- **FOMO Victims:** Diane (-40-45% ROI) - Classic buy-high, sell-low pattern
- **Hyperactive Traders:** Shankles (-30-40% ROI) - Excessive trading with poor timing
- **Rug Victims:** Multiple players caught in final collapse (near-total loss)

## Research Questions for Further Investigation

1. **House Position Threshold:** Does the house maintain a specific "limit" for how negative its position can become before algorithmic intervention becomes more aggressive?

2. **Liability Metrics:** What is the exact calculation for the game's internal "rug risk" assessment? Is it purely mathematical or does it incorporate player behavior patterns?

3. **Bot Identification:** Can we definitively separate house-controlled bots from real players through statistical analysis of trade timing, sizes, and patterns?

4. **Predictive Signals:** What combination of market conditions (house position, price trend, player count, liquidity) provides the highest-accuracy signals for upcoming price movements?

5. **Game Parameter Variations:** Does the game subtly adjust parameters like rug probability or big move chance based on house position or time of day?

6. **Signal Validation:** What is the statistical success rate of our buy/sell signal generation across a large sample of games?

## Practical Strategy Applications

1. **Counter-Cyclical Trading:**
   - Buy when house is profitable and price is dropping
   - Sell when house is losing and price is rising

2. **Liquidity Analysis:**
   - Monitor total player positions and their aggregate value
   - Exit positions when total liability approaches historical thresholds

3. **Pattern Recognition:**
   - Identify "distribution" phases (smart money selling to naïve buyers)
   - Recognize "accumulation" phases (smart money buying from panic sellers)

4. **Player Psychology Exploitation:**
   - Counter-position against visible FOMO behavior
   - Take contrarian positions during extreme fear

The House Edge Tracker helps validate these theories by monitoring game state, tracking player positions, and calculating signals in real-time based on these hypotheses. 