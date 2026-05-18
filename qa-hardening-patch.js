(function () {
  if (window.__qaHardeningPatchApplied) return;
  window.__qaHardeningPatchApplied = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeText(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureHiddenNode(tagName, id) {
    if (byId(id)) return byId(id);
    const node = document.createElement(tagName);
    node.id = id;
    node.hidden = true;
    node.setAttribute("aria-hidden", "true");
    document.body.appendChild(node);
    return node;
  }

  function ensureMissingWatchlistNodes() {
    ensureHiddenNode("div", "watchlistGrid");
    ensureHiddenNode("button", "clearWatchlist");
  }

  function formatWith(name, value, fallback = "N/A") {
    if (typeof window[name] === "function") {
      return window[name](value);
    }
    return fallback;
  }

  function patchStockCardRenderer() {
    if (typeof window.renderStockDataCard !== "function" || window.renderStockDataCard.__qaWrapped) return;
    const wrapped = function renderStockDataCardPatched(data) {
      const card = byId("stockDataCard");
      if (!card) return;
      card.innerHTML = `
        <strong>${escapeText(data?.name || data?.symbol || "N/A")} (${escapeText(data?.symbol || "N/A")})</strong>
        <p>${escapeText(data?.exchange || "Primary listing")}${data?.sector ? ` | ${escapeText(data.sector)}` : ""}${data?.industry ? ` | ${escapeText(data.industry)}` : ""}</p>
        <div class="spec-grid">
          <div><span>Price</span><b>${formatWith("formatDollarValue", data?.price)}</b></div>
          <div><span>Market cap</span><b>${formatWith("formatCompactDollarValue", data?.marketCap)}</b></div>
          <div><span>Shares out.</span><b>${formatWith("formatMillionsAsShares", data?.sharesOutstanding)}</b></div>
          <div><span>EPS TTM</span><b>${formatWith("formatDollarValue", data?.eps)}</b></div>
          <div><span>P/E</span><b>${Number.isFinite(data?.peTtm) && window.oneDecimal ? window.oneDecimal.format(data.peTtm) : "N/A"}</b></div>
          <div><span>52W range</span><b>${formatWith("formatDollarValue", data?.week52Low)} - ${formatWith("formatDollarValue", data?.week52High)}</b></div>
          <div><span>Revenue TTM</span><b>${formatWith("formatCompactDollarValue", Number(data?.revenueTtm) * 1000000)}</b></div>
          <div><span>Net margin</span><b>${Number.isFinite(data?.netMargin) && window.oneDecimal ? `${window.oneDecimal.format(data.netMargin)}%` : "N/A"}</b></div>
        </div>
      `;
    };
    wrapped.__qaWrapped = true;
    window.renderStockDataCard = wrapped;
  }

  function updateSp500Readout() {
    if (typeof window.calculateSp500Path !== "function") return;
    const readout = byId("sp500Readout");
    if (!readout) return;
    const model = window.calculateSp500Path();
    const endingValue = formatWith("formatDollarValue", model?.endingValue);
    const contributions = formatWith("formatDollarValue", model?.totalContributions);
    const years = Math.max(0, (model?.rows?.length || 1) - 1);
    readout.textContent = `Projected ${endingValue} after ${years} years with ${contributions} contributed.`;
  }

  function patchSp500Renderer() {
    if (typeof window.renderSp500 !== "function" || window.renderSp500.__qaWrapped) return;
    const original = window.renderSp500;
    const wrapped = function renderSp500Patched() {
      const result = original.apply(this, arguments);
      updateSp500Readout();
      return result;
    };
    wrapped.__qaWrapped = true;
    window.renderSp500 = wrapped;
    updateSp500Readout();
  }

  function applyPatches() {
    ensureMissingWatchlistNodes();
    patchStockCardRenderer();
    patchSp500Renderer();
  }

  ensureMissingWatchlistNodes();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyPatches, { once: true });
  } else {
    applyPatches();
  }
  window.addEventListener("load", applyPatches, { once: true });
  setTimeout(applyPatches, 0);
  setTimeout(updateSp500Readout, 250);
})();
