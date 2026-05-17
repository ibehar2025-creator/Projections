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

  if (typeof window.runReverse !== "function") {
    window.runReverse = function runReversePreload() {
      return null;
    };
  }

  if (typeof window.runMos !== "function") {
    window.runMos = function runMosPreload() {
      return null;
    };
  }

  function activateHashTab() {
    const tabId = window.location.hash.replace(/^#/, "");
    if (!tabId) return;
    if (typeof window.activateTab === "function") {
      window.activateTab(tabId);
      return;
    }
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabId));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
  }

  function finishStartup() {
    activateHashTab();
    if (typeof window.runReverse === "function") window.runReverse();
    if (typeof window.runMos === "function") window.runMos();
  }

  window.addEventListener("hashchange", activateHashTab);
  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(finishStartup, 0);
    setTimeout(finishStartup, 300);
    setTimeout(finishStartup, 900);
  });
})();
