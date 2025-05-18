# Majick Karpet - Phase 4: Enhanced Analytics Engine Plan

This document outlines the revised plan for developing the Enhanced Analytics Engine for the Majick Karpet project, marking the completion of Phase 4. It incorporates detailed feedback and aims to provide a structured, maintainable, and powerful analytics capability aligned with the `REVERSE_ENGINEERING_FRAMEWORK.md`.

## Overarching Goals

*   Systematically implement the components and methodologies of the `REVERSE_ENGINEERING_FRAMEWORK.md`.
*   Transform the rich dataset (stored in `majick_karpet.db`) into deep, actionable insights about the Rugs.fun game mechanics.
*   Drive the development and refinement of sophisticated, statistically-backed trading strategies.

## Phase 1: Foundational Infrastructure & Initial Analysis Workbench (Est. 4-6 weeks)

This phase focuses on setting up the core data pipeline, initial visualization components, and the hypothesis management structure.

### 1. Define a Clear Data Processing Pipeline:
    *   **Objective:** Establish a standardized ETL (Extract, Transform, Load) process and define analysis-ready data formats.
    *   **Actions:**
        *   **ETL Process Design:**
            *   Map out the data flow from the SQLite DB (`majick_karpet.db`) to analysis-specific formats. This includes cleaning, transformation (e.g., feature engineering, aggregation), and potential schema changes for analytical performance.
            *   Define intermediate data structures (e.g., Parquet files, in-memory DataFrames if using Python, or optimized tables/views if staying within SQL for some analyses) optimized for analytical queries.
        *   **Data Sampling Strategy:**
            *   Implement strategies for data sampling: full dataset for rigorous backtesting/validation, smaller representative samples for exploratory analysis and rapid prototyping to manage the database size efficiently.
        *   **Initial ETL Prototype:** Implement a small-scale ETL process for a subset of key data (e.g., game summaries, price updates for selected games, trade data).
    *   **Technology Stack Consideration:**
        *   Evaluate and decide on primary tools for ETL. If statistical analysis will lean heavily on Python, tools like Pandas, Dask (for larger-than-memory datasets), or Apache Arrow for efficient data interchange could be used. Node.js can orchestrate these Python scripts or handle lighter ETL tasks directly.

### 2. Develop Core Visualization Components & Unified Architecture:
    *   **Objective:** Build essential, reusable visualization components and establish a strategy for a unified visualization system.
    *   **Actions:**
        *   **Core Visualization Types:** Develop 3-5 essential, standardized visualization types (e.g., time-series plots for price/indicator data, scatter plots for correlation analysis, histograms/density plots for distributions, heatmaps).
        *   **Visualization Library/Strategy:** Select a primary visualization library (e.g., Chart.js if extending existing dashboard, Plotly for interactivity, or a Python library like Matplotlib/Seaborn/Plotly if analysis is Python-based). Aim for a common interface or wrapper if multiple libraries are needed.
        *   **Initial State Management (for Interactivity):** For interactive dashboards, think about a basic state management approach to allow users to adjust parameters, select data ranges, etc.

### 3. Formalize the Hypothesis Management & Testing Framework:
    *   **Objective:** Establish a structured approach for defining, tracking, and validating/falsifying hypotheses about game mechanics.
    *   **Actions:**
        *   **Hypothesis Template Definition:** Create a standardized format for defining hypotheses, including:
            *   Formal statement (clear, testable claim).
            *   Variables involved and their expected relationships.
            *   Expected statistical signatures (e.g., "if X, then Y should increase by Z%").
            *   Clear falsification criteria.
        *   **Hypothesis Registry (Initial):** Set up a simple system (e.g., a structured document, a set of markdown files in `docs/hypotheses/`, or a basic database table) to log hypotheses, their status (proposed, testing, validated, falsified), and links to supporting evidence/analyses. Consider version control for this registry.
        *   **Define Success Metrics for Validation:** Establish clear statistical criteria for hypothesis validation (e.g., p-value thresholds for significance tests, confidence interval requirements, effect size minimums).

### 4. Initial Multi-dimensional Analysis Workbench Implementation:
    *   **Objective:** Begin implementing tools for data exploration and pattern discovery using the new data pipeline and visualization components.
    *   **Actions:**
        *   **Expand Correlation Explorer:** Using the defined ETL process, systematically calculate correlations between a wider array of variables. Visualize these using the new core visualization components.
        *   **Enhance Distributional Analysis:** Apply statistical tests to determine the goodness-of-fit for various distributions to key game metrics.

## Phase 2: Parameter Inference, Advanced Visualization & Iterative Feedback (Est. 5-7 weeks)

This phase focuses on deriving quantitative insights, enhancing how they are visualized, and creating a loop back to strategy development.

### 1. Develop Parameter Estimation Framework & Initial Inference:
    *   **Objective:** Start estimating underlying game parameters based on data and validated hypotheses.
    *   **Actions:**
        *   **Statistical Framework:** Develop or adopt statistical methods for parameter estimation (e.g., Maximum Likelihood Estimation, Bayesian inference if applicable, or simpler curve fitting based on observed distributions).
        *   **Target Initial Parameters:** Focus on a few key parameters suspected from the `ANALYTICS_STRATEGY.md` or `REVERSE_ENGINEERING_FRAMEWORK.md`.
        *   **Performance Optimization:** For computationally intensive estimations, plan for how these will be run (e.g., batch processing, potential for parallelization if using appropriate Python libraries).

