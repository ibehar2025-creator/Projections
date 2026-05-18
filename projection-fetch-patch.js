(function () {
  if (window.__projectionFetchPatchApplied) return;
  window.__projectionFetchPatchApplied = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function hasExampleTickerText(node) {
    return Boolean(node && /AAPL|MSFT|Apple|Microsoft/i.test(node.textContent || ""));
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
  setTimeout(clearExampleTickerUi, 1500);
  setTimeout(clearExampleTickerUi, 3000);
})();
