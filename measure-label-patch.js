(function () {
  if (window.__measureLabelPatchApplied) return;
  window.__measureLabelPatchApplied = true;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function wrapMeasureLines(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) return [];

    const lines = [];
    let current = words[0];

    for (let index = 1; index < words.length; index += 1) {
      const next = `${current} ${words[index]}`;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
      } else {
        lines.push(current);
        current = words[index];
      }
    }

    lines.push(current);
    return lines;
  }

  function buildLabelLines(ctx, label, maxWidth) {
    const segments = String(label || "")
      .split(" | ")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (!segments.length) return [];

    return segments.flatMap((segment) => wrapMeasureLines(ctx, segment, maxWidth));
  }

  if (typeof measurePlugin !== "object" || typeof roundRect !== "function") return;

  measurePlugin.afterDatasetsDraw = function patchedMeasureOverlay(chart) {
    const interaction = chart.$interaction;
    if (!interaction || !interaction.measureStart || !interaction.measureEnd) {
      return;
    }

    const ctx = chart.ctx;
    const area = chart.chartArea;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    const left = xScale.getPixelForValue(interaction.measureStart.xValue);
    const right = xScale.getPixelForValue(interaction.measureEnd.xValue);
    const activeDataset = chart.data.datasets[interaction.measureDatasetIndex] || chart.data.datasets[0];
    const minX = Math.min(left, right);
    const fill = activeDataset?.borderColor || "#4f8cff";
    const baseline = area.bottom;
    const datasetPoints = Array.isArray(activeDataset?.data) ? activeDataset.data : [];
    const startIndex = Number.isInteger(interaction.measureStart.index) ? interaction.measureStart.index : 0;
    const endIndex = Number.isInteger(interaction.measureEnd.index) ? interaction.measureEnd.index : datasetPoints.length - 1;
    const fromIndex = Math.max(0, Math.min(startIndex, endIndex));
    const toIndex = Math.min(datasetPoints.length - 1, Math.max(startIndex, endIndex));
    const selectedPoints = datasetPoints.slice(fromIndex, toIndex + 1);
    const topValue = Math.max(
      ...selectedPoints.map((point) => point?.y ?? 0),
      interaction.measureStart.yValue,
      interaction.measureEnd.yValue,
    );
    const topPixel = yScale ? yScale.getPixelForValue(topValue) : area.top;

    ctx.save();
    ctx.fillStyle = "rgba(79, 140, 255, 0.14)";
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1.2;

    if (selectedPoints.length >= 2 && yScale) {
      ctx.beginPath();
      ctx.moveTo(xScale.getPixelForValue(selectedPoints[0].x), baseline);
      selectedPoints.forEach((point) => {
        ctx.lineTo(xScale.getPixelForValue(point.x), yScale.getPixelForValue(point.y));
      });
      ctx.lineTo(xScale.getPixelForValue(selectedPoints[selectedPoints.length - 1].x), baseline);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      selectedPoints.forEach((point, index) => {
        const px = xScale.getPixelForValue(point.x);
        const py = yScale.getPixelForValue(point.y);
        if (index === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(left, topPixel);
    ctx.lineTo(left, baseline);
    ctx.moveTo(right, topPixel);
    ctx.lineTo(right, baseline);
    ctx.stroke();

    ctx.font = "12px IBM Plex Sans";
    const textMaxWidth = clamp(area.right - area.left - 36, 120, 220);
    const lines = buildLabelLines(ctx, interaction.measureLabel || "", textMaxWidth);
    if (!lines.length) {
      ctx.restore();
      return;
    }

    const lineHeight = 15;
    const paddingX = 10;
    const paddingY = 8;
    const textWidth = lines.reduce((widest, line) => Math.max(widest, ctx.measureText(line).width), 0);
    const labelWidth = Math.min(area.right - area.left - 12, textWidth + paddingX * 2);
    const labelHeight = lines.length * lineHeight + paddingY * 2;
    const labelX = clamp(minX + 6, area.left + 6, area.right - labelWidth - 6);
    const labelY = clamp(topPixel - labelHeight - 8, area.top + 6, area.bottom - labelHeight - 6);

    ctx.fillStyle = "rgba(12, 18, 28, 0.95)";
    ctx.strokeStyle = fill;
    roundRect(ctx, labelX, labelY, labelWidth, labelHeight, 6, true, true);

    ctx.fillStyle = "#e9f1ff";
    lines.forEach((line, index) => {
      ctx.fillText(line, labelX + paddingX, labelY + paddingY + 11 + index * lineHeight);
    });
    ctx.restore();
  };

  if (typeof appState === "object" && appState?.charts) {
    Object.values(appState.charts).forEach((bundle) => {
      bundle?.chart?.update?.("none");
    });
  }
})();
