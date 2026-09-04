# ARB Bearings - Production Planning & Analytics Dashboard

This is a premium, high-fidelity, single-page web application (SPA) built for **ARB Bearings** to automate their production planning lifecycle, analyze historical trends, and monitor variances.

---

## 🌟 Key Features

1. **Interactive Analytics Dashboard:** Includes 8 dynamic KPI cards (featuring the WAPE-based Forecast Accuracy metric) and 11 responsive data visualizations powered by `Chart.js`, including:
   - Monthly Production Trend (Line)
   - Quarterly Production Comparison (Grouped Bar)
   - Year-over-Year Growth (Area)
   - Production by Unit / Category (Bars)
   - Unit / Category Contribution shares (Donuts)
   - Top & Least Produced Bearings
   - Planned vs. Actual tracking
   - Custom CSS Grid Heatmap (Units vs. Months matrix representation)

2. **Automated Planning Engine:** Employs the company's dual-quarter historical baseline algorithm (combining previous year's same quarter + latest completed quarter of current year), scales by a user-defined growth rate, and distributes target volumes equally over a rolling 6-month timeline.

3. **Editable Targets Grid:** Allows planners to override planned target cells in the rolling schedule with visual indicator highlights (amber borders) for manually edited cells.

4. **Multi-Format Reports (8 Operational Reports):** Aggregates data and supports exports in **Excel (SheetJS)**, **CSV**, and **PDF (jsPDF + AutoTable)** for:
   - Monthly / Quarterly Production Reports
   - Six-Month Production Plan
   - Unit-wise / Category-wise / Bearing-wise Production Reports
   - Planned vs. Actual variance report
   - Yearly Production Summary

5. **Data Ingestion Engine:** Supports drag-and-drop or file selector uploads of Excel/CSV records. Checks field schema validity, negative quantities, flags errors by row numbers, and offers a Wizard Modal to resolve duplicates (Overwrite vs. Skip).

6. **Interactive Role Switcher:** Simulates system views from three role perspectives (`Admin`, `Production Planner`, and `Viewer`) with instantaneous Role-Based Access Control (RBAC) restrictions.

---

## 📂 File Structure

*   `index.html`: Main shell structure, loading SheetJS, PapaParse, jsPDF, and Chart.js via CDNs.
*   `index.css`: Styling configurations implementing a custom obsidian dark violet theme, responsive grids, and animations.
*   `mockData.js`: Programmatic 3-year production history seeding database state (January 2023 - June 2026).
*   `uploader.js`: File spreadsheet parser, header standardizer, validation schema, and duplicate scanner.
*   `charts.js`: Handles creation, scaling, destruction, and themes for all 10 Chart.js canvases and the matrix heatmap.
*   `reports.js`: Prepares report tables, aggregates totals, and exports files.
*   `app.js`: Connects controllers, handles routers, state mutations, and baseline calculations.

---

## 🚀 How to Run the Application

Since this is a client-side SPA with zero server dependencies, you can launch it in a few simple ways:

### Option A: Local Live Server (Recommended)
If you are running in a local developer environment, spin up a simple static files server.
For example, using Python:
```bash
python -m http.server 8000
```
Then navigate to `http://localhost:8000` in your web browser.

Alternatively, using Node.js `http-server`:
```bash
npx http-server ./
```

### Option B: Direct File Load
Simply locate the `index.html` file in your workspace folder (`c:\Users\amank\OneDrive\Desktop\prod plan`) and double-click to open it directly in any modern web browser.
*(Note: Some browsers limit local file schema access for certain web storage or worker files, so running a local live server as in Option A is recommended for full Excel/PDF export compatibility).*
