import type { SeriesPoint } from "../../store/types";
import { mixColor } from "../format";
import { t } from "../../i18n";

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
  opts: {
    bg: string;
    text: string;
    markerYear?: number | null;
    overlay?: ChartSeries | null;
  }
) {
  const attached = canvas.clientWidth > 0 && canvas.clientHeight > 0;
  const dpr = attached ? window.devicePixelRatio || 1 : 1;
  const cssW = attached ? canvas.clientWidth : canvas.width || 320;
  const cssH = attached ? canvas.clientHeight : canvas.height || 140;
  const W = Math.max(160, attached ? Math.round(cssW * dpr) : canvas.width || Math.round(cssW));
  const H = Math.max(72, attached ? Math.round(cssH * dpr) : canvas.height || Math.round(cssH));
  if (attached) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d")!;
  const u = Math.max(0.75, H / 168);
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = opts.text;
  ctx.font = `600 ${Math.round(12 * u)}px "DM Sans", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(series.title, 10 * u, 16 * u);
  if (opts.overlay) {
    ctx.fillStyle = opts.overlay.color || "#94a3b8";
    ctx.font = `500 ${Math.round(10 * u)}px "DM Sans", system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(t("charts.wppLegend"), W - 10 * u, 16 * u);
  }

  const pts = (series.points || []).filter((p) => Number.isFinite(p.value));
  const over = (opts.overlay?.points || []).filter((p) => Number.isFinite(p.value));
  if (pts.length < 1 && over.length < 1) {
    ctx.fillStyle = mixColor(opts.text, opts.bg, 0.5);
    ctx.font = `400 ${Math.round(11 * u)}px "DM Sans", system-ui`;
    ctx.textAlign = "left";
    ctx.fillText("No series for this indicator", 10 * u, H / 2);
    return;
  }

  const pad = { l: 48 * u, r: 12 * u, t: 28 * u, b: 24 * u };
  const all = [...pts, ...over];
  const xs = all.map((p) => p.year);
  const ys = all.map((p) => p.value);
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
  ctx.lineWidth = Math.max(1, u);
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, H - pad.b);
  ctx.lineTo(W - pad.r, H - pad.b);
  ctx.stroke();

  const strokeLine = (points: SeriesPoint[], color: string, dash?: number[]) => {
    if (points.length < 1) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = (dash ? 1.5 : 2) * u;
    ctx.setLineDash(dash ? dash.map((n) => n * u) : []);
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xOf(p.year);
      const y = yOf(p.value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };
  if (over.length) strokeLine(over, opts.overlay?.color || "#94a3b8", [5, 4]);
  strokeLine(pts, series.color || "#38bdf8");

  ctx.fillStyle = series.color || "#38bdf8";
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(xOf(p.year), yOf(p.value), 2.2 * u, 0, Math.PI * 2);
    ctx.fill();
  }

  if (opts.markerYear != null && Number.isFinite(opts.markerYear)) {
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.5 * u;
    ctx.setLineDash([4 * u, 3 * u]);
    ctx.beginPath();
    ctx.moveTo(xOf(opts.markerYear), pad.t);
    ctx.lineTo(xOf(opts.markerYear), H - pad.b);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = mixColor(opts.text, opts.bg, 0.4);
  ctx.font = `400 ${Math.round(9 * u)}px "JetBrains Mono", monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(minX), pad.l, H - 6 * u);
  ctx.textAlign = "right";
  ctx.fillText(String(maxX), W - pad.r, H - 6 * u);
  const fmtY = (v: number) =>
    Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(v >= 10 ? 0 : 2);
  ctx.fillText(fmtY(y1), pad.l - 4 * u, pad.t + 8 * u);
  ctx.fillText(fmtY(y0), pad.l - 4 * u, H - pad.b);
}
