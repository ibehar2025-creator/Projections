import { createServer } from "http";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = process.env.PORT || 3000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

const historyRangeConfig = {
  "1m": { range: "1mo", interval: "1d", label: "1M" },
  "6m": { range: "6mo", interval: "1d", label: "6M" },
  "1y": { range: "1y", interval: "1d", label: "1Y" },
  "5y": { range: "5y", interval: "1d", label: "5Y" },
  max: { range: "max", interval: "1wk", label: "Max" },
};

function cleanSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

function yahooSymbol(symbol) {
  return String(symbol || "").toUpperCase().replace(/\./g, "-");
}

function stooqSymbol(symbol) {
  const clean = String(symbol || "").toLowerCase();
  if (clean.includes(".")) {
    return `${clean.replace(/\./g, "_")}.us`;
  }
  if (clean.endsWith("usd")) {
    return clean;
  }
  return `${clean}.us`;
}

function secLookupSymbol(symbol) {
  return String(symbol || "").toUpperCase().replace(/\./g, "-");
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "StockProjectionLab/2.0",
      Accept: "application/json",
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "StockProjectionLab/2.0",
      Accept: "text/plain,text/csv,*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchFinnhub(symbol) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return null;

  const [quote, profile, metrics] = await Promise.all([
    fetchJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`),
    fetchJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`),
    fetchJson(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${token}`),
  ]);

  if (!quote?.c) return null;

  const metric = metrics?.metric || {};
  const shareCount = profile?.shareOutstanding || metric.shareOutstanding || null;

  return {
    source: "Finnhub",
    symbol,
    price: quote.c,
    previousClose: quote.pc,
    open: quote.o,
    high: quote.h,
    low: quote.l,
    timestamp: quote.t ? quote.t * 1000 : Date.now(),
    name: profile?.name || symbol,
    exchange: profile?.exchange || "",
    industry: profile?.finnhubIndustry || "",
    sector: profile?.finnhubIndustry || "",
    marketCap: profile?.marketCapitalization ? profile.marketCapitalization * 1_000_000 : null,
    sharesOutstanding: shareCount,
    eps: metric.epsTTM || metric.epsInclExtraItemsTTM || null,
    revenueTtm: metric.revenuePerShareTTM && shareCount ? metric.revenuePerShareTTM * shareCount : null,
    peTtm: metric.peTTM || null,
    grossMargin: metric.grossMarginTTM || null,
    netMargin: metric.netProfitMarginTTM || null,
    beta: metric.beta || null,
    week52High: metric["52WeekHigh"] || null,
    week52Low: metric["52WeekLow"] || null,
  };
}

async function fetchAlphaVantage(symbol) {
  const token = process.env.ALPHA_VANTAGE_API_KEY;
  if (!token) return null;

  const [quote, overview] = await Promise.all([
    fetchJson(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${token}`),
    fetchJson(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${token}`),
  ]);

  const global = quote?.["Global Quote"];
  const price = Number(global?.["05. price"]);
  if (!price) return null;

  return {
    source: "Alpha Vantage",
    symbol,
    price,
    previousClose: Number(global?.["08. previous close"]) || null,
    open: Number(global?.["02. open"]) || null,
    high: Number(global?.["03. high"]) || null,
    low: Number(global?.["04. low"]) || null,
    timestamp: Date.now(),
    name: overview?.Name || symbol,
    exchange: overview?.Exchange || "",
    industry: overview?.Industry || "",
    sector: overview?.Sector || "",
    marketCap: Number(overview?.MarketCapitalization) || null,
    sharesOutstanding: Number(overview?.SharesOutstanding) ? Number(overview.SharesOutstanding) / 1_000_000 : null,
    eps: Number(overview?.EPS) || null,
    revenueTtm: Number(overview?.RevenueTTM) ? Number(overview.RevenueTTM) / 1_000_000 : null,
    peTtm: Number(overview?.PERatio) || null,
    grossMargin:
      Number(overview?.GrossProfitTTM) && Number(overview?.RevenueTTM)
        ? (Number(overview.GrossProfitTTM) / Number(overview.RevenueTTM)) * 100
        : null,
    netMargin: Number(overview?.ProfitMargin) ? Number(overview.ProfitMargin) * 100 : null,
    beta: Number(overview?.Beta) || null,
    week52High: Number(overview?.["52WeekHigh"]) || null,
    week52Low: Number(overview?.["52WeekLow"]) || null,
  };
}

async function fetchYahooFallback(symbol) {
  const modules = "price,summaryDetail,defaultKeyStatistics,financialData,summaryProfile";
  const data = await fetchJson(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol(symbol))}?modules=${modules}`,
  );
  const result = data?.quoteSummary?.result?.[0];
  if (!result?.price?.regularMarketPrice?.raw) return null;

  return {
    source: "Yahoo Finance delayed fallback",
    symbol,
    price: result.price.regularMarketPrice.raw,
    previousClose: result.summaryDetail?.previousClose?.raw || null,
    open: result.summaryDetail?.open?.raw || null,
    high: result.summaryDetail?.dayHigh?.raw || null,
    low: result.summaryDetail?.dayLow?.raw || null,
    timestamp: result.price.regularMarketTime ? result.price.regularMarketTime * 1000 : Date.now(),
    name: result.price.longName || result.price.shortName || symbol,
    exchange: result.price.exchangeName || result.price.exchange || "",
    industry: result.summaryProfile?.industry || "",
    sector: result.summaryProfile?.sector || "",
    marketCap: result.price.marketCap?.raw || null,
    sharesOutstanding: result.defaultKeyStatistics?.sharesOutstanding?.raw
      ? result.defaultKeyStatistics.sharesOutstanding.raw / 1_000_000
      : null,
    eps: result.defaultKeyStatistics?.trailingEps?.raw || result.defaultKeyStatistics?.forwardEps?.raw || null,
    revenueTtm: result.financialData?.totalRevenue?.raw ? result.financialData.totalRevenue.raw / 1_000_000 : null,
    peTtm: result.summaryDetail?.trailingPE?.raw || result.defaultKeyStatistics?.forwardPE?.raw || null,
    grossMargin: result.financialData?.grossMargins?.raw ? result.financialData.grossMargins.raw * 100 : null,
    netMargin: result.financialData?.profitMargins?.raw ? result.financialData.profitMargins.raw * 100 : null,
    beta: result.defaultKeyStatistics?.beta?.raw || null,
    week52High: result.summaryDetail?.fiftyTwoWeekHigh?.raw || null,
    week52Low: result.summaryDetail?.fiftyTwoWeekLow?.raw || null,
  };
}

async function fetchYahooChartQuoteFallback(symbol) {
  const data = await fetchJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}?range=5d&interval=1d&includePrePost=false`,
  );
  const result = data?.chart?.result?.[0];
  const meta = result?.meta || {};
  const quote = result?.indicators?.quote?.[0] || {};
  const timestamps = result?.timestamp || [];
  const lastClose = [...(quote.close || [])].reverse().find((value) => Number.isFinite(Number(value)));
  const price = Number(meta.regularMarketPrice) || Number(lastClose);
  if (!price) return null;

  return {
    source: "Yahoo Finance chart fallback",
    symbol,
    price,
    previousClose: Number(meta.previousClose) || null,
    open: Number(meta.regularMarketOpen) || Number(quote.open?.[quote.open.length - 1]) || null,
    high: Number(meta.regularMarketDayHigh) || Number(quote.high?.[quote.high.length - 1]) || null,
    low: Number(meta.regularMarketDayLow) || Number(quote.low?.[quote.low.length - 1]) || null,
    timestamp: timestamps.length ? timestamps[timestamps.length - 1] * 1000 : Date.now(),
    name: meta.longName || meta.shortName || symbol,
    exchange: meta.exchangeName || "",
    industry: "",
    sector: "",
    marketCap: null,
    sharesOutstanding: null,
    eps: null,
    revenueTtm: null,
    peTtm: null,
    grossMargin: null,
    netMargin: null,
    beta: null,
    week52High: Number(meta.fiftyTwoWeekHigh) || null,
    week52Low: Number(meta.fiftyTwoWeekLow) || null,
    volume: Number(quote.volume?.[quote.volume.length - 1]) || null,
  };
}

function latestFact(facts, tags, unit, preferredForms = ["10-K", "10-Q"]) {
  const tagList = Array.isArray(tags) ? tags : [tags];
  const candidates = [];
  for (const tag of tagList) {
    const rows = facts?.["us-gaap"]?.[tag]?.units?.[unit] || [];
    rows.forEach((row) => {
      if (Number.isFinite(Number(row.val)) && preferredForms.includes(row.form)) {
        candidates.push(row);
      }
    });
  }
  candidates.sort((a, b) => {
    const dateCompare = String(b.end || "").localeCompare(String(a.end || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(b.filed || "").localeCompare(String(a.filed || ""));
  });
  return candidates[0]?.val || null;
}

async function fetchSecCompanyFacts(symbol) {
  const tickers = await fetchJson("https://www.sec.gov/files/company_tickers.json", {
    "User-Agent": "StockProjectionLab/2.0 support@example.com",
  });
  const lookup = secLookupSymbol(symbol);
  const company = Object.values(tickers).find((item) => item.ticker?.toUpperCase() === lookup);
  if (!company?.cik_str) return null;

  const cik = String(company.cik_str).padStart(10, "0");
  const facts = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
    "User-Agent": "StockProjectionLab/2.0 support@example.com",
  });
  const revenue =
    latestFact(facts.facts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues"], "USD", ["10-K"]) ||
    latestFact(facts.facts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues"], "USD");
  const netIncome =
    latestFact(facts.facts, "NetIncomeLoss", "USD", ["10-K"]) ||
    latestFact(facts.facts, "NetIncomeLoss", "USD");
  const eps =
    latestFact(facts.facts, ["EarningsPerShareDiluted", "EarningsPerShareBasic"], "USD/shares", ["10-K"]) ||
    latestFact(facts.facts, ["EarningsPerShareDiluted", "EarningsPerShareBasic"], "USD/shares");
  const shares =
    latestFact(
      facts.facts,
      ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic"],
      "shares",
      ["10-K"],
    ) ||
    latestFact(
      facts.facts,
      ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic"],
      "shares",
    );

  return {
    name: facts.entityName || company.title || symbol,
    revenueTtm: revenue ? Number(revenue) / 1_000_000 : null,
    eps: eps ? Number(eps) : null,
    sharesOutstanding: shares ? Number(shares) / 1_000_000 : null,
    netMargin: revenue && netIncome ? (Number(netIncome) / Number(revenue)) * 100 : null,
  };
}

async function fetchStooqFallback(symbol) {
  const csv = await fetchText(`https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol(symbol))}&f=sd2t2ohlcv&h&e=csv`);
  const [, row] = csv.trim().split(/\r?\n/);
  if (!row) return null;
  const [returnedSymbol, date, time, open, high, low, close, volume] = row.split(",");
  const price = Number(close);
  if (!price || close === "N/D") return null;

  let sec = null;
  try {
    sec = await fetchSecCompanyFacts(symbol);
  } catch {
    sec = null;
  }

  const sharesOutstanding = sec?.sharesOutstanding || null;
  const eps = sec?.eps || null;
  return {
    source: "Stooq delayed price fallback",
    symbol,
    price,
    previousClose: null,
    open: Number(open) || null,
    high: Number(high) || null,
    low: Number(low) || null,
    timestamp: date && time ? new Date(`${date}T${time}`).getTime() : Date.now(),
    name: sec?.name || returnedSymbol || symbol,
    exchange: "US delayed",
    industry: "",
    sector: "",
    marketCap: sharesOutstanding ? price * sharesOutstanding * 1_000_000 : null,
    sharesOutstanding,
    eps,
    revenueTtm: sec?.revenueTtm || null,
    peTtm: eps ? price / eps : null,
    grossMargin: null,
    netMargin: sec?.netMargin || null,
    beta: null,
    week52High: null,
    week52Low: null,
    volume: Number(volume) || null,
  };
}

async function fetchHistoricalYahoo(symbol, rangeKey) {
  const chosen = historyRangeConfig[rangeKey] || historyRangeConfig["5y"];
  const data = await fetchJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}?range=${chosen.range}&interval=${chosen.interval}&includePrePost=false`,
  );
  const result = data?.chart?.result?.[0];
  if (!result?.timestamp?.length) return null;

  const quote = result.indicators?.quote?.[0] || {};
  const points = result.timestamp
    .map((timestamp, index) => ({
      date: timestamp * 1000,
      open: Number(quote.open?.[index]) || null,
      high: Number(quote.high?.[index]) || null,
      low: Number(quote.low?.[index]) || null,
      close: Number(quote.close?.[index]) || null,
      volume: Number(quote.volume?.[index]) || null,
    }))
    .filter((point) => Number.isFinite(point.close));

  if (!points.length) return null;

  return {
    source: "Yahoo Finance history",
    symbol: result.meta?.symbol || symbol,
    name: result.meta?.longName || result.meta?.shortName || symbol,
    currency: result.meta?.currency || "USD",
    exchange: result.meta?.exchangeName || "",
    range: rangeKey,
    rangeLabel: chosen.label,
    points,
  };
}

