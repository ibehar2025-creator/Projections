(function () {
  if (window.__projectionChartPatchApplied) return;
  window.__projectionChartPatchApplied = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function addYearsToDate(baseValue, years) {
    const date = new Date(baseValue);
    const copy = new Date(date.getTime());
    copy.setFullYear(copy.getFullYear() + years);
    return copy.getTime();
  }

  function installRangeButtons() {
    const toolbar = byId("projectionForwardChart")?.closest(".chart-card")?.querySelector(".chart-toolbar");
    if (!toolbar || toolbar.querySelector('[data-chart-range-target="projectionHistorical"]')) return;

    const rangeGroup = document.createElement("div");
    rangeGroup.className = "segmented-group";
    rangeGroup.dataset.chartRangeTarget = "projectionHistorical";
    rangeGroup.innerHTML = `
      <button class="segmented-button" type="button" data-range="1m">1M</button>
      <button class="segmented-button" type="button" data-range="6m">6M</button>
      <button class="segmented-button" type="button" data-range="1y">1Y</button>
      <button class="segmented-button active" type="button" data-range="5y">5Y</button>
      <button class="segmented-button" type="button" data-range="max">Max</button>
    `;
    toolbar.prepend(rangeGroup);

    rangeGroup.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-range]");
      if (!button) return;
      rangeGroup.querySelectorAll(".segmented-button").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      appState.projectionHistoryRange = button.dataset.range;
      try {
        await loadProjectionHistoricalChart(byId("ticker")?.value, appState.projectionHistoryRange);
      } catch (error) {
        setChartReadout("projectionForwardReadout", error.message || "Could not load updated price history.");
      }
    });
  }

  function normalizeProjectionPanel() {
    const projectionCard = byId("projectionForwardChart")?.closest(".chart-card");
    const historicalCard = byId("projectionHistoricalChart")?.closest(".chart-card");
    const heading = projectionCard?.querySelector("h2");
    const subcopy = projectionCard?.querySelector(".small-muted");
    const readout = byId("projectionForwardReadout");

    if (heading) heading.textContent = "Price Path";
    if (subcopy) {
      subcopy.textContent =
        "Historical pricing and forward scenarios share one timeline so you can inspect the handoff cleanly.";
    }
    if (readout && !readout.textContent.trim()) {
      readout.textContent = "Price-path details will appear here.";
    }
    if (historicalCard) {
      historicalCard.style.display = "none";
    }
    installRangeButtons();
  }

  const originalCreateLineChart = window.createLineChart;
  if (typeof originalCreateLineChart === "function") {
    window.createLineChart = function patchedCreateLineChart(chartKey, canvasId, config) {
      const chart = originalCreateLineChart(chartKey, canvasId, config);
      if (chart) {
        requestAnimationFrame(() => {
          chart.resize();
          chart.update("none");
        });
      }
      return chart;
    };
  }

  function drawUnifiedProjectionChart(result, history) {
    const lastHistoryPoint = history?.points?.[history.points.length - 1];
    if (!lastHistoryPoint) {
      drawProjectionForwardChart(result);
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
      xFormatter: (value) => formatDate(value),
      xTime: true,
      datasets,
    });

    if (chart?.options?.scales?.x) {
      chart.options.scales.x.type = "time";
      chart.options.scales.x.time = {
        unit: "year",
        tooltipFormat: "MMM d, yyyy",
        displayFormats: {
          month: "MMM yyyy",
          year: "yyyy",
        },
      };
      chart.options.scales.x.ticks = {
        ...(chart.options.scales.x.ticks || {}),
        maxRotation: 0,
        autoSkip: true,
        callback(value) {
          const date = new Date(Number(value));
          if (Number.isNaN(date.getTime())) return "";
          return date.getFullYear();
        },
      };
      chart.update("none");
    }

    setChartReadout(
      "projectionForwardReadout",
      `${history.symbol} ${history.rangeLabel} history and forward scenarios loaded on one timeline.`,
    );
  }

  const originalRenderProjection = window.renderProjection;
  window.renderProjection = function patchedRenderProjection(result) {
    originalRenderProjection(result);
    const history = appState.__projectionUnifiedHistory;
    if (history && String(history.symbol || "").toUpperCase() === result.input.ticker) {
      drawUnifiedProjectionChart(result, history);
    }
    normalizeProjectionPanel();
  };

  window.loadProjectionHistoricalChart = async function patchedLoadProjectionHistoricalChart(symbol, range = "5y") {
    const history = await fetchHistoricalData(symbol, range);
    appState.__projectionUnifiedHistory = history;
    if (appState.lastProjection && String(history.symbol || "").toUpperCase() === appState.lastProjection.input.ticker) {
      drawUnifiedProjectionChart(appState.lastProjection, history);
    }
    normalizeProjectionPanel();
    return history;
  };

  normalizeProjectionPanel();
  setTimeout(async () => {
    try {
      if (typeof runProjection === "function") {
        runProjection();
      }
      if (byId("ticker")?.value) {
        await loadProjectionHistoricalChart(byId("ticker").value, appState.projectionHistoryRange || "5y");
      }
    } catch (error) {
      setChartReadout("projectionForwardReadout", error.message || "Could not load the unified price path.");
    }
  }, 0);
})();

