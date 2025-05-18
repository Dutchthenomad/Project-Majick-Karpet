# Rugs.fun House Edge Tracker

This project provides tools for analyzing the house edge and market mechanics in the Rugs.fun game. It includes a terminal-based UI and browser-based dashboards for real-time monitoring and data collection.

## Features

- Real-time tracking of game state, price movements, and house position
- Player position tracking with usernames and PnL calculation
- Detailed analysis of trade activity and liquidity
- Signal generation for potential buy/sell opportunities
- Correlation tracking to validate trading signals
- Statistics collection for long-term analysis
- Rug pull detection and risk assessment

## Setup

1. Make sure you have [Node.js](https://nodejs.org/) installed (v16+ recommended)
2. Extract all files to a directory
3. Open a terminal/command prompt in that directory
4. Install dependencies:

```
npm install
```

5. Make sure you have a Chromium-based browser installed (Chrome/Brave) that the tracker can connect to

## Running the Terminal Tracker

The terminal UI provides a text-based interface for monitoring the game:

```
npm run track
```

This will start the tracker in your terminal, connecting to the game and displaying real-time information.

Controls:

- Press `Q` to exit
- Press `R` to reset statistics
- Press `D` to view data summary

## Running the Browser Dashboards

### Simple Dashboard (Recommended)

The simple dashboard provides a clean, modern interface with charts and player tracking:

```
npm run simple
```

This will start a local web server on port 3001. Open your web browser and navigate to:

```
http://localhost:3001
```

### Full Dashboard

The full-featured dashboard provides additional analysis tools:

```
npm run dashboard
```

This will start a local web server on port 3000. Open your web browser and navigate to:

```
http://localhost:3000
```

## Running the Trading Bot

To run the automated trading bot with House Tracker functionality:

```
npm start
```

The bot works by:

1. Connecting to the game via a browser window
2. Monitoring WebSocket messages for game state and player positions
3. Calculating the house position in real-time
4. Generating buy/sell signals based on the house edge theory
5. Executing trades according to the strategy defined in `strategy3_refined.js`

You'll need to log into your Phantom wallet when prompted before the bot can operate. The bot will display a terminal UI showing real-time analysis while it runs.

### Customizing Bot Strategy

You can modify the trading strategy by editing these files:

- `strategy3_refined.js` - Contains the core trading logic
- `config.js` - Contains settings for minimum/maximum bet sizes and thresholds

## Game Theory Documentation

See the included `GAME_THEORY.md` file for a comprehensive analysis of:

- Core game mechanics and parameters
- Market manipulation theories
- Case studies of actual games
- Player psychology and trading patterns
- Research questions for further investigation

This document provides the theoretical foundation for the tracking and signal generation features.

## Project Components

- `house_tracker.js` - Core tracking functionality
- `tracker_only.js` - Terminal UI for the tracker
- `simple_dashboard.js` - Web-based dashboard (port 3001)
- `house_dashboard.js` - Full-featured dashboard (port 3000)
- `main.js` - Main bot entry point
- `websocket_handler.js` - WebSocket connection handler
- `config.js` - Configuration settings
- `strategy3_refined.js` - Trading strategy (used by main.js)

## Data Collection

The tracker collects and analyzes multiple types of data:

- **Game Statistics**: Tracks total games, rug pulls, durations, and outcomes
- **Trading Signals**: Monitors buy/sell signal accuracy with success rates
- **House Position**: Records changes in house position over time
- **Player Activity**: Tracks all player positions, trades, and PnL

This data is maintained in memory during the session and can be viewed in the dashboard or terminal UI.

## Notes

- This tool is for educational and research purposes only
- No actual trading is performed by the tracker unless you explicitly run the trading bot
- The dashboard requires an active internet connection
- You will need to log into Phantom wallet in the connected browser
- All data is stored in memory only and will be reset when the tracker is closed

## Troubleshooting

- **Port in use**: If you see errors about port 3000 or 3001 being in use, change the port in the respective dashboard JS file
- **Browser connection**: Make sure Chrome/Brave is installed and not running in a way that blocks debugging connections
- **Websocket errors**: Ensure you have a stable internet connection
- **Display issues**: For terminal UI, ensure your terminal supports Unicode and colors
