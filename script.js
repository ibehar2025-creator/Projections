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
  const ticker = el("ticker").value;
  setDataStatus(`Fetching ${ticker.toUpperCase()}...`);
  try {
    const data = await fetchStockData(ticker);
    applyStockDataToProjection(data);
    setDataStatus(`${data.symbol} market data refreshed.`);
    await loadProjectionHistoricalChart(data.symbol, appState.projectionHistoryRange);
  } catch (error) {
    setDataStatus(error.message);
    el("stockDataCard").innerHTML = `<strong>Could not load data.</strong><p>${error.message}</p>`;
  }
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
  return { ...stock, futureEps, futurePrice, upside, cagr, yearly };
}

function runCompare() {
  const years = Math.max(1, Math.min(15, Number(el("compareYears").value) || 5));
  const a = calculateCompareStock(compareInput("compareA"), years);
  const b = calculateCompareStock(compareInput("compareB"), years);

  el("compareCards").innerHTML = [a, b]
    .map(
      (stock) => `
        <article class="metric-card">
          <span>${stock.ticker}</span>
          <strong>${formatDollarValue(stock.futurePrice)}</strong>
          <p>${formatPercent(stock.upside)} upside, ${formatPercent(stock.cagr)} CAGR over ${years} years</p>
        </article>
      `,
    )
    .join("");

  drawCompareForwardChart(a, b, years);
  return { a, b, years };
}

async function fetchCompareTickers() {
  const aTicker = el("compareATicker").value;
  const bTicker = el("compareBTicker").value;

  try {
    const [aData, bData] = await Promise.all([fetchStockData(aTicker), fetchStockData(bTicker)]);
    el("compareATicker").value = aData.symbol;
    el("compareAPrice").value = Number(aData.price || 0).toFixed(2);
    el("compareAEps").value = Number(aData.eps || 0).toFixed(2);
    el("compareBTicker").value = bData.symbol;
    el("compareBPrice").value = Number(bData.price || 0).toFixed(2);
    el("compareBEps").value = Number(bData.eps || 0).toFixed(2);
    runCompare();
    await loadCompareHistoricalChart(appState.compareHistoryRange);
  } catch (error) {
    setChartReadout("compareHistoricalReadout", error.message);
  }
}

function saveProjection() {
  const result = appState.lastProjection || runProjection();
  const base = result.cases.find((item) => item.key === "base");
  const existingIndex = appState.watchlist.findIndex((item) => item.ticker === result.input.ticker);
  const existingItem = existingIndex >= 0 ? appState.watchlist[existingIndex] : null;
  const payload = {
    ticker: result.input.ticker,
    savedAt: new Date().toISOString(),
    currentPrice: result.input.currentPrice,
    bear: result.cases.find((item) => item.key === "bear")?.terminal.price || 0,
    base: base.terminal.price,
    bull: result.cases.find((item) => item.key === "bull")?.terminal.price || 0,
    baseCagr: base.cagr,
    years: result.input.years,
    notes: existingItem?.notes || "",
    inputs: serializeProjectionInputs(),
  };

  if (existingIndex >= 0) {
    appState.watchlist.splice(existingIndex, 1, payload);
  } else {
    appState.watchlist.unshift(payload);
  }
  appState.watchlist = appState.watchlist.slice(0, 40);
  persistWatchlist();
  renderWatchlist();
  setInlineStatus("projectionSaveStatus", `${payload.ticker} saved to watchlist.`, "positive");
}

function serializeProjectionInputs() {
  const values = {};
  [
    "ticker",
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
    values[id] = el(id).value;
  });
  return values;
}

function restoreProjectionInputs(values) {
  Object.entries(values || {}).forEach(([id, value]) => {
    if (el(id)) {
      el(id).value = value;
    }
  });
}

