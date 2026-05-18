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

  function ensureCompareMeasureMode() {
    const modeGroup = document.querySelector('[data-chart-mode-target="compareHistorical"]');
    if (modeGroup) {
      modeGroup.innerHTML = '<button class="segmented-button active" type="button" data-mode="measure">Measure</button>';
      modeGroup.onclick = () => updateChartMode("compareHistorical", "measure");
    }
    updateChartMode("compareHistorical", "measure");
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

    ensureCompareMeasureMode();
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
      const historySeries = history.points.map((point) => ({
        x: toTimestamp(point.date),
        y: Number(point.close) || 0,
      }));
      const anchor = historySeries[historySeries.length - 1];
      const anchorPrice = Number.isFinite(anchor?.y) ? anchor.y : Number(projection.currentPrice) || 0;
      const projectionSeries = anchor && anchorPrice > 0
        ? [
            { x: anchor.x, y: anchorPrice },
            ...projection.yearly.slice(1).map((point) => ({
              x: addYearsToDate(anchor.x, point.year),
              y: Number(point.price) || 0,
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
          pointRadius: 2,
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
      chart.options.scales.y.ticks.callback = (value) => `${Number(value).toFixed(0)}`;
      chart.options.plugins.tooltip.callbacks.label = (context) =>
        `${context.dataset.label}: ${formatDollarValue(context.parsed.y)}`;
      chart.update("none");
    }

    ensureCompareMeasureMode();
    setChartReadout(
      "compareHistoricalReadout",
      `${historical.a.symbol} and ${historical.b.symbol} now share one chart: ${historical.a.rangeLabel} price history followed by dashed forward projection paths.`,
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
        color: index === 0 ? "#4f8cff" : "#3ecf8e",
        yearly,
        terminal,
        cagr: price > 0 && terminal > 0 ? Math.pow(terminal / price, 1 / years) - 1 : 0,
        returnMultiple: price > 0 ? terminal / price : 0,
        currentPrice: price,
      };
    });
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

  function bindCompareButton(buttonId, handler) {
    const button = byId(buttonId);
    if (!button || !button.parentNode) return;
    const replacement = button.cloneNode(true);
    button.parentNode.replaceChild(replacement, button);
    replacement.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        void handler(event);
      },
      true,
    );
  }

  function wireCompareActions() {
    bindCompareButton("fetchCompare", async () => {
      const button = byId("fetchCompare");
      if (button) {
        button.disabled = true;
        button.textContent = "Fetching...";
      }

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
              pe: Number.isFinite(a?.peTtm) ? a.peTtm : current.slots.A.pe,
            },
            B: {
              ...current.slots.B,
              ticker: b?.symbol || current.slots.B.ticker,
              price: Number.isFinite(b?.price) ? b.price : current.slots.B.price,
              eps: Number.isFinite(b?.eps) ? b.eps : current.slots.B.eps,
              pe: Number.isFinite(b?.peTtm) ? b.peTtm : current.slots.B.pe,
            },
          },
        };

        applyCompareSnapshot(nextSnapshot);

        if (typeof loadCompareHistoricalChart === "function") {
          await loadCompareHistoricalChart(appState.compareHistoryRange || "5y");
        }
        if (typeof setDataStatus === "function") {
          setDataStatus("Compare data loaded");
        }
        const result = buildCompareProjectionDataPatched(nextSnapshot);
        appState.compareForward = result;
        renderCompareCards(result);
        drawCombinedCompareChart();
      } catch (error) {
        if (typeof setDataStatus === "function") {
          setDataStatus("Compare fetch failed");
        }
        alert(error.message || "Could not fetch compare data.");
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = "Fetch A & B";
        }
      }
    });

    bindCompareButton("runCompare", async () => {
      if (typeof runCompare === "function") {
        runCompare();
      }
      if (typeof loadCompareHistoricalChart === "function") {
        await loadCompareHistoricalChart(appState.compareHistoryRange || "5y").catch(() => {});
      }
    });

    bindCompareButton("useCurrentForA", () => {
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
    });
  }

  normalizeCompareUi();
  wireCompareActions();
  setTimeout(() => {
    normalizeCompareUi();
    wireCompareActions();
    drawCombinedCompareChart();
  }, 0);
})();
