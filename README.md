# Stock Projection Lab

A private, Render-ready stock research dashboard with tabbed tools and live stock data:

- Bull/base/bear stock projection calculator
- Two-stock projection comparison
- Reverse valuation, margin of safety, and position sizing tools
- Browser-local watchlist and research notes

## Run locally

Start the server:

```bash
node server.js
```

Then open `http://localhost:3000`.

## Deploy to Render

Create a new Render Web Service from this repository. Render can use `render.yaml` automatically.

For the most reliable live prices and specs, add one or both environment variables in Render:

- `FINNHUB_API_KEY`
- `ALPHA_VANTAGE_API_KEY`

The app prefers Finnhub, then Alpha Vantage, then delayed no-key fallbacks. API keys stay server-side and are never exposed in the browser. Finnhub or Alpha Vantage is strongly recommended because no-key fallbacks may provide prices without full company specs such as EPS, revenue, margins, or share count.

## Projection Method

The model estimates future revenue, applies a scenario net margin to estimate net income, adjusts share count for dilution or buybacks, calculates EPS, and applies an exit P/E multiple to estimate the future share price.

This is for personal research and is not financial advice.
