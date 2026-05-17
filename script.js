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
  renderStockDataCard(data);
  setDataStatus(`Loaded live data for ${data.symbol} from ${data.source}.`);
  runProjection();
}

async function fetchProjectionTicker() {
  try {
    const symbol = el("ticker").value;
    setDataStatus(`Fetching live data for ${symbol.toUpperCase()}...`);
    const data = await fetchStockData(symbol);
    applyStockDataToProjection(data);
    await loadProjectionHistoricalChart(data.symbol, appState.projectionHistoryRange);
  } catch (error) {
    setDataStatus(error.message);
    renderStockDataCard({ symbol: el("ticker").value.toUpperCase(), name: "Live data unavailable" });
  }
}

function readCompareInputs() {
  const years = Math.max(1, Math.min(15, Number(el("compareYears").value) || 5));
  const readSide = (suffix) => ({
    ticker: el(`compare${suffix}Ticker`).value.trim().toUpperCase(),
    price: Number(el(`compare${suffix}Price`).value) || 0,
    eps: Number(el(`compare${suffix}Eps`).value) || 0,
    growth: (Number(el(`compare${suffix}Growth`).value) || 0) / 100,
    pe: Number(el(`compare${suffix}Pe`).value) || 0,
  });

  return { years, a: readSide("A"), b: readSide("B") };
}

function calculateCompareScoreboard(inputs) {
  const project = (stock) => {
    const terminalEps = stock.eps * Math.pow(1 + stock.growth, inputs.years);
    const terminalPrice = terminalEps * stock.pe;
    const cagr = stock.price > 0 && terminalPrice > 0 ? Math.pow(terminalPrice / stock.price, 1 / inputs.years) - 1 : 0;
    return { ...stock, terminalEps, terminalPrice, cagr };
  };

  return { a: project(inputs.a), b: project(inputs.b), years: inputs.years };
}

function renderCompareForward(scoreboard) {
  el("compareCards").innerHTML = [scoreboard.a, scoreboard.b]
    .map(
      (stock) => `
        <article class="metric-card">
          <span>${stock.ticker}</span>
          <strong>${formatDollarValue(stock.terminalPrice)}</strong>
          <p>${formatPercent(stock.cagr)} annualized over ${scoreboard.years} years</p>
        </article>
      `,
    )
    .join("");

  drawCompareForwardChart(scoreboard);
}

function compareForwardSeries(stock, years) {
  return Array.from({ length: years + 1 }, (_, year) => {
    const eps = stock.eps * Math.pow(1 + stock.growth, year);
    return {
      x: year,
      y: eps * stock.pe,
    };
  });
}

function destroyChart(key) {
  if (appState.charts[key]?.chart) {
    appState.charts[key].chart.destroy();
    delete appState.charts[key];
  }
}

function setChartReadout(id, message) {
  const target = el(id);
  if (target) target.textContent = message;
}

function registerChartInteractions(chartKey, chart, readoutId, options = {}) {
  const bundle = appState.charts[chartKey] || {};
  bundle.chart = chart;
  appState.charts[chartKey] = bundle;
  setupChartInteractions(chartKey, readoutId, options);
}

function setupChartInteractions(chartKey, readoutId, options = {}) {
  const bundle = appState.charts[chartKey];
  const chart = bundle?.chart;
  if (!chart) return;
  chart.$interaction = chart.$interaction || { mode: "measure" };
  chart.$interaction.readoutId = readoutId;
  chart.$interaction.formatLabel = options.formatLabel || null;
  chart.$interaction.defaultMessage = options.defaultMessage || "Click a point or drag across the chart for details.";
  setChartReadout(readoutId, chart.$interaction.defaultMessage);
}

function formatMeasureLabel(start, end) {
  if (!start || !end) return "";
  const change = end.yValue - start.yValue;
  const pctChange = start.yValue ? change / start.yValue : 0;
  return `${formatDollarValue(start.yValue)} to ${formatDollarValue(end.yValue)} (${formatPercent(pctChange)})`;
}

