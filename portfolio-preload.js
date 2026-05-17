(function () {
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