function renderWatchlist() {
  const container = el("watchlistGrid");
  if (!appState.watchlist.length) {
    container.innerHTML = '<div class="empty-state">No saved projections yet. Save one from the Projection tab and it will show up here.</div>';
    return;
  }

  container.innerHTML = appState.watchlist
    .map(
      (item, index) => `
        <article class="watch-card">
          <h3>${item.ticker}</h3>
          <p class="small-muted">Saved ${formatDate(item.savedAt)} from ${formatDollarValue(item.currentPrice)}</p>
          <dl>
            <div><dt>Bear</dt><dd>${formatDollarValue(item.bear)}</dd></div>
            <div><dt>Base</dt><dd>${formatDollarValue(item.base)}</dd></div>
            <div><dt>Bull</dt><dd>${formatDollarValue(item.bull)}</dd></div>
            <div><dt>Base CAGR</dt><dd>${formatPercent(item.baseCagr)}</dd></div>
          </dl>
          <label class="watch-note-field">
            <span>Notes</span>
            <textarea
              rows="4"
              placeholder="Add your thesis, risks, catalysts, or reminders..."
              data-watch-note="${index}"
            >${escapeHtml(item.notes || "")}</textarea>
          </label>
          <div class="watch-actions">
            <button class="tiny-button" type="button" data-watch-action="load" data-watch-index="${index}">Load</button>
            <button class="tiny-button danger" type="button" data-watch-action="delete" data-watch-index="${index}">Delete</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function runReverse() {
  const price = numberValue("revPrice");
  const eps = numberValue("revEps");
  const pe = numberValue("revPe");
  const years = Math.max(1, numberValue("revYears"));
  const impliedFutureEps = pe > 0 ? price / pe : 0;
  const growth = eps > 0 && impliedFutureEps > 0 ? Math.pow(impliedFutureEps / eps, 1 / years) - 1 : 0;
  el("reverseAnswer").innerHTML = `
    <strong>${formatPercent(growth)}</strong>
    The current price implies roughly ${formatPercent(growth)} annual EPS growth for the next ${years} year${years === 1 ? "" : "s"} if the stock exits at ${pe.toFixed(1)}x earnings.
  `;
}

function runMos() {
  const fairValue = numberValue("fairValue");
  const currentPrice = numberValue("mosPrice");
  const safety = numberValue("mosPercent") / 100;
  const buyBelow = fairValue * (1 - safety);
  const upside = currentPrice > 0 ? fairValue / currentPrice - 1 : 0;
  el("mosAnswer").innerHTML = `
    <strong>${formatDollarValue(buyBelow)}</strong>
    If your fair value estimate is ${formatDollarValue(fairValue)}, a ${wholeNumber.format(safety * 100)}% margin of safety means your buy zone is ${formatDollarValue(buyBelow)} or below. That leaves ${formatPercent(upside)} upside to fair value from the current price.
  `;
}

function calculateSp500Projection() {
  const start = numberValue("spStart");
  const monthly = numberValue("spMonthly");
  const annualRate = numberValue("spRate") / 100;
  const years = Math.max(1, Math.min(50, numberValue("spYears")));
  const monthlyRate = annualRate / 12;

  let current = start;
  let totalContributed = start;
  let totalGrowth = 0;
  const yearlyRows = [];
  const chartPoints = [{ x: 0, y: start }];

  for (let year = 1; year <= years; year += 1) {
    const startValue = current;
    let contributionsThisYear = 0;
    for (let month = 0; month < 12; month += 1) {
      current = current * (1 + monthlyRate) + monthly;
      contributionsThisYear += monthly;
    }
    totalContributed += contributionsThisYear;
    totalGrowth = current - totalContributed;
    yearlyRows.push({
      year,
      startValue,
      contributions: contributionsThisYear,
      growth: current - startValue - contributionsThisYear,
      endingValue: current,
    });
    chartPoints.push({ x: year, y: current });
  }

  return {
    years,
    endingValue: current,
    totalContributed,
    totalGrowth,
    chartPoints,
    yearlyRows,
  };
}

function renderSp500() {
  const result = calculateSp500Projection();
  el("sp500Cards").innerHTML = [
    ["Ending value", formatDollarValue(result.endingValue)],
    ["Total contributed", formatDollarValue(result.totalContributed)],
    ["Growth earned", formatDollarValue(result.totalGrowth)],
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

  el("sp500Table").innerHTML = result.yearlyRows
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
    readoutId: "sp500Readout",
    datasets: [
      {
        label: "Portfolio value",
        data: result.chartPoints,
        borderColor: "#4f8cff",
        backgroundColor: "rgba(79, 140, 255, 0.16)",
      },
    ],
    xType: "linear",
    xTitle: "Years",
    yTitle: "Portfolio value",
    readoutFormatter: (context) => `${context.dataset.label}: ${formatDollarValue(context.parsed.y)} in year ${context.parsed.x}`,
  });
  setChartReadout("sp500Readout", "S&P chart details will appear here.");
}

function setChartReadout(readoutId, message) {
  const node = el(readoutId);
  if (node) {
    node.textContent = message;
  }
}

function destroyChart(chartKey) {
  const bundle = appState.charts[chartKey];
  if (bundle?.chart) {
    bundle.chart.destroy();
  }
  delete appState.charts[chartKey];
}

function baseChartOptions({ xType = "linear", xTitle = "", yTitle = "", readoutId, readoutFormatter }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: "nearest",
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
            return readoutFormatter
              ? readoutFormatter(context)
              : `${context.dataset.label}: ${formatDollarValue(context.parsed.y)}`;
          },
        },
      },
      zoom: {
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
      },
    },
    scales: {
      x: {
        type: xType,
        title: {
          display: Boolean(xTitle),
          text: xTitle,
          color: "#93a8c4",
        },
        ticks: {
          color: "#93a8c4",
        },
        grid: {
          color: "rgba(36, 52, 75, 0.45)",
        },
      },
      y: {
        title: {
          display: Boolean(yTitle),
          text: yTitle,
          color: "#93a8c4",
        },
        ticks: {
          color: "#93a8c4",
          callback(value) {
            return formatCompactDollarValue(Number(value));
          },
        },
        grid: {
          color: "rgba(36, 52, 75, 0.45)",
        },
      },
    },
    onHover(event, elements, chart) {
      if (!elements.length || !readoutId) return;
      const context = chart.getDatasetMeta(elements[0].datasetIndex).controller.getLabelAndValue(elements[0].index);
      const dataset = chart.data.datasets[elements[0].datasetIndex];
      const dataPoint = dataset.data[elements[0].index];
      const parsed = typeof dataPoint === "object" ? dataPoint : { x: elements[0].index, y: dataPoint };
      setChartReadout(
        readoutId,
        readoutFormatter
          ? readoutFormatter({ dataset, parsed, datasetIndex: elements[0].datasetIndex, dataIndex: elements[0].index, labelAndValue: context })
          : `${dataset.label}: ${formatDollarValue(parsed.y)}`,
      );
    },
  };
}

function createLineChart(chartKey, canvasId, config) {
  destroyChart(chartKey);
  const ctx = el(canvasId).getContext("2d");
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: config.datasets.map((dataset) => ({
        ...dataset,
        tension: 0.22,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
      })),
    },
    options: baseChartOptions(config),
  });
  appState.charts[chartKey] = { chart, mode: "measure", config };
  return chart;
}

function updateChartMode(chartKey, mode) {
  const bundle = appState.charts[chartKey];
  if (!bundle?.chart) return;
  bundle.mode = mode;
}

function resetChartView(chartKey) {
  const bundle = appState.charts[chartKey];
  if (!bundle?.chart) return;
  if (bundle.chart.resetZoom) {
    bundle.chart.resetZoom();
  }
  bundle.chart.update("none");
}

function drawProjectionForwardChart(result) {
  createLineChart("projectionForward", "projectionForwardChart", {
    readoutId: "projectionForwardReadout",
    datasets: result.cases.map((item) => ({
      label: `${item.label} case`,
      data: item.yearly,
      borderColor: item.color,
      backgroundColor: `${item.color}33`,
    })),
    xType: "linear",
    xTitle: "Years",
    yTitle: "Share price",
    readoutFormatter: (context) => `${context.dataset.label}: ${formatDollarValue(context.parsed.y)} in year ${context.parsed.x}`,
  });
  setChartReadout("projectionForwardReadout", "Price-path details will appear here.");
}

function drawProjectionUnifiedChart(result, history) {
  const historicalDataset = {
    label: `${history.symbol} history`,
    data: history.points,
    borderColor: "#7aa7ff",
    backgroundColor: "rgba(122, 167, 255, 0.18)",
  };
  const projectionDatasets = result.cases.map((item) => ({
    label: `${item.label} case`,
    data: item.yearly.map((point) => ({ x: point.year + (history.forwardOffset || 0), y: point.price })),
    borderColor: item.color,
    backgroundColor: `${item.color}33`,
  }));

  createLineChart("projectionForward", "projectionForwardChart", {
    readoutId: "projectionForwardReadout",
    datasets: [historicalDataset, ...projectionDatasets],
    xType: "time",
    xTitle: "Date",
    yTitle: "Share price",
    readoutFormatter: (context) => `${context.dataset.label}: ${formatDollarValue(context.parsed.y)}`,
  });
}

function drawCompareForwardChart(a, b, years) {
  createLineChart("compareForward", "compareForwardChart", {
    readoutId: "compareForwardReadout",
    datasets: [
      {
        label: a.ticker,
        data: a.yearly,
        borderColor: "#4f8cff",
        backgroundColor: "rgba(79, 140, 255, 0.18)",
      },
      {
        label: b.ticker,
        data: b.yearly,
        borderColor: "#3ecf8e",
        backgroundColor: "rgba(62, 207, 142, 0.18)",
      },
    ],
    xType: "linear",
    xTitle: "Years",
    yTitle: "Share price",
    readoutFormatter: (context) => `${context.dataset.label}: ${formatDollarValue(context.parsed.y)} in year ${context.parsed.x}`,
  });
  setChartReadout("compareForwardReadout", `Forward comparison for ${a.ticker} and ${b.ticker} over ${years} years.`);
}

async function loadProjectionHistoricalChart(symbol, range) {
  const history = await fetchHistoricalData(symbol, range);
  appState.projectionHistory = history;
  if (appState.lastProjection) {
    drawProjectionUnifiedChart(appState.lastProjection, history);
  }
}

async function loadCompareHistoricalChart(range) {
  const a = compareInput("compareA");
  const b = compareInput("compareB");
  const [aHistory, bHistory] = await Promise.all([fetchHistoricalData(a.ticker, range), fetchHistoricalData(b.ticker, range)]);

  createLineChart("compareHistorical", "compareHistoricalChart", {
    readoutId: "compareHistoricalReadout",
    datasets: [
      {
        label: aHistory.symbol,
        data: aHistory.normalizedPoints,
        borderColor: "#4f8cff",
        backgroundColor: "rgba(79, 140, 255, 0.18)",
      },
      {
        label: bHistory.symbol,
        data: bHistory.normalizedPoints,
        borderColor: "#3ecf8e",
        backgroundColor: "rgba(62, 207, 142, 0.18)",
      },
    ],
    xType: "time",
    xTitle: "Date",
    yTitle: "Indexed performance",
    readoutFormatter: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(1)} indexed`,
  });

  setChartReadout(
    "compareHistoricalReadout",
    `${aHistory.symbol} and ${bHistory.symbol} ${aHistory.rangeLabel} history loaded and normalized to 100 at the starting point.`,
  );
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
  el("tradeForm").addEventListener("submit", handleTradeSubmit);
  el("resetTradeForm").addEventListener("click", resetTradeForm);
  el("connectDriveButton").addEventListener("click", connectDrive);
  el("disconnectDriveButton").addEventListener("click", () => {
    disconnectDrive().catch((error) => setInlineStatus("portfolioStatus", error.message, "negative"));
  });
  el("syncPortfolioNowButton").addEventListener("click", () => {
    syncPortfolioToDrive().catch((error) => setInlineStatus("portfolioStatus", error.message, "negative"));
  });
  el("loadDrivePortfolioButton").addEventListener("click", () => {
    loadPortfolioFromDrive().catch((error) => setInlineStatus("portfolioStatus", error.message, "negative"));
  });
  el("reloadRemotePortfolioButton").addEventListener("click", () => {
    loadPortfolioFromDrive().catch((error) => setInlineStatus("portfolioStatus", error.message, "negative"));
  });
  el("forceOverwriteRemoteButton").addEventListener("click", () => {
    syncPortfolioToDrive({ force: true }).catch((error) => setInlineStatus("portfolioStatus", error.message, "negative"));
  });
  el("downloadPortfolioTemplate").addEventListener("click", downloadPortfolioTemplate);
  el("importPortfolioButton").addEventListener("click", () => el("portfolioFileInput").click());
  el("exportPortfolioButton").addEventListener("click", exportPortfolioWorkbook);
  el("exportTradesCsvButton").addEventListener("click", exportTradesCsv);
  el("refreshPortfolioQuotes").addEventListener("click", refreshPortfolioQuotes);

  el("portfolioFileInput").addEventListener("change", async (event) => {
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

  el("portfolioTradesTable").addEventListener("click", (event) => {
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

  el("projectionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    runProjection();
    await loadProjectionHistoricalChart(el("ticker").value, appState.projectionHistoryRange).catch(() => {});
  });

  [
    "ticker",
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
    el(id).addEventListener("input", () => {
      runProjection();
    });
  });

  el("saveProjection").addEventListener("click", saveProjection);
  el("fetchTicker").addEventListener("click", fetchProjectionTicker);
  el("runCompare").addEventListener("click", async () => {
    runCompare();
    await loadCompareHistoricalChart(appState.compareHistoryRange).catch(() => {});
  });
  el("fetchCompare").addEventListener("click", fetchCompareTickers);
  el("runReverse").addEventListener("click", runReverse);
  el("runMos").addEventListener("click", runMos);
  el("sp500Form").addEventListener("submit", (event) => {
    event.preventDefault();
    renderSp500();
  });
  el("clearWatchlist").addEventListener("click", () => {
    appState.watchlist = [];
    persistWatchlist();
    renderWatchlist();
  });
  el("useCurrentForA").addEventListener("click", () => {
    const input = readProjectionInputs();
    el("compareATicker").value = input.ticker;
    el("compareAPrice").value = input.currentPrice;
    el("compareAEps").value = input.eps;
    el("compareAGrowth").value = (input.cases.base.growth * 100).toFixed(1);
    el("compareAPe").value = input.cases.base.pe;
    runCompare();
  });
  el("compareViewToggle").addEventListener("click", (event) => {
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

function toggleCompareView(view) {
  appState.compareView = view;
  document.querySelectorAll("[data-compare-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.compareView === view);
  });
  el("compareHistoricalBlock").classList.toggle("active", view === "historical");
  el("compareForwardBlock").classList.toggle("active", view === "forward");
  resizeVisibleCharts();
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

function refreshPortfolioQuotes() {
  setInlineStatus("portfolioStatus", "Refreshing quotes...", "neutral");
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
