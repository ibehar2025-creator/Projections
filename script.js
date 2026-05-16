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

function findNearestDataPoint(chart, event) {
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
      measureStart: { xValue: nearest.point.x, yValue: nearest.point.y },
      measureEnd: { xValue: nearest.point.x, yValue: nearest.point.y },
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
    const current = findNearestDataPoint(chart, event);
    if (!current) return;
    const start = chart.$interaction.measureStart;
    const delta = current.point.y - start.yValue;
    const percentChange = start.yValue !== 0 ? delta / start.yValue : 0;
    chart.$interaction.measureEnd = { xValue: current.point.x, yValue: current.point.y };
    chart.$interaction.measureDatasetIndex = current.datasetIndex;
    chart.$interaction.measureLabel = `${xFormatter(start.xValue)} to ${xFormatter(current.point.x)} | ${formatDollarValue(delta)} (${formatPercent(percentChange)})`;
    setChartReadout(readoutId, chart.$interaction.measureLabel);
    chart.update("none");
  };

  const mouseUp = (event) => {
    const nearest = findNearestDataPoint(chart, event);
    if (nearest) {
      setChartReadout(readoutId, `${nearest.dataset.label}: ${xFormatter(nearest.point.x)} | ${formatDollarValue(nearest.point.y)}`);
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
  const ctx = el(canvasId).getContext("2d");
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
  return chart;
}

function updateChartMode(chartKey, mode) {
  const bundle = appState.charts[chartKey];
  if (!bundle?.chart) return;
  bundle.mode = mode;
  if (bundle.chart.canvas) {
    bundle.chart.canvas.style.cursor = mode === "pan" ? "grab" : "crosshair";
  }
  bundle.chart.options.plugins.zoom.pan.enabled = mode === "pan";
  bundle.chart.options.plugins.zoom.zoom.wheel.enabled = mode === "pan";
  bundle.chart.options.plugins.zoom.zoom.pinch.enabled = mode === "pan";
  if (mode !== "measure") {
    bundle.chart.$interaction = null;
  }
  bundle.chart.update("none");
}

function resetChartView(chartKey) {
  const bundle = appState.charts[chartKey];
  if (!bundle?.chart) return;
  if (typeof bundle.chart.resetZoom === "function") {
    bundle.chart.resetZoom();
  }
  bundle.chart.$interaction = null;
  bundle.chart.update("none");
}

function xFormatterFactory(xTime) {
  return xTime
    ? (value) => formatDate(value)
    : (value) => `Year ${value}`;
}

function drawProjectionForwardChart(result) {
  const datasets = result.cases.map((scenario) => ({
    label: `${scenario.label} case`,
    data: scenario.yearly.map((point) => ({ x: point.year, y: point.price })),
    borderColor: scenario.color,
    backgroundColor: scenario.color,
    borderWidth: 2,
    pointRadius: 0,
    pointHitRadius: 18,
  }));

  createLineChart("projectionForward", "projectionForwardChart", {
    datasets,
    readoutId: "projectionForwardReadout",
    xFormatter: xFormatterFactory(false),
    xTime: false,
  });
  setChartReadout("projectionForwardReadout", "Click a year or drag across the path to inspect the scenarios.");
}

function normalizeHistoryPoints(points) {
  return (points || []).map((point) => ({
    x: point.date,
    y: point.close,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
    volume: point.volume,
  }));
}

function historyReadout(symbol, history) {
  return `${symbol} ${history.rangeLabel || history.range.toUpperCase()} history loaded. Click or drag to inspect exact points.`;
}

function drawProjectionHistoricalChart(history) {
  const symbol = history.symbol || el("ticker").value.trim().toUpperCase();
  appState.projectionHistory = history;

  createLineChart("projectionHistorical", "projectionForwardChart", {
    datasets: [
      {
        label: `${symbol} price`,
        data: normalizeHistoryPoints(history.points),
        borderColor: "#4f8cff",
        backgroundColor: "#4f8cff",
        borderWidth: 2,
      },
    ],
    readoutId: "projectionForwardReadout",
    xFormatter: xFormatterFactory(true),
    xTime: true,
  });
  setChartReadout("projectionForwardReadout", historyReadout(symbol, history));
}

function drawProjectionUnifiedChart(result, history) {
  const historyPoints = normalizeHistoryPoints(history.points);
  const lastHistoricalPoint = historyPoints[historyPoints.length - 1] || null;
  const baseTime = lastHistoricalPoint?.x || Date.now();
  const stepMs = 365 * 24 * 60 * 60 * 1000;

  const datasets = [
    {
      label: `${result.input.ticker} historical`,
      data: historyPoints,
      borderColor: "#4f8cff",
      backgroundColor: "#4f8cff",
      borderWidth: 2.4,
      pointRadius: 0,
      pointHitRadius: 18,
    },
    ...result.cases.map((scenario) => ({
      label: `${scenario.label} case`,
      data: scenario.yearly.map((point, index) => ({
        x: baseTime + index * stepMs,
        y: point.price,
        year: point.year,
      })),
      borderColor: scenario.color,
      backgroundColor: scenario.color,
      borderWidth: 2,
      borderDash: scenario.key === "base" ? [] : [7, 6],
      pointRadius: 0,
      pointHitRadius: 18,
    })),
  ];

  createLineChart("projectionForward", "projectionForwardChart", {
    datasets,
    readoutId: "projectionForwardReadout",
    xFormatter: xFormatterFactory(true),
    xTime: true,
  });
  setChartReadout(
    "projectionForwardReadout",
    `${result.input.ticker} price path loaded. Historical pricing rolls straight into your bull, base, and bear scenarios.`,
  );
}

async function loadProjectionHistoricalChart(symbol, range) {
  const history = await fetchHistoricalData(symbol, range);
  appState.projectionHistory = history;
  if (appState.lastProjection && appState.lastProjection.input.ticker === String(symbol || "").trim().toUpperCase()) {
    drawProjectionUnifiedChart(appState.lastProjection, history);
  } else {
    drawProjectionHistoricalChart(history);
  }
}

function readCompareInputs() {
  return {
    years: Math.max(1, Math.min(15, Number(el("compareYears").value) || 5)),
    A: {
      ticker: el("compareATicker").value.trim().toUpperCase() || "A",
      price: Number(el("compareAPrice").value) || 0,
      eps: Number(el("compareAEps").value) || 0,
      growth: (Number(el("compareAGrowth").value) || 0) / 100,
      pe: Number(el("compareAPe").value) || 0,
    },
    B: {
      ticker: el("compareBTicker").value.trim().toUpperCase() || "B",
      price: Number(el("compareBPrice").value) || 0,
      eps: Number(el("compareBEps").value) || 0,
      growth: (Number(el("compareBGrowth").value) || 0) / 100,
      pe: Number(el("compareBPe").value) || 0,
    },
  };
}

function compareProjectionLine(stock, years) {
  return Array.from({ length: years + 1 }, (_, year) => {
    const eps = stock.eps * Math.pow(1 + stock.growth, year);
    const price = eps * stock.pe;
    return { x: year, y: price, price, eps };
  });
}

function runCompare() {
  const input = readCompareInputs();
  const lineA = compareProjectionLine(input.A, input.years);
  const lineB = compareProjectionLine(input.B, input.years);
  const terminalA = lineA[lineA.length - 1];
  const terminalB = lineB[lineB.length - 1];
  const cagrA = input.A.price > 0 ? Math.pow(terminalA.price / input.A.price, 1 / input.years) - 1 : 0;
  const cagrB = input.B.price > 0 ? Math.pow(terminalB.price / input.B.price, 1 / input.years) - 1 : 0;

  el("compareCards").innerHTML = [
    {
      label: input.A.ticker,
      terminal: terminalA.price,
      cagr: cagrA,
      multiple: input.A.price > 0 ? terminalA.price / input.A.price : 0,
    },
    {
      label: input.B.ticker,
      terminal: terminalB.price,
      cagr: cagrB,
      multiple: input.B.price > 0 ? terminalB.price / input.B.price : 0,
    },
  ]
    .map(
      (item) => `
        <article class="metric-card">
          <span>${item.label}</span>
          <strong>${formatDollarValue(item.terminal)}</strong>
          <p>${formatPercent(item.cagr)} annualized | ${item.multiple.toFixed(2)}x outcome</p>
        </article>
      `,
    )
    .join("");

  createLineChart("compareForward", "compareForwardChart", {
    datasets: [
      {
        label: input.A.ticker,
        data: lineA,
        borderColor: "#4f8cff",
        backgroundColor: "#4f8cff",
        borderWidth: 2,
      },
      {
        label: input.B.ticker,
        data: lineB,
        borderColor: "#3ecf8e",
        backgroundColor: "#3ecf8e",
        borderWidth: 2,
      },
    ],
    readoutId: "compareForwardReadout",
    xFormatter: xFormatterFactory(false),
    xTime: false,
  });
  setChartReadout("compareForwardReadout", "Forward comparison details will appear here.");
}

function normalizeCompareHistory(points) {
  if (!points.length) return [];
  const base = points[0].close || points[0].y || 1;
  return points.map((point) => ({ x: point.date || point.x, y: ((point.close || point.y) / base) * 100 }));
}

async function loadCompareHistoricalChart(range) {
  const tickerA = el("compareATicker").value.trim().toUpperCase();
  const tickerB = el("compareBTicker").value.trim().toUpperCase();
  const [historyA, historyB] = await Promise.all([fetchHistoricalData(tickerA, range), fetchHistoricalData(tickerB, range)]);
  appState.compareHistorical = { historyA, historyB };

  createLineChart("compareHistorical", "compareHistoricalChart", {
    datasets: [
      {
        label: `${tickerA} normalized`,
        data: normalizeCompareHistory(historyA.points),
        borderColor: "#4f8cff",
        backgroundColor: "#4f8cff",
        borderWidth: 2,
      },
      {
        label: `${tickerB} normalized`,
        data: normalizeCompareHistory(historyB.points),
        borderColor: "#3ecf8e",
        backgroundColor: "#3ecf8e",
        borderWidth: 2,
      },
    ],
    readoutId: "compareHistoricalReadout",
    xFormatter: xFormatterFactory(true),
    xTime: true,
  });
  setChartReadout("compareHistoricalReadout", `${tickerA} and ${tickerB} ${historyA.rangeLabel || range.toUpperCase()} history loaded.`);
}

function runReverse() {
  const price = Number(el("revPrice").value) || 0;
  const eps = Number(el("revEps").value) || 0;
  const exitPe = Number(el("revPe").value) || 0;
  const years = Math.max(1, Number(el("revYears").value) || 1);
  if (price <= 0 || eps <= 0 || exitPe <= 0) {
    el("reverseAnswer").textContent = "Enter positive values to calculate the implied growth rate.";
    return;
  }

  const targetEps = price / exitPe;
  const impliedGrowth = Math.pow(targetEps / eps, 1 / years) - 1;
  el("reverseAnswer").innerHTML = `
    <strong>${formatPercent(impliedGrowth)}</strong>
    <p>The current price implies EPS must grow from ${formatDollarValue(eps)} to ${formatDollarValue(targetEps)} over ${years} years if the stock exits at ${oneDecimal.format(exitPe)}x earnings.</p>
  `;
}

function runMos() {
  const fairValue = Number(el("fairValue").value) || 0;
  const currentPrice = Number(el("mosPrice").value) || 0;
  const requiredSafety = (Number(el("mosPercent").value) || 0) / 100;
  if (fairValue <= 0 || currentPrice <= 0) {
    el("mosAnswer").textContent = "Enter positive fair value and current price values.";
    return;
  }

  const discount = 1 - currentPrice / fairValue;
  const buyBelow = fairValue * (1 - requiredSafety);
  el("mosAnswer").innerHTML = `
    <strong>${formatPercent(discount)}</strong>
    <p>The stock trades ${discount >= 0 ? "below" : "above"} your fair value estimate. A ${formatPercent(requiredSafety)} margin of safety would put your preferred entry near ${formatDollarValue(buyBelow)}.</p>
  `;
}

function saveProjection() {
  const projection = appState.lastProjection || calculateProjection(readProjectionInputs());
  const base = projection.cases.find((item) => item.key === "base");
  const entry = {
    ticker: projection.input.ticker,
    savedAt: new Date().toISOString(),
    currentPrice: projection.input.currentPrice,
    baseCagr: base?.cagr || 0,
    outcomes: Object.fromEntries(projection.cases.map((item) => [item.key, item.terminal.price])),
    inputs: readProjectionInputs(),
  };

  appState.watchlist = [entry, ...appState.watchlist.filter((item) => item.ticker !== entry.ticker)].slice(0, 24);
  persistWatchlist();
  renderWatchlist();
  setInlineStatus("projectionSaveStatus", `${entry.ticker} saved to watchlist.`, "positive");
}

function restoreProjectionInputs(input) {
  if (!input) return;
  el("ticker").value = input.ticker;
  el("currentPrice").value = input.currentPrice;
  el("revenue").value = input.revenue;
  el("shares").value = input.shares;
  el("eps").value = input.eps;
  el("years").value = input.years;
  scenarioConfig.forEach((scenario) => {
    el(`${scenario.key}Growth`).value = (input.cases[scenario.key].growth * 100).toFixed(1);
    el(`${scenario.key}Margin`).value = (input.cases[scenario.key].margin * 100).toFixed(1);
    el(`${scenario.key}Pe`).value = input.cases[scenario.key].pe;
  });
}

function renderWatchlist() {
  const grid = el("watchlistGrid");
  if (!appState.watchlist.length) {
    grid.innerHTML = `
      <article class="empty-card">
        <strong>No saved projections yet.</strong>
        <p>Save one from the Projection tab and it will show up here immediately.</p>
      </article>
    `;
    return;
  }

  grid.innerHTML = appState.watchlist
    .map(
      (item, index) => `
        <article class="watch-card">
          <div class="watch-card-top">
            <div>
              <strong>${item.ticker}</strong>
              <p>Saved ${formatDate(item.savedAt)}</p>
            </div>
            <span>${formatDollarValue(item.currentPrice)}</span>
          </div>
          <div class="watch-metrics">
            <span>Bear ${formatDollarValue(item.outcomes.bear)}</span>
            <span>Base ${formatDollarValue(item.outcomes.base)}</span>
            <span>Bull ${formatDollarValue(item.outcomes.bull)}</span>
            <span>Base CAGR ${formatPercent(item.baseCagr)}</span>
          </div>
          <div class="button-row">
            <button class="secondary-button" data-watch-action="load" data-watch-index="${index}" type="button">Load</button>
            <button class="secondary-button" data-watch-action="delete" data-watch-index="${index}" type="button">Delete</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function calculateSp500Series() {
  const startingAmount = Number(el("spStart").value) || 0;
  const monthlyContribution = Number(el("spMonthly").value) || 0;
  const annualRate = (Number(el("spRate").value) || 0) / 100;
  const years = Math.max(1, Number(el("spYears").value) || 1);
  const monthlyRate = annualRate / 12;

  let balance = startingAmount;
  const rows = [];
  const chartPoints = [{ x: 0, y: balance }];

  for (let year = 1; year <= years; year += 1) {
    const startValue = balance;
    let contributions = 0;
    for (let month = 0; month < 12; month += 1) {
      balance += monthlyContribution;
      contributions += monthlyContribution;
      balance *= 1 + monthlyRate;
    }
    const endingValue = balance;
    rows.push({
      year,
      startValue,
      contributions,
      growth: endingValue - startValue - contributions,
      endingValue,
    });
    chartPoints.push({ x: year, y: endingValue });
  }

  return {
    startingAmount,
    monthlyContribution,
    annualRate,
    years,
    rows,
    chartPoints,
    endingValue: balance,
    totalContributions: startingAmount + monthlyContribution * years * 12,
    totalGrowth: balance - (startingAmount + monthlyContribution * years * 12),
  };
}

function renderSp500() {
  const result = calculateSp500Series();
  el("sp500Cards").innerHTML = [
    ["Ending value", formatDollarValue(result.endingValue)],
    ["Total contributed", formatDollarValue(result.totalContributions)],
    ["Total growth", formatDollarValue(result.totalGrowth)],
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

  el("sp500Table").innerHTML = result.rows
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
        data: result.chartPoints,
        borderColor: "#4f8cff",
        backgroundColor: "#4f8cff",
        borderWidth: 2,
      },
    ],
    readoutId: "sp500Readout",
    xFormatter: xFormatterFactory(false),
    xTime: false,
  });
  setChartReadout("sp500Readout", "S&P chart details will appear here.");
}

function portfolioTotals(holdings) {
  return holdings.reduce(
    (totals, holding) => {
      totals.initialValue += holding.initialValue || 0;
      totals.currentValue += holding.currentValue || 0;
      totals.dayChange += holding.dayChange || 0;
      totals.unrealizedProfit += holding.unrealizedProfit || 0;
      totals.realizedProfit += holding.realizedProfit || 0;
      return totals;
    },
    { initialValue: 0, currentValue: 0, dayChange: 0, unrealizedProfit: 0, realizedProfit: 0 },
  );
}

function deriveHoldingsFromTrades(trades, preserveQuotes = true) {
  const priorMap = new Map((appState.portfolio.holdings || []).map((holding) => [holding.symbol, holding]));
  const ledger = new Map();

  [...trades]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((trade) => {
      const key = trade.symbol;
      if (!key) return;
      const bucket =
        ledger.get(key) || {
          symbol: trade.symbol,
          asset: trade.asset,
          sector: trade.sector || "Unassigned",
          account: trade.account || "Primary",
          quantity: 0,
          costBasis: 0,
          averageCost: 0,
          initialValue: 0,
          realizedProfit: 0,
        };

      if (trade.side === "buy") {
        bucket.costBasis += trade.quantity * trade.tradePrice + trade.fees;
        bucket.quantity += trade.quantity;
        bucket.averageCost = bucket.quantity > 0 ? bucket.costBasis / bucket.quantity : 0;
      } else {
        const sellQuantity = Math.min(bucket.quantity, trade.quantity);
        const proceeds = sellQuantity * trade.tradePrice - trade.fees;
        const costRemoved = sellQuantity * bucket.averageCost;
        bucket.realizedProfit += proceeds - costRemoved;
        bucket.quantity -= sellQuantity;
        bucket.costBasis -= costRemoved;
        if (bucket.quantity <= 0.0000001) {
          bucket.quantity = 0;
          bucket.costBasis = 0;
          bucket.averageCost = 0;
        } else {
          bucket.averageCost = bucket.costBasis / bucket.quantity;
        }
      }

      bucket.asset = trade.asset || bucket.asset;
      bucket.sector = trade.sector || bucket.sector;
      bucket.account = trade.account || bucket.account;
      bucket.initialValue = bucket.quantity * bucket.averageCost;
      ledger.set(key, bucket);
    });

  const holdings = [...ledger.values()]
    .filter((holding) => holding.quantity > 0)
    .map((holding) => {
      const prior = priorMap.get(holding.symbol);
      const currentPrice = preserveQuotes ? prior?.currentPrice || 0 : 0;
      const previousClose = preserveQuotes ? prior?.previousClose || currentPrice : currentPrice;
      const currentValue = holding.quantity * currentPrice;
      const dayChange = holding.quantity * (currentPrice - previousClose);
      return {
        ...holding,
        currentPrice,
        previousClose,
        currentValue,
        dayChange,
        dayPercentChange: previousClose > 0 ? (currentPrice - previousClose) / previousClose : 0,
        unrealizedProfit: currentValue - holding.initialValue,
      };
    });

  holdings.sort((a, b) => b.currentValue - a.currentValue);
  return holdings;
}

async function refreshPortfolioQuotes() {
  const symbols = [...new Set(appState.portfolio.trades.map((trade) => trade.symbol).filter(Boolean))];
  if (!symbols.length) {
    setInlineStatus("portfolioStatus", "Add or import trades first, then refresh prices.", "negative");
    return;
  }

  setInlineStatus("portfolioStatus", "Refreshing quotes...", "neutral");
  const quotes = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const data = await fetchStockData(symbol);
        return [symbol, data];
      } catch {
        return [symbol, null];
      }
    }),
  );

  const quoteMap = new Map(quotes);
  appState.portfolio.holdings = deriveHoldingsFromTrades(appState.portfolio.trades, false).map((holding) => {
    const quote = quoteMap.get(holding.symbol);
    const currentPrice = Number(quote?.price) || 0;
    const previousClose = Number(quote?.previousClose) || currentPrice;
    const currentValue = holding.quantity * currentPrice;
    const dayChange = holding.quantity * (currentPrice - previousClose);
    return {
      ...holding,
      asset: holding.asset || quote?.name || holding.symbol,
      sector: holding.sector || quote?.sector || "Unassigned",
      currentPrice,
      previousClose,
      currentValue,
      dayChange,
      dayPercentChange: previousClose > 0 ? (currentPrice - previousClose) / previousClose : 0,
      unrealizedProfit: currentValue - holding.initialValue,
    };
  });
  queuePortfolioDriveSync();
  renderPortfolio();
  setInlineStatus("portfolioStatus", "Portfolio quotes updated.", "positive");
}

function getPortfolioWorkbookData() {
  const holdings = deriveHoldingsFromTrades(appState.portfolio.trades, true);
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
    holdings: holdings.map((holding) => ({
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

function renderPortfolioCards(holdings) {
  const totals = portfolioTotals(holdings);
  const cards = [
    ["Portfolio value", formatDollarValue(totals.currentValue)],
    ["Day change", formatDollarValue(totals.dayChange), classForValue(totals.dayChange)],
    ["Unrealized P/L", formatDollarValue(totals.unrealizedProfit), classForValue(totals.unrealizedProfit)],
    ["Realized P/L", formatDollarValue(totals.realizedProfit), classForValue(totals.realizedProfit)],
  ];

  el("portfolioCards").innerHTML = cards
    .map(
      ([label, value, extraClass = ""]) => `
        <article class="metric-card ${extraClass}">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `,
    )
    .join("");
}

function renderPortfolioTrades() {
  const tbody = el("portfolioTradesTable");
  if (!appState.portfolio.trades.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="small-muted">No trades yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = appState.portfolio.trades
    .map(
      (trade) => `
        <tr>
          <td>${formatDate(trade.date)}</td>
          <td>${trade.symbol}</td>
          <td>${trade.side}</td>
          <td>${trade.quantity}</td>
          <td>${formatDollarValue(trade.tradePrice)}</td>
          <td>${formatDollarValue(trade.fees)}</td>
          <td>${safeText(trade.account, "Primary")}</td>
          <td>
            <div class="table-actions">
              <button class="ghost-icon-button" data-trade-action="edit" data-trade-id="${trade.id}" type="button">Edit</button>
              <button class="ghost-icon-button" data-trade-action="delete" data-trade-id="${trade.id}" type="button">Delete</button>
            </div>
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
    tbody.innerHTML = `<tr><td colspan="13" class="small-muted">No holdings yet.</td></tr>`;
    return;
  }
  const totals = portfolioTotals(holdings);
  tbody.innerHTML = holdings
    .map((holding) => {
      const allocation = totals.currentValue > 0 ? holding.currentValue / totals.currentValue : 0;
      return `
        <tr>
          <td>${safeText(holding.account, "Account")}</td>
          <td>${safeText(holding.sector, "Unassigned")}</td>
          <td>${safeText(holding.asset, holding.symbol)}</td>
          <td>${formatDollarValue(holding.currentPrice)}</td>
          <td>${formatDollarValue(holding.averageCost)}</td>
          <td>${holding.quantity.toFixed(4).replace(/\.?0+$/, "")}</td>
          <td>${formatDollarValue(holding.initialValue)}</td>
          <td>${formatDollarValue(holding.currentValue)}</td>
          <td class="${classForValue(holding.dayChange)}">${formatDollarValue(holding.dayChange)}</td>
          <td class="${classForValue(holding.dayPercentChange)}">${formatPercent(holding.dayPercentChange)}</td>
          <td class="${classForValue(holding.unrealizedProfit)}">${formatDollarValue(holding.unrealizedProfit)}</td>
          <td class="${classForValue(holding.realizedProfit)}">${formatDollarValue(holding.realizedProfit)}</td>
          <td>${formatPercent(allocation)}</td>
        </tr>
      `;
    })
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
