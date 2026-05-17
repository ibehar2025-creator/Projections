const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compactDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

const wholeNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const oneDecimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const scenarioConfig = [
  { key: "bear", label: "Bear", color: "#ef6b73" },
  { key: "base", label: "Base", color: "#f4b74e" },
  { key: "bull", label: "Bull", color: "#3ecf8e" },
];

const storageKeys = {
  watchlist: "stockLabWatchlistV2",
  portfolio: "stockLabPortfolioV2",
};

const portfolioTemplate = {
  trades: [],
  holdings: [],
  sync: {
    remoteFileId: null,
    lastSyncedAt: null,
    remoteUpdatedAt: null,
    syncStatus: "local_only",
    remoteRevision: null,
    deviceId: null,
  },
};

const requiredTradeColumns = [
  "Date",
  "Symbol",
  "Asset",
  "Sector",
  "Side",
  "Quantity",
  "Trade Price",
  "Fees",
  "Account",
  "Notes",
];

const requiredHoldingColumns = [
  "Symbol",
  "Asset",
  "Sector",
  "Quantity",
  "Average Cost",
  "Initial Value",
  "Account",
];

const appState = {
  lastProjection: null,
  lastStockData: null,
  lastProjectionFetchSymbol: "",
  projectionFetchInFlight: "",
  projectionHistory: null,
  projectionHistoryRange: "5y",
  compareHistoryRange: "5y",
  compareView: "historical",
  watchlist: [],
  compareHistorical: null,
  portfolio: loadPortfolioState(),
  portfolioRemoteConflict: null,
  driveAuth: {
    connected: false,
  },
  charts: {},
  activeTradeEditId: null,
};

const chartRegistry = {};

const measurePlugin = {
  id: "measureOverlay",
  afterDatasetsDraw(chart) {
    const interaction = chart.$interaction;
    if (!interaction || !interaction.measureStart || !interaction.measureEnd) {
      return;
    }

    const ctx = chart.ctx;
    const area = chart.chartArea;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    const left = xScale.getPixelForValue(interaction.measureStart.xValue);
    const right = xScale.getPixelForValue(interaction.measureEnd.xValue);
    const activeDataset = chart.data.datasets[interaction.measureDatasetIndex] || chart.data.datasets[0];
    const topValue = Math.max(interaction.measureStart.yValue, interaction.measureEnd.yValue);
    const topPixel = yScale ? yScale.getPixelForValue(topValue) : area.top;
    const minX = Math.min(left, right);
    const width = Math.abs(right - left);
    const fill = activeDataset?.borderColor || "#4f8cff";

    ctx.save();
    ctx.fillStyle = "rgba(79, 140, 255, 0.12)";
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1.2;
    ctx.fillRect(minX, area.top, width, area.bottom - area.top);
    ctx.beginPath();
    ctx.moveTo(left, area.top);
    ctx.lineTo(left, area.bottom);
    ctx.moveTo(right, area.top);
    ctx.lineTo(right, area.bottom);
    ctx.stroke();
    ctx.fillStyle = "rgba(12, 18, 28, 0.95)";
    ctx.strokeStyle = fill;
    const label = interaction.measureLabel || "";
    const labelWidth = Math.max(70, Math.min(260, ctx.measureText(label).width + 18));
    const labelX = Math.min(Math.max(minX + 6, area.left + 6), area.right - labelWidth - 6);
    const labelY = Math.max(area.top + 6, topPixel - 30);
    roundRect(ctx, labelX, labelY, labelWidth, 24, 6, true, true);
    ctx.fillStyle = "#e9f1ff";
    ctx.font = "12px IBM Plex Sans";
    ctx.fillText(label, labelX + 9, labelY + 16);
    ctx.restore();
  },
};

const zoomPlugin = window.ChartZoom || window["chartjs-plugin-zoom"] || window.zoomPlugin;

if (window.Chart) {
  Chart.register(measurePlugin);
  if (zoomPlugin) {
    Chart.register(zoomPlugin);
  }
}

function el(id) {
  return document.getElementById(id);
}

