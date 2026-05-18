(function () {
  if (window.Chart && !window.__stockLabChartCanvasGuard) {
    const BaseChart = window.Chart;
    const GuardedChart = function guardedChart(ctx, config) {
      const canvas = ctx?.canvas || ctx;
      const existing = BaseChart.getChart?.(canvas);
      if (existing) existing.destroy();
      return new BaseChart(ctx, config);
    };
    Object.setPrototypeOf(GuardedChart, BaseChart);
    GuardedChart.prototype = BaseChart.prototype;
    window.Chart = GuardedChart;
    window.__stockLabChartCanvasGuard = true;
  }

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
  const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const oneDecimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function byId(id) {
    return document.getElementById(id);
  }

  function numberValue(id) {
    return Number(byId(id)?.value) || 0;
  }

  function classForValue(value) {
    if (!Number.isFinite(value) || value === 0) return "";
    return value > 0 ? "value-positive" : "value-negative";
  }

  window.runReverse = function runReversePreload() {
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
      <p>Current price implies ${money.format(terminalEps)} terminal EPS in ${whole.format(years)} years at ${oneDecimal.format(exitPe)}x earnings.</p>
    `;
    return { impliedGrowth, terminalEps };
  };

  window.runMos = function runMosPreload() {
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

  function activateHashTab() {
    const tabId = window.location.hash.replace(/^#/, "");
    if (!tabId) return;
    if (tabId === "portfolio") {
      history.replaceState({}, "", `${window.location.pathname}${window.location.search}#projection`);
      activateHashTab();
      return;
    }
    if (typeof window.activateTab === "function") {
      window.activateTab(tabId);
      return;
    }
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabId));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
  }

  function finishStartup() {
    removePortfolioEntryPoints();
    clearExampleTickerDefaults();
    activateHashTab();
    if (typeof window.runReverse === "function") window.runReverse();
    if (typeof window.runMos === "function") window.runMos();
    improveDriveButtonHelp();
  }

  function clearExampleTickerDefaults() {
    [
      ["ticker", "Enter ticker"],
      ["compareATicker", "Ticker"],
      ["compareBTicker", "Ticker"],
      ["tradeSymbol", "Ticker"],
      ["tradeAsset", "Asset name"],
    ].forEach(([id, placeholder]) => {
      const input = byId(id);
      if (!input || input.dataset.examplesCleared === "true") return;
      if (["AAPL", "MSFT"].includes(String(input.value || "").trim().toUpperCase())) input.value = "";
      if (["AAPL", "MSFT", "Apple Inc."].includes(String(input.placeholder || "").trim())) input.placeholder = placeholder;
      input.dataset.examplesCleared = "true";
    });
  }

  function removePortfolioEntryPoints() {
    document.querySelectorAll('[data-tab="portfolio"]').forEach((node) => node.remove());
    const portfolioPanel = byId("portfolio");
    if (portfolioPanel) {
      portfolioPanel.hidden = true;
      portfolioPanel.setAttribute("aria-hidden", "true");
      portfolioPanel.classList.remove("active");
    }
  }

  function getDriveAuthState() {
    try {
      if (typeof appState !== "undefined") {
        return appState.driveAuth || {};
      }
    } catch {
      return {};
    }
    return {};
  }

  function improveDriveButtonHelp() {
    const auth = getDriveAuthState();
    const connected = Boolean(auth.connected);
    const needsReconnect = Boolean(auth.needsReconnectForSheets);
    const message = needsReconnect
      ? "Reconnect Drive first so the dashboard can read your Portfolio spreadsheet."
      : "Connect Drive first to load your Portfolio Google Sheet.";
    ["loadDrivePortfolioButton", "reloadRemotePortfolioButton", "syncPortfolioNowButton", "forceOverwriteRemoteButton"].forEach((id) => {
      const button = byId(id);
      if (!button) return;
      button.title = connected && !needsReconnect ? "" : message;
      button.setAttribute("aria-label", `${button.textContent.trim()}${connected && !needsReconnect ? "" : `. ${message}`}`);
    });
    const meta = byId("portfolioSyncMeta");
    if (!meta || connected) return;
    meta.textContent = "Drive is not connected. Connect Drive first, then load your Portfolio Google Sheet.";
  }

  finishStartup();
  window.addEventListener("hashchange", activateHashTab);
  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(finishStartup, 0);
    setTimeout(finishStartup, 300);
    setTimeout(finishStartup, 900);
    setTimeout(finishStartup, 1800);
  });
})();
