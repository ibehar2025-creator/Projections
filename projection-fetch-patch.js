(function () {
  if (window.__projectionFetchPatchApplied) return;
  window.__projectionFetchPatchApplied = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function hasExampleTickerText(node) {
    return Boolean(node && /AAPL|MSFT|Apple|Microsoft/i.test(node.textContent || ""));
  }

  function setProjectionReadout(message) {
    if (typeof setChartReadout === "function") {
      setChartReadout("projectionForwardReadout", message);
      return;
    }
    const readout = byId("projectionForwardReadout");
    if (readout) readout.textContent = message;
  }

  function clearExampleTickerUi() {
    [
      ["ticker", "Enter ticker"],
      ["compareATicker", "Ticker"],
      ["compareBTicker", "Ticker"],
    ].forEach(([id, placeholder]) => {
      const input = byId(id);
      if (!input) return;
      const current = String(input.value || "").trim().toUpperCase();
      const attrValue = String(input.getAttribute("value") || "").trim().toUpperCase();
      const attrPlaceholder = String(input.getAttribute("placeholder") || "").trim().toUpperCase();
      if (["AAPL", "MSFT"].includes(current) || ["AAPL", "MSFT"].includes(attrValue)) {
        input.value = "";
        input.defaultValue = "";
        input.removeAttribute("value");
      }
      if (["AAPL", "MSFT"].includes(attrPlaceholder)) {
        input.placeholder = placeholder;
        input.setAttribute("placeholder", placeholder);
      }
    });

    const stockCard = byId("stockDataCard");
    if (hasExampleTickerText(stockCard)) {
      stockCard.innerHTML = "<strong>Live data not loaded yet.</strong><p>Enter a ticker and fetch market data to fill the projection inputs automatically.</p>";
    }

    const projectionCards = byId("projectionCards");
    const projectionDetails = byId("projectionDetails");
    if (hasExampleTickerText(projectionCards)) projectionCards.innerHTML = "";
    if (hasExampleTickerText(projectionDetails)) projectionDetails.innerHTML = "";

    const projectionReadout = byId("projectionForwardReadout");
    if (hasExampleTickerText(projectionReadout)) {
      projectionReadout.textContent = "Enter a ticker and fetch live data to load the price path.";
    }

    const compareCards = byId("compareCards");
    if (hasExampleTickerText(compareCards)) compareCards.innerHTML = "";

    const compareHistoricalReadout = byId("compareHistoricalReadout");
    const compareForwardReadout = byId("compareForwardReadout");
    if (hasExampleTickerText(compareHistoricalReadout)) {
      compareHistoricalReadout.textContent = "Enter two tickers and fetch A & B to load the comparison.";
    }
    if (hasExampleTickerText(compareForwardReadout)) {
      compareForwardReadout.textContent = "Forward comparison details will appear here.";
    }
  }

  async function runProjectionSafely({ fetchHistory = true } = {}) {
    if (typeof runProjection !== "function") return;

    const ticker = String(byId("ticker")?.value || "").trim().toUpperCase();
    runProjection();

    if (!fetchHistory || !ticker || typeof loadProjectionHistoricalChart !== "function") {
      setProjectionReadout(ticker ? "Projection updated. Fetch live data to refresh the price path." : "Projection updated. Enter a ticker and fetch live data to load the price path.");
      return;
    }

    try {
      await loadProjectionHistoricalChart(ticker, appState?.projectionHistoryRange || "5y");
    } catch (error) {
      setProjectionReadout(error.message || "Projection updated, but price history could not load.");
    }
  }

  function bindProjectionRun() {
    const form = byId("projectionForm");
    const button =
      form?.querySelector('button[type="submit"]') ||
      [...document.querySelectorAll("#projection button")].find((candidate) => candidate.textContent.trim() === "Run projection");

    if (form && form.dataset.projectionRunPatchBound !== "true") {
      form.dataset.projectionRunPatchBound = "true";
      form.addEventListener(
        "submit",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          void runProjectionSafely();
        },
        true,
      );
    }

    if (button && button.dataset.projectionRunPatchBound !== "true") {
      button.dataset.projectionRunPatchBound = "true";
      button.type = "button";
      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          void runProjectionSafely();
        },
        true,
      );
    }
  }

  function bindProjectionFetch() {
    const button = byId("fetchTicker");
    if (!button || !button.parentNode || button.dataset.projectionFetchPatchBound === "true") return;

    button.dataset.projectionFetchPatchBound = "true";
    button.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        button.disabled = true;
        button.textContent = "Fetching...";
        if (typeof setDataStatus === "function") {
          setDataStatus("Fetching live data");
        }

        try {
          const ticker = byId("ticker")?.value;
          const data = await fetchStockData(ticker);
          if (typeof applyStockDataToProjection === "function") {
            applyStockDataToProjection(data);
          }
          await runProjectionSafely({ fetchHistory: false });
          if (typeof loadProjectionHistoricalChart === "function") {
            await loadProjectionHistoricalChart(data.symbol, appState?.projectionHistoryRange || "5y");
          }
        } catch (error) {
          if (typeof setDataStatus === "function") {
            setDataStatus("Data unavailable");
          }
          const card = byId("stockDataCard");
          if (card) {
            card.innerHTML = `<strong>Could not load data.</strong><p>${error.message || "Request failed."}</p>`;
          }
        } finally {
          button.disabled = false;
          button.textContent = "Fetch live data";
        }
      },
      true,
    );
  }

  function bootstrapProjectionPatch() {
    clearExampleTickerUi();
    bindProjectionRun();
    bindProjectionFetch();
  }

  bootstrapProjectionPatch();
  setTimeout(bootstrapProjectionPatch, 0);
  setTimeout(bootstrapProjectionPatch, 500);
  setTimeout(bootstrapProjectionPatch, 1500);
  setTimeout(bootstrapProjectionPatch, 3000);
})();