function on(id, eventName, handler, options) {
  const node = el(id);
  if (!node) return false;
  node.addEventListener(eventName, handler, options);
  return true;
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function numberValue(id) {
  return Number(el(id)?.value) || 0;
}

function safeText(value, fallback = "N/A") {
  return value || fallback;
}

function formatDate(value) {
  if (!value) return "N/A";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPercent(value) {
  return Number.isFinite(value) ? pct.format(value) : "N/A";
}

function formatDollarValue(value) {
  return Number.isFinite(value) ? dollars.format(value) : "N/A";
}

function formatCompactDollarValue(value) {
  return Number.isFinite(value) ? compactDollars.format(value) : "N/A";
}

function formatMillionsAsShares(millions) {
  if (!Number.isFinite(millions)) return "N/A";
  if (millions >= 1000) {
    return `${oneDecimal.format(millions / 1000)}B`;
  }
  return `${oneDecimal.format(millions)}M`;
}

function classForValue(value) {
  if (!Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "value-positive" : "value-negative";
}

function setDataStatus(message) {
  el("dataStatus").textContent = message;
}

function setInlineStatus(id, message, tone = "neutral") {
  const node = el(id);
  if (!node) return;
  node.textContent = message;
  node.className = "inline-status";
  if (tone === "positive") {
    node.classList.add("value-positive");
  } else if (tone === "negative") {
    node.classList.add("value-negative");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function loadPortfolioState() {
  const stored = parseJsonStorage(storageKeys.portfolio, null);
  if (!stored) return structuredClone(portfolioTemplate);
  return {
    trades: Array.isArray(stored.trades) ? stored.trades : [],
    holdings: Array.isArray(stored.holdings) ? stored.holdings : [],
    sync: {
      ...structuredClone(portfolioTemplate).sync,
      ...(stored.sync || {}),
    },
  };
}

function persistPortfolioState() {
  localStorage.setItem(storageKeys.portfolio, JSON.stringify(appState.portfolio));
}

function persistWatchlist() {
  localStorage.setItem(storageKeys.watchlist, JSON.stringify(appState.watchlist));
}

function loadWatchlist() {
  appState.watchlist = parseJsonStorage(storageKeys.watchlist, []);
}

async function loadPortfolioSeedIfAvailable() {
  try {
    const response = await fetch("/portfolio-seed.json", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.trades)) return null;
    return {
      trades: payload.trades.map(normalizeImportedTrade),
      holdings: Array.isArray(payload.holdings) ? payload.holdings.map(normalizeSeedHolding) : [],
    };
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

async function sendJson(url, method = "POST", body = null) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : null,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function ensurePortfolioDeviceId() {
  if (!appState.portfolio.sync.deviceId) {
    appState.portfolio.sync.deviceId = `device_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    persistPortfolioState();
  }
  return appState.portfolio.sync.deviceId;
}

async function fetchStockData(symbol) {
  const clean = String(symbol || "").trim().toUpperCase();
  if (!clean) throw new Error("Enter a ticker first.");
  return fetchJson(`/api/stock/${encodeURIComponent(clean)}`);
}

async function fetchHistoricalData(symbol, range = "5y") {
  const clean = String(symbol || "").trim().toUpperCase();
  if (!clean) throw new Error("Enter a ticker first.");
  return fetchJson(`/api/stock/${encodeURIComponent(clean)}/history?range=${encodeURIComponent(range)}`);
}

function portfolioPayloadFromState() {
  ensurePortfolioDeviceId();
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    deviceId: appState.portfolio.sync.deviceId,
    trades: appState.portfolio.trades.map((trade) => ({ ...trade })),
    holdingsSnapshot: deriveHoldingsFromTrades(appState.portfolio.trades, false),
  };
}

function applyDrivePortfolioPayload(payload, metadata = {}) {
  const trades = Array.isArray(payload?.trades) ? payload.trades.map(normalizeImportedTrade) : [];
  appState.portfolio.trades = trades;
  appState.portfolio.holdings = deriveHoldingsFromTrades(trades, false);
  appState.portfolio.sync = {
    ...appState.portfolio.sync,
    remoteFileId: metadata.fileId || appState.portfolio.sync.remoteFileId || null,
    lastSyncedAt: new Date().toISOString(),
    remoteUpdatedAt: metadata.remoteUpdatedAt || payload?.updatedAt || null,
    syncStatus: "synced",
    remoteRevision: metadata.remoteRevision || metadata.remoteUpdatedAt || payload?.updatedAt || null,
    deviceId: payload?.deviceId || appState.portfolio.sync.deviceId || null,
  };
  appState.portfolioRemoteConflict = null;
  persistPortfolioState();
  renderPortfolio();
  renderPortfolioSyncState();
}

function setPortfolioSyncStatus(message, syncStatus = null, tone = "neutral") {
  if (syncStatus) {
    appState.portfolio.sync.syncStatus = syncStatus;
    persistPortfolioState();
  }
  setInlineStatus("portfolioStatus", message, tone);
  renderPortfolioSyncState();
}

function renderPortfolioSyncState() {
  const meta = el("portfolioSyncMeta");
  if (!meta) return;
  const sync = appState.portfolio.sync || {};
  const auth = appState.driveAuth || {};
  const connected = Boolean(auth.connected);
  const lastSynced = sync.lastSyncedAt ? formatDate(sync.lastSyncedAt) : "Not yet";
  const remoteUpdated = sync.remoteUpdatedAt ? formatDate(sync.remoteUpdatedAt) : "No remote file yet";
  const syncLabelMap = {
    local_only: "Saved locally only",
    syncing: "Syncing to private Drive",
    synced: "Synced to private Drive",
    error: "Sync failed",
    conflict: "Drive copy is newer",
  };
  meta.textContent = connected
    ? `${syncLabelMap[sync.syncStatus] || "Drive connected"}. Last synced: ${lastSynced}. Remote updated: ${remoteUpdated}.`
    : "Drive is not connected. Your browser cache works on this device, but it is not the permanent private copy yet.";

  const connectButton = el("connectDriveButton");
  const disconnectButton = el("disconnectDriveButton");
  const syncButton = el("syncPortfolioNowButton");
  const loadButton = el("loadDrivePortfolioButton");
  if (connectButton) connectButton.disabled = connected;
  if (disconnectButton) disconnectButton.disabled = !connected;
  if (syncButton) syncButton.disabled = !connected;
  if (loadButton) loadButton.disabled = !connected;

  const conflictRow = el("portfolioConflictActions");
  if (conflictRow) {
    conflictRow.hidden = !appState.portfolioRemoteConflict;
  }
}

async function refreshDriveAuthStatus() {
  try {
    const status = await fetchJson("/api/drive/auth/status");
    appState.driveAuth = status;
    if (status.connected && status.fileId) {
      appState.portfolio.sync.remoteFileId = status.fileId;
      appState.portfolio.sync.remoteUpdatedAt = status.remoteUpdatedAt || appState.portfolio.sync.remoteUpdatedAt;
      appState.portfolio.sync.remoteRevision = status.remoteRevision || appState.portfolio.sync.remoteRevision;
      persistPortfolioState();
    }
  } catch {
    appState.driveAuth = { connected: false };
  }
  renderPortfolioSyncState();
}

function handleDriveAuthReturn() {
  const url = new URL(window.location.href);
  const driveStatus = url.searchParams.get("drive");
  if (!driveStatus) return;

  if (driveStatus === "connected") {
    setInlineStatus("portfolioStatus", "Drive connected. You can now sync a permanent private portfolio copy.", "positive");
  } else if (driveStatus === "error") {
    setInlineStatus("portfolioStatus", "Drive connection did not finish. Try connecting again.", "negative");
  }

  url.searchParams.delete("drive");
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function connectDrive() {
  window.location.href = "/api/drive/auth/start";
}

async function disconnectDrive() {
  await sendJson("/api/drive/auth/logout", "POST");
  appState.driveAuth = { connected: false };
  appState.portfolio.sync.syncStatus = "local_only";
  appState.portfolio.sync.remoteFileId = null;
  appState.portfolio.sync.remoteUpdatedAt = null;
  appState.portfolio.sync.remoteRevision = null;
  appState.portfolioRemoteConflict = null;
  persistPortfolioState();
  renderPortfolioSyncState();
  setInlineStatus("portfolioStatus", "Disconnected from Drive. Local cache is still available on this browser.", "positive");
}

async function loadPortfolioFromDrive() {
  setPortfolioSyncStatus("Loading your private Drive portfolio...", "syncing", "neutral");
  const remote = await fetchJson("/api/drive/portfolio");
  applyDrivePortfolioPayload(remote.portfolio, {
    fileId: remote.fileId,
    remoteUpdatedAt: remote.remoteUpdatedAt,
    remoteRevision: remote.remoteRevision,
  });
  setInlineStatus("portfolioStatus", "Loaded portfolio from private Drive.", "positive");
}

async function syncPortfolioToDrive({ force = false } = {}) {
  if (!appState.driveAuth.connected) {
    setInlineStatus("portfolioStatus", "Connect Drive first to save a permanent private copy.", "negative");
    return;
  }

  const payload = portfolioPayloadFromState();
  appState.portfolio.sync.syncStatus = "syncing";
  persistPortfolioState();
  renderPortfolioSyncState();
  setInlineStatus("portfolioStatus", "Syncing portfolio to private Drive...", "neutral");

  try {
    const response = await sendJson("/api/drive/portfolio", "POST", {
      portfolio: payload,
      remoteUpdatedAt: appState.portfolio.sync.remoteUpdatedAt,
      force,
    });
    appState.portfolio.sync.remoteFileId = response.fileId || null;
    appState.portfolio.sync.lastSyncedAt = new Date().toISOString();
    appState.portfolio.sync.remoteUpdatedAt = response.remoteUpdatedAt || payload.updatedAt;
    appState.portfolio.sync.remoteRevision = response.remoteRevision || response.remoteUpdatedAt || payload.updatedAt;
    appState.portfolio.sync.syncStatus = "synced";
    appState.portfolioRemoteConflict = null;
    persistPortfolioState();
    renderPortfolioSyncState();
    setInlineStatus("portfolioStatus", "Portfolio synced to private Drive.", "positive");
  } catch (error) {
    if (error.status === 409) {
      appState.portfolioRemoteConflict = error.payload || null;
      appState.portfolio.sync.syncStatus = "conflict";
      if (error.payload?.remoteUpdatedAt) {
        appState.portfolio.sync.remoteUpdatedAt = error.payload.remoteUpdatedAt;
        appState.portfolio.sync.remoteRevision = error.payload.remoteRevision || error.payload.remoteUpdatedAt;
      }
      persistPortfolioState();
      renderPortfolioSyncState();
      setInlineStatus("portfolioStatus", "Your Drive copy is newer. Load it or overwrite it.", "negative");
      return;
    }

    appState.portfolio.sync.syncStatus = "error";
    persistPortfolioState();
    renderPortfolioSyncState();
    setInlineStatus("portfolioStatus", error.message || "Portfolio sync failed.", "negative");
  }
}

function queuePortfolioDriveSync() {
  persistPortfolioState();
  renderPortfolioSyncState();
  if (!appState.driveAuth.connected) {
    return;
  }

  clearTimeout(queuePortfolioDriveSync._timer);
  queuePortfolioDriveSync._timer = setTimeout(() => {
    syncPortfolioToDrive().catch(() => {});
  }, 900);
}

function readProjectionInputs() {
  return {
    ticker: el("ticker").value.trim().toUpperCase() || "STOCK",
    currentPrice: numberValue("currentPrice"),
    revenue: numberValue("revenue"),
    shares: numberValue("shares"),
    eps: numberValue("eps"),
    years: Math.max(1, Math.min(15, numberValue("years"))),
    cases: Object.fromEntries(
      scenarioConfig.map((scenario) => [
        scenario.key,
        {
          growth: numberValue(`${scenario.key}Growth`) / 100,
          margin: numberValue(`${scenario.key}Margin`) / 100,
          pe: numberValue(`${scenario.key}Pe`),
        },
      ]),
    ),
  };
}

function calculateProjection(input) {
  const cases = scenarioConfig.map((scenario) => {
    const assumptions = input.cases[scenario.key];
    const yearly = [];
    for (let year = 0; year <= input.years; year += 1) {
      const revenue = input.revenue * Math.pow(1 + assumptions.growth, year);
      const shares = input.shares;
      const netIncome = revenue * assumptions.margin;
      const eps = shares > 0 ? netIncome / shares : 0;
      const price = eps * assumptions.pe;
      const returnMultiple = input.currentPrice > 0 ? price / input.currentPrice : 0;
      yearly.push({
        x: year,
        y: price,
        year,
        revenue,
        shares,
        netIncome,
        eps,
        price,
        returnMultiple,
      });
    }
    const terminal = yearly[yearly.length - 1];
    const cagr =
      input.currentPrice > 0 && terminal.price > 0
        ? Math.pow(terminal.price / input.currentPrice, 1 / input.years) - 1
        : 0;
    return { ...scenario, assumptions, yearly, terminal, cagr };
  });
  return { input, cases };
}

function projectionMetrics(base) {
  return [
    ["Terminal revenue", formatCompactDollarValue(base.terminal.revenue * 1_000_000)],
    ["Terminal net income", formatCompactDollarValue(base.terminal.netIncome * 1_000_000)],
    ["Terminal EPS", formatDollarValue(base.terminal.eps)],
    ["Terminal shares", formatMillionsAsShares(base.terminal.shares)],
  ];
}

function renderProjection(result) {
  appState.lastProjection = result;
  el("projectionCards").innerHTML = result.cases
    .map(
      (item) => `
        <article class="metric-card">
          <span>${item.label} case</span>
          <strong>${formatDollarValue(item.terminal.price)}</strong>
          <p>${formatPercent(item.cagr)} annualized, ${item.terminal.returnMultiple.toFixed(2)}x ending value</p>
        </article>
      `,
    )
    .join("");

  const base = result.cases.find((item) => item.key === "base");
  el("projectionDetails").innerHTML = projectionMetrics(base)
    .map(
      ([label, value]) => `
        <article class="detail-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `,
    )
    .join("");

  const projectionHistoryMatches =
    appState.projectionHistory &&
    appState.projectionHistory.symbol &&
    String(appState.projectionHistory.symbol).toUpperCase() === result.input.ticker;

  if (projectionHistoryMatches) {
    drawProjectionUnifiedChart(result, appState.projectionHistory);
  } else {
    drawProjectionForwardChart(result);
  }
}

function renderStockDataCard(data) {
  el("stockDataCard").innerHTML = `
    <strong>${safeText(data.name, data.symbol)} (${data.symbol})</strong>
    <p>${safeText(data.exchange, "Primary listing")} ${data.sector ? `| ${data.sector}` : ""} ${data.industry ? `| ${data.industry}` : ""}</p>
    <div class="spec-grid">
      <div><span>Price</span><b>${formatDollarValue(data.price)}</b></div>
      <div><span>Market cap</span><b>${formatCompactDollarValue(data.marketCap)}</b></div>
      <div><span>Shares out.</span><b>${formatMillionsAsShares(data.sharesOutstanding)}</b></div>
      <div><span>EPS TTM</span><b>${formatDollarValue(data.eps)}</b></div>
      <div><span>P/E</span><b>${Number.isFinite(data.peTtm) ? oneDecimal.format(data.peTtm) : "N/A"}</b></div>
      <div><span>52W range</span><b>${formatDollarValue(data.week52Low)} - ${formatDollarValue(data.week52High)}</b></div>
      <div><span>Revenue TTM</span><b>${formatCompactDollarValue(Number(data.revenueTtm) * 1_000_000)}</b></div>
      <div><span>Net margin</span><b>${Number.isFinite(data.netMargin) ? `${oneDecimal.format(data.netMargin)}%` : "N/A"}</b></div>
    </div>
  `;
}

function applyStockDataToProjection(data) {
  appState.lastStockData = data;
  el("ticker").value = data.symbol;
  if (Number.isFinite(data.price)) el("currentPrice").value = Number(data.price).toFixed(2);
  if (Number.isFinite(data.revenueTtm)) el("revenue").value = Math.round(data.revenueTtm);
  if (Number.isFinite(data.sharesOutstanding)) el("shares").value = Math.round(data.sharesOutstanding);
  if (Number.isFinite(data.eps)) el("eps").value = Number(data.eps).toFixed(2);
  if (Number.isFinite(data.netMargin)) {
    const margin = Math.max(0, Number(data.netMargin));
    el("bearMargin").value = Math.max(1, margin * 0.7).toFixed(1);
    el("baseMargin").value = margin.toFixed(1);
    el("bullMargin").value = Math.min(60, margin * 1.2).toFixed(1);
  }
  renderStockDataCard(data);
  runProjection();
}

async function fetchProjectionTicker() {
  const ticker = el("ticker").value.trim().toUpperCase();
  if (!ticker) {
    setDataStatus("Enter a ticker to load market data.");
    return;
  }
  if (ticker === appState.projectionFetchInFlight || ticker === appState.lastProjectionFetchSymbol) {
    return;
  }
  el("ticker").value = ticker;
  appState.projectionFetchInFlight = ticker;
  setDataStatus(`Fetching ${ticker.toUpperCase()}...`);
  try {
    const data = await fetchStockData(ticker);
    applyStockDataToProjection(data);
    appState.lastProjectionFetchSymbol = data.symbol;
    setDataStatus(`${data.symbol} market data refreshed.`);
    await loadProjectionHistoricalChart(data.symbol, appState.projectionHistoryRange);
  } catch (error) {
    appState.lastProjectionFetchSymbol = "";
    setDataStatus(error.message);
    el("stockDataCard").innerHTML = `<strong>Could not load data.</strong><p>${error.message}</p>`;
  } finally {
    appState.projectionFetchInFlight = "";
  }
}

function normalizeProjectionTicker() {
  const tickerField = el("ticker");
  if (!tickerField) return "";
  const normalizedTicker = tickerField.value.trim().toUpperCase().replace(/[^A-Z.\-]/g, "");
  tickerField.value = normalizedTicker;
  if (!normalizedTicker) {
    appState.lastProjectionFetchSymbol = "";
    return "";
  }
  return normalizedTicker;
}

function triggerProjectionTickerFetch() {
  const normalizedTicker = normalizeProjectionTicker();
  if (!normalizedTicker || normalizedTicker === appState.lastProjectionFetchSymbol) {
    return;
  }
  fetchProjectionTicker().catch((error) => {
    setDataStatus(error.message || "Could not load market data.");
  });
}

function compareInput(prefix) {
  return {
    ticker: el(`${prefix}Ticker`).value.trim().toUpperCase() || prefix,
    price: Number(el(`${prefix}Price`).value) || 0,
    eps: Number(el(`${prefix}Eps`).value) || 0,
    growth: (Number(el(`${prefix}Growth`).value) || 0) / 100,
    pe: Number(el(`${prefix}Pe`).value) || 0,
  };
}

function calculateCompareStock(stock, years) {
  const futureEps = stock.eps * Math.pow(1 + stock.growth, years);
  const futurePrice = futureEps * stock.pe;
  const upside = stock.price > 0 ? futurePrice / stock.price - 1 : 0;
  const cagr = stock.price > 0 && futurePrice > 0 ? Math.pow(futurePrice / stock.price, 1 / years) - 1 : 0;
  const yearly = [];
  for (let year = 0; year <= years; year += 1) {
    const eps = stock.eps * Math.pow(1 + stock.growth, year);
    yearly.push({
      x: year,
      y: eps * stock.pe,
      year,
      eps,
      price: eps * stock.pe,
    });
  }
  return { ...stock, yearly, futurePrice, upside, cagr };
}

function renderCompareCards(stocks) {
  el("compareCards").innerHTML = stocks
    .map(
      (stock) => `
        <article class="metric-card">
          <span>${stock.ticker}</span>
          <strong>${formatDollarValue(stock.futurePrice)}</strong>
          <p>${formatPercent(stock.cagr)} expected CAGR, ${formatPercent(stock.upside)} upside</p>
        </article>
      `,
    )
    .join("");
}

function runCompare() {
  const years = Math.max(1, Math.min(15, Number(el("compareYears").value) || 1));
  const a = calculateCompareStock(compareInput("compareA"), years);
  const b = calculateCompareStock(compareInput("compareB"), years);
  renderCompareCards([a, b]);
  drawCompareForwardChart(a, b, years);
  return { a, b, years };
}

async function fetchCompareTickers() {
  const aTicker = el("compareATicker").value.trim();
  const bTicker = el("compareBTicker").value.trim();
  if (!aTicker || !bTicker) return;

  try {
    const [aData, bData] = await Promise.all([fetchStockData(aTicker), fetchStockData(bTicker)]);
    el("compareAPrice").value = Number(aData.price || 0).toFixed(2);
    el("compareAEps").value = Number(aData.eps || 0).toFixed(2);
    el("compareBPrice").value = Number(bData.price || 0).toFixed(2);
    el("compareBEps").value = Number(bData.eps || 0).toFixed(2);
    runCompare();
  } catch (error) {
    setInlineStatus("watchlistStatus", error.message, "negative");
  }
}

function saveProjection() {
  if (!appState.lastProjection) {
    runProjection();
  }

  const result = appState.lastProjection;
  const existingIndex = appState.watchlist.findIndex((item) => item.ticker === result.input.ticker);
  const payload = {
    ticker: result.input.ticker,
    inputs: structuredClone(result.input),
    notes: existingIndex >= 0 ? appState.watchlist[existingIndex].notes || "" : "",
    savedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    appState.watchlist.splice(existingIndex, 1, payload);
  } else {
    appState.watchlist.unshift(payload);
  }

  persistWatchlist();
  renderWatchlist();
  setInlineStatus("projectionSaveStatus", `${payload.ticker} saved to watchlist.`, "positive");
}

function restoreProjectionInputs(input) {
  [
    "ticker",
    "currentPrice",
    "revenue",
    "shares",
    "eps",
    "years",
  ].forEach((key) => {
    if (key in input) {
      el(key).value = input[key];
    }
  });

  scenarioConfig.forEach((scenario) => {
    const assumptions = input.cases[scenario.key];
    if (!assumptions) return;
    el(`${scenario.key}Growth`).value = assumptions.growth * 100;
    el(`${scenario.key}Margin`).value = assumptions.margin * 100;
    el(`${scenario.key}Pe`).value = assumptions.pe;
  });
}

function renderWatchlist() {
  if (!appState.watchlist.length) {
    el("watchlistGrid").innerHTML = `<article class="empty-card"><strong>No saved ideas yet.</strong><p>Save a projection to build a personal research queue.</p></article>`;
    return;
  }

  el("watchlistGrid").innerHTML = appState.watchlist
    .map(
      (item, index) => `
        <article class="watch-card">
          <div class="watch-card-header">
            <div>
              <h3>${item.ticker}</h3>
              <span class="small-muted">Saved ${formatDate(item.savedAt)}</span>
            </div>
            <div class="watch-actions">
              <button class="secondary-button" type="button" data-watch-action="load" data-watch-index="${index}">Load</button>
              <button class="ghost-button" type="button" data-watch-action="delete" data-watch-index="${index}">Remove</button>
            </div>
          </div>
          <label class="wide-field">
            Notes
            <textarea data-watch-note="${index}" rows="4" placeholder="What needs to happen for this thesis to work?">${escapeHtml(item.notes || "")}</textarea>
          </label>
        </article>
      `,
    )
    .join("");
}

function toggleCompareView(view) {
  appState.compareView = view;
  document.querySelectorAll("[data-compare-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.compareView === view);
  });
  el("compareHistoricalBlock").classList.toggle("active", view === "historical");
  el("compareForwardBlock").classList.toggle("active", view === "forward");
  resizeVisibleCharts();
}

function destroyChart(key) {
  const current = chartRegistry[key];
  if (current) {
    current.destroy();
    delete chartRegistry[key];
  }
}

function chartReadoutForPoints(points, indexA, indexB, xFormatter = (value) => value) {
  const a = points[indexA];
  const b = points[indexB];
  if (!a || !b) return "";
  const start = a.y;
  const end = b.y;
  const move = end - start;
  const pctMove = start ? move / start : 0;
  return `${xFormatter(a.x)} to ${xFormatter(b.x)}: ${formatDollarValue(start)} to ${formatDollarValue(end)} (${formatDollarValue(move)}, ${formatPercent(pctMove)}).`;
}

function setChartReadout(id, message) {
  const node = el(id);
  if (node) {
    node.textContent = message;
  }
}

function lineChartInteraction(chart, readoutId, points, xFormatter = (value) => value) {
  let selected = null;
  const state = {
    points,
    chart,
    readoutId,
    xFormatter,
  };

  const updateMeasureOverlay = (firstIndex, secondIndex) => {
    const start = points[firstIndex];
    const end = points[secondIndex];
    if (!start || !end) return;
    chart.$interaction = {
      measureStart: { xValue: start.x, yValue: start.y },
      measureEnd: { xValue: end.x, yValue: end.y },
      measureDatasetIndex: 0,
      measureLabel: chartReadoutForPoints(points, firstIndex, secondIndex, xFormatter),
    };
    setChartReadout(readoutId, chart.$interaction.measureLabel);
    chart.update("none");
  };

  const clearOverlay = () => {
    chart.$interaction = null;
    chart.update("none");
  };

  chart.canvas.onclick = (event) => {
    const elements = chart.getElementsAtEventForMode(event, "nearest", { intersect: false }, true);
    if (!elements.length) return;
    const index = elements[0].index;
    if (selected === null) {
      selected = index;
      setChartReadout(readoutId, `${xFormatter(points[index].x)} selected. Click another point to measure move.`);
      return;
    }
    updateMeasureOverlay(selected, index);
    selected = null;
  };

  state.reset = () => {
    selected = null;
    clearOverlay();
  };

  return state;
}

function baseLineOptions(readoutId) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "nearest",
      intersect: false,
    },
    plugins: {
      legend: {
        labels: {
          color: "#dce9ff",
        },
      },
      tooltip: {
        backgroundColor: "rgba(8, 12, 18, 0.95)",
        titleColor: "#f5f7fb",
        bodyColor: "#dce9ff",
        borderColor: "rgba(79, 140, 255, 0.4)",
        borderWidth: 1,
        callbacks: {
          label(context) {
            const value = context.parsed.y;
            return `${context.dataset.label}: ${formatDollarValue(value)}`;
          },
        },
      },
      zoom: {
        limits: {
          x: { min: "original", max: "original" },
          y: { min: "original", max: "original" },
        },
        pan: {
          enabled: true,
          mode: "xy",
          modifierKey: "shift",
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true,
          },
          drag: {
            enabled: true,
            borderColor: "rgba(79, 140, 255, 0.8)",
            borderWidth: 1,
            backgroundColor: "rgba(79, 140, 255, 0.12)",
          },
          mode: "xy",
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: "rgba(120, 147, 188, 0.12)",
        },
        ticks: {
          color: "#8fa7c8",
        },
      },
      y: {
        grid: {
          color: "rgba(120, 147, 188, 0.12)",
        },
        ticks: {
          color: "#8fa7c8",
          callback(value) {
            return formatDollarValue(value);
          },
        },
      },
    },
    onResize() {
      const node = el(readoutId);
      if (node && !node.textContent.trim()) {
        node.textContent = "Chart details will appear here.";
      }
    },
  };
}

function createLineChart(key, canvasId, { datasets, readoutId, xFormatter = (value) => value, xTime = false }) {
  destroyChart(key);
  const canvas = el(canvasId);
  if (!canvas) return null;

  const chart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      datasets,
    },
    options: {
      ...baseLineOptions(readoutId),
      parsing: false,
      normalized: true,
      spanGaps: true,
      animation: false,
      scales: {
        ...baseLineOptions(readoutId).scales,
        x: {
          ...baseLineOptions(readoutId).scales.x,
          type: xTime ? "time" : "linear",
          ticks: {
            ...baseLineOptions(readoutId).scales.x.ticks,
            callback(value) {
              return xTime ? formatDate(value) : value;
            },
          },
        },
      },
    },
  });

  chartRegistry[key] = chart;
  if (datasets.length && datasets[0].data?.length) {
    const interaction = lineChartInteraction(chart, readoutId, datasets[0].data, xFormatter);
    chart.$resetInteraction = interaction.reset;
  }
  return chart;
}

