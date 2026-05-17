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
})();
