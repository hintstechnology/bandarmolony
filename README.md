# Bandarmolony – Frontend/Backend

This repository contains the Bandarmolony frontend (React + Vite) and backend (Node.js) apps.

## New: BaZi Cycle Analyzer

Path: `frontend/src/components/astrology/BaZiCycleAnalysis.tsx`

What it does:
- Analyze performance by Element and Shio across three timeframes: Yearly, Monthly (BaZi Month), and Daily.
- Monthly uses BaZi Month grouping (approx. solar-term boundaries), not Gregorian months.
- Daily includes per-day Open→Close percentage and daily stats.

How to use:
1) Open the “Ba Zi Cycle Analyzer” view in the app.
2) Upload daily OHLC CSV (headers should include at least `date`, `open`, `close`; `high`, `low`, `volume` are optional).
3) Fill ticker, choose anchor method, select date range, then Run Analysis.
4) Switch the tabs (Yearly/Monthly/Daily) to change the aggregation and columns.

Displayed metrics:
- Avg Daily Ret (%), Prob Up/Down (%), Avg Open→Close (% period), count of periods (Years/Months), and Avg ATR/Close (%).
- In Daily, the period Open→Close becomes per-day Open→Close; the count column is hidden.

## Developer Notes

- The Element and Shio tables update their labels/columns based on the selected timeframe. Headers are left-aligned.
- Helper functions for aggregation and BaZi month keys are in `BaZiCycleAnalysis.tsx`.
- Recent changes are tracked in `CHANGELOG.md` on branch `hilmy`.

## Running Locally

Frontend
```
cd frontend
npm install
npm run dev
```

Backend
```
cd backend
npm install
npm run dev
```