function baseLineOptions({ readoutId, defaultMessage }) {
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
        callbacks: {
          label(context) {
            return `${context.dataset.label}: ${formatDollarValue(context.parsed.y)}`;
          },
        },
      },
      zoom: zoomPlugin
        ? {
            pan: {
              enabled: true,
              mode: "x",
            },
            zoom: {
              wheel: {
                enabled: true,
              },
              pinch: {
                enabled: true,
              },
              mode: "x",
            },
          }
        : undefined,
    },
    scales: {
      x: {
        ticks: {
          color: "#9fb2cf",
        },
        grid: {
          color: "rgba(36, 52, 75, 0.45)",
        },
      },
      y: {
        ticks: {
          color: "#9fb2cf",
          callback(value) {
            return formatDollarValue(value);
          },
        },
        grid: {
          color: "rgba(36, 52, 75, 0.45)",
        },
      },
    },
    onClick(event, elements, chart) {
      if (!elements.length) return;
      const point = elements[0];
      const dataset = chart.data.datasets[point.datasetIndex];
      const dataPoint = dataset.data[point.index];
      setChartReadout(readoutId, `${dataset.label}: ${formatDollarValue(dataPoint.y)}`);
    },
  };
}

function drawProjectionForwardChart(result) {
  destroyChart("projectionForward");
  const ctx = el("projectionForwardChart").getContext("2d");
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: result.cases.map((scenario) => ({
        label: `${scenario.label} scenario`,
        data: scenario.yearly,
        borderColor: scenario.color,
        backgroundColor: scenario.color,
        borderWidth: 2,
        tension: 0.2,
      })),
    },
    options: {
      ...baseLineOptions({
        readoutId: "projectionForwardReadout",
        defaultMessage: "Price-path details will appear here.",
      }),
      scales: {
        x: {
          type: "linear",
          ticks: {
            color: "#9fb2cf",
            stepSize: 1,
          },
          grid: {
            color: "rgba(36, 52, 75, 0.45)",
          },
          title: {
            display: true,
            text: "Years",
            color: "#9fb2cf",
          },
        },
        y: {
          ticks: {
            color: "#9fb2cf",
            callback(value) {
              return formatDollarValue(value);
            },
          },
          grid: {
            color: "rgba(36, 52, 75, 0.45)",
          },
        },
      },
    },
  });
  registerChartInteractions("projectionForward", chart, "projectionForwardReadout", {
    defaultMessage: "Price-path details will appear here.",
    formatLabel: formatMeasureLabel,
  });
}

function drawProjectionUnifiedChart(result, history) {
  destroyChart("projectionForward");
  const ctx = el("projectionForwardChart").getContext("2d");
  const historicalPoints = (history.points || []).map((point) => ({ x: point.date, y: point.close }));
  const lastHistoricalDate = historicalPoints[historicalPoints.length - 1]?.x || Date.now();
  const yearMs = 365 * 24 * 60 * 60 * 1000;
  const forwardDatasets = result.cases.map((scenario) => ({
    label: `${scenario.label} scenario`,
    data: scenario.yearly.map((point) => ({
      x: lastHistoricalDate + point.x * yearMs,
      y: point.y,
    })),
    borderColor: scenario.color,
    backgroundColor: scenario.color,
    borderWidth: 2,
    tension: 0.2,
  }));

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: `${history.symbol} historical`,
          data: historicalPoints,
          borderColor: "#4f8cff",
          backgroundColor: "#4f8cff",
          borderWidth: 2,
          tension: 0.1,
        },
        ...forwardDatasets,
      ],
    },
    options: {
      ...baseLineOptions({
        readoutId: "projectionForwardReadout",
        defaultMessage: "Price-path details will appear here.",
      }),
      scales: {
        x: {
          type: "time",
          time: {
            unit: "month",
          },
          ticks: {
            color: "#9fb2cf",
          },
          grid: {
            color: "rgba(36, 52, 75, 0.45)",
          },
        },
        y: {
          ticks: {
            color: "#9fb2cf",
            callback(value) {
              return formatDollarValue(value);
            },
          },
          grid: {
            color: "rgba(36, 52, 75, 0.45)",
          },
        },
      },
    },
  });
  registerChartInteractions("projectionForward", chart, "projectionForwardReadout", {
    defaultMessage: "Price-path details will appear here.",
    formatLabel: formatMeasureLabel,
  });
}

async function loadProjectionHistoricalChart(symbol, range = "5y") {
  const history = await fetchHistoricalData(symbol, range);
  appState.projectionHistory = history;
  const current = appState.lastProjection;
  if (current && current.input.ticker === history.symbol) {
    drawProjectionUnifiedChart(current, history);
  }
}

