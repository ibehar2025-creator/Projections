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

    createLineChart("projectionForward", "projectionForwardChart", {
      readoutId: "projectionForwardReadout",
      xFormatter: (value) => formatDate(value),
      xTime: true,
      datasets,
    });

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
