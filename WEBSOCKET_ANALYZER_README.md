# WebSocket Data Analyzer for Reverse Engineering

This set of tools allows you to capture, analyze, and visualize WebSocket messages for reverse engineering purposes.

## Overview

The WebSocket Data Analyzer provides the following capabilities:

1. **Capturing Raw WebSocket Data**: Intercepts and stores all WebSocket messages in their raw form.
2. **Structured Data Dictionary**: Organizes WebSocket messages by type, structure, and patterns.
3. **Visual Dashboard**: Presents real-time and historical data in a web-based dashboard.
4. **Pattern Analysis**: Detects patterns and sequences in the WebSocket messages.
5. **Export and Report Tools**: Generates reports and exports data for offline analysis.

## Getting Started

### Running the Tools

You can access the WebSocket analyzer tools in multiple ways:

1. **From Main Menu**:

   ```
   node main.js
   ```

   Then select "WebSocket Data Analyzer (for reverse engineering)" from the menu.

2. **Direct Dashboard**:

   ```
   node ws_dashboard.js
   ```

   This launches the dashboard directly at http://localhost:3002

3. **Command-line Tool**:
   ```
   node ws_dataminer.js [command]
   ```
   Available commands:
   - `stats`: Show statistics about collected data
   - `report`: Generate a comprehensive Markdown report
   - `analyze`: Analyze patterns in the data
   - `export`: Export all data for offline analysis
   - `help`: Show help message

## Dashboard Interface

The dashboard at http://localhost:3002 provides:

- Real-time streaming of WebSocket messages
- Message type distribution and statistics
- Structure visualization and pattern detection
- Tools to generate reports and export data

## Data Files

All captured WebSocket data is stored in the `./ws_data_capture` directory:

- JSON data files with timestamped filenames
- Markdown reports in the `./ws_data_capture/reports` subdirectory
- Pattern analysis and structure exports

## Understanding the Data

### Message Types

WebSocket messages are categorized by type, which is typically the first element in the received array. Common types include:

- `gameStateUpdate`: Game state information
- `tradeEvent`: Trade-related events
- `engine.io.control`: Socket.IO control messages

### Data Structure

Each message type has a structure that shows its fields and data types. The dashboard provides a visual representation of these structures.

### Patterns

The pattern analyzer detects sequences and patterns in the WebSocket messages. This can be valuable for understanding the protocol and algorithm behavior.

## Reverse Engineering Workflow

1. **Data Collection**: Run the bot and collect WebSocket messages during normal operation.
2. **Pattern Analysis**: Use the analyzer to identify patterns in the messages.
3. **Structure Mapping**: Map the structure of key message types.
4. **Offline Analysis**: Export data for more in-depth offline analysis.
5. **Hypothesis Testing**: Formulate and test hypotheses about the algorithm.

## Advanced Usage

### Custom Analysis

You can extend the analyzer by modifying `ws_analyzer.js` to add custom analysis functions.

### Data Export

Use the `exportAllData()` function from `ws_analyzer.js` to export all collected data for external analysis in tools like Python, R, or Excel.

### Integration with Other Tools

The data files are in JSON format, making them easy to process with other analysis tools and programming languages.

## Troubleshooting

- If the dashboard doesn't show any messages, ensure the bot is running and connected to the website.
- If the data dictionary doesn't update, check the browser connection and WebSocket status.
- For large data collections, the dashboard might become slower - use the export tools for offline analysis.

## Notes

This toolkit is designed for educational and research purposes only. Use responsibly and in accordance with website terms of service.