function drawProjectionForwardChart(result) {
  const datasets = result.cases.map((item) => ({
    label: item.label,
    data: item.yearly.map((point) => ({ x: point.x, y: point.price })),
    borderColor: item.color,
    backgroundColor: `${item.color}26`,
    fill: false,
    tension: 0.22,
    borderWidth: item.key === "base" ? 2.8 : 2.2,
    pointRadius: 2,
    pointHoverRadius: 4,
    borderDash: item.key === "base" ? [] : [7, 5],
  }));

  createLineChart("projectionForward", "projectionForwardChart", {
    datasets,
    readoutId: "projectionForwardReadout",
    xFormatter: (value) => `Year ${value}`,
  });

  setChartReadout("projectionForwardReadout", `Base case reaches ${formatDollarValue(result.cases.find((item) => item.key === "base").terminal.price)} in year ${result.input.years}.`);
}

function drawProjectionUnifiedChart(result, history) {
  const lastHistoryPoint = history?.points?.[history.points.length - 1];
  if (!lastHistoryPoint) {
    drawProjectionForwardChart(result);
    return;
  }

  const anchorDate = lastHistoryPoint.date;
  const anchorPrice = Number.isFinite(lastHistoryPoint.close) ? lastHistoryPoint.close : result.input.currentPrice;

  const datasets = [
    {
      label: `${history.symbol} history`,
      data: history.points.map((point) => ({ x: point.date, y: point.close })),
      borderColor: "#4f8cff",
      backgroundColor: "rgba(79, 140, 255, 0.14)",
      fill: false,
      tension: 0.18,
      pointRadius: 0,
      pointHoverRadius: 3,
      borderWidth: 2.6,
    },
    ...result.cases.map((item) => ({
      label: `${item.label} outlook`,
      data: [
        { x: anchorDate, y: anchorPrice },
        ...item.yearly.slice(1).map((point) => ({
          x: addYearsToDate(anchorDate, point.year),
          y: point.price,
        })),
      ],
      borderColor: item.color,
      backgroundColor: `${item.color}26`,
      fill: false,
      tension: 0.22,
      pointRadius: 2,
      pointHoverRadius: 4,
      borderWidth: item.key === "base" ? 2.8 : 2.2,
      borderDash: item.key === "base" ? [] : [7, 5],
    })),
  ];

  createLineChart("projectionForward", "projectionForwardChart", {
    datasets,
    readoutId: "projectionForwardReadout",
    xFormatter: (value) => formatDate(value),
    xTime: true,
  });

  setChartReadout("projectionForwardReadout", `${history.symbol} ${history.rangeLabel} history and forward scenarios loaded on one timeline.`);
}

