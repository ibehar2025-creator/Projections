(function () {
  if (window.__compareCombinedPanPatchApplied) return;
  window.__compareCombinedPanPatchApplied = true;

  const compareColors = ["#4f8cff", "#3ecf8e"];

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

  function buttonText(button) {
    return String(button?.textContent || "").trim();
  }

  function findCompareButton(label, id) {
    return (
      (id ? byId(id) : null) ||
      [...document.querySelectorAll("#compare button")].find((button) => buttonText(button) === label) ||
      null
    );
  }

  function ensureFetchCompareButton() {
    let button = findCompareButton("Fetch A & B", "fetchCompare") || byId("fetchCompareVisible");
    if (button) return button;

    const actions = document.querySelector("#compare .heading-actions") || document.querySelector("#compare .button-row");
    if (!actions) return null;

    button = document.createElement("button");
    button.className = "ghost-button";
    button.id = "fetchCompareVisible";
    button.type = "button";
    button.textContent = "Fetch A & B";
    actions.prepend(button);
    return button;
  }

  function ensureCompareMeasureMode() {
    const modeGroup = document.querySelector('[data-chart-mode-target="compareHistorical"]');
    if (modeGroup) {
      modeGroup.innerHTML = '<button class="segmented-button active" type="button" data-mode="measure">Measure</button>';
      modeGroup.onclick = () => {
        if (typeof updateChartMode === "function") updateChartMode("compareHistorical", "measure");
      };
    }
    if (typeof updateChartMode === "function") updateChartMode("compareHistorical", "measure");
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
    if (copy) copy.textContent = "Historical prices and forward projections now live on one timeline.";
    if (chartTitle) chartTitle.textContent = "Price Path";
    if (chartCopy) {
      chartCopy.textContent =
        "Each stock shows actual price history first, then its dashed forward projection continues from the latest point.";
    }

    ensureFetchCompareButton();
    ensureCompareMeasureMode();
  }

  function normalizeHistoricalSeries(historical = appState.compareHistorical) {
    if (!historical) return [];

    if (Array.isArray(historical.series)) {
      return historical.series
        .map((series, index) => ({
          key: index === 0 ? "A" : "B",
          color: compareColors[index % compareColors.length],
          history: {
            symbol: series.symbol || historical.symbols?.[index] || `Stock ${index + 1}`,
            rangeLabel: series.rangeLabel || String(series.range || historical.range || "5y").toUpperCase(),
            points: Array.isArray(series.points) ? series.points : [],
          },
        }))
        .filter((item) => item.history.points.length);
    }

    return [
      { key: "A", color: compareColors[0], history: historical.a },
      { key: "B", color: compareColors[1], history: historical.b },
    ].filter((item) => item.history?.points?.length);
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

  function readCompareSnapshot() {
    return {
      years: Math.max(1, Math.min(15, Number(byId("compareYears")?.value) || 5)),
      slots: {
        A: {
          ticker: byId("compareATicker")?.value?.trim().toUpperCase() || "STOCK A",
          price: Number(byId("compareAPrice")?.value) || 0,
          eps: Number(byId("compareAEps")?.value) || 0,
          growth: (Number(byId("compareAGrowth")?.value) || 0) / 100,
          pe: Number(byId("compareAPe")?.value) || 0,
        },
        B: {
          ticker: byId("compareBTicker")?.value?.trim().toUpperCase() || "STOCK B",
          price: Number(byId("compareBPrice")?.value) || 0,
          eps: Number(byId("compareBEps")?.value) || 0,
          growth: (Number(byId("compareBGrowth")?.value) || 0) / 100,
          pe: Number(byId("compareBPe")?.value) || 0,
        },
      },
    };
  }

  function applyCompareSnapshot(snapshot) {
    if (!snapshot?.slots) return;
    if (byId("compareYears")) byId("compareYears").value = snapshot.years;
    ["A", "B"].forEach((slot) => {
      const item = snapshot.slots[slot];
      if (!item) return;
      if (byId(`compare${slot}Ticker`)) byId(`compare${slot}Ticker`).value = item.ticker;
      if (byId(`compare${slot}Price`)) byId(`compare${slot}Price`).value = item.price;
      if (byId(`compare${slot}Eps`)) byId(`compare${slot}Eps`).value = item.eps;
      if (byId(`compare${slot}Growth`)) byId(`compare${slot}Growth`).value = (item.growth * 100).toFixed(1);
      if (byId(`compare${slot}Pe`)) byId(`compare${slot}Pe`).value = item.pe;
    });
  }

  function buildCompareProjectionDataPatched(snapshot = readCompareSnapshot()) {
    const years = snapshot.years;
    return ["A", "B"].map((slot, index) => {
      const source = snapshot.slots[slot] || {};
      const ticker = source.ticker || `STOCK ${slot}`;
      const price = Number(source.price) || 0;
      const eps = Number(source.eps) || 0;
      const growth = Number(source.growth) || 0;
      const pe = Number(source.pe) || 0;
      const yearly = [];

      for (let year = 0; year <= years; year += 1) {
        const futureEps = eps * Math.pow(1 + growth, year);
        const futurePrice = futureEps * pe;
        yearly.push({
          x: year,
          y: futurePrice,
          year,
          price: futurePrice,
        });
      }

      const terminal = yearly[yearly.length - 1]?.price || 0;
      return {
        key: slot,
        label: ticker,
        color: compareColors[index % compareColors.length],
        yearly,
        terminal,
        cagr: price > 0 && terminal > 0 ? Math.pow(terminal / price, 1 / years) - 1 : 0,
        returnMultiple: price > 0 ? terminal / price : 0,
        currentPrice: price,
      };
    });
  }

  function ensureCompareForward() {
    if (!Array.isArray(appState.compareForward) || !appState.compareForward.length) {
      appState.compareForward = buildCompareProjectionDataPatched();
    }
    return appState.compareForward;
  }

  function projectionForHistory(forward, slotKey, symbol, index) {
    const normalizedSymbol = String(symbol || "").toUpperCase();
    return (
      forward.find((item) => item.key === slotKey) ||
      forward.find((item) => String(item.label || "").toUpperCase() === normalizedSymbol) ||
      forward[index]
    );
  }

  function drawCombinedCompareChart() {
    const histories = normalizeHistoricalSeries();
    const forward = ensureCompareForward();
    if (histories.length < 2 || !Array.isArray(forward) || !forward.length || typeof createLineChart !== "function") {
      return false;
    }

    const datasets = histories.flatMap(({ key, color, history }, index) => {
      const projection = projectionForHistory(forward, key, history.symbol, index);
      if (!projection?.yearly?.length) return [];

      const historySeries = history.points
        .map((point) => ({
          x: toTimestamp(point.date),
          y: Number(point.close) || 0,
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
      const anchor = historySeries[historySeries.length - 1];
      const anchorPrice = Number.isFinite(anchor?.y) ? anchor.y : Number(projection.currentPrice) || 0;
      const projectionSeries = anchor && anchorPrice > 0
        ? [
            { x: anchor.x, y: anchorPrice },
            ...projection.yearly.slice(1).map((point) => ({
              x: addYearsToDate(anchor.x, point.year),
              y: Number(point.price ?? point.y) || 0,
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
          fill: false,
        },
        {
          label: `${history.symbol} future projection`,
          borderColor: color,
          backgroundColor: `${color}1f`,
          borderDash: [8, 5],
          data: projectionSeries,
          pointRadius: 2,
          pointHitRadius: 18,
          pointHoverRadius: 5,
          borderWidth: 2.8,
          fill: false,
        },
      ];
    });

    if (datasets.length < 4) return false;

    createLineChart("compareHistorical", "compareHistoricalChart", {
      readoutId: "compareHistoricalReadout",
      xFormatter: (value) => formatDate(value),
      xTime: true,
      mode: "measure",
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
      chart.options.scales.y.title = { display: true, text: "Share price" };
      chart.options.scales.y.ticks.callback = (value) => `${Number(value).toFixed(0)}`;
      chart.options.plugins.tooltip.callbacks.label = (context) =>
        `${context.dataset.label}: ${formatDollarValue(context.parsed.y)}`;
      chart.update("none");
    }

    ensureCompareMeasureMode();
    const [first, second] = histories;
    const rangeLabel = first.history.rangeLabel || second.history.rangeLabel || "selected range";
    setChartReadout(
      "compareHistoricalReadout",
      `${first.history.symbol} and ${second.history.symbol} now share one chart: ${rangeLabel} price history plus dashed future projection paths.`,
    );
    return true;
  }

  if (typeof window.runCompare === "function") {
    const patchedRunCompare = function patchedRunCompare() {
      const result = buildCompareProjectionDataPatched();
      appState.compareForward = result;
      renderCompareCards(result);
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

  function bindCompareButton(button, handler) {
    if (!button || !button.parentNode || button.dataset.compareCombinedBound === "true") return;
    button.dataset.compareCombinedBound = "true";
    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        void handler(event);
      },
      true,
    );
  }

  function setFetchBusy(isBusy) {
    [ensureFetchCompareButton(), byId("fetchCompare"), byId("fetchCompareVisible")]
      .filter(Boolean)
      .forEach((button) => {
        button.disabled = isBusy;
        button.textContent = isBusy ? "Fetching..." : "Fetch A & B";
      });
  }

  function wireCompareActions() {
    const fetchCompareHandler = async () => {
      setFetchBusy(true);

      try {
        const current = readCompareSnapshot();
        const [a, b] = await Promise.all([
          fetchStockData(byId("compareATicker")?.value),
          fetchStockData(byId("compareBTicker")?.value),
        ]);

        const nextSnapshot = {
          years: current.years,
          slots: {
            A: {
              ...current.slots.A,
              ticker: a?.symbol || current.slots.A.ticker,
              price: Number.isFinite(a?.price) ? a.price : current.slots.A.price,
              eps: Number.isFinite(a?.eps) ? a.eps : current.slots.A.eps,
              growth: Number.isFinite(a?.estimatedGrowth) ? a.estimatedGrowth / 100 : current.slots.A.growth,
              pe: Number.isFinite(a?.peTtm) ? a.peTtm : current.slots.A.pe,
            },
            B: {
              ...current.slots.B,
              ticker: b?.symbol || current.slots.B.ticker,
              price: Number.isFinite(b?.price) ? b.price : current.slots.B.price,
              eps: Number.isFinite(b?.eps) ? b.eps : current.slots.B.eps,
              growth: Number.isFinite(b?.estimatedGrowth) ? b.estimatedGrowth / 100 : current.slots.B.growth,
              pe: Number.isFinite(b?.peTtm) ? b.peTtm : current.slots.B.pe,
            },
          },
        };

        applyCompareSnapshot(nextSnapshot);
        const result = buildCompareProjectionDataPatched(nextSnapshot);
        appState.compareForward = result;
        renderCompareCards(result);

        if (typeof loadCompareHistoricalChart === "function") {
          await loadCompareHistoricalChart(appState.compareHistoryRange || "5y");
        }
        drawCombinedCompareChart();
        if (typeof setDataStatus === "function") {
          setDataStatus("Compare data loaded");
        }
      } catch (error) {
        if (typeof setDataStatus === "function") {
          setDataStatus("Compare fetch failed");
        }
        setChartReadout("compareHistoricalReadout", error.message || "Could not fetch live comparison data.");
      } finally {
        setFetchBusy(false);
      }
    };

    bindCompareButton(ensureFetchCompareButton(), fetchCompareHandler);

    bindCompareButton(byId("runCompare"), async () => {
      if (typeof runCompare === "function") {
        runCompare();
      }
      if (typeof loadCompareHistoricalChart === "function") {
        await loadCompareHistoricalChart(appState.compareHistoryRange || "5y").catch(() => {});
      }
      drawCombinedCompareChart();
    });

    bindCompareButton(byId("useCurrentForA"), () => {
      if (typeof readProjectionInputs !== "function") return;
      const input = readProjectionInputs();
      if (byId("compareATicker")) byId("compareATicker").value = input.ticker;
      if (byId("compareAPrice")) byId("compareAPrice").value = input.currentPrice;
      if (byId("compareAEps")) byId("compareAEps").value = input.eps;
      if (byId("compareAGrowth")) byId("compareAGrowth").value = (input.cases.base.growth * 100).toFixed(1);
      if (byId("compareAPe")) byId("compareAPe").value = input.cases.base.pe;
      if (typeof runCompare === "function") {
        runCompare();
      }
      drawCombinedCompareChart();
    });
  }

  normalizeCompareUi();
  wireCompareActions();
  setTimeout(() => {
    normalizeCompareUi();
    wireCompareActions();
    drawCombinedCompareChart();
  }, 0);
  setTimeout(drawCombinedCompareChart, 800);
})();
