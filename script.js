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
  portfolioProjection: null,
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
    const minX = Math.min(left, right);
    const fill = activeDataset?.borderColor || "#4f8cff";
    const baseline = area.bottom;
    const datasetPoints = Array.isArray(activeDataset?.data) ? activeDataset.data : [];
    const startIndex = Number.isInteger(interaction.measureStart.index) ? interaction.measureStart.index : 0;
    const endIndex = Number.isInteger(interaction.measureEnd.index) ? interaction.measureEnd.index : datasetPoints.length - 1;
    const fromIndex = Math.max(0, Math.min(startIndex, endIndex));
    const toIndex = Math.min(datasetPoints.length - 1, Math.max(startIndex, endIndex));
    const selectedPoints = datasetPoints.slice(fromIndex, toIndex + 1);
    const topValue = Math.max(...selectedPoints.map((point) => point?.y ?? 0), interaction.measureStart.yValue, interaction.measureEnd.yValue);
    const topPixel = yScale ? yScale.getPixelForValue(topValue) : area.top;

    ctx.save();
    ctx.fillStyle = "rgba(79, 140, 255, 0.14)";
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1.2;

    if (selectedPoints.length >= 2 && yScale) {
      ctx.beginPath();
      ctx.moveTo(xScale.getPixelForValue(selectedPoints[0].x), baseline);
      selectedPoints.forEach((point) => {
        ctx.lineTo(xScale.getPixelForValue(point.x), yScale.getPixelForValue(point.y));
      });
      ctx.lineTo(xScale.getPixelForValue(selectedPoints[selectedPoints.length - 1].x), baseline);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      selectedPoints.forEach((point, index) => {
        const px = xScale.getPixelForValue(point.x);
        const py = yScale.getPixelForValue(point.y);
        if (index === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(left, topPixel);
    ctx.lineTo(left, baseline);
    ctx.moveTo(right, topPixel);
    ctx.lineTo(right, baseline);
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
  const holdingsSnapshot = appState.portfolio.trades.length
    ? deriveHoldingsFromTrades(appState.portfolio.trades, false)
    : (appState.portfolio.holdings || []).map(normalizePortfolioHolding);
  return {
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    deviceId: appState.portfolio.sync.deviceId,
    trades: appState.portfolio.trades.map((trade) => ({ ...trade })),
    holdingsSnapshot,
  };
}

function applyDrivePortfolioPayload(payload, metadata = {}) {
  const trades = Array.isArray(payload?.trades) ? payload.trades.map(normalizeImportedTrade) : [];
  const remoteHoldingsSource = Array.isArray(payload?.holdingsSnapshot)
    ? payload.holdingsSnapshot
    : Array.isArray(payload?.holdings)
      ? payload.holdings
      : [];
  const remoteHoldings = remoteHoldingsSource.map(normalizePortfolioHolding).filter((holding) => holding.symbol && holding.quantity > 0);
  appState.portfolio.trades = trades;
  appState.portfolio.holdings = trades.length ? deriveHoldingsFromTrades(trades, false) : remoteHoldings;
  appState.portfolioProjection = null;
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
    el("bullMargin").value = Math.max(margin * 1.15, margin + 2).toFixed(1);
  }
  if (Number.isFinite(data.peTtm)) {
    const pe = Math.max(5, Number(data.peTtm));
    el("bearPe").value = Math.max(8, pe * 0.75).toFixed(1);
    el("basePe").value = pe.toFixed(1);
    el("bullPe").value = Math.max(pe * 1.15, pe + 3).toFixed(1);
  }
  renderStockDataCard(data);
  setDataStatus(`${data.source || "Market"} data loaded`);
}

async function fetchProjectionTicker() {
  const button = el("fetchTicker");
  button.disabled = true;
  button.textContent = "Fetching...";
  setDataStatus("Fetching live data");
  try {
    const data = await fetchStockData(el("ticker").value);
    applyStockDataToProjection(data);
    runProjection();
    await loadProjectionHistoricalChart(data.symbol, appState.projectionHistoryRange);
  } catch (error) {
    setDataStatus("Data unavailable");
    el("stockDataCard").innerHTML = `<strong>Could not load data.</strong><p>${error.message}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = "Fetch live data";
  }
}

function buildBaseChartOptions({ yAxisLabelPrefix = "", readoutId, xTime = false, mode = "measure" }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "nearest",
      intersect: false,
    },
    scales: {
      x: xTime
        ? {
            type: "time",
            time: {
              tooltipFormat: "MMM d, yyyy",
            },
            ticks: {
              color: "#92a8c5",
              maxRotation: 0,
            },
            grid: {
              color: "rgba(36, 52, 75, 0.55)",
            },
          }
        : {
            type: "linear",
            ticks: {
              color: "#92a8c5",
              precision: 0,
            },
            grid: {
              color: "rgba(36, 52, 75, 0.55)",
            },
          },
      y: {
        ticks: {
          color: "#92a8c5",
          callback(value) {
            return `${yAxisLabelPrefix}${Number(value).toLocaleString()}`;
          },
        },
        grid: {
          color: "rgba(36, 52, 75, 0.55)",
        },
      },
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
            const label = context.dataset.label ? `${context.dataset.label}: ` : "";
            const value = context.parsed.y;
            return `${label}${formatDollarValue(value)}`;
          },
        },
      },
      zoom: {
        pan: {
          enabled: mode === "pan",
          mode: "x",
        },
        zoom: {
          wheel: {
            enabled: mode === "pan",
          },
          pinch: {
            enabled: mode === "pan",
          },
          drag: {
            enabled: false,
          },
          mode: "x",
        },
      },
    },
    elements: {
      point: {
        radius: 0,
        hitRadius: 18,
        hoverRadius: 4,
      },
      line: {
        tension: 0.2,
      },
    },
    onClick(event, elements, chart) {
      if (!elements.length) return;
      const first = elements[0];
      const point = chart.data.datasets[first.datasetIndex].data[first.index];
      const xText = xTime ? formatDate(point.x) : `Year ${point.x}`;
      setChartReadout(readoutId, `${chart.data.datasets[first.datasetIndex].label}: ${xText} | ${formatDollarValue(point.y)}`);
    },
  };
}

function destroyChart(chartKey) {
  const existing = appState.charts[chartKey];
  if (existing?.chart) {
    existing.chart.destroy();
  }
  delete appState.charts[chartKey];
}

function setChartReadout(readoutId, message) {
  const node = el(readoutId);
  if (node) node.textContent = message;
}

function pointDistance(a, b) {
  return Math.abs(Number(a) - Number(b));
}

function findNearestDataPoint(chart, event, targetDatasetIndex = null) {
  const area = chart.chartArea;
  if (!area) return null;

  const position = Chart.helpers.getRelativePosition(event, chart);
  if (
    position.x < area.left ||
    position.x > area.right ||
    position.y < area.top ||
    position.y > area.bottom
  ) {
    return null;
  }

  const xScale = chart.scales.x;
  const xValue = xScale.getValueForPixel(position.x);
  let nearest = null;

  chart.data.datasets.forEach((dataset, datasetIndex) => {
    if (targetDatasetIndex !== null && datasetIndex !== targetDatasetIndex) {
      return;
    }
    dataset.data.forEach((point, index) => {
      const distance = pointDistance(point.x, xValue);
      if (!nearest || distance < nearest.distance) {
        nearest = { dataset, datasetIndex, point, index, distance };
      }
    });
  });

  return nearest;
}

function attachMeasureHandlers(chartKey) {
  const bundle = appState.charts[chartKey];
  if (!bundle?.chart) return;
  const { chart, readoutId, xFormatter } = bundle;
  const canvas = chart.canvas;
  if (!canvas) return;

  if (bundle.cleanupMeasure) {
    bundle.cleanupMeasure();
  }

  let dragging = false;

  const mouseDown = (event) => {
    event.preventDefault();
    if (bundle.mode !== "measure") return;
    const nearest = findNearestDataPoint(chart, event);
    if (!nearest) return;
    dragging = true;
    chart.$interaction = {
      measureStart: { xValue: nearest.point.x, yValue: nearest.point.y, index: nearest.index },
      measureEnd: { xValue: nearest.point.x, yValue: nearest.point.y, index: nearest.index },
      measureDatasetIndex: nearest.datasetIndex,
      measureLabel: "",
    };
    chart.update("none");
  };

  const mouseMove = (event) => {
    const nearest = findNearestDataPoint(chart, event);
    if (nearest && !dragging) {
      setChartReadout(readoutId, `${nearest.dataset.label}: ${xFormatter(nearest.point.x)} | ${formatDollarValue(nearest.point.y)}`);
    }
    if (!dragging || bundle.mode !== "measure") return;
    const current = findNearestDataPoint(chart, event, chart.$interaction.measureDatasetIndex);
    if (!current) return;
    const start = chart.$interaction.measureStart;
    const delta = current.point.y - start.yValue;
    const percentChange = start.yValue !== 0 ? delta / start.yValue : 0;
    chart.$interaction.measureEnd = { xValue: current.point.x, yValue: current.point.y, index: current.index };
    chart.$interaction.measureDatasetIndex = current.datasetIndex;
    chart.$interaction.measureLabel = `${xFormatter(start.xValue)} to ${xFormatter(current.point.x)} | Growth ${formatDollarValue(delta)} | ${formatPercent(percentChange)}`;
    setChartReadout(readoutId, chart.$interaction.measureLabel);
    chart.update("none");
  };

  const mouseUp = (event) => {
    if (dragging && chart.$interaction?.measureLabel) {
      const current = findNearestDataPoint(chart, event, chart.$interaction.measureDatasetIndex);
      if (current) {
        const start = chart.$interaction.measureStart;
        const delta = current.point.y - start.yValue;
        const percentChange = start.yValue !== 0 ? delta / start.yValue : 0;
        chart.$interaction.measureEnd = { xValue: current.point.x, yValue: current.point.y, index: current.index };
        chart.$interaction.measureDatasetIndex = current.datasetIndex;
        chart.$interaction.measureLabel = `${xFormatter(start.xValue)} to ${xFormatter(current.point.x)} | Growth ${formatDollarValue(delta)} | ${formatPercent(percentChange)}`;
        setChartReadout(readoutId, chart.$interaction.measureLabel);
        chart.update("none");
      } else {
        setChartReadout(readoutId, chart.$interaction.measureLabel);
      }
    } else {
      const nearest = findNearestDataPoint(chart, event);
      if (nearest) {
        setChartReadout(readoutId, `${nearest.dataset.label}: ${xFormatter(nearest.point.x)} | ${formatDollarValue(nearest.point.y)}`);
      }
    }
    dragging = false;
  };

  const mouseLeave = () => {
    dragging = false;
  };

  const clickHandler = (event) => {
    const nearest = findNearestDataPoint(chart, event);
    if (!nearest) return;
    setChartReadout(readoutId, `${nearest.dataset.label}: ${xFormatter(nearest.point.x)} | ${formatDollarValue(nearest.point.y)}`);
  };

  canvas.style.cursor = bundle.mode === "pan" ? "grab" : "crosshair";
  canvas.addEventListener("pointerdown", mouseDown);
  canvas.addEventListener("pointermove", mouseMove);
  canvas.addEventListener("pointerup", mouseUp);
  canvas.addEventListener("pointerleave", mouseLeave);
  canvas.addEventListener("click", clickHandler);

  bundle.cleanupMeasure = () => {
    canvas.removeEventListener("pointerdown", mouseDown);
    canvas.removeEventListener("pointermove", mouseMove);
    canvas.removeEventListener("pointerup", mouseUp);
    canvas.removeEventListener("pointerleave", mouseLeave);
    canvas.removeEventListener("click", clickHandler);
  };
}

function createLineChart(chartKey, canvasId, config) {
  destroyChart(chartKey);
  const canvas = el(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const options = buildBaseChartOptions(config);
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: config.datasets,
    },
    options,
  });

  appState.charts[chartKey] = {
    chart,
    mode: config.mode || "measure",
    readoutId: config.readoutId,
    xFormatter: config.xFormatter,
    isTimeSeries: config.xTime,
  };
  chart.$interaction = null;
  attachMeasureHandlers(chartKey);
  requestAnimationFrame(() => {
    chart.resize();
    chart.update("none");
  });
  return chart;
}

function updateChartMode(chartKey, mode) {
  const bundle = appState.charts[chartKey];
  if (!bundle?.chart) return;
  bundle.mode = mode;
  bundle.chart.options.plugins.zoom.pan.enabled = mode === "pan";
  bundle.chart.options.plugins.zoom.zoom.wheel.enabled = mode === "pan";
  bundle.chart.options.plugins.zoom.zoom.pinch.enabled = mode === "pan";
  bundle.chart.$interaction = null;
  attachMeasureHandlers(chartKey);
  bundle.chart.update("none");
}

function resetChartView(chartKey) {
  const bundle = appState.charts[chartKey];
  if (!bundle?.chart) return;
  bundle.chart.resetZoom?.();
  bundle.chart.$interaction = null;
  bundle.chart.update("none");
  const fallbackMessages = {
    projectionHistorical: "Historical details will appear here.",
    projectionForward: "Future scenario details will appear here.",
    compareHistorical: "Historical comparison details will appear here.",
    compareForward: "Forward comparison details will appear here.",
    sp500Chart: "S&P chart details will appear here.",
  };
  if (bundle.readoutId) setChartReadout(bundle.readoutId, fallbackMessages[chartKey] || "Chart details will appear here.");
}

function drawProjectionForwardChart(result) {
  const datasets = result.cases.map((scenario) => ({
    label: `${scenario.label} outlook`,
    data: scenario.yearly.map((point) => ({ x: point.year, y: point.price })),
    borderColor: scenario.color,
    borderDash: scenario.key === "base" ? [] : [6, 6],
    backgroundColor: `${scenario.color}33`,
    pointRadius: 0,
    pointHitRadius: 18,
    fill: false,
  }));

  createLineChart("projectionForward", "projectionForwardChart", {
    datasets,
    readoutId: "projectionForwardReadout",
    xFormatter: (value) => `Year ${value}`,
    xTime: false,
    mode: "measure",
  });
  setChartReadout("projectionForwardReadout", "Future scenario details will appear here.");
}

async function loadProjectionHistoricalChart(symbol, range = "5y") {
  const data = await fetchHistoricalData(symbol, range);
  appState.projectionHistory = {
    symbol: data.symbol,
    range: data.range,
    points: data.points,
  };

  if (appState.lastProjection && String(appState.lastProjection.input.ticker).toUpperCase() === String(data.symbol).toUpperCase()) {
    drawProjectionUnifiedChart(appState.lastProjection, appState.projectionHistory);
    return;
  }

  const datasets = [
    {
      label: `${data.symbol} historical`,
      data: data.points.map((point) => ({ x: point.date, y: point.close })),
      borderColor: "#4f8cff",
      backgroundColor: "rgba(79, 140, 255, 0.18)",
      pointRadius: 0,
      pointHitRadius: 18,
      fill: false,
    },
  ];

  createLineChart("projectionHistorical", "projectionForwardChart", {
    datasets,
    readoutId: "projectionForwardReadout",
    xFormatter: (value) => formatDate(value),
    xTime: true,
    mode: "measure",
  });
  setChartReadout(
    "projectionForwardReadout",
    `${data.symbol} ${range.toUpperCase()} history loaded. Click or drag to inspect exact points.`,
  );
}

function restoreProjectionInputs(inputs) {
  if (!inputs) return;
  el("ticker").value = inputs.ticker;
  el("currentPrice").value = inputs.currentPrice;
  el("revenue").value = inputs.revenue;
  el("shares").value = inputs.shares;
  el("eps").value = inputs.eps;
  el("years").value = inputs.years;
  scenarioConfig.forEach((scenario) => {
    const item = inputs.cases?.[scenario.key];
    if (!item) return;
    el(`${scenario.key}Growth`).value = (item.growth * 100).toFixed(1);
    el(`${scenario.key}Margin`).value = (item.margin * 100).toFixed(1);
    el(`${scenario.key}Pe`).value = item.pe;
  });
}

function saveProjection() {
  const inputs = readProjectionInputs();
  const projection = appState.lastProjection || calculateProjection(inputs);
  const base = projection.cases.find((item) => item.key === "base");
  const saved = {
    ticker: inputs.ticker,
    savedAt: new Date().toISOString(),
    currentPrice: inputs.currentPrice,
    targets: Object.fromEntries(projection.cases.map((item) => [item.key, item.terminal.price])),
    baseCagr: base?.cagr || 0,
    inputs,
    notes: "",
  };

  const existingIndex = appState.watchlist.findIndex((item) => item.ticker === saved.ticker);
  if (existingIndex >= 0) {
    appState.watchlist.splice(existingIndex, 1, saved);
  } else {
    appState.watchlist.unshift(saved);
  }
  persistWatchlist();
  renderWatchlist();
  setInlineStatus("projectionSaveStatus", `${saved.ticker} saved to watchlist.`, "positive");
  setInlineStatus("watchlistStatus", `${saved.ticker} added to the watchlist.`, "positive");
}

function compareProjectionSeries(symbol, currentPrice, eps, growthPct, exitPe, years) {
  const growth = Number(growthPct) / 100;
  const startEps = Number(eps) || 0;
  const current = Number(currentPrice) || 0;
  const multiple = Number(exitPe) || 0;
  const data = [];

  for (let year = 0; year <= years; year += 1) {
    const projectedEps = startEps * Math.pow(1 + growth, year);
    const price = projectedEps * multiple;
    data.push({
      x: year,
      y: price,
      returnMultiple: current > 0 ? price / current : 0,
    });
  }

  return {
    symbol,
    current,
    terminalPrice: data[data.length - 1].y,
    cagr: current > 0 ? Math.pow(data[data.length - 1].y / current, 1 / years) - 1 : 0,
    data,
  };
}

function runCompare() {
  const years = Math.max(1, Math.min(15, Number(el("compareYears").value) || 5));
  const stockA = compareProjectionSeries(
    el("compareATicker").value.trim().toUpperCase() || "STOCK A",
    Number(el("compareAPrice").value),
    Number(el("compareAEps").value),
    Number(el("compareAGrowth").value),
    Number(el("compareAPe").value),
    years,
  );
  const stockB = compareProjectionSeries(
    el("compareBTicker").value.trim().toUpperCase() || "STOCK B",
    Number(el("compareBPrice").value),
    Number(el("compareBEps").value),
    Number(el("compareBGrowth").value),
    Number(el("compareBPe").value),
    years,
  );

  el("compareCards").innerHTML = [stockA, stockB]
    .map(
      (item) => `
        <article class="metric-card">
          <span>${item.symbol}</span>
          <strong>${formatDollarValue(item.terminalPrice)}</strong>
          <p>${formatPercent(item.cagr)} annualized, ${item.data[item.data.length - 1].returnMultiple.toFixed(2)}x ending value</p>
        </article>
      `,
    )
    .join("");

  createLineChart("compareForward", "compareForwardChart", {
    datasets: [
      {
        label: stockA.symbol,
        data: stockA.data,
        borderColor: "#4f8cff",
        backgroundColor: "rgba(79, 140, 255, 0.2)",
        pointRadius: 0,
        pointHitRadius: 18,
        fill: false,
      },
      {
        label: stockB.symbol,
        data: stockB.data,
        borderColor: "#f4b74e",
        backgroundColor: "rgba(244, 183, 78, 0.2)",
        pointRadius: 0,
        pointHitRadius: 18,
        fill: false,
      },
    ],
    readoutId: "compareForwardReadout",
    xFormatter: (value) => `Year ${value}`,
    xTime: false,
    mode: "measure",
  });
  setChartReadout("compareForwardReadout", "Forward comparison details will appear here.");
}

async function fetchCompareTickers() {
  const button = el("fetchCompare");
  button.disabled = true;
  button.textContent = "Fetching...";
  try {
    const [stockA, stockB] = await Promise.all([
      fetchStockData(el("compareATicker").value),
      fetchStockData(el("compareBTicker").value),
    ]);
    el("compareATicker").value = stockA.symbol;
    el("compareAPrice").value = Number(stockA.price || 0).toFixed(2);
    el("compareAEps").value = Number(stockA.eps || 0).toFixed(2);
    el("compareAGrowth").value = Number(stockA.estimatedGrowth || 10).toFixed(1);
    el("compareAPe").value = Number(stockA.peTtm || 20).toFixed(1);

    el("compareBTicker").value = stockB.symbol;
    el("compareBPrice").value = Number(stockB.price || 0).toFixed(2);
    el("compareBEps").value = Number(stockB.eps || 0).toFixed(2);
    el("compareBGrowth").value = Number(stockB.estimatedGrowth || 10).toFixed(1);
    el("compareBPe").value = Number(stockB.peTtm || 20).toFixed(1);

    runCompare();
    await loadCompareHistoricalChart(appState.compareHistoryRange);
  } catch (error) {
    setChartReadout("compareHistoricalReadout", error.message || "Could not fetch live comparison data.");
  } finally {
    button.disabled = false;
    button.textContent = "Fetch A & B";
  }
}

async function loadCompareHistoricalChart(range = "5y") {
  const symbols = [el("compareATicker").value, el("compareBTicker").value].map((value) => String(value || "").trim().toUpperCase()).filter(Boolean);
  if (symbols.length < 2) return;
  const [histA, histB] = await Promise.all(symbols.map((symbol) => fetchHistoricalData(symbol, range)));
  appState.compareHistorical = { symbols, range, series: [histA, histB] };

  const datasets = [histA, histB].map((series, index) => {
    const first = series.points[0]?.close || 1;
    return {
      label: `${series.symbol} historical`,
      data: series.points.map((point) => ({
        x: point.date,
        y: first ? (point.close / first) * 100 : point.close,
      })),
      borderColor: index === 0 ? "#4f8cff" : "#f4b74e",
      backgroundColor: index === 0 ? "rgba(79, 140, 255, 0.18)" : "rgba(244, 183, 78, 0.18)",
      pointRadius: 0,
      pointHitRadius: 18,
      fill: false,
    };
  });

  createLineChart("compareHistorical", "compareHistoricalChart", {
    datasets,
    readoutId: "compareHistoricalReadout",
    xFormatter: (value) => formatDate(value),
    xTime: true,
    mode: "measure",
  });
  setChartReadout(
    "compareHistoricalReadout",
    `${symbols.join(" vs ")} ${range.toUpperCase()} history loaded. Click or drag to inspect exact points.`,
  );
}

function runReverse() {
  const price = Number(el("revPrice").value) || 0;
  const eps = Number(el("revEps").value) || 0;
  const pe = Number(el("revPe").value) || 0;
  const years = Math.max(1, Number(el("revYears").value) || 5);

  if (price <= 0 || eps <= 0 || pe <= 0) {
    el("reverseAnswer").innerHTML = `<strong>Need positive inputs.</strong><p>Price, EPS, and exit P/E all need values above zero.</p>`;
    return;
  }

  const targetEps = price / pe;
  const impliedGrowth = Math.pow(targetEps / eps, 1 / years) - 1;
  el("reverseAnswer").innerHTML = `
    <strong>${formatPercent(impliedGrowth)} implied annual EPS growth</strong>
    <p>If the market price is ${formatDollarValue(price)} and you expect a ${oneDecimal.format(pe)}x exit multiple in ${years} years, EPS must grow from ${formatDollarValue(eps)} to about ${formatDollarValue(targetEps)}.</p>
  `;
}

function runMos() {
  const fairValue = Number(el("fairValue").value) || 0;
  const price = Number(el("mosPrice").value) || 0;
  const requiredPct = (Number(el("mosPercent").value) || 0) / 100;
  if (fairValue <= 0) {
    el("mosAnswer").innerHTML = `<strong>Need a fair value.</strong><p>Enter your best fair value estimate first.</p>`;
    return;
  }

  const currentMargin = price > 0 ? 1 - price / fairValue : 0;
  const targetBuy = fairValue * (1 - requiredPct);
  el("mosAnswer").innerHTML = `
    <strong>${formatPercent(currentMargin)} current margin of safety</strong>
    <p>At ${formatDollarValue(price)}, you are ${(currentMargin >= 0 ? "buying below" : "paying above")} your ${formatDollarValue(fairValue)} fair value estimate. A ${formatPercent(requiredPct)} target margin would imply a buy price near ${formatDollarValue(targetBuy)}.</p>
  `;
}

function calculateSp500Path() {
  const start = Number(el("spStart").value) || 0;
  const monthly = Number(el("spMonthly").value) || 0;
  const annualRate = (Number(el("spRate").value) || 0) / 100;
  const years = Math.max(1, Math.min(50, Number(el("spYears").value) || 10));
  const monthlyRate = annualRate / 12;

  let value = start;
  let totalContributions = start;
  const rows = [{ year: 0, startValue: start, contributions: 0, growth: 0, endingValue: start }];

  for (let year = 1; year <= years; year += 1) {
    const startValue = value;
    let contributions = 0;
    for (let month = 0; month < 12; month += 1) {
      value += monthly;
      contributions += monthly;
      value *= 1 + monthlyRate;
    }
    totalContributions += contributions;
    rows.push({
      year,
      startValue,
      contributions,
      growth: value - startValue - contributions,
      endingValue: value,
    });
  }

  return {
    rows,
    totalContributions,
    endingValue: value,
    totalGrowth: value - totalContributions,
  };
}

function renderSp500() {
  const model = calculateSp500Path();
  el("sp500Cards").innerHTML = [
    ["Ending value", formatDollarValue(model.endingValue)],
    ["Total contributed", formatDollarValue(model.totalContributions)],
    ["Total growth", formatDollarValue(model.totalGrowth)],
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

  el("sp500Table").innerHTML = model.rows
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
        label: "S&P 500 path",
        data: model.rows.map((row) => ({ x: row.year, y: row.endingValue })),
        borderColor: "#3ecf8e",
        backgroundColor: "rgba(62, 207, 142, 0.18)",
        pointRadius: 0,
        pointHitRadius: 18,
        fill: false,
      },
    ],
    readoutId: "sp500Readout",
    xFormatter: (value) => `Year ${value}`,
    xTime: false,
    mode: "measure",
  });
  setChartReadout("sp500Readout", "S&P chart details will appear here.");
}

function renderWatchlist() {
  const grid = el("watchlistGrid");
  if (!appState.watchlist.length) {
    grid.innerHTML = `<div class="empty-state">No saved projections yet. Save one from the Projection tab and it will show up here immediately.</div>`;
    return;
  }

  grid.innerHTML = appState.watchlist
    .map(
      (item, index) => `
        <article class="watch-card">
          <span>${item.ticker}</span>
          <h3>${formatDollarValue(item.targets.base)}</h3>
          <p>Saved ${formatDate(item.savedAt)}</p>
          <dl>
            <div><dt>Current price</dt><dd>${formatDollarValue(item.currentPrice)}</dd></div>
            <div><dt>Bear target</dt><dd>${formatDollarValue(item.targets.bear)}</dd></div>
            <div><dt>Base CAGR</dt><dd>${formatPercent(item.baseCagr)}</dd></div>
            <div><dt>Bull target</dt><dd>${formatDollarValue(item.targets.bull)}</dd></div>
          </dl>
          <label class="watch-note-field">
            <span>Note</span>
            <textarea data-watch-note="${index}" placeholder="Quick thesis, trigger, or checklist">${escapeHtml(item.notes || "")}</textarea>
          </label>
          <div class="watch-actions">
            <button class="tiny-button" type="button" data-watch-action="load" data-watch-index="${index}">Load into projection</button>
            <button class="tiny-button danger" type="button" data-watch-action="delete" data-watch-index="${index}">Delete</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function normalizePortfolioHolding(holding) {
  return {
    ...holding,
    symbol: String(holding.symbol || "").trim().toUpperCase(),
    asset: holding.asset || holding.symbol || "Holding",
    sector: holding.sector || "Unassigned",
    account: holding.account || "Primary",
    quantity: Number(holding.quantity) || 0,
    averageCost: Number(holding.averageCost) || 0,
    initialValue: Number(holding.initialValue) || 0,
    currentPrice: Number(holding.currentPrice) || 0,
    currentValue: Number(holding.currentValue) || 0,
    dayChange: Number(holding.dayChange) || 0,
    dayPercentChange: Number(holding.dayPercentChange) || 0,
    unrealizedProfit: Number(holding.unrealizedProfit) || 0,
    realizedProfit: Number(holding.realizedProfit) || 0,
    allocation: Number(holding.allocation) || 0,
  };
}

function formatTradeForWorkbook(trade) {
  return {
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
  };
}

function calculatePortfolioProjectionFromQuotes(holdings, quoteMap) {
  const validHoldings = holdings.filter((holding) => quoteMap.has(holding.symbol));
  if (!validHoldings.length) {
    return null;
  }

  const cases = scenarioConfig.map((scenario) => {
    const holdingsBreakdown = validHoldings.map((holding) => {
      const quote = quoteMap.get(holding.symbol) || {};
      const baseGrowthPct = Number(quote.estimatedGrowth) || 10;
      const currentPrice = Number(quote.price) || Number(holding.currentPrice) || 0;
      const eps = Number(quote.eps) || (Number(holding.averageCost) > 0 ? Number(holding.averageCost) / 20 : 1);
      const terminalPe = Number(quote.peTtm) || 20;
      const model = compareProjectionSeries(
        holding.symbol,
        currentPrice,
        eps,
        Math.max(1, baseGrowthPct + (scenario.key === "bear" ? -4 : scenario.key === "bull" ? 4 : 0)),
        Math.max(8, terminalPe + (scenario.key === "bear" ? -4 : scenario.key === "bull" ? 4 : 0)),
        Math.max(1, Number(el("years")?.value) || 5),
      );
      const currentValue = Number(holding.currentValue) || (Number(holding.quantity) || 0) * currentPrice;
      const projectedValue = (Number(holding.quantity) || 0) * model.terminalPrice;
      return {
        symbol: holding.symbol,
        asset: holding.asset,
        sector: holding.sector,
        quantity: Number(holding.quantity) || 0,
        currentValue,
        projectedValue,
        impliedGain: projectedValue - currentValue,
        cagr: model.cagr,
      };
    });

    const currentValue = holdingsBreakdown.reduce((sum, holding) => sum + holding.currentValue, 0);
    const projectedValue = holdingsBreakdown.reduce((sum, holding) => sum + holding.projectedValue, 0);
    const years = Math.max(1, Number(el("years")?.value) || 5);
    const cagr = currentValue > 0 && projectedValue > 0 ? Math.pow(projectedValue / currentValue, 1 / years) - 1 : 0;

    return {
      key: scenario.key,
      label: scenario.label,
      color: scenario.color,
      currentValue,
      projectedValue,
      dollarGain: projectedValue - currentValue,
      cagr,
      holdings: holdingsBreakdown,
    };
  });

  const base = cases.find((item) => item.key === "base") || cases[1] || cases[0];
  const spotlight = [...base.holdings]
    .sort((a, b) => (b.projectedValue || 0) - (a.projectedValue || 0))
    .slice(0, 5);

  return {
    asOf: new Date().toISOString(),
    cases,
    spotlight,
  };
}

async function refreshPortfolioQuotes() {
  const holdings = Array.isArray(appState.portfolio.holdings) ? appState.portfolio.holdings : [];
  if (!holdings.length) {
    setInlineStatus("portfolioStatus", "Load or import your portfolio first.", "negative");
    return;
  }

  setInlineStatus("portfolioStatus", "Refreshing quotes...", "neutral");
  const symbols = [...new Set(holdings.map((holding) => holding.symbol).filter(Boolean))];
  const results = await Promise.allSettled(symbols.map((symbol) => fetchStockData(symbol)));
  const quoteMap = new Map();
  let successCount = 0;
  let failureCount = 0;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      quoteMap.set(symbols[index], result.value);
      successCount += 1;
    } else {
      failureCount += 1;
    }
  });

  const holdingsBase = appState.portfolio.trades.length
    ? deriveHoldingsFromTrades(appState.portfolio.trades, false)
    : holdings.map(normalizePortfolioHolding);

  appState.portfolio.holdings = holdingsBase.map((holding) => {
    const quote = quoteMap.get(holding.symbol);
    if (!quote) {
      return normalizePortfolioHolding(holding);
    }
    const currentPrice = Number(quote.price) || Number(holding.currentPrice) || 0;
    const quantity = Number(holding.quantity) || 0;
    const currentValue = currentPrice * quantity;
    const initialValue = Number(holding.initialValue) || Number(holding.averageCost || 0) * quantity;
    const previousClose = Number(quote.previousClose) || currentPrice;
    const dayPercentChange = previousClose ? ((currentPrice - previousClose) / previousClose) * 100 : 0;
    const dayChange = (currentPrice - previousClose) * quantity;
    return {
      ...normalizePortfolioHolding(holding),
      asset: quote.name || holding.asset,
      sector: quote.sector || holding.sector,
      currentPrice,
      currentValue,
      initialValue,
      dayChange,
      dayPercentChange,
      unrealizedProfit: currentValue - initialValue,
    };
  });

  appState.portfolioProjection = null;
  renderPortfolio();
  queuePortfolioDriveSync();
  setInlineStatus("portfolioStatus", appState.driveAuth.connected ? "Portfolio quotes refreshed and queued for Drive sync." : "Portfolio quotes refreshed.", failureCount ? "neutral" : "positive");
}

function portfolioTotals(holdings) {
  return holdings.reduce(
    (totals, holding) => {
      totals.currentValue += Number(holding.currentValue) || 0;
      totals.initialValue += Number(holding.initialValue) || 0;
      totals.dayChange += Number(holding.dayChange) || 0;
      totals.unrealizedProfit += Number(holding.unrealizedProfit) || 0;
      totals.realizedProfit += Number(holding.realizedProfit) || 0;
      return totals;
    },
    { currentValue: 0, initialValue: 0, dayChange: 0, unrealizedProfit: 0, realizedProfit: 0 },
  );
}

function getPortfolioDisplayHoldings() {
  const localHoldings = Array.isArray(appState.portfolio.holdings) ? appState.portfolio.holdings : [];
  if (localHoldings.length) {
    return localHoldings.map(normalizePortfolioHolding);
  }
  if (appState.portfolio.trades.length) {
    return deriveHoldingsFromTrades(appState.portfolio.trades, false);
  }
  return [];
}

function renderPortfolioHero(holdings) {
  const container = el("portfolioHero");
  if (!container) return;
  if (!holdings.length) {
    container.innerHTML = `<article class="hero-card"><span>Portfolio</span><strong>Ready for holdings</strong><p>Import a workbook, sync from Drive, or add trades manually to light up the dashboard.</p></article>`;
    return;
  }
  const totals = portfolioTotals(holdings);
  const bestHolding = [...holdings].sort((a, b) => (b.unrealizedProfit || 0) - (a.unrealizedProfit || 0))[0];
  const biggestHolding = [...holdings].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0))[0];
  container.innerHTML = `
    <article class="hero-card">
      <span>Total portfolio value</span>
      <strong>${formatDollarValue(totals.currentValue)}</strong>
      <p>${holdings.length} holdings across ${new Set(holdings.map((holding) => holding.account)).size} account${new Set(holdings.map((holding) => holding.account)).size === 1 ? "" : "s"}. Biggest line item: ${biggestHolding ? biggestHolding.symbol : "N/A"}.</p>
    </article>
    <article class="hero-card">
      <span>Unrealized profit</span>
      <strong>${formatDollarValue(totals.unrealizedProfit)}</strong>
      <p>That is ${formatPercent(totals.initialValue ? totals.unrealizedProfit / totals.initialValue : 0)} versus the estimated cost basis currently in the dashboard.</p>
    </article>
    <article class="hero-card">
      <span>Best contributor</span>
      <strong>${bestHolding ? bestHolding.symbol : "N/A"}</strong>
      <p>${bestHolding ? `${formatDollarValue(bestHolding.unrealizedProfit || 0)} unrealized on ${formatDollarValue(bestHolding.currentValue || 0)} of current value.` : "Load quotes to surface the strongest position."}</p>
    </article>
    <article class="hero-card">
      <span>Day change</span>
      <strong>${formatDollarValue(totals.dayChange)}</strong>
      <p>${formatPercent(totals.currentValue ? totals.dayChange / Math.max(totals.currentValue - totals.dayChange, 1) : 0)} move based on the quotes currently loaded into the app.</p>
    </article>
  `;
}