(function () {
  if (window.__portfolioDashboardPatchApplied) return;
  window.__portfolioDashboardPatchApplied = true;
  if (typeof window === "undefined" || typeof appState === "undefined") return;

  const patchCss = `
    .portfolio-hero-grid,
    .portfolio-dashboard-grid,
    .portfolio-scenario-grid,
    .portfolio-spotlight-grid {
      display: grid;
      gap: 16px;
    }
    .portfolio-hero-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-bottom: 16px;
    }
    .portfolio-dashboard-grid {
      grid-template-columns: minmax(420px, 1.2fr) minmax(320px, 0.8fr);
      margin-bottom: 16px;
      align-items: start;
    }
    .portfolio-scenario-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-top: 14px;
    }
    .portfolio-spotlight-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .hero-card {
      position: relative;
      overflow: hidden;
      min-height: 180px;
      padding: 20px;
      border: 1px solid rgba(92, 126, 168, 0.38);
      border-radius: 16px;
      background:
        radial-gradient(circle at top right, rgba(79, 140, 255, 0.22), transparent 38%),
        linear-gradient(180deg, rgba(19, 30, 47, 0.98), rgba(11, 18, 29, 0.98));
      box-shadow: var(--shadow);
    }
    .hero-card::after {
      content: "";
      position: absolute;
      inset: auto -30px -30px auto;
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: rgba(62, 207, 142, 0.08);
    }
    .hero-card span {
      color: #9fb2cf;
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .hero-card strong {
      display: block;
      margin: 18px 0 8px;
      font-size: clamp(2rem, 4vw, 3.2rem);
      line-height: 0.92;
    }
    .hero-card p {
      max-width: 26ch;
      margin-bottom: 0;
      color: var(--muted);
      line-height: 1.45;
    }
    .portfolio-projection-panel .metric-row {
      margin-top: 12px;
    }
    .scenario-card,
    .spotlight-card {
      min-height: 100%;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(18, 27, 42, 0.96), rgba(13, 20, 31, 0.96));
    }
    .scenario-card span,
    .spotlight-card span {
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .scenario-card strong,
    .spotlight-card strong {
      display: block;
      margin: 12px 0 4px;
      font-size: 1.45rem;
      line-height: 1.05;
    }
    .scenario-card p,
    .spotlight-card p {
      margin-bottom: 0;
      color: var(--muted);
      line-height: 1.45;
    }
    .scenario-card[data-case="bear"] { border-color: rgba(239, 107, 115, 0.4); }
    .scenario-card[data-case="base"] { border-color: rgba(244, 183, 78, 0.4); }
    .scenario-card[data-case="bull"] { border-color: rgba(62, 207, 142, 0.4); }
    .portfolio-empty-card {
      padding: 16px;
      border: 1px dashed var(--line);
      border-radius: 12px;
      color: var(--muted);
      background: rgba(12, 18, 28, 0.78);
    }
    @media (max-width: 1160px) {
      .portfolio-hero-grid,
      .portfolio-dashboard-grid,
      .portfolio-scenario-grid,
      .portfolio-spotlight-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 760px) {
      .hero-card {
        min-height: 0;
        padding: 16px;
      }
      .hero-card strong {
        margin-top: 14px;
        font-size: 2rem;
      }
    }
  `;

  function injectStyles() {
    if (document.getElementById("portfolioDashboardPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "portfolioDashboardPatchStyles";
    style.textContent = patchCss;
    document.head.appendChild(style);
  }

  function normalizePatchedHolding(row) {
    const normalized = typeof normalizeSeedHolding === "function" ? normalizeSeedHolding(row || {}) : row || {};
    const quantity = Number(normalized.quantity) || 0;
    const averageCost = Number(normalized.averageCost) || 0;
    const currentPrice = Number(normalized.currentPrice) || 0;
    const initialValue = Number(normalized.initialValue) || averageCost * quantity;
    const currentValue = Number(normalized.currentValue) || currentPrice * quantity;
    const unrealizedProfit = Number(normalized.unrealizedProfit) || currentValue - initialValue;
    return {
      ...normalized,
      quantity,
      averageCost,
      initialValue,
      currentPrice,
      currentValue,
      unrealizedProfit,
      latestQuote: row?.latestQuote || normalized.latestQuote || null,
    };
  }

  function getActivePortfolioHoldings() {
    const localHoldings = Array.isArray(appState.portfolio?.holdings) ? appState.portfolio.holdings : [];
    if (localHoldings.length) return localHoldings.map(normalizePatchedHolding);
    if (Array.isArray(appState.portfolio?.trades) && appState.portfolio.trades.length) {
      return deriveHoldingsFromTrades(appState.portfolio.trades, false);
    }
    return [];
  }

  function installPortfolioLayout() {
    const status = document.getElementById("portfolioStatus");
    const syncCard = status?.nextElementSibling;
    const cards = document.getElementById("portfolioCards");
    if (!status || !syncCard || !cards) return;

    if (!document.getElementById("portfolioHero")) {
      const hero = document.createElement("div");
      hero.className = "portfolio-hero-grid";
      hero.id = "portfolioHero";
      syncCard.parentNode.insertBefore(hero, syncCard);
    }

    if (!document.getElementById("portfolioProjectionCards")) {
      const dashboard = document.createElement("div");
      dashboard.className = "portfolio-dashboard-grid";
      dashboard.innerHTML = `
        <article class="chart-card portfolio-projection-panel">
          <div class="section-heading">
            <div>
              <h2>Full Portfolio Projection</h2>
              <p class="small-muted">Runs bear, base, and bull projections across every holding and rolls them into one view.</p>
            </div>
            <button class="primary-button" id="runPortfolioProjection" type="button">Run full portfolio projection</button>
          </div>
          <p class="inline-status" id="portfolioProjectionStatus"></p>
          <div class="metric-row" id="portfolioProjectionCards"></div>
          <div class="portfolio-scenario-grid" id="portfolioProjectionScenarios"></div>
        </article>
        <article class="table-card">
          <div class="section-heading">
            <div>
              <h2>Portfolio Snapshot</h2>
              <p class="small-muted">Clean read on concentration, accounts, and the biggest movers.</p>
            </div>
          </div>
          <div class="portfolio-spotlight-grid" id="portfolioSpotlight"></div>
        </article>
      `;
      syncCard.parentNode.insertBefore(dashboard, syncCard);
    }
  }

  window.normalizeImportedTrade = function normalizeImportedTradePatched(row, index) {
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
  };

  window.portfolioPayloadFromState = function portfolioPayloadFromStatePatched() {
    ensurePortfolioDeviceId();
    const holdingsSnapshot = appState.portfolio.trades.length
      ? deriveHoldingsFromTrades(appState.portfolio.trades, false)
      : getActivePortfolioHoldings();
    return {
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      deviceId: appState.portfolio.sync.deviceId,
      trades: appState.portfolio.trades.map((trade) => ({ ...trade })),
      holdingsSnapshot,
    };
  };

  window.applyDrivePortfolioPayload = function applyDrivePortfolioPayloadPatched(payload, metadata = {}) {
    const trades = Array.isArray(payload?.trades) ? payload.trades.map(window.normalizeImportedTrade) : [];
    const remoteHoldingsSource = Array.isArray(payload?.holdingsSnapshot)
      ? payload.holdingsSnapshot
      : Array.isArray(payload?.holdings)
        ? payload.holdings
        : [];
    const remoteHoldings = remoteHoldingsSource.map(normalizePatchedHolding).filter((holding) => holding.symbol && holding.quantity > 0);
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
  };

  function renderPortfolioHero(holdings) {
    const container = document.getElementById("portfolioHero");
    if (!container) return;
    if (!holdings.length) {
      container.innerHTML = `
        <article class="hero-card">
          <span>Portfolio</span>
          <strong>$0</strong>
          <p>Import a workbook, sync from Drive, or add your first trade to light up the dashboard.</p>
        </article>
      `;
      return;
    }
    const totals = portfolioTotals(holdings);
    const totalGain = totals.unrealizedProfit + totals.realizedProfit;
    const holdingsCount = holdings.length;
    const accountsCount = new Set(holdings.map((holding) => safeText(holding.account, "Account"))).size;
    const biggestPosition = [...holdings].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0))[0];
    const totalReturn = totals.initialValue > 0 ? totalGain / totals.initialValue : 0;
    container.innerHTML = [
      ["Current value", formatDollarValue(totals.currentValue), `${holdingsCount} active holding${holdingsCount === 1 ? "" : "s"} across ${accountsCount} account${accountsCount === 1 ? "" : "s"}`],
      ["Total gain", formatDollarValue(totalGain), `${formatPercent(totalReturn)} combined realized and unrealized return`, classForValue(totalGain)],
      ["Capital at work", formatDollarValue(totals.initialValue), "Current cost basis still in open positions"],
      [
        "Top position",
        biggestPosition ? biggestPosition.symbol : "N/A",
        biggestPosition ? `${formatDollarValue(biggestPosition.currentValue || 0)} in ${safeText(biggestPosition.asset, biggestPosition.symbol)}` : "Add holdings to see concentration",
      ],
    ]
      .map(
        ([label, value, copy, extraClass = ""]) => `
          <article class="hero-card">
            <span>${label}</span>
            <strong class="${extraClass}">${value}</strong>
            <p>${copy}</p>
          </article>
        `,
      )
      .join("");
  }

  function renderPortfolioSpotlight(holdings) {
    const container = document.getElementById("portfolioSpotlight");
    if (!container) return;
    if (!holdings.length) {
      container.innerHTML = `<div class="portfolio-empty-card">No holdings yet. Once your portfolio loads, this section will call out concentration, best performers, and account exposure.</div>`;
      return;
    }
    const totals = portfolioTotals(holdings);
    const biggest = [...holdings].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0))[0];
    const bestPerformer = [...holdings].sort((a, b) => (b.unrealizedProfit || 0) - (a.unrealizedProfit || 0))[0];
    const bySector = holdings.reduce((map, holding) => {
      const key = safeText(holding.sector, "Unassigned");
      map.set(key, (map.get(key) || 0) + (holding.currentValue || 0));
      return map;
    }, new Map());
    const byAccount = holdings.reduce((map, holding) => {
      const key = safeText(holding.account, "Account");
      map.set(key, (map.get(key) || 0) + (holding.currentValue || 0));
      return map;
    }, new Map());
    const [topSector, topSectorValue] = [...bySector.entries()].sort((a, b) => b[1] - a[1])[0] || ["N/A", 0];
    const [topAccount, topAccountValue] = [...byAccount.entries()].sort((a, b) => b[1] - a[1])[0] || ["N/A", 0];
    container.innerHTML = [
      [
        "Largest position",
        biggest ? biggest.symbol : "N/A",
        biggest ? `${formatPercent(totals.currentValue ? (biggest.currentValue || 0) / totals.currentValue : 0)} of the portfolio at ${formatDollarValue(biggest.currentValue || 0)}` : "No positions loaded",
      ],
      [
        "Best open winner",
        bestPerformer ? bestPerformer.symbol : "N/A",
        bestPerformer ? `${formatDollarValue(bestPerformer.unrealizedProfit || 0)} unrealized on ${safeText(bestPerformer.asset, bestPerformer.symbol)}` : "No positions loaded",
        classForValue(bestPerformer?.unrealizedProfit || 0),
      ],
      ["Top sector", topSector, `${formatPercent(totals.currentValue ? topSectorValue / totals.currentValue : 0)} of current value`],
      ["Largest account", topAccount, `${formatDollarValue(topAccountValue)} currently allocated`],
    ]
      .map(
        ([label, value, copy, extraClass = ""]) => `
          <article class="spotlight-card">
            <span>${label}</span>
            <strong class="${extraClass}">${value}</strong>
            <p>${copy}</p>
          </article>
        `,
      )
      .join("");
  }

  function calculatePortfolioProjectionFromQuotes(holdings, quoteMap) {
    const input = readProjectionInputs();
    const years = Math.max(1, input.years || 1);
    const cases = scenarioConfig.map((scenario) => ({
      ...scenario,
      growth: Number(input.cases[scenario.key]?.growth) || 0,
      pe: Number(input.cases[scenario.key]?.pe) || 0,
    }));
    const enriched = holdings.map((holding) => {
      const quote = quoteMap.get(holding.symbol) || holding.latestQuote || {};
      const price = Number(quote.price) || Number(holding.currentPrice) || Number(holding.averageCost) || 0;
      const eps = Number(quote.eps) || 0;
      const currentValue = price * (holding.quantity || 0);
      const scenarioValues = Object.fromEntries(
        cases.map((scenario) => {
          const futureEps = eps > 0 ? eps * Math.pow(1 + scenario.growth, years) : 0;
          const futurePrice = futureEps > 0 ? futureEps * scenario.pe : 0;
          return [scenario.key, futurePrice * (holding.quantity || 0)];
        }),
      );
      return {
        ...holding,
        currentPrice: price,
        currentValue,
        eps,
        scenarioValues,
        hasProjectionData: eps > 0,
      };
    });
    const projectedHoldings = enriched.filter((holding) => holding.hasProjectionData);
    const totals = portfolioTotals(enriched);
    const scenarioTotals = cases.map((scenario) => {
      const totalValue = projectedHoldings.reduce((sum, holding) => sum + (holding.scenarioValues[scenario.key] || 0), 0);
      return {
        ...scenario,
        totalValue,
        returnPct: totals.currentValue > 0 ? totalValue / totals.currentValue - 1 : 0,
        cagr: totals.currentValue > 0 && totalValue > 0 ? Math.pow(totalValue / totals.currentValue, 1 / years) - 1 : 0,
      };
    });
    const projectedCurrentValue = projectedHoldings.reduce((sum, holding) => sum + (holding.currentValue || 0), 0);
    return {
      years,
      holdings: enriched.sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0)),
      totals,
      scenarioTotals,
      projectedCurrentValue,
      coverage: totals.currentValue > 0 ? projectedCurrentValue / totals.currentValue : 0,
      missingSymbols: enriched.filter((holding) => !holding.hasProjectionData).map((holding) => holding.symbol),
    };
  }

  function renderPortfolioProjection(result = appState.portfolioProjection) {
    const cards = document.getElementById("portfolioProjectionCards");
    const scenarios = document.getElementById("portfolioProjectionScenarios");
    const status = document.getElementById("portfolioProjectionStatus");
    if (!cards || !scenarios || !status) return;
    if (!result || !result.holdings.length) {
      cards.innerHTML = "";
      scenarios.innerHTML = `<div class="portfolio-empty-card">Run the portfolio projection after your holdings load to see aggregate bear, base, and bull outcomes for the whole portfolio.</div>`;
      status.textContent = "";
      status.className = "inline-status";
      return;
    }
    const base = result.scenarioTotals.find((scenario) => scenario.key === "base");
    cards.innerHTML = [
      ["Projected coverage", formatPercent(result.coverage), `${formatDollarValue(result.projectedCurrentValue)} of ${formatDollarValue(result.totals.currentValue)} has enough data to project`],
      ["Base case value", formatDollarValue(base?.totalValue || 0), `${formatPercent(base?.returnPct || 0)} vs. current value`],
      ["Base case CAGR", formatPercent(base?.cagr || 0), `${result.years}-year annualized return`],
    ]
      .map(
        ([label, value, copy]) => `
          <article class="metric-card">
            <span>${label}</span>
            <strong>${value}</strong>
            <p>${copy}</p>
          </article>
        `,
      )
      .join("");
    scenarios.innerHTML = result.scenarioTotals
      .map((scenario) => `
        <article class="scenario-card" data-case="${scenario.key}">
          <span>${scenario.label} case</span>
          <strong>${formatDollarValue(scenario.totalValue)}</strong>
          <p>${formatPercent(scenario.returnPct)} upside and ${formatPercent(scenario.cagr)} CAGR over ${result.years} years.</p>
        </article>
      `)
      .join("");
    if (result.missingSymbols.length) {
      status.textContent = `Projected ${wholeNumber.format(result.holdings.length - result.missingSymbols.length)} of ${wholeNumber.format(result.holdings.length)} holdings. Missing EPS data for ${result.missingSymbols.join(", ")}.`;
      status.className = "inline-status value-negative";
    } else {
      status.textContent = `Projected all ${wholeNumber.format(result.holdings.length)} holdings using the current scenario assumptions from the Projection tab.`;
      status.className = "inline-status value-positive";
    }
  }

  window.renderPortfolio = function renderPortfolioPatched() {
    installPortfolioLayout();
    const holdings = getActivePortfolioHoldings();
    appState.portfolio.holdings = holdings;
    renderPortfolioHero(holdings);
    renderPortfolioCards(holdings);
    renderPortfolioSpotlight(holdings);
    renderPortfolioTrades();
    renderPortfolioHoldings();
    renderPortfolioCharts(holdings);
    renderPortfolioProjection();
    renderPortfolioSyncState();
  };

  async function refreshPortfolioQuotesPatched() {
    const holdingsBase = getActivePortfolioHoldings();
    if (!holdingsBase.length) {
      setInlineStatus("portfolioStatus", "Load or import your portfolio first.", "negative");
      renderPortfolio();
      return;
    }
    setInlineStatus("portfolioStatus", "Refreshing quotes...", "neutral");
    const quotes = await Promise.all(
      holdingsBase.map(async (holding) => {
        try {
          return await fetchStockData(holding.symbol);
        } catch {
          return null;
        }
      }),
    );
    const quoteMap = new Map();
    quotes.forEach((quote) => {
      if (quote?.symbol) quoteMap.set(quote.symbol, quote);
    });
    appState.portfolio.holdings = holdingsBase.map((holding) => {
      const quote = quoteMap.get(holding.symbol) || holding.latestQuote || {};
      const currentPrice = Number(quote.price) || Number(holding.currentPrice) || Number(holding.averageCost) || 0;
      const previousClose = Number(quote.previousClose) || currentPrice || 0;
      const currentValue = currentPrice * (holding.quantity || 0);
      const dayChange = (currentPrice - previousClose) * (holding.quantity || 0);
      const dayPercentChange = previousClose > 0 ? (currentPrice - previousClose) / previousClose : 0;
      return {
        ...holding,
        asset: holding.asset || quote.name || holding.symbol,
        sector: holding.sector || quote.sector || "Unassigned",
        currentPrice,
        currentValue,
        dayChange,
        dayPercentChange,
        unrealizedProfit: currentValue - (holding.initialValue || 0),
        latestQuote: quote,
      };
    });
    appState.portfolioProjection = null;
    queuePortfolioDriveSync();
    renderPortfolio();
    setInlineStatus("portfolioStatus", appState.driveAuth.connected ? "Portfolio quotes refreshed and queued for Drive sync." : "Portfolio quotes refreshed.", "positive");
  }

  async function runPortfolioProjectionPatched() {
    const holdings = getActivePortfolioHoldings();
    if (!holdings.length) {
      setInlineStatus("portfolioProjectionStatus", "Load your portfolio first so the projection has holdings to analyze.", "negative");
      return;
    }
    setInlineStatus("portfolioProjectionStatus", "Running projections across the full portfolio...", "neutral");
    const quotes = await Promise.all(
      holdings.map(async (holding) => {
        try {
          return await fetchStockData(holding.symbol);
        } catch {
          return null;
        }
      }),
    );
    const quoteMap = new Map();
    quotes.forEach((quote) => {
      if (quote?.symbol) quoteMap.set(quote.symbol, quote);
    });
    appState.portfolio.holdings = holdings.map((holding) => {
      const quote = quoteMap.get(holding.symbol) || holding.latestQuote || {};
      const currentPrice = Number(quote.price) || Number(holding.currentPrice) || Number(holding.averageCost) || 0;
      const previousClose = Number(quote.previousClose) || currentPrice || 0;
      const currentValue = currentPrice * (holding.quantity || 0);
      const dayChange = (currentPrice - previousClose) * (holding.quantity || 0);
      const dayPercentChange = previousClose > 0 ? (currentPrice - previousClose) / previousClose : 0;
      return {
        ...holding,
        asset: holding.asset || quote.name || holding.symbol,
        sector: holding.sector || quote.sector || "Unassigned",
        currentPrice,
        currentValue,
        dayChange,
        dayPercentChange,
        unrealizedProfit: currentValue - (holding.initialValue || 0),
        latestQuote: quote,
      };
    });
    appState.portfolioProjection = calculatePortfolioProjectionFromQuotes(appState.portfolio.holdings, quoteMap);
    queuePortfolioDriveSync();
    renderPortfolio();
  }

  function bindPatchedPortfolioEvents() {
    const refreshButton = document.getElementById("refreshPortfolioQuotes");
    if (refreshButton && !refreshButton.dataset.portfolioPatchBound) {
      refreshButton.dataset.portfolioPatchBound = "true";
      refreshButton.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          refreshPortfolioQuotesPatched().catch((error) => setInlineStatus("portfolioStatus", error.message, "negative"));
        },
        true,
      );
    }

    const projectionButton = document.getElementById("runPortfolioProjection");
    if (projectionButton && !projectionButton.dataset.portfolioPatchBound) {
      projectionButton.dataset.portfolioPatchBound = "true";
      projectionButton.addEventListener("click", () => {
        runPortfolioProjectionPatched().catch((error) => setInlineStatus("portfolioProjectionStatus", error.message, "negative"));
      });
    }

    const fileInput = document.getElementById("portfolioFileInput");
    if (fileInput && !fileInput.dataset.portfolioPatchBound) {
      fileInput.dataset.portfolioPatchBound = "true";
      fileInput.addEventListener(
        "change",
        async (event) => {
          event.stopImmediatePropagation();
          const [file] = event.target.files || [];
          if (!file) return;
          try {
            const imported = await importPortfolioWorkbook(file);
            appState.portfolio.trades = imported.trades;
            appState.portfolio.holdings = imported.trades.length
              ? deriveHoldingsFromTrades(imported.trades, false)
              : imported.holdings.map(normalizePatchedHolding);
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
        },
        true,
      );
    }
  }

  injectStyles();
  installPortfolioLayout();
  bindPatchedPortfolioEvents();
  renderPortfolio();

  if (appState.driveAuth?.connected && !getActivePortfolioHoldings().length && typeof loadPortfolioFromDrive === "function") {
    loadPortfolioFromDrive().catch(() => {});
  }
})();

