(function () {
  if (window.__compareCombinedPanPatchApplied) return;
  window.__compareCombinedPanPatchApplied = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function addYearsToDate(baseValue, years) {
    const date = new Date(baseValue);
    const copy = new Date(date.getTime());
    copy.setFullYear(copy.getFullYear() + years);
    return copy.getTime();
  }

  function toTimestamp(value) {
    if (typeof value === "number") return value;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : Date.now();
  }

  function forceComparePanMode() {
    const modeGroup = document.querySelector('[data-chart-mode-target="compareHistorical"]');
    if (modeGroup) {
      modeGroup.innerHTML = '<button class="segmented-button active" type="button" data-mode="pan">Pan</button>';
      modeGroup.onclick = () => updateChartMode("compareHistorical", "pan");
    }
    updateChartMode("compareHistorical", "pan");
  }

  function normalizeCompareUi() {
    byId("compareViewToggle")?.remove();
    byId("compareForwardBlock")?.remove();
    byId("compareHistoricalBlock")?.classList.add("active");

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

    forceComparePanMode();
  }

  function drawCombinedCompareChart() {
    const historical = appState.compareHistorical;
    const forward = appState.compareForward;
    if (!historical?.a?.points?.length || !historical?.b?.points?.length || !Array.isArray(forward) || !forward.length) {
      return;
    }

    const histories = [
      { color: "#4f8cff", history: historical.a, projection: forward.find((item) => item.key === "A") },
      { color: "#3ecf8e", history: historical.b, projection: forward.find((item) => item.key === "B") },
    ].filter((item) => item.projection);

    if (!histories.length || typeof createLineChart !== "function") return;

    const datasets = histories.flatMap(({ color, history, projection }) => {
      const firstClose = history.points.find((point) => Number.isFinite(point.close))?.close || 1;
      const historySeries = history.points.map((point) => ({
        x: toTimestamp(point.date),
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
          backgroundColor: `${color}1f`,
          borderDash: [8, 5],
          data: projectionSeries,
          pointRadius: 0,
          pointHitRadius: 18,
          pointHoverRadius: 5,
          borderWidth: 2.8,
        },
      ];
    });

    createLineChart("compareHistorical", "compareHistoricalChart", {
      readoutId: "compareHistoricalReadout",
      xFormatter: (value) => formatDate(value),
      xTime: true,
      mode: "pan",
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

    forceComparePanMode();
    setChartReadout(
      "compareHistoricalReadout",
      `${historical.a.symbol} and ${historical.b.symbol} now share one chart: normalized ${historical.a.rangeLabel} history followed by forward projection paths.`,
    );
  }

  function renderCompareCards(stocks) {
    const compareCards = byId("compareCards");
    if (!compareCards) return;
    compareCards.innerHTML = stocks
      .map(
        (stock) => `
          <article class="metric-card">
            <span>${stock.label}</span>
            <strong>${formatDollarValue(stock.terminal)}</strong>
            <p>${formatPercent(stock.cagr)} annualized, ${stock.returnMultiple.toFixed(2)}x ending value</p>
          </article>
        `,
      )
      .join("");
  }

  const originalRunCompare = typeof window.runCompare === "function" ? window.runCompare : null;
  if (originalRunCompare) {
    const patchedRunCompare = function patchedRunCompare() {
      const result = typeof buildCompareProjectionData === "function" ? buildCompareProjectionData() : originalRunCompare();
      appState.compareForward = Array.isArray(result) ? result : appState.compareForward;
      if (Array.isArray(appState.compareForward)) {
        renderCompareCards(appState.compareForward);
      }
      drawCombinedCompareChart();
      return result;
    };
    window.runCompare = patchedRunCompare;
    runCompare = patchedRunCompare;
  }

  const originalLoadCompareHistoricalChart =
    typeof window.loadCompareHistoricalChart === "function" ? window.loadCompareHistoricalChart : null;
  if (originalLoadCompareHistoricalChart) {
    const patchedLoadCompareHistoricalChart = async function patchedLoadCompareHistoricalChart(range = "5y") {
      const result = await originalLoadCompareHistoricalChart.apply(this, arguments);
      drawCombinedCompareChart();
      return result;
    };
    window.loadCompareHistoricalChart = patchedLoadCompareHistoricalChart;
    loadCompareHistoricalChart = patchedLoadCompareHistoricalChart;
  }

  if (typeof window.toggleCompareView === "function") {
    const patchedToggleCompareView = function patchedToggleCompareView() {
      byId("compareHistoricalBlock")?.classList.add("active");
      resizeVisibleCharts();
    };
    window.toggleCompareView = patchedToggleCompareView;
    toggleCompareView = patchedToggleCompareView;
  }

  normalizeCompareUi();
  setTimeout(() => {
    normalizeCompareUi();
    drawCombinedCompareChart();
  }, 0);
})();