function renderPortfolioCards(holdings) {
  const totals = portfolioTotals(holdings);
  el("portfolioCards").innerHTML = [
    ["Portfolio value", formatDollarValue(totals.currentValue)],
    ["Day change", formatDollarValue(totals.dayChange)],
    ["Unrealized profit", formatDollarValue(totals.unrealizedProfit)],
    ["Realized profit", formatDollarValue(totals.realizedProfit)],
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

function renderPortfolioSpotlight(holdings) {
  const container = el("portfolioSpotlight");
  if (!container) return;
  if (!holdings.length) {
    container.innerHTML = `<div class="portfolio-empty-card">No holdings yet. Once your portfolio loads, this section will call out concentration, best performers, and account exposure.</div>`;
    return;
  }

  const totals = portfolioTotals(holdings);
  const biggest = [...holdings].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0))[0];
  const best = [...holdings].sort((a, b) => (b.unrealizedProfit || 0) - (a.unrealizedProfit || 0))[0];
  const worst = [...holdings].sort((a, b) => (a.unrealizedProfit || 0) - (b.unrealizedProfit || 0))[0];
  const accountBreakdown = holdings.reduce((map, holding) => {
    map.set(holding.account || "Primary", (map.get(holding.account || "Primary") || 0) + (holding.currentValue || 0));
    return map;
  }, new Map());
  const topAccount = [...accountBreakdown.entries()].sort((a, b) => b[1] - a[1])[0];

  const items = [
    [
      "Largest position",
      biggest ? biggest.symbol : "N/A",
      biggest ? `${formatPercent(totals.currentValue ? (biggest.currentValue || 0) / totals.currentValue : 0)} of the portfolio at ${formatDollarValue(biggest.currentValue || 0)}` : "No positions loaded",
    ],
    [
      "Best unrealized",
      best ? best.symbol : "N/A",
      best ? `${formatDollarValue(best.unrealizedProfit || 0)} on ${formatDollarValue(best.currentValue || 0)} of current value` : "No positions loaded",
    ],
    [
      "Weakest unrealized",
      worst ? worst.symbol : "N/A",
      worst ? `${formatDollarValue(worst.unrealizedProfit || 0)} on ${formatDollarValue(worst.currentValue || 0)} of current value` : "No positions loaded",
    ],
    [
      "Top account",
      topAccount ? topAccount[0] : "N/A",
      topAccount ? `${formatDollarValue(topAccount[1])} currently allocated there` : "No accounts loaded",
    ],
  ];

  container.innerHTML = items
    .map(
      ([label, title, copy]) => `
        <article class="spotlight-card">
          <span>${label}</span>
          <strong>${title}</strong>
          <p>${copy}</p>
        </article>
      `,
    )
    .join("");
}