(function () {
  if (window.__compareAutoFetchPatchApplied) return;
  window.__compareAutoFetchPatchApplied = true;

  function compareTickersReady() {
    const a = document.getElementById("compareATicker")?.value?.trim();
    const b = document.getElementById("compareBTicker")?.value?.trim();
    return Boolean(a && b);
  }

  let compareFetchTimer = null;
  let compareFetchInFlight = false;
  let lastCompareFetchKey = "";

  async function autoFetchCompare(reason = "auto") {
    if (!compareTickersReady() || typeof fetchCompareTickers !== "function") return;
    const key = [
      document.getElementById("compareATicker")?.value?.trim()?.toUpperCase(),
      document.getElementById("compareBTicker")?.value?.trim()?.toUpperCase(),
    ].join("|");

    if (compareFetchInFlight || (reason === "tab" && key === lastCompareFetchKey)) {
      return;
    }

    compareFetchInFlight = true;
    try {
      await fetchCompareTickers();
      lastCompareFetchKey = key;
    } finally {
      compareFetchInFlight = false;
    }
  }

  function queueCompareFetch() {
    clearTimeout(compareFetchTimer);
    compareFetchTimer = setTimeout(() => {
      autoFetchCompare().catch(() => {});
    }, 450);
  }

  const originalActivateTab = window.activateTab;
  if (typeof originalActivateTab === "function") {
    window.activateTab = function patchedCompareActivateTab(tabId) {
      originalActivateTab(tabId);
      if (tabId === "compare") {
        autoFetchCompare("tab").catch(() => {});
      }
    };
  }

  ["compareATicker", "compareBTicker"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input || input.dataset.compareAutoFetchBound) return;
    input.dataset.compareAutoFetchBound = "true";
    input.addEventListener("change", queueCompareFetch);
    input.addEventListener("blur", queueCompareFetch);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        autoFetchCompare("enter").catch(() => {});
      }
    });
  });
})();