function runCompare() {
  const inputs = readCompareInputs();
  const scoreboard = calculateCompareScoreboard(inputs);
  renderCompareForward(scoreboard);
  return scoreboard;
}

async function fetchCompareTickers() {
  const symbols = [el("compareATicker").value, el("compareBTicker").value];
  try {
    const [a, b] = await Promise.all(symbols.map((symbol) => fetchStockData(symbol)));
    el("compareATicker").value = a.symbol;
    el("compareAPrice").value = Number(a.price || 0).toFixed(2);
    el("compareAEps").value = Number(a.eps || 0).toFixed(2);
    el("compareBTicker").value = b.symbol;
    el("compareBPrice").value = Number(b.price || 0).toFixed(2);
    el("compareBEps").value = Number(b.eps || 0).toFixed(2);
    runCompare();
    await loadCompareHistoricalChart(appState.compareHistoryRange);
  } catch (error) {
    setChartReadout("compareHistoricalReadout", error.message);
  }
}

async function loadCompareHistoricalChart(range = "5y") {
  const aSymbol = el("compareATicker").value.trim().toUpperCase();
  const bSymbol = el("compareBTicker").value.trim().toUpperCase();
  const [aHistory, bHistory] = await Promise.all([
    fetchHistoricalData(aSymbol, range),
    fetchHistoricalData(bSymbol, range),
  ]);
  appState.compareHistorical = { aHistory, bHistory };
  drawCompareHistoricalChart(aHistory, bHistory);
}

function normalizeHistory(points) {
  if (!points.length) return [];
  const first = points[0].close || 1;
  return points.map((point) => ({
    x: point.date,
    y: first ? (point.close / first) * 100 : 0,
  }));
}

function drawCompareHistoricalChart(aHistory, bHistory) {
  destroyChart("compareHistorical");
  const ctx = el("compareHistoricalChart").getContext("2d");
  const datasets = [
    {
      label: `${aHistory.symbol} normalized`,
      data: normalizeHistory(aHistory.points || []),
      borderColor: "#4f8cff",
      backgroundColor: "#4f8cff",
      borderWidth: 2,
      tension: 0.2,
    },
    {
      label: `${bHistory.symbol} normalized`,
      data: normalizeHistory(bHistory.points || []),
      borderColor: "#3ecf8e",
      backgroundColor: "#3ecf8e",
      borderWidth: 2,
      tension: 0.2,
    },
  ];

  const chart = new Chart(ctx, {
    type: "line",
    data: { datasets },
    options: {
      ...baseLineOptions({
        readoutId: "compareHistoricalReadout",
        defaultMessage: "Historical comparison details will appear here.",
      }),
      scales: {
        x: {
          type: "time",
          time: {
            unit: "month",
          },
          ticks: {
            color: "#9fb2cf",
          },
          grid: {
            color: "rgba(36, 52, 75, 0.45)",
          },
        },
        y: {
          ticks: {
            color: "#9fb2cf",
            callback(value) {
              return `${oneDecimal.format(value)}%`;
            },
          },
          grid: {
            color: "rgba(36, 52, 75, 0.45)",
          },
        },
      },
    },
  });
  registerChartInteractions("compareHistorical", chart, "compareHistoricalReadout", {
    defaultMessage: "Historical comparison details will appear here.",
    formatLabel: formatMeasureLabel,
  });
}

function drawCompareForwardChart(scoreboard) {
  destroyChart("compareForward");
  const ctx = el("compareForwardChart").getContext("2d");
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: scoreboard.a.ticker,
          data: compareForwardSeries(scoreboard.a, scoreboard.years),
          borderColor: "#4f8cff",
          backgroundColor: "#4f8cff",
          borderWidth: 2,
          tension: 0.2,
        },
        {
          label: scoreboard.b.ticker,
          data: compareForwardSeries(scoreboard.b, scoreboard.years),
          borderColor: "#3ecf8e",
          backgroundColor: "#3ecf8e",
          borderWidth: 2,
          tension: 0.2,
        },
      ],
    },
    options: {
      ...baseLineOptions({
        readoutId: "compareForwardReadout",
        defaultMessage: "Forward comparison details will appear here.",
      }),
      scales: {
        x: {
          type: "linear",
          ticks: {
            color: "#9fb2cf",
            stepSize: 1,
          },
          grid: {
            color: "rgba(36, 52, 75, 0.45)",
          },
        },
        y: {
          ticks: {
            color: "#9fb2cf",
            callback(value) {
              return formatDollarValue(value);
            },
          },
          grid: {
            color: "rgba(36, 52, 75, 0.45)",
          },
        },
      },
    },
  });
  registerChartInteractions("compareForward", chart, "compareForwardReadout", {
    defaultMessage: "Forward comparison details will appear here.",
    formatLabel: formatMeasureLabel,
  });
}