function addYearsToDate(baseValue, years) {
  const date = new Date(baseValue);
  const copy = new Date(date.getTime());
  copy.setFullYear(copy.getFullYear() + years);
  return copy.getTime();
}

function normalizeHistoricalPoints(points) {
  if (!points.length) return [];
  const base = points[0].close || 1;
  return points.map((point) => ({
    x: point.date,
    y: (point.close / base) * 100,
  }));
}

function drawCompareForwardChart(a, b, years) {
  createLineChart("compareForward", "compareForwardChart", {
    datasets: [
      {
        label: a.ticker,
        data: a.yearly.map((point) => ({ x: point.x, y: point.price })),
        borderColor: "#4f8cff",
        backgroundColor: "rgba(79, 140, 255, 0.18)",
        fill: false,
        tension: 0.22,
        borderWidth: 2.5,
      },
      {
        label: b.ticker,
        data: b.yearly.map((point) => ({ x: point.x, y: point.price })),
        borderColor: "#3ecf8e",
        backgroundColor: "rgba(62, 207, 142, 0.18)",
        fill: false,
        tension: 0.22,
        borderWidth: 2.5,
      },
    ],
    readoutId: "compareForwardReadout",
    xFormatter: (value) => `Year ${value}`,
  });
  setChartReadout("compareForwardReadout", `Forward comparison for ${a.ticker} and ${b.ticker} over ${years} years.`);
}