function buildPortfolioProjectionScenarioCards(cases) {
  return cases
    .map((scenario) => {
      const biggestProjected = [...scenario.holdings].sort((a, b) => (b.projectedValue || 0) - (a.projectedValue || 0))[0];
      return `
        <article class="scenario-card" data-case="${scenario.key}">
          <span>${scenario.label} case</span>
          <strong>${formatDollarValue(scenario.projectedValue)}</strong>
          <p>${formatPercent(scenario.cagr)} annualized with ${formatDollarValue(scenario.dollarGain)} of projected value creation. ${biggestProjected ? `${biggestProjected.symbol} leads this case at ${formatDollarValue(biggestProjected.projectedValue)}.` : ""}</p>
        </article>
      `;
    })
    .join("");
}

function renderPortfolioProjection(result = appState.portfolioProjection) {
  const cards = el("portfolioProjectionCards");
  const scenarios = el("portfolioProjectionScenarios");
  const status = el("portfolioProjectionStatus");
  if (!cards || !scenarios || !status) return;

  if (!result) {
    cards.innerHTML = "";
    scenarios.innerHTML = `<div class="portfolio-empty-card">Run the portfolio projection after your holdings load to see aggregate bear, base, and bull outcomes for the whole portfolio.</div>`;
    status.textContent = "";
    return;
  }

  cards.innerHTML = result.cases
    .map(
      (scenario) => `
        <article class="metric-card">
          <span>${scenario.label} outlook</span>
          <strong>${formatDollarValue(scenario.projectedValue)}</strong>
          <p>${formatPercent(scenario.cagr)} annualized from ${formatDollarValue(scenario.currentValue)} today.</p>
        </article>
      `,
    )
    .join("");

  scenarios.innerHTML = buildPortfolioProjectionScenarioCards(result.cases);
  status.textContent = `Projection updated ${formatDate(result.asOf)} using the currently loaded holdings and quote assumptions.`;
}