function runReverse() {
  const price = Number(el("revPrice").value) || 0;
  const eps = Number(el("revEps").value) || 0;
  const pe = Number(el("revPe").value) || 0;
  const years = Math.max(1, Number(el("revYears").value) || 1);
  const impliedGrowth = price > 0 && eps > 0 && pe > 0 ? Math.pow(price / (eps * pe), 1 / years) - 1 : 0;
  el("reverseAnswer").innerHTML = `<strong>${formatPercent(impliedGrowth)}</strong><p>Implied annual EPS growth over ${years} years.</p>`;
}

function runMos() {
  const fairValue = Number(el("fairValue").value) || 0;
  const price = Number(el("mosPrice").value) || 0;
  const requiredSafety = (Number(el("mosPercent").value) || 0) / 100;
  const discountPrice = fairValue * (1 - requiredSafety);
  const actualMargin = fairValue > 0 ? (fairValue - price) / fairValue : 0;
  el("mosAnswer").innerHTML = `
    <strong>Buy below ${formatDollarValue(discountPrice)}</strong>
    <p>Current margin of safety: ${formatPercent(actualMargin)}.</p>
  `;
}

function calculateSp500Projection() {
  const startingAmount = Number(el("spStart").value) || 0;
  const monthlyContribution = Number(el("spMonthly").value) || 0;
  const annualRate = (Number(el("spRate").value) || 0) / 100;
  const years = Math.max(1, Math.min(50, Number(el("spYears").value) || 1));
  const monthlyRate = annualRate / 12;
  let balance = startingAmount;
  const yearlyRows = [];

  for (let year = 1; year <= years; year += 1) {
    const startValue = balance;
    let contributions = 0;
    let growth = 0;
    for (let month = 0; month < 12; month += 1) {
      balance += monthlyContribution;
      contributions += monthlyContribution;
      const afterGrowth = balance * (1 + monthlyRate);
      growth += afterGrowth - balance;
      balance = afterGrowth;
    }
    yearlyRows.push({ year, startValue, contributions, growth, endingValue: balance });
  }

  return {
    startingAmount,
    monthlyContribution,
    annualRate,
    years,
    yearlyRows,
    endingValue: balance,
    totalContributed: startingAmount + monthlyContribution * years * 12,
    growthEarned: balance - (startingAmount + monthlyContribution * years * 12),
  };
}

function renderSp500() {
  const projection = calculateSp500Projection();
  el("sp500Cards").innerHTML = [
    ["Ending value", formatDollarValue(projection.endingValue)],
    ["Total contributed", formatDollarValue(projection.totalContributed)],
    ["Growth earned", formatDollarValue(projection.growthEarned)],
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

  el("sp500Table").innerHTML = projection.yearlyRows
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

  drawSp500Chart(projection.yearlyRows);
}

function drawSp500Chart(rows) {
  destroyChart("sp500Chart");
  const ctx = el("sp500ChartCanvas").getContext("2d");
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Portfolio value",
          data: rows.map((row) => ({ x: row.year, y: row.endingValue })),
          borderColor: "#3ecf8e",
          backgroundColor: "#3ecf8e",
          borderWidth: 2,
          tension: 0.2,
        },
      ],
    },
    options: {
      ...baseLineOptions({
        readoutId: "sp500Readout",
        defaultMessage: "S&P chart details will appear here.",
      }),
      scales: {
        x: {
          type: "linear",
          ticks: {
            color: "#9fb2cf",
            stepSize: 1,
          },
          grid: {
            color: "rgba(36, 52, 75, 0.45)",
          },
        },
        y: {
          ticks: {
            color: "#9fb2cf",
            callback(value) {
              return formatCompactDollarValue(value);
            },
          },
          grid: {
            color: "rgba(36, 52, 75, 0.45)",
          },
        },
      },
    },
  });
  registerChartInteractions("sp500Chart", chart, "sp500Readout", {
    defaultMessage: "S&P chart details will appear here.",
    formatLabel: formatMeasureLabel,
  });
}