async function loadProjectionHistoricalChart(symbol, range = "5y") {
  const history = await fetchHistoricalData(symbol, range);
  appState.projectionHistory = history;
  if (appState.lastProjection && String(history.symbol || "").toUpperCase() === appState.lastProjection.input.ticker) {
    drawProjectionUnifiedChart(appState.lastProjection, history);
  }
  return history;
}

async function loadCompareHistoricalChart(range = "5y") {
  const current = runCompare();
  const [aHistory, bHistory] = await Promise.all([fetchHistoricalData(current.a.ticker, range), fetchHistoricalData(current.b.ticker, range)]);

  appState.compareHistorical = { a: aHistory, b: bHistory };

  createLineChart("compareHistorical", "compareHistoricalChart", {
    datasets: [
      {
        label: `${aHistory.symbol} normalized`,
        data: normalizeHistoricalPoints(aHistory.points),
        borderColor: "#4f8cff",
        backgroundColor: "rgba(79, 140, 255, 0.18)",
        fill: false,
        tension: 0.2,
        borderWidth: 2.5,
      },
      {
        label: `${bHistory.symbol} normalized`,
        data: normalizeHistoricalPoints(bHistory.points),
        borderColor: "#3ecf8e",
        backgroundColor: "rgba(62, 207, 142, 0.18)",
        fill: false,
        tension: 0.2,
        borderWidth: 2.5,
      },
    ],
    readoutId: "compareHistoricalReadout",
    xFormatter: (value) => formatDate(value),
    xTime: true,
  });

  setChartReadout("compareHistoricalReadout", `${aHistory.symbol} and ${bHistory.symbol} normalized over ${aHistory.rangeLabel || range}.`);
}

function resetChartView(key) {
  const chart = chartRegistry[key];
  if (!chart) return;
  if (typeof chart.resetZoom === "function") {
    chart.resetZoom();
  }
  if (typeof chart.$resetInteraction === "function") {
    chart.$resetInteraction();
  }
}

function updateChartMode() {
  // Measure mode is the only active chart interaction mode right now.
}

function bindTabEvents() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });
}

function bindChartControls() {
  document.querySelectorAll("[data-chart-mode-target]").forEach((group) => {
    group.addEventListener("click", (event) => {
      const button = event.target.closest("[data-mode]");
      if (!button) return;
      const chartKey = group.dataset.chartModeTarget;
      group.querySelectorAll(".segmented-button").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      updateChartMode(chartKey, button.dataset.mode);
    });
  });

  document.querySelectorAll("[data-chart-reset]").forEach((button) => {
    button.addEventListener("click", () => resetChartView(button.dataset.chartReset));
  });

  document.querySelectorAll("[data-chart-range-target]").forEach((group) => {
    group.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-range]");
      if (!button) return;
      const chartKey = group.dataset.chartRangeTarget;
      group.querySelectorAll(".segmented-button").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");

      if (chartKey === "projectionHistorical") {
        appState.projectionHistoryRange = button.dataset.range;
        await loadProjectionHistoricalChart(el("ticker").value, appState.projectionHistoryRange);
      } else if (chartKey === "compareHistorical") {
        appState.compareHistoryRange = button.dataset.range;
        await loadCompareHistoricalChart(appState.compareHistoryRange);
      }
    });
  });
}

function bindWatchlistActions() {
  el("watchlistGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-watch-action]");
    if (!button) return;
    const index = Number(button.dataset.watchIndex);
    const item = appState.watchlist[index];
    if (!item) return;

    if (button.dataset.watchAction === "load") {
      restoreProjectionInputs(item.inputs);
      runProjection();
      activateTab("projection");
      setInlineStatus("projectionSaveStatus", `${item.ticker} loaded from watchlist.`, "positive");
    } else if (button.dataset.watchAction === "delete") {
      appState.watchlist.splice(index, 1);
      persistWatchlist();
      renderWatchlist();
    }
  });

  el("watchlistGrid").addEventListener("input", (event) => {
    const field = event.target.closest("[data-watch-note]");
    if (!field) return;
    const index = Number(field.dataset.watchNote);
    const item = appState.watchlist[index];
    if (!item) return;
    item.notes = field.value;
    persistWatchlist();
    setInlineStatus("watchlistStatus", `Notes saved for ${item.ticker}.`, "positive");
  });
}

function bindPortfolioActions() {
  on("tradeForm", "submit", handleTradeSubmit);
  on("resetTradeForm", "click", resetTradeForm);
  on("connectDriveButton", "click", connectDrive);
  on("disconnectDriveButton", "click", () => {
    disconnectDrive().catch((error) => setInlineStatus("portfolioStatus", error.message, "negative"));
  });
  on("syncPortfolioNowButton", "click", () => {
    syncPortfolioToDrive().catch((error) => setInlineStatus("portfolioStatus", error.message, "negative"));
  });
  on("loadDrivePortfolioButton", "click", () => {
    loadPortfolioFromDrive().catch((error) => setInlineStatus("portfolioStatus", error.message, "negative"));
  });
  on("reloadRemotePortfolioButton", "click", () => {
    loadPortfolioFromDrive().catch((error) => setInlineStatus("portfolioStatus", error.message, "negative"));
  });
  on("forceOverwriteRemoteButton", "click", () => {
    syncPortfolioToDrive({ force: true }).catch((error) => setInlineStatus("portfolioStatus", error.message, "negative"));
  });
  on("downloadPortfolioTemplate", "click", downloadPortfolioTemplate);
  on("importPortfolioButton", "click", () => el("portfolioFileInput")?.click());
  on("exportPortfolioButton", "click", exportPortfolioWorkbook);
  on("exportTradesCsvButton", "click", exportTradesCsv);
  on("refreshPortfolioQuotes", "click", refreshPortfolioQuotes);

  on("portfolioFileInput", "change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      const imported = await importPortfolioWorkbook(file);
      appState.portfolio.trades = imported.trades;
      appState.portfolio.holdings = deriveHoldingsFromTrades(imported.trades, false);
      queuePortfolioDriveSync();
      renderPortfolio();
      setInlineStatus(
        "portfolioStatus",
        appState.driveAuth.connected
          ? "Workbook imported and queued for Drive sync. Pull latest info to add current quotes."
          : "Workbook imported locally. Connect Drive to make it permanent across devices.",
        "positive",
      );
    } catch (error) {
      setInlineStatus("portfolioStatus", error.message, "negative");
    } finally {
      event.target.value = "";
    }
  });

  on("portfolioTradesTable", "click", (event) => {
    const button = event.target.closest("[data-trade-action]");
    if (!button) return;
    const tradeId = button.dataset.tradeId;
    if (button.dataset.tradeAction === "edit") {
      editTrade(tradeId);
    } else if (button.dataset.tradeAction === "delete") {
      deleteTrade(tradeId);
    }
  });
}