### 2. Expand and Integrate Visualization System:
    *   **Objective:** Create more sophisticated, adaptive visualizations connected to the analysis components and hypothesis testing.
    *   **Actions:**
        *   **Adaptive Visualizations:** Design visualizations that can dynamically adapt to display evidence for/against specific hypotheses or showcase parameter estimation results.
        *   **Connect to Hypothesis Registry:** Link visualizations directly to the hypotheses they are intended to explore or validate.
        *   **Pattern Recognition Visualizations:** Explore visual methods for highlighting detected patterns or anomalies.

### 3. Establish Iterative Feedback Loop to Strategies:
    *   **Objective:** Create clear pathways for analytical findings to influence and improve trading strategies.
    *   **Actions:**
        *   **Formal Promotion Process:** Define a process for how statistically validated patterns or inferred parameters from the analytics engine get incorporated into strategy logic or configuration.
        *   **Strategy Parameterization:** Ensure strategies are designed to easily accept parameters derived from analytics.
        *   **A/B Testing Framework (Backtesting):** Enhance the backtesting engine (`test-batch-backtest.js`) to support A/B testing of strategy variants based on different hypotheses or parameter sets. Compare performance systematically.

### 4. Refine Hypothesis Management:
    *   **Objective:** Improve the system for managing and prioritizing hypotheses.
    *   **Actions:**
        *   **Weighted Evidence Aggregation:** Consider a system (even if qualitative at first) to weigh different pieces of evidence supporting or contradicting a hypothesis.
        *   **Competing Hypotheses:** Develop a way to track and compare competing hypotheses that attempt to explain the same phenomenon.

## Phase 3: Advanced Analysis, Model Construction & Validation (Ongoing, iterative)

This phase aligns with the more advanced stages of the `REVERSE_ENGINEERING_FRAMEWORK.md`.

### 1. Advanced Pattern Recognition & Causal Analysis:
    *   Implement more sophisticated algorithms for pattern detection in event sequences and price data.
    *   Begin exploring techniques for causal inference to distinguish correlation from causation.

### 2. Algorithm Parameter Inference System (Fuller Implementation):
    *   Employ more advanced statistical techniques for parameter fitting.
    *   Implement confidence interval generation for parameter estimates.
    *   Conduct sensitivity analysis to see how changes in inferred parameters affect modeled outcomes.

### 3. Model Construction & Validation (Initial Stages):
    *   Based on validated hypotheses and inferred parameters, start building partial models of specific game mechanics.
    *   Use the backtesting engine to simulate these partial models and compare their output to observed game data (divergence analysis).

## Technical Stack Clarification:

*   **Data Storage & Core Orchestration:** Node.js and SQLite remain central.
*   **ETL & Heavy Analytics/Statistics:** Python is highly recommended for its rich ecosystem (Pandas, NumPy, SciPy, Statsmodels, scikit-learn). Node.js can orchestrate Python scripts (e.g., using `child_process`). Apache Arrow can be used for efficient data exchange between Node.js and Python if needed.
*   **Visualization:**
    *   For dashboards integrated into the Node.js app: Chart.js, Plotly.js.
    *   For exploratory analysis within a Python environment: Matplotlib, Seaborn, Plotly (Python version), Bokeh.
*   **Modularity:** Design the analytics components as modular, pluggable systems. This allows for easier integration of different statistical libraries or even swapping out components in the future.

## Practical Next Steps (To Initiate Phase 1)

1.  **Data Pipeline Prototype:**
    *   **Action:** Create a small-scale ETL process: Extract data for a few key metrics (e.g., per-game summary stats, tick data for 10-20 representative games) from SQLite. Transform it into an analysis-ready format (e.g., CSVs, Parquet files, or directly into Pandas DataFrames via a Node.js-Python bridge). Load it for use by an initial analysis script.
    *   **Focus:** Test data extraction, basic transformation, and the chosen analysis-ready format.
2.  **Core Visualization Components:**
    *   **Action:** Build 3-5 essential, reusable visualization functions/components (e.g., a time-series plotter, a histogram generator, a scatter plot function) using the chosen library.
    *   **Focus:** Reusability and ability to feed data from the pipeline prototype.
3.  **Hypothesis Template & Initial Registry:**
    *   **Action:** Define the standard markdown (or other structured format) template for hypothesis documentation. Create an initial `docs/hypotheses/` directory (or similar) and populate it with 1-2 example hypotheses based on `ANALYTICS_STRATEGY.md`.
    *   **Focus:** Clarity, completeness of the template, and ease of use.
4.  **Parameter Estimation Framework (Conceptual + Basic):**
    *   **Action:** Outline the statistical approach for estimating one or two initial parameters (e.g., average rug tick based on observed distribution). Implement a basic script (Python or Node.js, depending on complexity) to calculate this from the data pipeline output.
    *   **Focus:** Feasibility of the chosen statistical method and integration with the data pipeline.
5.  **Define Statistical Criteria for Hypothesis Validation:**
    *   **Action:** Document the initial set of statistical criteria (e.g., target p-value < 0.05, minimum sample size for a test) that will be used to consider a hypothesis as provisionally validated or falsified.
    *   **Focus:** Establishing a baseline for rigor. 