async function handleStockApi(res, symbol) {
  const clean = cleanSymbol(symbol);
  if (!clean) {
    sendJson(res, 400, { error: "Missing ticker symbol." });
    return;
  }

  const errors = [];
  for (const provider of [fetchFinnhub, fetchAlphaVantage, fetchYahooFallback, fetchYahooChartQuoteFallback, fetchStooqFallback]) {
    try {
      const data = await provider(clean);
      if (data) {
        sendJson(res, 200, { ...data, fetchedAt: new Date().toISOString() });
        return;
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  sendJson(res, 502, {
    error: "Could not fetch reliable stock data for this ticker.",
    details: errors,
  });
}

async function handleHistoryApi(res, symbol, rangeKey) {
  const clean = cleanSymbol(symbol);
  if (!clean) {
    sendJson(res, 400, { error: "Missing ticker symbol." });
    return;
  }

  try {
    const data = await fetchHistoricalYahoo(clean, rangeKey);
    if (!data) {
      sendJson(res, 404, { error: "Historical data unavailable for this ticker." });
      return;
    }
    sendJson(res, 200, { ...data, fetchedAt: new Date().toISOString() });
  } catch (error) {
    sendJson(res, 502, { error: "Could not fetch historical price data.", details: error.message });
  }
}

async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, normalized);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(file);
  } catch {
    const fallback = await readFile(path.join(__dirname, "index.html"));
    res.writeHead(200, { "Content-Type": mimeTypes[".html"] });
    res.end(fallback);
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const stockHistoryMatch = url.pathname.match(/^\/api\/stock\/([^/]+)\/history$/);
    const stockMatch = url.pathname.match(/^\/api\/stock\/([^/]+)$/);

    if (stockHistoryMatch) {
      await handleHistoryApi(res, stockHistoryMatch[1], url.searchParams.get("range") || "5y");
      return;
    }

    if (stockMatch) {
      await handleStockApi(res, stockMatch[1]);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error." });
  }
}).listen(port, () => {
  console.log(`Stock Projection Lab running on port ${port}`);
});