(function () {
  if (window.__compareUnifiedChartPatchApplied) return;
  window.__compareUnifiedChartPatchApplied = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function addYearsToDate(baseValue, years) {
    const date = new Date(baseValue);
    const copy = new Date(date.getTime());
    copy.setFullYear(copy.getFullYear() + years);
    return copy.getTime();
  }

  function removeManualCompareUi() {
    byId("fetchCompare")?.remove();
    byId("compareViewToggle")?.remove();
    byId("compareForwardBlock")?.remove();
    byId("compareHistoricalBlock")?.classList.add("active");

    const actions = document.querySelector("#compare .heading-actions");
    if (actions && !actions.children.length) {
      actions.remove();
    }

    const title = document.querySelector("#compare .results-panel .section-heading h2");
    const copy = document.querySelector("#compare .results-panel .section-heading .small-muted");
    const chartTitle = document.querySelector("#compareHistoricalBlock h2");
    const chartCopy = document.querySelector("#compareHistoricalBlock .small-muted");

    if (title) title.textContent = "Comparison Scoreboard";
    if (copy) copy.textContent = "Historical price action and forward projections now live on one timeline.";
    if (chartTitle) chartTitle.textContent = "Combined Price Path";
    if (chartCopy) {
      chartCopy.textContent =
        "Each stock shows normalized history first, then its forward projection continues from the latest point.";
    }
  }

  function drawCombinedCompareChart() {
    const historical = appState.compareHistorical;
    const forward = appState.compareForward;
    if (!historical?.a?.points?.length || !historical?.b?.points?.length || !Array.isArray(forward) || !forward.length) {
      return;
    }

    const histories = [
      { key: "A", color: "#4f8cff", history: historical.a, projection: forward.find((item) => item.key === "A") },
      { key: "B", color: "#3ecf8e", history: historical.b, projection: forward.find((item) => item.key === "B") },
    ].filter((item) => item.projection);

    if (!histories.length || typeof createLineChart !== "function") return;

    const datasets = histories.flatMap(({ color, history, projection }) => {
      const firstClose = history.points.find((point) => Number.isFinite(point.close))?.close || 1;
      const historySeries = history.points.map((point) => ({
        x: point.date,
        y: (point.close / firstClose) * 100,
      }));
      const anchor = historySeries[historySeries.length - 1];
      const anchorPrice = Number(projection.currentPrice) || 0;
      const projectionSeries = anchor && anchorPrice > 0
        ? [
            { x: anchor.x, y: anchor.y },
            ...projection.yearly.slice(1).map((point) => ({
              x: addYearsToDate(anchor.x, point.year),
              y: anchor.y * (point.price / anchorPrice),
            })),
          ]
        : [];

      return [
        {
          label: `${history.symbol} history`,
          borderColor: color,
          backgroundColor: `${color}22`,
          data: historySeries,
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 2.2,
        },
        {
          label: `${history.symbol} projection`,
          borderColor: color,
          backgroundColor: `${color}16`,
          borderDash: [8, 5],
          data: projectionSeries,
          pointRadius: 2,
          pointHoverRadius: 4,
          borderWidth: 2.2,
        },
      ];
    });

    createLineChart("compareHistorical", "compareHistoricalChart", {
      readoutId: "compareHistoricalReadout",
      xFormatter: (value) => formatDate(value),
      xTime: true,
      datasets,
    });

    const chart = appState.charts.compareHistorical?.chart;
    if (chart) {
      chart.options.scales.x.type = "time";
      chart.options.scales.x.time = {
        unit: "year",
        tooltipFormat: "MMM d, yyyy",
        displayFormats: {
          month: "MMM yyyy",
          year: "yyyy",
        },
      };
      chart.options.scales.y.ticks.callback = (value) => `${Number(value).toFixed(0)}`;
      chart.options.plugins.tooltip.callbacks.label = (context) =>
        `${context.dataset.label}: ${context.parsed.y.toFixed(1)} indexed`;
      chart.update("none");
    }

    setChartReadout(
      "compareHistoricalReadout",
      `${historical.a.symbol} and ${historical.b.symbol} now share one chart: normalized ${historical.a.rangeLabel} history followed by forward projection paths.`,
    );
  }

  if (typeof window.runCompare === "function") {
    const originalRunCompare = window.runCompare;
    window.runCompare = function patchedRunCompare() {
      const result = originalRunCompare.apply(this, arguments);
      drawCombinedCompareChart();
      return result;
    };
  }

  if (typeof window.loadCompareHistoricalChart === "function") {
    const originalLoadCompareHistoricalChart = window.loadCompareHistoricalChart;
    window.loadCompareHistoricalChart = async function patchedLoadCompareHistoricalChart(range = "5y") {
      const result = await originalLoadCompareHistoricalChart.apply(this, arguments);
      drawCombinedCompareChart();
      return result;
    };
  }

  if (typeof window.fetchCompareTickers === "function") {
    window.fetchCompareTickers = async function patchedFetchCompareTickers() {
      try {
        const [a, b] = await Promise.all([
          fetchStockData(byId("compareATicker")?.value),
          fetchStockData(byId("compareBTicker")?.value),
        ]);

        fillCompareSlot("A", a);
        fillCompareSlot("B", b);
        await loadCompareHistoricalChart(appState.compareHistoryRange);
        setDataStatus("Compare data loaded");
        runCompare();
      } catch (error) {
        setDataStatus("Compare fetch failed");
        throw error;
      }
    };
  }

  if (typeof window.toggleCompareView === "function") {
    window.toggleCompareView = function patchedToggleCompareView() {
      byId("compareHistoricalBlock")?.classList.add("active");
      resizeVisibleCharts();
    };
  }

  removeManualCompareUi();
  setTimeout(removeManualCompareUi, 0);
})();