function bindEvents() {
  bindTabEvents();
  bindChartControls();
  bindWatchlistActions();
  bindPortfolioActions();

  on("projectionForm", "submit", async (event) => {
    event.preventDefault();
    runProjection();
    triggerProjectionTickerFetch();
    await loadProjectionHistoricalChart(el("ticker").value, appState.projectionHistoryRange).catch(() => {});
  });

  on("ticker", "input", () => {
    normalizeProjectionTicker();
    runProjection();
  });
  on("ticker", "blur", () => {
    triggerProjectionTickerFetch();
  });
  on("ticker", "keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      triggerProjectionTickerFetch();
    }
  });

  [
    "currentPrice",
    "revenue",
    "shares",
    "eps",
    "years",
    "bearGrowth",
    "bearMargin",
    "bearPe",
    "baseGrowth",
    "baseMargin",
    "basePe",
    "bullGrowth",
    "bullMargin",
    "bullPe",
  ].forEach((id) => {
    on(id, "input", () => {
      runProjection();
    });
  });

  on("saveProjection", "click", saveProjection);
  on("runCompare", "click", async () => {
    runCompare();
    await loadCompareHistoricalChart(appState.compareHistoryRange).catch(() => {});
  });
  on("fetchCompare", "click", fetchCompareTickers);
  on("runReverse", "click", runReverse);
  on("runMos", "click", runMos);
  on("sp500Form", "submit", (event) => {
    event.preventDefault();
    renderSp500();
  });
  on("clearWatchlist", "click", () => {
    appState.watchlist = [];
    persistWatchlist();
    renderWatchlist();
  });
  on("useCurrentForA", "click", () => {
    const input = readProjectionInputs();
    el("compareATicker").value = input.ticker;
    el("compareAPrice").value = input.currentPrice;
    el("compareAEps").value = input.eps;
    el("compareAGrowth").value = (input.cases.base.growth * 100).toFixed(1);
    el("compareAPe").value = input.cases.base.pe;
    runCompare();
  });
  on("compareViewToggle", "click", (event) => {
    const button = event.target.closest("[data-compare-view]");
    if (!button) return;
    toggleCompareView(button.dataset.compareView);
  });
}

function activateTab(tabId) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabId));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
  resizeVisibleCharts();
}

function renderSp500() {
  const principal = Number(el("spStart").value) || 0;
  const monthly = Number(el("spMonthly").value) || 0;
  const rate = (Number(el("spRate").value) || 0) / 100;
  const years = Math.max(1, Math.min(50, Number(el("spYears").value) || 1));
  const monthlyRate = rate / 12;
  let balance = principal;
  const rows = [];

  for (let year = 1; year <= years; year += 1) {
    const startValue = balance;
    let contributions = 0;
    let growth = 0;
    for (let month = 0; month < 12; month += 1) {
      balance += monthly;
      contributions += monthly;
      const monthGrowth = balance * monthlyRate;
      balance += monthGrowth;
      growth += monthGrowth;
    }
    rows.push({
      year,
      startValue,
      contributions,
      growth,
      endingValue: balance,
    });
  }

  const totalContributed = principal + monthly * 12 * years;
  const growthEarned = balance - totalContributed;

  el("sp500Cards").innerHTML = [
    ["Ending value", formatDollarValue(balance)],
    ["Total contributed", formatDollarValue(totalContributed)],
    ["Growth earned", formatDollarValue(growthEarned)],
  ]
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `,
    )
    .join("");

  el("sp500Table").innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.year}</td>
          <td>${formatDollarValue(row.startValue)}</td>
          <td>${formatDollarValue(row.contributions)}</td>
          <td>${formatDollarValue(row.growth)}</td>
          <td>${formatDollarValue(row.endingValue)}</td>
        </tr>
      `,
    )
    .join("");

  createLineChart("sp500Chart", "sp500ChartCanvas", {
    datasets: [
      {
        label: "Portfolio value",
        data: rows.map((row) => ({ x: row.year, y: row.endingValue })),
        borderColor: "#4f8cff",
        backgroundColor: "rgba(79, 140, 255, 0.18)",
        fill: false,
        tension: 0.22,
        borderWidth: 2.8,
      },
    ],
    readoutId: "sp500Readout",
    xFormatter: (value) => `Year ${value}`,
  });

  setChartReadout("sp500Readout", `Projected ending value after ${years} years: ${formatDollarValue(balance)}.`);
}

function renderPortfolioCards(holdings) {
  const totalValue = holdings.reduce((sum, holding) => sum + (Number(holding.currentValue) || 0), 0);
  const totalCost = holdings.reduce((sum, holding) => sum + (Number(holding.initialValue) || 0), 0);
  const unrealized = holdings.reduce((sum, holding) => sum + (Number(holding.unrealizedProfit) || 0), 0);
  const dayChange = holdings.reduce((sum, holding) => sum + (Number(holding.dayChange) || 0), 0);

  el("portfolioCards").innerHTML = [
    ["Market value", formatDollarValue(totalValue), "Current holdings value"],
    ["Cost basis", formatDollarValue(totalCost), "Initial deployed capital"],
    ["Unrealized P/L", formatDollarValue(unrealized), "Open profit across holdings", classForValue(unrealized)],
    ["Day change", formatDollarValue(dayChange), "Move versus prior close", classForValue(dayChange)],
  ]
    .map(
      ([label, value, copy, toneClass = ""]) => `
        <article class="metric-card ${toneClass}">
          <span>${label}</span>
          <strong>${value}</strong>
          <p>${copy}</p>
        </article>
      `,
    )
    .join("");
}

function renderPortfolioTrades() {
  el("portfolioTradesTable").innerHTML = appState.portfolio.trades
    .map(
      (trade) => `
        <tr>
          <td>${trade.date}</td>
          <td>${trade.symbol}</td>
          <td>${trade.side}</td>
          <td>${trade.quantity}</td>
          <td>${formatDollarValue(trade.tradePrice)}</td>
          <td>${formatDollarValue(trade.fees)}</td>
          <td>${trade.account}</td>
          <td class="table-actions">
            <button class="tiny-button" type="button" data-trade-action="edit" data-trade-id="${trade.id}">Edit</button>
            <button class="tiny-button danger" type="button" data-trade-action="delete" data-trade-id="${trade.id}">Delete</button>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderPortfolioHoldings() {
  el("portfolioHoldingsTable").innerHTML = appState.portfolio.holdings
    .map(
      (holding) => `
        <tr>
          <td>${holding.account}</td>
          <td>${holding.sector}</td>
          <td>${holding.asset}</td>
          <td>${formatDollarValue(holding.currentPrice || 0)}</td>
          <td>${formatDollarValue(holding.averageCost || 0)}</td>
          <td>${holding.quantity || 0}</td>
          <td>${formatDollarValue(holding.initialValue || 0)}</td>
          <td>${formatDollarValue(holding.currentValue || 0)}</td>
          <td class="${classForValue(holding.dayChange || 0)}">${formatDollarValue(holding.dayChange || 0)}</td>
          <td class="${classForValue(holding.dayPercentChange || 0)}">${formatPercent((holding.dayPercentChange || 0) / 100)}</td>
          <td class="${classForValue(holding.unrealizedProfit || 0)}">${formatDollarValue(holding.unrealizedProfit || 0)}</td>
          <td class="${classForValue(holding.realizedProfit || 0)}">${formatDollarValue(holding.realizedProfit || 0)}</td>
          <td>${formatPercent((holding.allocation || 0) / 100)}</td>
        </tr>
      `,
    )
    .join("");
}

function createPieChart(chartKey, canvasId, labels, values, palette) {
  destroyChart(chartKey);
  const ctx = el(canvasId).getContext("2d");
  const chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: palette,
          borderColor: "#0f1724",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#dce9ff",
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.label}: ${formatDollarValue(context.parsed)}`;
            },
          },
        },
      },
    },
  });
  appState.charts[chartKey] = { chart };
}

function resizeVisibleCharts() {
  requestAnimationFrame(() => {
    Object.values(appState.charts).forEach((bundle) => {
      if (bundle?.chart) {
        bundle.chart.resize();
        bundle.chart.update("none");
      }
    });
  });
}

