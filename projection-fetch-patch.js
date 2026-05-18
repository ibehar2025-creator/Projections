(function () {
  if (window.__projectionFetchPatchApplied) return;
  window.__projectionFetchPatchApplied = true;

  function byId(id) {
    return document.getElementById(id);
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
    if (stockCard && /AAPL|MSFT|Apple|Microsoft/i.test(stockCard.textContent || "")) {
      stockCard.innerHTML = "<strong>Live data not loaded yet.</strong><p>Enter a ticker and fetch market data to fill the projection inputs automatically.</p>";
    }

    const projectionCards = byId("projectionCards");
    const projectionDetails = byId("projectionDetails");
    if (projectionCards && /AAPL|MSFT|Apple|Microsoft/i.test(projectionCards.textContent || "")) projectionCards.innerHTML = "";
    if (projectionDetails && /AAPL|MSFT|Apple|Microsoft/i.test(projectionDetails.textContent || "")) projectionDetails.innerHTML = "";

    const compareCards = byId("compareCards");
    if (compareCards && /AAPL|MSFT|Apple|Microsoft/i.test(compareCards.textContent || "")) compareCards.innerHTML = "";

    const compareHistoricalReadout = byId("compareHistoricalReadout");
    const compareForwardReadout = byId("compareForwardReadout");
    if (compareHistoricalReadout && /AAPL|MSFT|Apple|Microsoft/i.test(compareHistoricalReadout.textContent || "")) {
      compareHistoricalReadout.textContent = "Enter two tickers and fetch A & B to load the comparison.";
    }
    if (compareForwardReadout && /AAPL|MSFT|Apple|Microsoft/i.test(compareForwardReadout.textContent || "")) {
      compareForwardReadout.textContent = "Forward comparison details will appear here.";
    }
  }

  function bindProjectionFetch() {
    const button = byId("fetchTicker");
    if (!button || !button.parentNode) return;

    const replacement = button.cloneNode(true);
    button.parentNode.replaceChild(replacement, button);
    replacement.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        replacement.disabled = true;
        replacement.textContent = "Fetching...";
        if (typeof setDataStatus === "function") {
          setDataStatus("Fetching live data");
        }

        try {
          const ticker = byId("ticker")?.value;
          const data = await fetchStockData(ticker);
          if (typeof applyStockDataToProjection === "function") {
            applyStockDataToProjection(data);
          }
          if (typeof runProjection === "function") {
            runProjection();
          }
          if (typeof loadProjectionHistoricalChart === "function") {
            await loadProjectionHistoricalChart(data.symbol, appState.projectionHistoryRange || "5y");
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
          replacement.disabled = false;
          replacement.textContent = "Fetch live data";
        }
      },
      true,
    );
  }

  clearExampleTickerUi();
  bindProjectionFetch();
  setTimeout(clearExampleTickerUi, 0);
  setTimeout(bindProjectionFetch, 0);
  setTimeout(clearExampleTickerUi, 500);
})();