async function runPortfolioProjection() {
  const holdings = getPortfolioDisplayHoldings();
  if (!holdings.length) {
    setInlineStatus("portfolioProjectionStatus", "Load your portfolio first so the projection has holdings to analyze.", "negative");
    return;
  }

  setInlineStatus("portfolioProjectionStatus", "Running projections across the full portfolio...", "neutral");
  const symbols = [...new Set(holdings.map((holding) => holding.symbol).filter(Boolean))];
  const results = await Promise.allSettled(symbols.map((symbol) => fetchStockData(symbol)));
  const quoteMap = new Map();
  let successCount = 0;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      quoteMap.set(symbols[index], result.value);
      successCount += 1;
    }
  });

  if (!successCount) {
    setInlineStatus("portfolioProjectionStatus", "Could not load any live quote data for the projection run.", "negative");
    return;
  }

  appState.portfolio.holdings = holdings.map((holding) => {
    const quote = quoteMap.get(holding.symbol);
    if (!quote) return normalizePortfolioHolding(holding);
    const currentPrice = Number(quote.price) || Number(holding.currentPrice) || 0;
    const quantity = Number(holding.quantity) || 0;
    const currentValue = currentPrice * quantity;
    const initialValue = Number(holding.initialValue) || Number(holding.averageCost || 0) * quantity;
    return {
      ...normalizePortfolioHolding(holding),
      asset: quote.name || holding.asset,
      sector: quote.sector || holding.sector,
      currentPrice,
      currentValue,
      initialValue,
      unrealizedProfit: currentValue - initialValue,
    };
  });

  const totals = portfolioTotals(appState.portfolio.holdings);
  appState.portfolio.holdings = appState.portfolio.holdings.map((holding) => ({
    ...holding,
    allocation: totals.currentValue > 0 ? ((holding.currentValue || 0) / totals.currentValue) * 100 : 0,
  }));

  appState.portfolioProjection = calculatePortfolioProjectionFromQuotes(appState.portfolio.holdings, quoteMap);
  persistPortfolioState();
  renderPortfolio();
  renderPortfolioProjection();
  setInlineStatus("portfolioProjectionStatus", `Projection ran across ${successCount} live quote ${successCount === 1 ? "ticker" : "tickers"}.`, "positive");
}