function renderPortfolioCharts(holdings) {
  const byAsset = [];
  const bySector = new Map();
  holdings.forEach((holding) => {
    if (holding.currentValue > 0) {
      byAsset.push({ label: holding.symbol, value: holding.currentValue });
      bySector.set(holding.sector || "Unassigned", (bySector.get(holding.sector || "Unassigned") || 0) + holding.currentValue);
    }
  });

  const assetPalette = ["#4f8cff", "#3ecf8e", "#f4b74e", "#ef6b73", "#8c72ff", "#2ed3d8", "#e58eff", "#9cc85f"];
  const sectorEntries = [...bySector.entries()];

  createPieChart(
    "portfolioAllocation",
    "portfolioAllocationChart",
    byAsset.map((item) => item.label),
    byAsset.map((item) => item.value),
    byAsset.map((_, index) => assetPalette[index % assetPalette.length]),
  );

  createPieChart(
    "portfolioSector",
    "portfolioSectorChart",
    sectorEntries.map(([label]) => label),
    sectorEntries.map(([, value]) => value),
    sectorEntries.map((_, index) => assetPalette[(index + 2) % assetPalette.length]),
  );
}

function renderPortfolio() {
  if (!Array.isArray(appState.portfolio.holdings)) {
    appState.portfolio.holdings = [];
  }
  renderPortfolioCards(appState.portfolio.holdings);
  renderPortfolioTrades();
  renderPortfolioHoldings();
  renderPortfolioCharts(appState.portfolio.holdings);
  renderPortfolioSyncState();
}

function resetTradeForm() {
  el("tradeForm").reset();
  el("tradeDate").value = new Date().toISOString().slice(0, 10);
  el("tradeSide").value = "buy";
  el("tradeFees").value = "0";
  appState.activeTradeEditId = null;
  el("saveTradeButton").textContent = "Add trade";
}

