Changelog

All notable changes to branch `hilmy`.

2025-10-18

- Added: `frontend/src/components/astrology/BaZiCycleAnalysis.tsx`
  - Yearly/Monthly/Daily tabs (shared) for Element and Shio performance
  - BaZi Month aggregation (fallback solar-term boundaries) for Monthly
  - Daily Open-Close (% Day) metric for Daily
  - Dynamic table headers/columns per timeframe
  - Inline `TimeframeTabs` control
  - Helpers: `aggregateByElementMonthly`, `aggregateByElementDaily`, `aggregateByShioMonthly`, `aggregateByShioDaily`, `getBaziMonthIndex`, `getBaziMonthKey`

- Changed: Element/Shio tables
  - Switch data source per tab (Yearly/BaZi Monthly/Daily)
  - Labels: “Avg Open-Close % (BaZi Month)” and “Avg Open-Close % (Day)”
  - Hide period Open-Close and counts in Daily where not applicable
  - Header alignment: force left alignment (justify-items-start)

- Fixed
  - JSX fragment error (adjacent elements) in Element section
  - Header row centering issue

- Maintenance
  - Rebased `hilmy`, resolved conflict in `frontend/src/components/stock-transaction/StockTransactionDoneDetail.tsx` (kept remote version)