function renderPortfolioTrades() {
  const tbody = el("portfolioTradesTable");
  if (!appState.portfolio.trades.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No trades loaded yet.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = appState.portfolio.trades
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
  const tbody = el("portfolioHoldingsTable");
  const holdings = appState.portfolio.holdings || [];
  if (!holdings.length) {
    tbody.innerHTML = `<tr><td colspan="13"><div class="empty-state">No holdings loaded yet.</div></td></tr>`;
    return;
  }

  const totals = portfolioTotals(holdings);
  tbody.innerHTML = holdings
    .map(
      (holding) => `
        <tr>
          <td>${holding.account}</td>
          <td>${holding.sector}</td>
          <td>${holding.asset}</td>
          <td>${formatDollarValue(holding.currentPrice)}</td>
          <td>${formatDollarValue(holding.averageCost)}</td>
          <td>${wholeNumber.format(holding.quantity)}</td>
          <td>${formatDollarValue(holding.initialValue)}</td>
          <td>${formatDollarValue(holding.currentValue)}</td>
          <td class="${classForValue(holding.dayChange)}">${formatDollarValue(holding.dayChange)}</td>
          <td class="${classForValue(holding.dayPercentChange)}">${formatPercent((holding.dayPercentChange || 0) / 100)}</td>
          <td class="${classForValue(holding.unrealizedProfit)}">${formatDollarValue(holding.unrealizedProfit)}</td>
          <td class="${classForValue(holding.realizedProfit)}">${formatDollarValue(holding.realizedProfit)}</td>
          <td>${formatPercent(totals.currentValue ? holding.currentValue / totals.currentValue : 0)}</td>
        </tr>
      `,
    )
    .join("");
}

function createPieChart(chartKey, canvasId, labels, values, palette) {
  destroyChart(chartKey);
  const canvas = el(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
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
  const holdings = getPortfolioDisplayHoldings();
  appState.portfolio.holdings = holdings;
  renderPortfolioHero(holdings);
  renderPortfolioCards(holdings);
  renderPortfolioSpotlight(holdings);
  renderPortfolioTrades();
  renderPortfolioHoldings();
  renderPortfolioCharts(holdings);
  renderPortfolioProjection();
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
    appState.portfolioProjection = null;
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
  appState.portfolioProjection = null;
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
    id: row.id || row.Id || `import_${Date.now()}_${index}`,
    date: normalizeImportDate(row.date || row.Date),
    symbol: String(row.symbol || row.Symbol || "").trim().toUpperCase(),
    asset: String(row.asset || row.Asset || "").trim(),
    sector: String(row.sector || row.Sector || "Unassigned").trim(),
    side: String(row.side || row.Side || "buy").trim().toLowerCase() === "sell" ? "sell" : "buy",
    quantity: Number(row.quantity ?? row.Quantity) || 0,
    tradePrice: Number(row.tradePrice ?? row["Trade Price"]) || 0,
    fees: Number(row.fees ?? row.Fees) || 0,
    account: String(row.account || row.Account || "Primary").trim(),
    notes: String(row.notes || row.Notes || "").trim(),
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

function setMobileNavOpen(open) {
  const menuToggle = el("menuToggle");
  const mobileNav = el("mobileNav");
  const mobileNavBackdrop = el("mobileNavBackdrop");
  if (!menuToggle || !mobileNav || !mobileNavBackdrop) return;
  menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
  mobileNav.hidden = !open;
  mobileNavBackdrop.hidden = !open;
}

function activateTab(tabId) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabId));
  document.querySelectorAll(".mobile-nav-link").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabId));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
  setMobileNavOpen(false);
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