function readTradeForm() {
  const trade = {
    id: appState.activeTradeEditId || `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    date: el("tradeDate").value,
    symbol: el("tradeSymbol").value.trim().toUpperCase(),
    asset: el("tradeAsset").value.trim(),
    sector: el("tradeSector").value.trim() || "Unassigned",
    side: el("tradeSide").value,
    quantity: Number(el("tradeQuantity").value),
    tradePrice: Number(el("tradePrice").value),
    fees: Number(el("tradeFees").value) || 0,
    account: el("tradeAccount").value.trim() || "Primary",
    notes: el("tradeNotes").value.trim(),
  };

  if (!trade.date || !trade.symbol || !trade.quantity || !Number.isFinite(trade.tradePrice)) {
    throw new Error("Date, symbol, quantity, and trade price are required.");
  }

  return trade;
}

function upsertTrade(trade) {
  const index = appState.portfolio.trades.findIndex((item) => item.id === trade.id);
  if (index >= 0) {
    appState.portfolio.trades.splice(index, 1, trade);
  } else {
    appState.portfolio.trades.push(trade);
  }
  appState.portfolio.trades.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function handleTradeSubmit(event) {
  event.preventDefault();
  try {
    const trade = readTradeForm();
    upsertTrade(trade);
    appState.portfolio.holdings = deriveHoldingsFromTrades(appState.portfolio.trades, false);
    queuePortfolioDriveSync();
    renderPortfolio();
    resetTradeForm();
    setInlineStatus(
      "portfolioStatus",
      appState.driveAuth.connected
        ? "Trade saved locally and queued for Drive sync. Pull latest info to refresh quotes."
        : "Trade saved locally. Connect Drive to make it permanent across devices.",
      "positive",
    );
  } catch (error) {
    setInlineStatus("portfolioStatus", error.message, "negative");
  }
}

function editTrade(tradeId) {
  const trade = appState.portfolio.trades.find((item) => item.id === tradeId);
  if (!trade) return;
  appState.activeTradeEditId = trade.id;
  el("tradeDate").value = trade.date;
  el("tradeSymbol").value = trade.symbol;
  el("tradeAsset").value = trade.asset;
  el("tradeSector").value = trade.sector;
  el("tradeSide").value = trade.side;
  el("tradeQuantity").value = trade.quantity;
  el("tradePrice").value = trade.tradePrice;
  el("tradeFees").value = trade.fees;
  el("tradeAccount").value = trade.account;
  el("tradeNotes").value = trade.notes;
  el("saveTradeButton").textContent = "Update trade";
  activateTab("portfolio");
}

function deleteTrade(tradeId) {
  appState.portfolio.trades = appState.portfolio.trades.filter((item) => item.id !== tradeId);
  appState.portfolio.holdings = deriveHoldingsFromTrades(appState.portfolio.trades, false);
  queuePortfolioDriveSync();
  renderPortfolio();
  setInlineStatus("portfolioStatus", appState.driveAuth.connected ? "Trade deleted and queued for Drive sync." : "Trade deleted locally.", "positive");
}

function rowsHaveColumns(rows, required) {
  const headers = new Set(Object.keys(rows[0] || {}));
  return required.every((column) => headers.has(column));
}

function normalizeImportedTrade(row, index) {
  return {
    id: row.id || `import_${Date.now()}_${index}`,
    date: normalizeImportDate(row.Date),
    symbol: String(row.Symbol || "").trim().toUpperCase(),
    asset: String(row.Asset || "").trim(),
    sector: String(row.Sector || "Unassigned").trim(),
    side: String(row.Side || "buy").trim().toLowerCase() === "sell" ? "sell" : "buy",
    quantity: Number(row.Quantity) || 0,
    tradePrice: Number(row["Trade Price"]) || 0,
    fees: Number(row.Fees) || 0,
    account: String(row.Account || "Primary").trim(),
    notes: String(row.Notes || "").trim(),
  };
}

function normalizeImportedHolding(row) {
  return {
    symbol: String(row.Symbol || "").trim().toUpperCase(),
    asset: String(row.Asset || "").trim(),
    sector: String(row.Sector || "Unassigned").trim(),
    quantity: Number(row.Quantity) || 0,
    averageCost: Number(row["Average Cost"]) || 0,
    initialValue: Number(row["Initial Value"]) || 0,
    account: String(row.Account || "Primary").trim(),
  };
}

function normalizeSeedHolding(row) {
  return {
    symbol: String(row.symbol || row.Symbol || "").trim().toUpperCase(),
    asset: String(row.asset || row.Asset || "").trim(),
    sector: String(row.sector || row.Sector || "Unassigned").trim(),
    quantity: Number(row.quantity ?? row.Quantity) || 0,
    averageCost: Number(row.averageCost ?? row["Average Cost"]) || 0,
    initialValue: Number(row.initialValue ?? row["Initial Value"]) || 0,
    account: String(row.account || row.Account || "Primary").trim(),
    realizedProfit: Number(row.realizedProfit ?? row["Realized Profit"]) || 0,
    currentPrice: Number(row.currentPrice ?? row["Current Price"]) || 0,
    currentValue: Number(row.currentValue ?? row["Current Value"]) || 0,
    dayChange: Number(row.dayChange ?? row["Day Change"]) || 0,
    dayPercentChange: Number(row.dayPercentChange ?? row["Day % Change"]) || 0,
    unrealizedProfit: Number(row.unrealizedProfit ?? row["Unrealized Profit"]) || 0,
  };
}

function normalizeImportDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
      return date.toISOString().slice(0, 10);
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function importPortfolioWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: "array" });
        const tradesSheet = workbook.Sheets.Trades;
        const holdingsSheet = workbook.Sheets.Holdings;

        if (!tradesSheet || !holdingsSheet) {
          throw new Error("Workbook must contain both Trades and Holdings sheets.");
        }

        const tradesRows = XLSX.utils.sheet_to_json(tradesSheet, { defval: "" });
        const holdingsRows = XLSX.utils.sheet_to_json(holdingsSheet, { defval: "" });

        if (tradesRows.length && !rowsHaveColumns(tradesRows, requiredTradeColumns)) {
          throw new Error("Trades sheet is missing one or more required columns.");
        }
        if (holdingsRows.length && !rowsHaveColumns(holdingsRows, requiredHoldingColumns)) {
          throw new Error("Holdings sheet is missing one or more required columns.");
        }

        resolve({
          trades: tradesRows.map(normalizeImportedTrade),
          holdings: holdingsRows.map(normalizeImportedHolding),
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Could not read the workbook."));
    reader.readAsArrayBuffer(file);
  });
}

function exportPortfolioWorkbook() {
  const workbookData = getPortfolioWorkbookData();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(workbookData.trades, { header: requiredTradeColumns }), "Trades");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(workbookData.holdings, { header: requiredHoldingColumns }), "Holdings");
  XLSX.writeFile(workbook, "portfolio-dashboard.xlsx");
}

function exportTradesCsv() {
  const workbookData = getPortfolioWorkbookData();
  const sheet = XLSX.utils.json_to_sheet(workbookData.trades, { header: requiredTradeColumns });
  const csv = XLSX.utils.sheet_to_csv(sheet);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "portfolio-trades.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function downloadPortfolioTemplate() {
  const workbook = XLSX.utils.book_new();
  const templateTrades = [
    {
      Date: "2026-01-10",
      Symbol: "AAPL",
      Asset: "Apple Inc.",
      Sector: "Technology",
      Side: "buy",
      Quantity: 10,
      "Trade Price": 185,
      Fees: 0,
      Account: "Brokerage",
      Notes: "Example starter row",
    },
  ];
  const templateHoldings = [
    {
      Symbol: "AAPL",
      Asset: "Apple Inc.",
      Sector: "Technology",
      Quantity: 10,
      "Average Cost": 185,
      "Initial Value": 1850,
      Account: "Brokerage",
    },
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(templateTrades, { header: requiredTradeColumns }), "Trades");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(templateHoldings, { header: requiredHoldingColumns }), "Holdings");
  XLSX.writeFile(workbook, "portfolio-template.xlsx");
}

async function refreshPortfolioQuotes() {
  const holdings = Array.isArray(appState.portfolio.holdings) ? appState.portfolio.holdings : [];
  if (!holdings.length) {
    setInlineStatus("portfolioStatus", "Add or import holdings before refreshing quotes.", "negative");
    return;
  }

  const symbols = [...new Set(holdings.map((holding) => String(holding.symbol || "").trim().toUpperCase()).filter(Boolean))];
  if (!symbols.length) {
    setInlineStatus("portfolioStatus", "No ticker symbols were found in the portfolio.", "negative");
    return;
  }

  setInlineStatus("portfolioStatus", "Refreshing quotes...", "neutral");

  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const data = await fetchStockData(symbol);
      return [symbol, data];
    }),
  );

  const quoteMap = new Map();
  let successCount = 0;
  let failureCount = 0;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const [symbol, data] = result.value;
      quoteMap.set(symbol, data);
      successCount += 1;
      return;
    }
    failureCount += 1;
    console.warn(`Quote refresh failed for ${symbols[index]}.`, result.reason);
  });

  if (!successCount) {
    setInlineStatus("portfolioStatus", "Could not refresh quotes for any holdings.", "negative");
    return;
  }

  const refreshedHoldings = holdings.map((holding) => {
    const symbol = String(holding.symbol || "").trim().toUpperCase();
    const quote = quoteMap.get(symbol);
    if (!quote) {
      return holding;
    }

    const currentPrice = Number(quote.price);
    const previousClose = Number(quote.previousClose);
    const quantity = Number(holding.quantity) || 0;
    const initialValue = Number(holding.initialValue) || 0;
    const currentValue = Number.isFinite(currentPrice) ? quantity * currentPrice : Number(holding.currentValue) || 0;
    const dayChangePerShare = Number.isFinite(currentPrice) && Number.isFinite(previousClose) ? currentPrice - previousClose : 0;
    const dayChange = quantity * dayChangePerShare;
    const dayPercentChange = Number.isFinite(currentPrice) && Number.isFinite(previousClose) && previousClose !== 0
      ? ((currentPrice - previousClose) / previousClose) * 100
      : 0;

    return {
      ...holding,
      asset: quote.name || holding.asset,
      sector: quote.sector || holding.sector,
      currentPrice: Number.isFinite(currentPrice) ? currentPrice : holding.currentPrice,
      currentValue,
      dayChange,
      dayPercentChange,
      unrealizedProfit: currentValue - initialValue,
    };
  });

  const totalValue = refreshedHoldings.reduce((sum, holding) => sum + (Number(holding.currentValue) || 0), 0);
  appState.portfolio.holdings = refreshedHoldings.map((holding) => ({
    ...holding,
    allocation: totalValue > 0 ? ((Number(holding.currentValue) || 0) / totalValue) * 100 : 0,
  }));

  persistPortfolioState();
  renderPortfolio();

  if (failureCount) {
    setInlineStatus(
      "portfolioStatus",
      `Refreshed ${successCount} holding ${successCount === 1 ? "ticker" : "tickers"}. ${failureCount} failed.`,
      "neutral",
    );
    return;
  }

  setInlineStatus(
    "portfolioStatus",
    `Refreshed quotes for ${successCount} holding ${successCount === 1 ? "ticker" : "tickers"}.`,
    "positive",
  );
}

function deriveHoldingsFromTrades(trades) {
  const holdingsMap = new Map();
  trades.forEach((trade) => {
    const key = `${trade.account}__${trade.symbol}`;
    const quantity = Number(trade.quantity) || 0;
    const signedQuantity = trade.side === "sell" ? -quantity : quantity;
    const tradeValue = (Number(trade.tradePrice) || 0) * quantity;
    if (!holdingsMap.has(key)) {
      holdingsMap.set(key, {
        account: trade.account,
        symbol: trade.symbol,
        asset: trade.asset,
        sector: trade.sector,
        quantity: 0,
        totalCost: 0,
        realizedProfit: 0,
        currentPrice: Number(trade.tradePrice) || 0,
        currentValue: 0,
        dayChange: 0,
        dayPercentChange: 0,
        unrealizedProfit: 0,
        allocation: 0,
      });
    }
    const holding = holdingsMap.get(key);
    if (trade.side === "buy") {
      holding.quantity += quantity;
      holding.totalCost += tradeValue + (Number(trade.fees) || 0);
    } else {
      const averageCost = holding.quantity > 0 ? holding.totalCost / holding.quantity : 0;
      holding.quantity -= quantity;
      holding.totalCost -= averageCost * quantity;
      holding.realizedProfit += tradeValue - averageCost * quantity - (Number(trade.fees) || 0);
    }
    holding.asset = trade.asset || holding.asset;
    holding.sector = trade.sector || holding.sector;
    holding.currentPrice = Number(trade.tradePrice) || holding.currentPrice;
  });

  const holdings = [...holdingsMap.values()]
    .filter((holding) => holding.quantity > 0)
    .map((holding) => {
      const averageCost = holding.quantity > 0 ? holding.totalCost / holding.quantity : 0;
      const currentValue = holding.quantity * holding.currentPrice;
      const initialValue = holding.quantity * averageCost;
      return {
        ...holding,
        averageCost,
        initialValue,
        currentValue,
        unrealizedProfit: currentValue - initialValue,
      };
    });

  const totalValue = holdings.reduce((sum, holding) => sum + holding.currentValue, 0);
  return holdings.map((holding) => ({
    ...holding,
    allocation: totalValue > 0 ? (holding.currentValue / totalValue) * 100 : 0,
  }));
}

function getPortfolioWorkbookData() {
  return {
    trades: appState.portfolio.trades.map((trade) => ({
      Date: trade.date,
      Symbol: trade.symbol,
      Asset: trade.asset,
      Sector: trade.sector,
      Side: trade.side,
      Quantity: trade.quantity,
      "Trade Price": trade.tradePrice,
      Fees: trade.fees,
      Account: trade.account,
      Notes: trade.notes,
    })),
    holdings: appState.portfolio.holdings.map((holding) => ({
      Symbol: holding.symbol,
      Asset: holding.asset,
      Sector: holding.sector,
      Quantity: holding.quantity,
      "Average Cost": holding.averageCost,
      "Initial Value": holding.initialValue,
      Account: holding.account,
    })),
  };
}

function runProjectionWrapper() {
  const result = calculateProjection(readProjectionInputs());
  renderProjection(result);
  return result;
}

function runProjection() {
  return runProjectionWrapper();
}

async function seedPortfolioIfEmpty() {
  if (!appState.portfolio.trades.length && !appState.portfolio.holdings.length) {
    appState.portfolio = structuredClone(portfolioTemplate);
    persistPortfolioState();
  }
}

async function init() {
  el("currentDate").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  loadWatchlist();
  await seedPortfolioIfEmpty();
  bindEvents();
  resetTradeForm();
  handleDriveAuthReturn();
  await refreshDriveAuthStatus();
  runProjection();
  runCompare();
  runReverse();
  runMos();
  renderSp500();
  renderWatchlist();
  if (!appState.portfolio.holdings.length) {
    appState.portfolio.holdings = deriveHoldingsFromTrades(appState.portfolio.trades, false);
  }
  renderPortfolio();
  if (appState.driveAuth.connected && !appState.portfolio.trades.length) {
    try {
      await loadPortfolioFromDrive();
    } catch {
      renderPortfolioSyncState();
    }
  }
  toggleCompareView("historical");

  try {
    await loadProjectionHistoricalChart(el("ticker").value, appState.projectionHistoryRange);
  } catch {
    setChartReadout("projectionForwardReadout", "Price path could not load yet. Fetch a ticker to try again.");
  }

  try {
    await loadCompareHistoricalChart(appState.compareHistoryRange);
  } catch {
    setChartReadout("compareHistoricalReadout", "Historical comparison could not load yet. Fetch A & B to try again.");
  }
}

init();
