# Majick Karpet: Advanced Analytics & Reverse Engineering System for rugs.fun

## Project Vision & Core Objectives

The Majick Karpet project represents a comprehensive analytical approach to understanding, modeling, and eventually replicating the underlying algorithms that govern the rugs.fun cryptocurrency trading simulator game. Through systematic data collection and analysis, our goal is to decode the game's mechanics, revealing how factors like house profitability, player count, and average SOL per player influence game outcomes.

Our primary objectives include:

- **Algorithm Reverse Engineering**: Decoding the game's underlying mechanics through statistical analysis of large datasets  
- **Predictive Modeling**: Developing increasingly accurate models to predict game outcomes based on observable parameters  
- **Strategic Advantage**: Providing players with actionable intelligence not available in the standard game UI  
- **Game Replication**: Eventually developing our own version of the game based on the reverse-engineered algorithm  

## Current Understanding of the Algorithm

The official rugs.fun documentation states:  
> "Every game tick (250ms) has a very small house edge built in - roughly 0.05%."  

While this provides a baseline understanding, our analysis indicates the system is significantly more complex.  
We are currently working to quantify exactly how this edge is calculated and distributed across game sessions. Preliminary observations suggest the algorithm may be adjusting odds based on:

- Running averages of previous games (likely ~100 games)  
- Current house profitability status  
- Average SOL played per player per game  
- Number of players participating  
- Buy/sell patterns within each game  

The V3 "provably fair" verification system, while ostensibly providing transparency, actually reveals a fundamental design characteristic: all game outcomes are predetermined and stored server-side. As stated in their documentation:

> "The server keeps the actual server seed secret during the game and only reveals it after the game ends. This prevents anyone (including the operator) from knowing the outcome in advance, while still allowing for verification afterward."  

This approach essentially creates a system where:

- The game claims outcomes "cannot be manipulated"  
- Yet the algorithm determining those outcomes remains entirely opaque  
- The "verification" only confirms a predetermined outcome was followed  

The fact that the game is still in beta testing and already on their V3 verification system suggests ongoing adjustments to the core algorithm - precisely what our reverse engineering efforts aim to uncover.

## System Architecture

The project employs:

- **Data Collection Framework**: A sophisticated WebSocket-based system capturing all game events and player interactions in real-time  
- **Centralized Event Bus Architecture**: A modular, event-driven system allowing all components to communicate through a standardized protocol  
- **Analytical Services Layer**: Specialized services processing game data to extract patterns, probabilities, and strategic insights  
- **Dashboard Interface**: The visual frontend providing actionable intelligence derived from the analytical engines  
- **Strategy Development Environment**: Tools for testing hypothetical strategies against historical and live game data  

The system is designed with extreme modularity to allow for continuous refinement as our understanding evolves, with each component built to fail gracefully so problems in one module don't compromise the entire system.

## Dashboard Vision

The Majick Karpet Analytics Dashboard aims to be the definitive technical analysis engine for the rugs.fun platform. Drawing inspiration from professional trading platforms like TradingView and intuitive heads-up displays from modern FPS games, this dashboard provides critical real-time insights while maintaining split-second readability.

The fully realized dashboard features:

- **Real-time Game State Visualization**: Sophisticated candlestick charts replicating live game state  
- **Algorithmic Phase Detection**: Advanced analytics identifying the current game phase with visual transition indicators  
- **Predictive Risk Analysis**: Heat-mapped visualizations of rug probability with color-coded risk indicators  
- **Pattern Recognition System**: Real-time detection of price patterns with confidence metrics  
- **Tactical Signal Panel**: Entry/exit strength indicators and position sizing recommendations  
- **Game History Analytics**: Statistical analysis of previous games showing distribution of outcomes  
- **Customizable Layout**: Configurable widget positioning saved to localStorage  

The dashboard employs a fighter jet HUD-inspired aesthetic prioritizing high-information density (65%) while maintaining clean visual hierarchy (35%), ensuring critical data points can be perceived at a glance during rapid gameplay.

## Psychological Analysis Component

A key aspect of our research involves analyzing how the game algorithm may be designed to manipulate core psychological tendencies including:

- FOMO (Fear Of Missing Out)  
- Greed and loss aversion  
- Novelty-seeking behavior  
- Risk assessment biases  

By monitoring and recording game states that trigger these responses, we can potentially identify algorithmic patterns designed to exploit cognitive biases, further enhancing our understanding of the system's underlying mechanics.

## Current Development Focus

We are currently focusing on building and integrating a functional dashboard system with our existing event-based architecture to provide:

- Real-time visualization of game data  
- Phase recognition and risk assessment tools  
- Strategy recommendation systems  
- A modular framework that can evolve with our understanding  

---

This document serves as both a vision statement and a context primer for anyone joining or assisting with the Majick Karpet project. It encapsulates the project's ambitious goals while providing essential background on the system we're analyzing.