function bindTabEvents() {
  const handleTabClick = (button) => activateTab(button.dataset.tab);
  document.querySelectorAll(".tab, .mobile-nav-link").forEach((button) => {
    button.addEventListener("click", () => handleTabClick(button));
  });

  el("menuToggle")?.addEventListener("click", () => {
    const shouldOpen = el("menuToggle").getAttribute("aria-expanded") !== "true";
    setMobileNavOpen(shouldOpen);
  });

  el("mobileNavBackdrop")?.addEventListener("click", () => setMobileNavOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMobileNavOpen(false);
    }
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
  if (!el("tradeForm")) return;
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
  el("runPortfolioProjection").addEventListener("click", () => {
    runPortfolioProjection().catch((error) => setInlineStatus("portfolioProjectionStatus", error.message, "negative"));
  });

  el("portfolioFileInput").addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      const imported = await importPortfolioWorkbook(file);
      appState.portfolio.trades = imported.trades;
      appState.portfolio.holdings = imported.trades.length
        ? deriveHoldingsFromTrades(imported.trades, false)
        : imported.holdings.map(normalizePortfolioHolding);
      appState.portfolioProjection = null;
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

function runProjection() {
  const result = calculateProjection(readProjectionInputs());
  renderProjection(result);
  return result;
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
  if (el("portfolio")) {
    if (!appState.portfolio.holdings.length) {
      appState.portfolio.holdings = appState.portfolio.trades.length
        ? deriveHoldingsFromTrades(appState.portfolio.trades, false)
        : (appState.portfolio.holdings || []).map(normalizePortfolioHolding);
    }
    renderPortfolio();
    if (appState.driveAuth.connected && !appState.portfolio.trades.length && !appState.portfolio.holdings.length) {
      try {
        await loadPortfolioFromDrive();
      } catch {
        renderPortfolioSyncState();
      }
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
