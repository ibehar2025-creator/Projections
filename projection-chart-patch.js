(function () {
  if (window.__stockLabRuntimePatchApplied) return;
  window.__stockLabRuntimePatchApplied = true;

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
  const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const validTabs = new Set(["projection", "compare", "valuation", "watchlist", "portfolio"]);

  function byId(id) {
    return document.getElementById(id);
  }

  function numberValue(id) {
    return Number(byId(id)?.value) || 0;
  }

  function escapeHtml(value) {
    const span = document.createElement("span");
    span.textContent = String(value ?? "");
    return span.innerHTML;
  }

  function classForValue(value) {
    if (!Number.isFinite(value) || value === 0) return "";
    return value > 0 ? "value-positive" : "value-negative";
  }

  function safeSetStatus(id, message, tone = "neutral") {
    if (typeof setInlineStatus === "function") {
      setInlineStatus(id, message, tone);
      return;
    }
    const node = byId(id);
    if (!node) return;
    node.textContent = message;
    node.className = "inline-status";
    if (tone === "positive") node.classList.add("value-positive");
    if (tone === "negative") node.classList.add("value-negative");
  }

  function metricCard(label, value, copy, toneClass) {
    return `
      <article class="metric-card ${toneClass || ""}">
        <span>${escapeHtml(label)}</span>
        <strong>${value}</strong>
        <p>${escapeHtml(copy)}</p>
      </article>
    `;
  }

  function normalizeImportDate(value) {
    if (!value) return new Date().toISOString().slice(0, 10);
    if (typeof value === "number" && window.XLSX?.SSF?.parse_date_code) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString().slice(0, 10);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  }

  function normalizeTradeRow(row = {}, index = 0) {
    return {
      id: row.id || row.Id || `import_${Date.now()}_${index}`,
      date: normalizeImportDate(row.date || row.Date),
      symbol: String(row.symbol || row.Symbol || "").trim().toUpperCase(),
      asset: String(row.asset || row.Asset || "").trim(),
      sector: String(row.sector || row.Sector || "Unassigned").trim(),
      side: String(row.side || row.Side || "buy").trim().toLowerCase() === "sell" ? "sell" : "buy",
      quantity: Number(row.quantity ?? row.Quantity) || 0,
      tradePrice: Number(row.tradePrice ?? row["Trade Price"] ?? row.averageCost ?? row["Average Cost"]) || 0,
      fees: Number(row.fees ?? row.Fees) || 0,
      account: String(row.account || row.Account || "Primary").trim(),
      notes: String(row.notes || row.Notes || "").trim(),
    };
  }

  function normalizeHoldingRow(row = {}) {
    const quantity = Number(row.quantity ?? row.Quantity) || 0;
    const averageCost = Number(row.averageCost ?? row["Average Cost"] ?? row.tradePrice ?? row["Trade Price"]) || 0;
    const currentPrice = Number(row.currentPrice ?? row["Current Price"] ?? averageCost) || 0;
    const initialValue = Number(row.initialValue ?? row["Initial Value"]) || quantity * averageCost;
    const currentValue = Number(row.currentValue ?? row["Current Value"]) || quantity * currentPrice;
    return {
      symbol: String(row.symbol || row.Symbol || "").trim().toUpperCase(),
      asset: String(row.asset || row.Asset || "").trim(),
      sector: String(row.sector || row.Sector || "Unassigned").trim(),
      quantity,
      averageCost,
      initialValue,
      account: String(row.account || row.Account || "Primary").trim(),
      realizedProfit: Number(row.realizedProfit ?? row["Realized Profit"]) || 0,
      currentPrice,
      currentValue,
      dayChange: Number(row.dayChange ?? row["Day Change"]) || 0,
      dayPercentChange: Number(row.dayPercentChange ?? row["Day % Change"]) || 0,
      unrealizedProfit: Number(row.unrealizedProfit ?? row["Unrealized Profit"]) || currentValue - initialValue,
      allocation: Number(row.allocation ?? row.Allocation) || 0,
      latestQuote: row.latestQuote || null,
    };
  }

  function normalizeHoldingsWithAllocation(holdings) {
    const filtered = holdings.filter((holding) => holding.symbol && holding.quantity > 0);
    const totalValue = filtered.reduce((sum, holding) => sum + (Number(holding.currentValue) || 0), 0);
    return filtered.map((holding) => ({
      ...holding,
      allocation: totalValue > 0 ? ((Number(holding.currentValue) || 0) / totalValue) * 100 : 0,
    }));
  }

  function holdingsToSyntheticTrades(holdings) {
    return holdings.map((holding, index) => normalizeTradeRow({
      id: `holding_import_${holding.symbol}_${index}`,
      Date: new Date().toISOString().slice(0, 10),
      Symbol: holding.symbol,
      Asset: holding.asset,
      Sector: holding.sector,
      Side: "buy",
      Quantity: holding.quantity,
      "Trade Price": holding.averageCost || holding.currentPrice || 0,
      Fees: 0,
      Account: holding.account || "Primary",
      Notes: "created_from_holding_snapshot",
    }, index));
  }

  function deriveHoldings(trades, fallbackHoldings = []) {
    if (trades.length && typeof deriveHoldingsFromTrades === "function") {
      return normalizeHoldingsWithAllocation(deriveHoldingsFromTrades(trades).map(normalizeHoldingRow));
    }
    return normalizeHoldingsWithAllocation(fallbackHoldings.map(normalizeHoldingRow));
  }

  function normalizePortfolioPayload(payload = {}) {
    const trades = Array.isArray(payload.trades)
      ? payload.trades.map(normalizeTradeRow).filter((trade) => trade.symbol && trade.quantity > 0)
      : [];
    const holdingSource = Array.isArray(payload.holdingsSnapshot)
      ? payload.holdingsSnapshot
      : Array.isArray(payload.holdings)
        ? payload.holdings
        : [];
    const holdingsSnapshot = normalizeHoldingsWithAllocation(holdingSource.map(normalizeHoldingRow));

    if (trades.length) {
      return { trades, holdings: deriveHoldings(trades, holdingsSnapshot) };
    }

    if (holdingsSnapshot.length) {
      return {
        trades: holdingsToSyntheticTrades(holdingsSnapshot),
        holdings: holdingsSnapshot,
      };
    }

    return { trades: [], holdings: [] };
  }

  window.runReverse = function runReversePatched() {
    const price = numberValue("revPrice");
    const eps = numberValue("revEps");
    const exitPe = numberValue("revPe");
    const years = Math.max(1, numberValue("revYears"));
    const answer = byId("reverseAnswer");
    if (!answer) return null;

    if (price <= 0 || eps <= 0 || exitPe <= 0) {
      answer.innerHTML = "<strong>Enter a positive price, EPS, and exit P/E.</strong>";
      return null;
    }

    const impliedGrowth = Math.pow(price / (eps * exitPe), 1 / years) - 1;
    const terminalEps = eps * Math.pow(1 + impliedGrowth, years);
    answer.innerHTML = `
      <strong>${percent.format(impliedGrowth)} implied EPS growth</strong>
      <p>Current price implies ${money.format(terminalEps)} terminal EPS in ${whole.format(years)} years at ${whole.format(exitPe)}x earnings.</p>
    `;
    return { impliedGrowth, terminalEps };
  };

  window.runMos = function runMosPatched() {
    const fairValue = numberValue("fairValue");
    const currentPrice = numberValue("mosPrice");
    const requiredSafety = Math.max(0, numberValue("mosPercent")) / 100;
    const answer = byId("mosAnswer");
    if (!answer) return null;

    if (fairValue <= 0 || currentPrice <= 0) {
      answer.innerHTML = "<strong>Enter a positive fair value and current price.</strong>";
      return null;
    }

    const margin = (fairValue - currentPrice) / fairValue;
    const buyBelow = fairValue * (1 - requiredSafety);
    const clearsBar = currentPrice <= buyBelow;
    answer.innerHTML = `
      <strong class="${classForValue(margin)}">${percent.format(margin)} margin of safety</strong>
      <p>${clearsBar ? "Clears" : "Does not clear"} your required discount. Buy-below price: ${money.format(buyBelow)}.</p>
    `;
    return { margin, buyBelow, clearsBar };
  };

  function bindCalculatorButtons() {
    [
      ["runReverse", window.runReverse],
      ["runMos", window.runMos],
    ].forEach(([id, handler]) => {
      const button = byId(id);
      if (!button || button.dataset.runtimePatchBound === "true") return;
      button.dataset.runtimePatchBound = "true";
      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          handler();
        },
        true,
      );
    });
  }

  function currentHashTab() {
    const hash = window.location.hash.replace(/^#/, "");
    return validTabs.has(hash) ? hash : "";
  }

  function installHashRouting() {
    if (window.__stockLabHashRoutingInstalled) return;
    const originalActivateTab = window.activateTab;
    if (typeof originalActivateTab === "function") {
      window.activateTab = function patchedActivateTab(tabId, options = {}) {
        if (!validTabs.has(tabId)) return;
        originalActivateTab(tabId);
        if (options.updateHash !== false && window.location.hash !== `#${tabId}`) {
          history.replaceState({}, "", `${window.location.pathname}${window.location.search}#${tabId}`);
        }
      };
    }

    document.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest("[data-tab]");
        if (!button || !validTabs.has(button.dataset.tab) || typeof window.activateTab !== "function") return;
        window.activateTab(button.dataset.tab);
      },
      true,
    );

    window.addEventListener("hashchange", () => {
      const tab = currentHashTab();
      if (tab && typeof window.activateTab === "function") {
        window.activateTab(tab, { updateHash: false });
      }
    });

    window.__stockLabHashRoutingInstalled = true;
  }

  function activateInitialHash() {
    const tab = currentHashTab();
    if (tab && typeof window.activateTab === "function") {
      window.activateTab(tab, { updateHash: false });
    }
  }

  function patchPortfolioDataFlows() {
    if (typeof portfolioPayloadFromState === "function" && !window.__stockLabPortfolioPayloadPatched) {
      portfolioPayloadFromState = function portfolioPayloadFromStatePatched() {
        if (typeof ensurePortfolioDeviceId === "function") ensurePortfolioDeviceId();
        const trades = Array.isArray(appState?.portfolio?.trades) ? appState.portfolio.trades.map((trade) => ({ ...trade })) : [];
        const currentHoldings = Array.isArray(appState?.portfolio?.holdings) ? appState.portfolio.holdings.map((holding) => ({ ...holding })) : [];
        const derivedHoldings = trades.length ? deriveHoldings(trades, currentHoldings) : currentHoldings;
        return {
          schemaVersion: 2,
          updatedAt: new Date().toISOString(),
          deviceId: appState?.portfolio?.sync?.deviceId || null,
          trades,
          holdingsSnapshot: normalizeHoldingsWithAllocation(derivedHoldings.map(normalizeHoldingRow)),
        };
      };
      window.__stockLabPortfolioPayloadPatched = true;
    }

    if (typeof normalizeImportedTrade === "function" && !window.__stockLabTradeNormalizerPatched) {
      normalizeImportedTrade = normalizeTradeRow;
      window.__stockLabTradeNormalizerPatched = true;
    }

    if (typeof normalizeImportedHolding === "function" && !window.__stockLabHoldingNormalizerPatched) {
      normalizeImportedHolding = normalizeHoldingRow;
      window.__stockLabHoldingNormalizerPatched = true;
    }

    if (typeof importPortfolioWorkbook === "function" && !window.__stockLabImportPatched) {
      const originalImportPortfolioWorkbook = importPortfolioWorkbook;
      importPortfolioWorkbook = async function importPortfolioWorkbookPatched(file) {
        const imported = await originalImportPortfolioWorkbook(file);
        const normalized = normalizePortfolioPayload({
          trades: imported?.trades || [],
          holdingsSnapshot: imported?.holdings || [],
        });
        return normalized;
      };
      window.__stockLabImportPatched = true;
    }

    if (typeof applyDrivePortfolioPayload === "function" && !window.__stockLabDrivePayloadPatched) {
      applyDrivePortfolioPayload = function applyDrivePortfolioPayloadPatched(payload, metadata = {}) {
        const normalized = normalizePortfolioPayload(payload || {});
        appState.portfolio.trades = normalized.trades;
        appState.portfolio.holdings = normalized.holdings;
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
        if (typeof persistPortfolioState === "function") persistPortfolioState();
        if (typeof renderPortfolio === "function") renderPortfolio();
        if (typeof renderPortfolioSyncState === "function") renderPortfolioSyncState();
      };
      window.__stockLabDrivePayloadPatched = true;
    }

    if (typeof loadPortfolioFromDrive === "function" && !window.__stockLabDriveLoaderPatched) {
      const originalLoadPortfolioFromDrive = loadPortfolioFromDrive;
      loadPortfolioFromDrive = async function loadPortfolioFromDrivePatched(...args) {
        if (!appState?.driveAuth?.connected) {
          safeSetStatus("portfolioStatus", "Connect Drive first to load your permanent private copy.", "negative");
          return null;
        }
        const result = await originalLoadPortfolioFromDrive.apply(this, args);
        const tradeCount = Array.isArray(appState?.portfolio?.trades) ? appState.portfolio.trades.length : 0;
        const holdingCount = Array.isArray(appState?.portfolio?.holdings) ? appState.portfolio.holdings.length : 0;
        safeSetStatus(
          "portfolioStatus",
          `Loaded ${whole.format(tradeCount)} trade${tradeCount === 1 ? "" : "s"} and ${whole.format(holdingCount)} holding${holdingCount === 1 ? "" : "s"} from private Drive.`,
          "positive",
        );
        return result;
      };
      window.__stockLabDriveLoaderPatched = true;
    }
  }

  function portfolioTotalValue(holdings) {
    return holdings.reduce((sum, holding) => sum + (Number(holding.currentValue) || 0), 0);
  }

  function largestHolding(holdings) {
    return holdings.reduce((largest, holding) => {
      const currentValue = Number(holding.currentValue) || 0;
      return currentValue > (Number(largest?.currentValue) || 0) ? holding : largest;
    }, null);
  }

  function renderPortfolioEnhancements() {
    const holdings = Array.isArray(appState?.portfolio?.holdings) ? appState.portfolio.holdings : [];
    const hero = byId("portfolioHero");
    const spotlight = byId("portfolioSpotlight");
    if (!hero && !spotlight) return;

    if (!holdings.length) {
      if (hero) hero.innerHTML = '<div class="empty-state">Import a workbook or add a trade to build your portfolio dashboard.</div>';
      if (spotlight) spotlight.innerHTML = '<div class="empty-state">Portfolio highlights will appear after holdings are added.</div>';
      return;
    }

    const totalValue = portfolioTotalValue(holdings);
    const totalCost = holdings.reduce((sum, holding) => sum + (Number(holding.initialValue) || 0), 0);
    const dayChange = holdings.reduce((sum, holding) => sum + (Number(holding.dayChange) || 0), 0);
    const largest = largestHolding(holdings);

    if (hero) {
      hero.innerHTML = [
        metricCard("Market value", money.format(totalValue), `${whole.format(holdings.length)} active holding${holdings.length === 1 ? "" : "s"}`),
        metricCard("Cost basis", money.format(totalCost), "Capital currently deployed"),
        metricCard("Day change", money.format(dayChange), "Move versus previous close", classForValue(dayChange)),
        metricCard("Largest position", escapeHtml(largest?.symbol || "N/A"), largest ? money.format(largest.currentValue || 0) : "No holdings"),
      ].join("");
    }

    if (spotlight) {
      const sectors = new Map();
      holdings.forEach((holding) => {
        const sector = holding.sector || "Unassigned";
        sectors.set(sector, (sectors.get(sector) || 0) + (Number(holding.currentValue) || 0));
      });
      const [topSector = "Unassigned", topSectorValue = 0] = [...sectors.entries()].sort((a, b) => b[1] - a[1])[0] || [];
      const biggestMover = holdings.reduce((best, holding) => {
        const currentMove = Math.abs(Number(holding.dayChange) || 0);
        const bestMove = Math.abs(Number(best?.dayChange) || 0);
        return currentMove > bestMove ? holding : best;
      }, null);

      spotlight.innerHTML = [
        metricCard("Concentration", escapeHtml(largest?.symbol || "N/A"), largest && totalValue > 0 ? `${percent.format((largest.currentValue || 0) / totalValue)} of portfolio` : "No current value yet"),
        metricCard("Top sector", escapeHtml(topSector), totalValue > 0 ? `${percent.format(topSectorValue / totalValue)} of portfolio` : "No current value yet"),
        metricCard("Biggest mover", escapeHtml(biggestMover?.symbol || "N/A"), biggestMover ? money.format(biggestMover.dayChange || 0) : "No quote refresh yet", biggestMover ? classForValue(biggestMover.dayChange || 0) : ""),
        metricCard("Positions", whole.format(holdings.length), "Open holdings in the trade ledger"),
      ].join("");
    }
  }

  function runPortfolioProjectionPatch() {
    const holdings = Array.isArray(appState?.portfolio?.holdings) ? appState.portfolio.holdings : [];
    const totalValue = portfolioTotalValue(holdings);
    const years = Math.max(1, Math.min(15, numberValue("years") || 5));
    const status = byId("portfolioProjectionStatus");
    const cards = byId("portfolioProjectionCards");
    const scenarios = byId("portfolioProjectionScenarios");

    if (!holdings.length || totalValue <= 0) {
      if (status) {
        status.textContent = "Add holdings and refresh quotes before running the portfolio projection.";
        status.className = "inline-status value-negative";
      }
      if (cards) cards.innerHTML = "";
      if (scenarios) scenarios.innerHTML = "";
      return;
    }

    const projections = ["bear", "base", "bull"].map((key) => {
      const label = key[0].toUpperCase() + key.slice(1);
      const growth = numberValue(`${key}Growth`) / 100;
      const terminalValue = totalValue * Math.pow(1 + growth, years);
      return {
        key,
        label,
        terminalValue,
        gain: terminalValue - totalValue,
        cagr: totalValue > 0 ? Math.pow(terminalValue / totalValue, 1 / years) - 1 : 0,
      };
    });
    const base = projections.find((projection) => projection.key === "base");

    if (cards) {
      cards.innerHTML = [
        metricCard("Current value", money.format(totalValue), "Starting portfolio value"),
        metricCard("Projection years", whole.format(years), "Using the projection tab horizon"),
        metricCard("Base ending value", money.format(base?.terminalValue || 0), "Base case portfolio estimate"),
      ].join("");
    }

    if (scenarios) {
      scenarios.innerHTML = projections
        .map((projection) =>
          metricCard(
            `${projection.label} case`,
            money.format(projection.terminalValue),
            `${money.format(projection.gain)} projected gain, ${percent.format(projection.cagr)} CAGR`,
            classForValue(projection.gain),
          ),
        )
        .join("");
    }

    if (status) {
      status.textContent = "Portfolio projection updated.";
      status.className = "inline-status value-positive";
    }
  }

  function bindPortfolioProjectionButton() {
    const button = byId("runPortfolioProjection");
    if (!button || button.dataset.runtimePatchBound === "true") return;
    button.dataset.runtimePatchBound = "true";
    button.addEventListener("click", runPortfolioProjectionPatch);
  }

  function improveDriveButtonState() {
    const connected = Boolean(appState?.driveAuth?.connected);
    [
      ["syncPortfolioNowButton", "Connect Drive first to sync your permanent private copy."],
      ["loadDrivePortfolioButton", "Connect Drive first to load your permanent private copy."],
      ["disconnectDriveButton", "Drive is not connected yet."],
    ].forEach(([id, title]) => {
      const button = byId(id);
      if (!button) return;
      if (!connected) {
        button.title = title;
        button.setAttribute("aria-disabled", "true");
      } else {
        button.removeAttribute("title");
        button.removeAttribute("aria-disabled");
      }
    });
  }

  function ensureToolbarIsFlat() {
    const toolbar = document.querySelector(".portfolio-toolbar");
    if (!toolbar || toolbar.dataset.runtimePatchFlattened === "true") return;
    const groups = [...toolbar.querySelectorAll(".portfolio-toolbar-group")];
    if (!groups.length) return;
    const fragment = document.createDocumentFragment();
    groups.forEach((group) => {
      [...group.children].forEach((child) => fragment.appendChild(child));
      group.remove();
    });
    toolbar.appendChild(fragment);
    toolbar.dataset.runtimePatchFlattened = "true";
  }

  function installCssPatch() {
    if (byId("stockLabRuntimePatchStyles")) return;
    const style = document.createElement("style");
    style.id = "stockLabRuntimePatchStyles";
    style.textContent = `
      .workspace-grid,
      .compare-layout,
      .portfolio-grid {
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      }
      .portfolio-hero-grid,
      .portfolio-spotlight-grid,
      .metric-row,
      .metric-row-two,
      #projectionCards,
      #compareCards,
      #portfolioCards,
      #portfolioProjectionCards,
      #sp500Cards {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        align-items: stretch;
      }
      .portfolio-dashboard-grid {
        grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
      }
      .details-grid,
      #projectionDetails {
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      }
      .metric-card,
      .detail-card,
      .watch-card {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .results-panel,
      .tool-panel,
      .chart-card,
      .table-card,
      .data-card,
      .section-heading > div,
      .chart-header > div,
      .watchlist-header > div,
      .portfolio-header > div {
        min-width: 0;
      }
      .portfolio-header {
        gap: 8px;
      }
      .portfolio-toolbar {
        display: flex !important;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        width: 100%;
      }
      .portfolio-toolbar > * {
        flex: 0 0 auto;
      }
      .portfolio-toolbar .primary-button {
        min-width: 156px;
      }
      .data-card .button-row {
        margin-top: 16px;
      }
      @media (max-width: 760px) {
        .portfolio-toolbar {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .portfolio-toolbar > * {
          width: 100%;
          min-width: 0;
        }
      }
      @media (max-width: 520px) {
        .portfolio-toolbar {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function installCompareCleanup() {
    const fetchButton = byId("fetchCompare");
    if (fetchButton) fetchButton.remove();
    const compareHeading = document.querySelector("#compare .results-panel .section-heading h2");
    if (compareHeading) compareHeading.textContent = "Summary";
    const compareSubcopy = document.querySelector("#compare .results-panel .section-heading .small-muted");
    if (compareSubcopy) compareSubcopy.textContent = "Compare both names side by side without the extra clutter.";
  }

  function installProjectionCleanup() {
    const historicalCard = byId("projectionHistoricalChart")?.closest(".chart-card");
    if (historicalCard) historicalCard.style.display = "none";
  }

  function addYearsToDate(baseValue, years) {
    const date = new Date(baseValue);
    const copy = new Date(date.getTime());
    copy.setFullYear(copy.getFullYear() + years);
    return copy.getTime();
  }

  function normalizeProjectionPanel() {
    const projectionCard = byId("projectionForwardChart")?.closest(".chart-card");
    const heading = projectionCard?.querySelector("h2");
    const subcopy = projectionCard?.querySelector(".small-muted");
    const readout = byId("projectionForwardReadout");
    if (heading) heading.textContent = "Price Path";
    if (subcopy) subcopy.textContent = "Historical pricing and forward scenarios share one timeline so you can inspect the handoff cleanly.";
    if (readout && !readout.textContent.trim()) readout.textContent = "Price-path details will appear here.";
  }

  function drawUnifiedProjectionChart(result, history) {
    const lastHistoryPoint = history?.points?.[history.points.length - 1];
    if (!lastHistoryPoint || typeof createLineChart !== "function") {
      if (typeof drawProjectionForwardChart === "function") drawProjectionForwardChart(result);
      return;
    }

    const anchorDate = lastHistoryPoint.date;
    const anchorPrice = Number.isFinite(lastHistoryPoint.close) ? lastHistoryPoint.close : result.input.currentPrice;
    const datasets = [
      {
        label: `${history.symbol} historical`,
        borderColor: "#4f8cff",
        backgroundColor: "rgba(79, 140, 255, 0.14)",
        data: history.points.map((point) => ({ x: point.date, y: point.close })),
        pointRadius: 0,
        pointHoverRadius: 3,
        borderWidth: 2.4,
      },
      ...result.cases.map((item) => ({
        label: `${item.label} outlook`,
        borderColor: item.color,
        backgroundColor: `${item.color}22`,
        borderDash: item.key === "base" ? [] : [7, 5],
        data: [
          { x: anchorDate, y: anchorPrice },
          ...item.yearly.slice(1).map((point) => ({
            x: addYearsToDate(anchorDate, point.year),
            y: point.price,
          })),
        ],
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: item.key === "base" ? 2.8 : 2.2,
        fill: false,
      })),
    ];

    const chart = createLineChart("projectionForward", "projectionForwardChart", {
      readoutId: "projectionForwardReadout",
      datasets,
      xFormatter: (value) => new Date(Number(value)).getFullYear(),
      xTime: true,
    });

    if (chart?.options?.scales?.x) {
      chart.options.scales.x.time = {
        unit: "year",
        tooltipFormat: "MMM d, yyyy",
        displayFormats: { month: "MMM yyyy", year: "yyyy" },
      };
      chart.update("none");
    }

    if (typeof setChartReadout === "function") {
      setChartReadout(
        "projectionForwardReadout",
        `${history.symbol} ${history.rangeLabel} history and forward scenarios loaded on one timeline.`,
      );
    }
  }

  function wrapRenderers() {
    if (typeof renderPortfolio === "function" && !window.__stockLabPortfolioRenderWrapped) {
      const originalRenderPortfolio = renderPortfolio;
      renderPortfolio = function renderPortfolioPatched(...args) {
        const result = originalRenderPortfolio.apply(this, args);
        ensureToolbarIsFlat();
        improveDriveButtonState();
        renderPortfolioEnhancements();
        bindPortfolioProjectionButton();
        return result;
      };
      window.__stockLabPortfolioRenderWrapped = true;
    }

    if (typeof renderPortfolioSyncState === "function" && !window.__stockLabPortfolioSyncWrapped) {
      const originalRenderPortfolioSyncState = renderPortfolioSyncState;
      renderPortfolioSyncState = function renderPortfolioSyncStatePatched(...args) {
        const result = originalRenderPortfolioSyncState.apply(this, args);
        improveDriveButtonState();
        return result;
      };
      window.__stockLabPortfolioSyncWrapped = true;
    }

    if (typeof renderProjection === "function" && !window.__stockLabProjectionRenderWrapped) {
      const originalRenderProjection = renderProjection;
      renderProjection = function renderProjectionPatched(result) {
        originalRenderProjection(result);
        const history = appState.__projectionUnifiedHistory;
        if (history && String(history.symbol || "").toUpperCase() === result.input.ticker) {
          drawUnifiedProjectionChart(result, history);
        }
        normalizeProjectionPanel();
      };
      window.__stockLabProjectionRenderWrapped = true;
    }

    if (typeof loadProjectionHistoricalChart === "function" && !window.__stockLabProjectionHistoryWrapped) {
      const originalLoadProjectionHistoricalChart = loadProjectionHistoricalChart;
      loadProjectionHistoricalChart = async function loadProjectionHistoricalChartPatched(symbol, range) {
        const history = await originalLoadProjectionHistoricalChart(symbol, range);
        appState.__projectionUnifiedHistory = history;
        if (appState.lastProjection && String(history?.symbol || "").toUpperCase() === appState.lastProjection.input.ticker) {
          drawUnifiedProjectionChart(appState.lastProjection, history);
        }
        normalizeProjectionPanel();
        return history;
      };
      window.__stockLabProjectionHistoryWrapped = true;
    }
  }

  function bootstrapPatches() {
    bindCalculatorButtons();
    installHashRouting();
    patchPortfolioDataFlows();
    wrapRenderers();
    installCssPatch();
    installCompareCleanup();
    installProjectionCleanup();
    ensureToolbarIsFlat();
    improveDriveButtonState();
    renderPortfolioEnhancements();
    bindPortfolioProjectionButton();
    normalizeProjectionPanel();
    activateInitialHash();
  }

  bootstrapPatches();
  setTimeout(bootstrapPatches, 0);
  document.addEventListener("DOMContentLoaded", bootstrapPatches, { once: true });
})();