function renderWatchlist() {
  const grid = el("watchlistGrid");
  if (!appState.watchlist.length) {
    grid.innerHTML = `<div class="empty-state">Save a projection to start building your watchlist.</div>`;
    return;
  }

  grid.innerHTML = appState.watchlist
    .map(
      (entry) => `
        <article class="watch-card">
          <h3>${entry.ticker}</h3>
          <p>${entry.savedAt ? `Saved ${formatDate(entry.savedAt)}` : "Saved projection"}</p>
          <dl>
            <div><dt>Current price</dt><dd>${formatDollarValue(entry.currentPrice)}</dd></div>
            <div><dt>Base case</dt><dd>${formatDollarValue(entry.baseTarget)}</dd></div>
          </dl>
          <label class="watch-note-field">
            <span>Notes</span>
            <textarea data-watch-note="${entry.id}">${escapeHtml(entry.notes || "")}</textarea>
          </label>
          <div class="watch-actions">
            <button class="tiny-button" type="button" data-watch-action="open" data-watch-id="${entry.id}">Open</button>
            <button class="tiny-button danger" type="button" data-watch-action="delete" data-watch-id="${entry.id}">Delete</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function saveProjection() {
  if (!appState.lastProjection) {
    setInlineStatus("projectionSaveStatus", "Run a projection first.", "negative");
    return;
  }

  const base = appState.lastProjection.cases.find((item) => item.key === "base");
  const entry = {
    id: `watch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ticker: appState.lastProjection.input.ticker,
    currentPrice: appState.lastProjection.input.currentPrice,
    baseTarget: base?.terminal?.price || 0,
    notes: "",
    savedAt: new Date().toISOString(),
    input: structuredClone(appState.lastProjection.input),
  };

  appState.watchlist.unshift(entry);
  persistWatchlist();
  renderWatchlist();
  setInlineStatus("projectionSaveStatus", `${entry.ticker} saved to watchlist.`, "positive");
}

function loadProjectionFromWatch(entry) {
  el("ticker").value = entry.input.ticker;
  el("currentPrice").value = entry.input.currentPrice;
  el("revenue").value = entry.input.revenue;
  el("shares").value = entry.input.shares;
  el("eps").value = entry.input.eps;
  el("years").value = entry.input.years;
  scenarioConfig.forEach((scenario) => {
    const assumptions = entry.input.cases[scenario.key];
    el(`${scenario.key}Growth`).value = (assumptions.growth * 100).toFixed(1);
    el(`${scenario.key}Margin`).value = (assumptions.margin * 100).toFixed(1);
    el(`${scenario.key}Pe`).value = assumptions.pe;
  });
  activateTab("projection");
  runProjection();
}

function handleWatchlistClick(event) {
  const button = event.target.closest("[data-watch-action]");
  if (!button) return;
  const id = button.dataset.watchId;
  const entry = appState.watchlist.find((item) => item.id === id);
  if (!entry) return;

  if (button.dataset.watchAction === "open") {
    loadProjectionFromWatch(entry);
    return;
  }

  if (button.dataset.watchAction === "delete") {
    appState.watchlist = appState.watchlist.filter((item) => item.id !== id);
    persistWatchlist();
    renderWatchlist();
  }
}

function handleWatchlistInput(event) {
  const field = event.target.closest("[data-watch-note]");
  if (!field) return;
  const entry = appState.watchlist.find((item) => item.id === field.dataset.watchNote);
  if (!entry) return;
  entry.notes = field.value;
  persistWatchlist();
}

function resetPortfolioProjectionStatus() {
  setInlineStatus("portfolioProjectionStatus", "", "neutral");
}

