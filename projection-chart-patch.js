(function () {
  if (window.__stockLabRuntimePatchApplied) return;
  window.__stockLabRuntimePatchApplied = true;

  const innerHtmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  const blockedTags = "script,iframe,object,embed,link,meta,base";
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
  const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    const span = document.createElement("span");
    span.textContent = String(value ?? "");
    return span.innerHTML;
  }

  function sanitizeHtml(value) {
    const template = document.createElement("template");
    innerHtmlDescriptor.set.call(template, String(value ?? ""));
    template.content.querySelectorAll(blockedTags).forEach((node) => node.remove());
    template.content.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const attrValue = String(attribute.value || "").trim().toLowerCase();
        const unsafeUrl = ["href", "src", "xlink:href"].includes(name) && attrValue.startsWith("javascript:");
        if (name.startsWith("on") || unsafeUrl) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return innerHtmlDescriptor.get.call(template);
  }

  if (innerHtmlDescriptor?.get && innerHtmlDescriptor?.set) {
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: true,
      enumerable: innerHtmlDescriptor.enumerable,
      get() {
        return innerHtmlDescriptor.get.call(this);
      },
      set(value) {
        innerHtmlDescriptor.set.call(this, sanitizeHtml(value));
      },
    });
  }

  function addYearsToDate(baseValue, years) {
    const date = new Date(baseValue);
    const copy = new Date(date.getTime());
    copy.setFullYear(copy.getFullYear() + years);
    return copy.getTime();
  }

  function classForValue(value) {
    if (!Number.isFinite(value) || value === 0) return "";
    return value > 0 ? "value-positive" : "value-negative";
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

  function metricCard(label, value, copy, toneClass) {
    return `
      <article class="metric-card ${toneClass || ""}">
        <span>${escapeHtml(label)}</span>
        <strong>${value}</strong>
        <p>${escapeHtml(copy)}</p>
      </article>
    `;
  }

  function getHoldings() {
    try {
      return Array.isArray(appState?.portfolio?.holdings) ? appState.portfolio.holdings : [];
    } catch {
      return [];
    }
  }

  function normalizeImportedHoldingsForTrades(holdings) {
    return holdings.map((holding, index) => ({
      Date: new Date().toISOString().slice(0, 10),
      Symbol: holding.symbol || holding.Symbol || "",
      Asset: holding.asset || holding.Asset || "",
      Sector: holding.sector || holding.Sector || "Unassigned",
      Side: "buy",
      Quantity: Number(holding.quantity ?? holding.Quantity) || 0,
      "Trade Price": Number(holding.averageCost ?? holding["Average Cost"] ?? holding.currentPrice ?? holding["Current Price"]) || 0,
      Fees: 0,
      Account: holding.account || holding.Account || "Primary",
      Notes: `holding_import_${index + 1}`,
    }));
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
      .compare-layout {
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      }
      .portfolio-grid {
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      }
      .portfolio-hero-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .portfolio-dashboard-grid {
        grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
      }
      .portfolio-spotlight-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
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
    if (compareSubcopy) {
      compareSubcopy.textContent = "Compare both names side by side without the extra clutter.";
    }
  }

  function installProjectionCleanup() {
    const historicalCard = byId("projectionHistoricalChart")?.closest(".chart-card");
    if (historicalCard) {
      historicalCard.style.display = "none";
    }
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
    installRangeButtons();
  }

  function drawUnifiedProjectionChart(result, history) {
    const lastHistoryPoint = history?.points?.[history.points.length - 1];
    if (!lastHistoryPoint || typeof createLineChart !== "function") {
      if (typeof drawProjectionForwardChart === "function") {
        drawProjectionForwardChart(result);
      }
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
      xType: "time",
      xTitle: "Date",
      yTitle: "Share price",
      readoutFormatter: (context) => `${context.dataset.label}: ${formatDollarValue(context.parsed.y)}`,
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

    if (typeof setChartReadout === "function") {
      setChartReadout(
        "projectionForwardReadout",
        `${history.symbol} ${history.rangeLabel} history and forward scenarios loaded on one timeline.`,
      );
    }
  }

  function renderPortfolioEnhancements() {
    const holdings = getHoldings();
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
        metricCard("Market value", money.format(totalValue), `${holdings.length} active holding${holdings.length === 1 ? "" : "s"}`),
        metricCard("Cost basis", money.format(totalCost), "Capital currently deployed"),
        metricCard("Day change", money.format(dayChange), "Move versus previous close", classForValue(dayChange)),
        metricCard("Largest position", escapeHtml(largest?.symbol || "N/A"), largest ? money.format(largest.currentValue || 0) : "No holdings"),
      ].join("");
    }

    if (spotlight) {
      const biggestMover = holdings.reduce((best, holding) => {
        const currentMove = Math.abs(Number(holding.dayChange) || 0);
        const bestMove = Math.abs(Number(best?.dayChange) || 0);
        return currentMove > bestMove ? holding : best;
      }, null);
      const sectors = new Map();
      holdings.forEach((holding) => {
        const sector = holding.sector || "Unassigned";
        sectors.set(sector, (sectors.get(sector) || 0) + (Number(holding.currentValue) || 0));
      });
      const [topSector = "Unassigned", topSectorValue = 0] = [...sectors.entries()].sort((a, b) => b[1] - a[1])[0] || [];
      spotlight.innerHTML = [
        metricCard("Concentration", escapeHtml(largest?.symbol || "N/A"), largest && totalValue > 0 ? `${percent.format((largest.currentValue || 0) / totalValue)} of portfolio` : "No current value yet"),
        metricCard("Top sector", escapeHtml(topSector), totalValue > 0 ? `${percent.format(topSectorValue / totalValue)} of portfolio` : "No current value yet"),
        metricCard("Biggest mover", escapeHtml(biggestMover?.symbol || "N/A"), biggestMover ? money.format(biggestMover.dayChange || 0) : "No quote refresh yet", biggestMover ? classForValue(biggestMover.dayChange || 0) : ""),
        metricCard("Positions", whole.format(holdings.length), "Open holdings in the trade ledger"),
      ].join("");
    }
  }

  function runPortfolioProjectionPatch() {
    const holdings = getHoldings();
    const totalValue = portfolioTotalValue(holdings);
    const years = Math.max(1, Math.min(15, Number(byId("years")?.value) || 5));
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

    const config = [
      { key: "bear", label: "Bear" },
      { key: "base", label: "Base" },
      { key: "bull", label: "Bull" },
    ];
    const projections = config.map((scenario) => {
      const growth = (Number(byId(`${scenario.key}Growth`)?.value) || 0) / 100;
      const terminalValue = totalValue * Math.pow(1 + growth, years);
      return {
        ...scenario,
        terminalValue,
        gain: terminalValue - totalValue,
        cagr: totalValue > 0 ? Math.pow(terminalValue / totalValue, 1 / years) - 1 : 0,
      };
    });

    if (cards) {
      const base = projections.find((item) => item.key === "base");
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

  function patchImportAndDriveFlows() {
    const originalImportWorkbook = window.importPortfolioWorkbook;
    if (typeof originalImportWorkbook === "function" && !window.__stockLabImportPatched) {
      window.importPortfolioWorkbook = async function patchedImportPortfolioWorkbook(file) {
        const imported = await originalImportWorkbook(file);
        if ((!imported.trades || !imported.trades.length) && Array.isArray(imported.holdings) && imported.holdings.length) {
          imported.trades = normalizeImportedHoldingsForTrades(imported.holdings);
        }
        return imported;
      };
      window.__stockLabImportPatched = true;
    }

    const originalApplyDrivePortfolioPayload = window.applyDrivePortfolioPayload;
    if (typeof originalApplyDrivePortfolioPayload === "function" && !window.__stockLabDrivePayloadPatched) {
      window.applyDrivePortfolioPayload = function patchedApplyDrivePortfolioPayload(payload, metadata) {
        const safePayload = { ...(payload || {}) };
        if ((!safePayload.trades || !safePayload.trades.length) && Array.isArray(safePayload.holdingsSnapshot) && safePayload.holdingsSnapshot.length) {
          safePayload.trades = normalizeImportedHoldingsForTrades(safePayload.holdingsSnapshot);
        }
        originalApplyDrivePortfolioPayload.call(this, safePayload, metadata);
        renderPortfolioEnhancements();
      };
      window.__stockLabDrivePayloadPatched = true;
    }

    const originalLoadPortfolioFromDrive = window.loadPortfolioFromDrive;
    if (typeof originalLoadPortfolioFromDrive === "function" && !window.__stockLabDriveLoaderPatched) {
      window.loadPortfolioFromDrive = async function patchedLoadPortfolioFromDrive(...args) {
        const result = await originalLoadPortfolioFromDrive.apply(this, args);
        const tradeCount = Array.isArray(appState?.portfolio?.trades) ? appState.portfolio.trades.length : 0;
        const holdingCount = Array.isArray(appState?.portfolio?.holdings) ? appState.portfolio.holdings.length : 0;
        if (typeof setInlineStatus === "function") {
          setInlineStatus(
            "portfolioStatus",
            `Loaded ${tradeCount} trade${tradeCount === 1 ? "" : "s"} and ${holdingCount} holding${holdingCount === 1 ? "" : "s"} from private Drive.`,
            "positive",
          );
        }
        return result;
      };
      window.__stockLabDriveLoaderPatched = true;
    }
  }

  function wrapPortfolioRender() {
    if (typeof renderPortfolio === "function" && !window.__stockLabPortfolioRenderWrapped) {
      const originalRenderPortfolio = renderPortfolio;
      window.renderPortfolio = function patchedRenderPortfolio(...args) {
        const result = originalRenderPortfolio.apply(this, args);
        ensureToolbarIsFlat();
        renderPortfolioEnhancements();
        return result;
      };
      window.__stockLabPortfolioRenderWrapped = true;
    }
  }

  function wrapProjectionRender() {
    if (typeof renderProjection === "function" && !window.__stockLabProjectionRenderWrapped) {
      const originalRenderProjection = renderProjection;
      window.renderProjection = function patchedRenderProjection(result) {
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
      window.loadProjectionHistoricalChart = async function patchedLoadProjectionHistoricalChart(symbol, range) {
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

  function bindPortfolioProjectionButton() {
    const button = byId("runPortfolioProjection");
    if (button && !button.dataset.runtimePatchBound) {
      button.dataset.runtimePatchBound = "true";
      button.addEventListener("click", runPortfolioProjectionPatch);
    }
  }

  function bootstrapPatches() {
    installCssPatch();
    installCompareCleanup();
    installProjectionCleanup();
    ensureToolbarIsFlat();
    patchImportAndDriveFlows();
    wrapPortfolioRender();
    wrapProjectionRender();
    bindPortfolioProjectionButton();
    renderPortfolioEnhancements();
    normalizeProjectionPanel();
  }

  bootstrapPatches();
  setTimeout(bootstrapPatches, 0);
})();
