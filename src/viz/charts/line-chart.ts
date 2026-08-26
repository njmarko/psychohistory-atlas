import type { SeriesPoint } from "../../store/types";
import { mixColor } from "../format";

export type ChartSeries = {
  id: string;
  title: string;
  unit: string;
  points: SeriesPoint[];
  color?: string;
};

export function drawLineChart(
  canvas: HTMLCanvasElement,
  series: ChartSeries,
  opts: { bg: string; text: string; markerYear?: number | null }
) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 140;
  const W = Math.max(200, Math.round(cssW * dpr));
  const H = Math.max(100, Math.round(cssH * dpr));
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = opts.text;
  ctx.font = `600 ${Math.round(12 * dpr)}px "DM Sans", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(series.title, 8 * dpr, 16 * dpr);

  const pts = series.points.filter((p) => Number.isFinite(p.value));
  if (pts.length < 1) {
    ctx.fillStyle = mixColor(opts.text, opts.bg, 0.5);
    ctx.font = `400 ${Math.round(11 * dpr)}px "DM Sans", system-ui`;
    ctx.fillText("No series for this indicator", 8 * dpr, H / 2);
    return;
  }

  const pad = { l: 44 * dpr, r: 10 * dpr, t: 28 * dpr, b: 22 * dpr };
  const xs = pts.map((p) => p.year);
  const ys = pts.map((p) => p.value);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const y0 = minY === maxY ? minY - 1 : minY;
  const y1 = minY === maxY ? maxY + 1 : maxY;
  const xw = maxX === minX ? 1 : maxX - minX;
  const yh = y1 - y0;
  const xOf = (x: number) => pad.l + ((x - minX) / xw) * (W - pad.l - pad.r);
  const yOf = (y: number) => pad.t + (1 - (y - y0) / yh) * (H - pad.t - pad.b);

  ctx.strokeStyle = mixColor(opts.text, opts.bg, 0.8);
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, H - pad.b);
  ctx.lineTo(W - pad.r, H - pad.b);
  ctx.stroke();

  ctx.strokeStyle = series.color || "#38bdf8";
  ctx.lineWidth = 1.6 * dpr;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = xOf(p.year);
    const y = yOf(p.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = series.color || "#38bdf8";
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(xOf(p.year), yOf(p.value), 2.2 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  if (opts.markerYear != null) {
    ctx.strokeStyle = "#fbbf24";
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.beginPath();
    ctx.moveTo(xOf(opts.markerYear), pad.t);
    ctx.lineTo(xOf(opts.markerYear), H - pad.b);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = mixColor(opts.text, opts.bg, 0.4);
  ctx.font = `400 ${Math.round(9 * dpr)}px "JetBrains Mono", monospace`;
  ctx.textAlign = "left";
  ctx.fillText(String(minX), pad.l, H - 6 * dpr);
  ctx.textAlign = "right";
  ctx.fillText(String(maxX), W - pad.r, H - 6 * dpr);
  ctx.fillText(y1.toFixed(y1 >= 100 ? 0 : 2), pad.l - 4 * dpr, pad.t + 8 * dpr);
  ctx.fillText(y0.toFixed(y0 >= 100 ? 0 : 2), pad.l - 4 * dpr, H - pad.b);
}