function renderPortfolioProjectionCards(summary) {
  el("portfolioProjectionCards").innerHTML = [
    ["Bear", formatDollarValue(summary.bear)],
    ["Base", formatDollarValue(summary.base)],
    ["Bull", formatDollarValue(summary.bull)],
  ]
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span>${label} case</span>
          <strong>${value}</strong>
        </article>
      `,
    )
    .join("");
}

function renderPortfolioProjectionScenarios(summary) {
  el("portfolioProjectionScenarios").innerHTML = [
    ["bear", summary.bear, "Bear case portfolio rollup."],
    ["base", summary.base, "Base case portfolio rollup."],
    ["bull", summary.bull, "Bull case portfolio rollup."],
  ]
    .map(
      ([key, value, description]) => `
        <article class="scenario-card" data-case="${key}">
          <span>${key}</span>
          <strong>${formatDollarValue(value)}</strong>
          <p>${description}</p>
        </article>
      `,
    )
    .join("");
}

function calculatePortfolioProjection() {
  const holdings = appState.portfolio.holdings || [];
  const totalValue = holdings.reduce((sum, holding) => sum + (holding.currentValue || 0), 0);
  return {
    bear: totalValue * 0.8,
    base: totalValue * 1.12,
    bull: totalValue * 1.35,
  };
}

function runPortfolioProjection() {
  if (!appState.portfolio.holdings.length) {
    setInlineStatus("portfolioProjectionStatus", "Import holdings or add trades before running a portfolio projection.", "negative");
    return;
  }
  const summary = calculatePortfolioProjection();
  renderPortfolioProjectionCards(summary);
  renderPortfolioProjectionScenarios(summary);
  setInlineStatus("portfolioProjectionStatus", "Portfolio projection refreshed.", "positive");
}

function renderPortfolioHeroCards(holdings) {
  const totalValue = holdings.reduce((sum, holding) => sum + (holding.currentValue || 0), 0);
  const positions = holdings.length;
  const topHolding = [...holdings].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0))[0];
  const topSector = holdings.reduce((map, holding) => {
    const key = holding.sector || "Unassigned";
    map.set(key, (map.get(key) || 0) + (holding.currentValue || 0));
    return map;
  }, new Map());
  const leadingSector = [...topSector.entries()].sort((a, b) => b[1] - a[1])[0];

  el("portfolioHero").innerHTML = [
    ["Portfolio value", formatDollarValue(totalValue), "Current marked-to-market value across all active holdings."],
    ["Open positions", wholeNumber.format(positions), "Number of holdings currently in the ledger."],
    ["Largest holding", topHolding ? `${topHolding.symbol} · ${formatDollarValue(topHolding.currentValue || 0)}` : "N/A", "Position with the highest market value."],
    ["Top sector", leadingSector ? `${leadingSector[0]} · ${formatPercent(totalValue ? leadingSector[1] / totalValue : 0)}` : "N/A", "Sector carrying the highest portfolio weight."],
  ]
    .map(
      ([label, value, description]) => `
        <article class="hero-card">
          <span>${label}</span>
          <strong>${value}</strong>
          <p>${description}</p>
        </article>
      `,
    )
    .join("");
}

function renderPortfolioSpotlight(holdings) {
  if (!holdings.length) {
    el("portfolioSpotlight").innerHTML = `<div class="portfolio-empty-card">Add trades or import a workbook to see position highlights.</div>`;
    return;
  }

  const largest = [...holdings].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0))[0];
  const bestDay = [...holdings].sort((a, b) => (b.dayChange || 0) - (a.dayChange || 0))[0];

  el("portfolioSpotlight").innerHTML = [
    ["Largest holding", largest?.symbol || "N/A", largest ? `${formatDollarValue(largest.currentValue || 0)} currently allocated.` : "No holdings available."],
    ["Best day move", bestDay?.symbol || "N/A", bestDay ? `${formatDollarValue(bestDay.dayChange || 0)} today.` : "No day-change data yet."],
  ]
    .map(
      ([label, value, description]) => `
        <article class="spotlight-card">
          <span>${label}</span>
          <strong>${value}</strong>
          <p>${description}</p>
        </article>
      `,
    )
    .join("");
}

function renderPortfolioCards(holdings) {
  const totalValue = holdings.reduce((sum, holding) => sum + (holding.currentValue || 0), 0);
  const dayChange = holdings.reduce((sum, holding) => sum + (holding.dayChange || 0), 0);
  const unrealized = holdings.reduce((sum, holding) => sum + (holding.unrealizedProfit || 0), 0);
  el("portfolioCards").innerHTML = [
    ["Portfolio value", formatDollarValue(totalValue)],
    ["Day change", formatDollarValue(dayChange)],
    ["Unrealized profit", formatDollarValue(unrealized)],
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
  renderPortfolioHeroCards(appState.portfolio.holdings);
  renderPortfolioSpotlight(appState.portfolio.holdings);
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
