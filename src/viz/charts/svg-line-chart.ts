import type { SeriesPoint } from "../../store/types";
import { t } from "../../i18n";

export type ChartSeries = {
  id: string;
  title: string;
  unit: string;
  points: SeriesPoint[];
  color?: string;
};

export function drawSvgLineChart(
  host: HTMLElement,
  series: ChartSeries,
  opts: {
    bg: string;
    text: string;
    markerYear?: number | null;
    overlay?: ChartSeries | null;
  }
) {
  const pts = (series.points || []).filter((p) => Number.isFinite(p.value));
  const over = (opts.overlay?.points || []).filter((p) => Number.isFinite(p.value));
  host.innerHTML = "";
  host.classList.add("svg-chart");
  const cssW = Math.max(280, Math.round(host.clientWidth || host.parentElement?.clientWidth || 360));
  const W = cssW;
  const H = 168;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMinYMid meet");
  svg.style.width = "100%";
  svg.style.height = `${H}px`;
  svg.style.background = opts.bg;
  svg.style.display = "block";
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", series.title);

  const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
  title.setAttribute("x", "10");
  title.setAttribute("y", "16");
  title.setAttribute("fill", opts.text);
  title.setAttribute("font-size", "12");
  title.setAttribute("font-family", "DM Sans, system-ui, sans-serif");
  title.setAttribute("font-weight", "600");
  title.textContent = series.title;
  svg.appendChild(title);

  if (opts.overlay && over.length) {
    const legend = document.createElementNS("http://www.w3.org/2000/svg", "text");
    legend.setAttribute("x", String(W - 10));
    legend.setAttribute("y", "16");
    legend.setAttribute("text-anchor", "end");
    legend.setAttribute("fill", opts.overlay.color || "#94a3b8");
    legend.setAttribute("font-size", "10");
    legend.textContent = t("charts.wppLegend");
    svg.appendChild(legend);
  }

  if (pts.length < 1 && over.length < 1) {
    const empty = document.createElementNS("http://www.w3.org/2000/svg", "text");
    empty.setAttribute("x", "10");
    empty.setAttribute("y", "90");
    empty.setAttribute("fill", opts.text);
    empty.setAttribute("opacity", "0.5");
    empty.setAttribute("font-size", "11");
    empty.textContent = "No series for this indicator";
    svg.appendChild(empty);
    host.appendChild(svg);
    return;
  }

  const pad = { l: 48, r: 12, t: 28, b: 26 };
  const all = [...pts, ...over];
  const xs = all.map((p) => p.year);
  const ys = all.map((p) => p.value);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const y0 = minY === maxY ? minY - 1 : minY;
  const y1 = minY === maxY ? maxY + 1 : maxY;
  const xw = maxX === minX ? 1 : maxX - minX;
  const yh = y1 - y0;
  const xOf = (x: number) => pad.l + ((x - minX) / xw) * (W - pad.l - pad.r);
  const yOf = (y: number) => pad.t + (1 - (y - y0) / yh) * (H - pad.t - pad.b);

  const axis = document.createElementNS("http://www.w3.org/2000/svg", "path");
  axis.setAttribute("d", `M${pad.l} ${pad.t} V${H - pad.b} H${W - pad.r}`);
  axis.setAttribute("fill", "none");
  axis.setAttribute("stroke", opts.text);
  axis.setAttribute("stroke-opacity", "0.25");
  svg.appendChild(axis);

  const drawLine = (points: SeriesPoint[], color: string, dash?: string) => {
    if (points.length < 1) return;
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.year).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(" ");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", d);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", dash ? "1.6" : "2");
    if (dash) line.setAttribute("stroke-dasharray", dash);
    svg.appendChild(line);
  };

  if (over.length) drawLine(over, opts.overlay?.color || "#94a3b8", "5 4");
  drawLine(pts, series.color || "#38bdf8");

  svg.dataset.minX = String(minX);
  svg.dataset.maxX = String(maxX);
  svg.dataset.padL = String(pad.l);
  svg.dataset.padR = String(pad.r);
  svg.dataset.padT = String(pad.t);
  svg.dataset.padB = String(pad.b);
  const mark = document.createElementNS("http://www.w3.org/2000/svg", "line");
  mark.setAttribute("class", "chart-year-mark");
  mark.setAttribute("y1", String(pad.t));
  mark.setAttribute("y2", String(H - pad.b));
  mark.setAttribute("stroke", "#fbbf24");
  mark.setAttribute("stroke-dasharray", "4 3");
  mark.setAttribute("stroke-width", "1.5");
  svg.appendChild(mark);
  placeMarker(svg, mark, opts.markerYear ?? null);

  const tip = document.createElement("div");
  tip.className = "chart-point-tip";
  tip.hidden = true;
  host.style.position = "relative";
  host.appendChild(svg);
  host.appendChild(tip);

  const showTip = (ev: PointerEvent, label: string) => {
    tip.hidden = false;
    tip.textContent = label;
    const r = host.getBoundingClientRect();
    const x = ev.clientX - r.left + 10;
    const y = ev.clientY - r.top - 30;
    tip.style.left = `${Math.max(4, Math.min(r.width - 8, x))}px`;
    tip.style.top = `${Math.max(4, y)}px`;
  };

  const addDots = (points: SeriesPoint[], color: string, prefix: string) => {
    for (const p of points) {
      const cx = xOf(p.year);
      const cy = yOf(p.value);
      const label = `${prefix}${p.year} · ${Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${series.unit ? " " + series.unit : ""}`;
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hit.setAttribute("cx", String(cx));
      hit.setAttribute("cy", String(cy));
      hit.setAttribute("r", "8");
      hit.setAttribute("fill", "transparent");
      hit.style.cursor = "pointer";
      hit.addEventListener("pointerenter", (ev) => showTip(ev, label));
      hit.addEventListener("pointermove", (ev) => showTip(ev, label));
      hit.addEventListener("pointerleave", () => {
        tip.hidden = true;
      });
      svg.appendChild(hit);
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", String(cx));
      c.setAttribute("cy", String(cy));
      c.setAttribute("r", "3");
      c.setAttribute("fill", color);
      c.setAttribute("pointer-events", "none");
      svg.appendChild(c);
    }
  };
  addDots(pts, series.color || "#38bdf8", "");
  if (over.length) addDots(over, opts.overlay?.color || "#94a3b8", "UN WPP · ");

  const axisLabel = (x: number, y: number, text: string, anchor = "start") => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
    el.setAttribute("x", String(x));
    el.setAttribute("y", String(y));
    el.setAttribute("fill", opts.text);
    el.setAttribute("opacity", "0.55");
    el.setAttribute("font-size", "9");
    el.setAttribute("text-anchor", anchor);
    el.textContent = text;
    svg.appendChild(el);
  };
  axisLabel(pad.l, H - 6, String(minX));
  axisLabel(W - pad.r, H - 6, String(maxX), "end");
  const fmtY = (v: number) =>
    Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(v >= 10 ? 0 : 2);
  axisLabel(pad.l - 6, pad.t + 4, fmtY(y1), "end");
  axisLabel(pad.l - 6, H - pad.b, fmtY(y0), "end");
}

function placeMarker(svg: SVGSVGElement, mark: SVGLineElement, year: number | null) {
  if (year == null || !Number.isFinite(year)) {
    mark.setAttribute("opacity", "0");
    return;
  }
  const minX = Number(svg.dataset.minX);
  const maxX = Number(svg.dataset.maxX);
  const padL = Number(svg.dataset.padL);
  const padR = Number(svg.dataset.padR);
  const W = svg.viewBox.baseVal.width || 400;
  const xw = maxX === minX ? 1 : maxX - minX;
  const x = padL + ((year - minX) / xw) * (W - padL - padR);
  mark.setAttribute("x1", String(x));
  mark.setAttribute("x2", String(x));
  mark.setAttribute("opacity", year < minX || year > maxX ? "0.35" : "1");
}

/** Move the year marker without rebuilding the chart (used during playback). */
export function updateSvgChartMarker(host: HTMLElement, year: number | null) {
  const svg = host.querySelector("svg");
  const mark = host.querySelector(".chart-year-mark") as SVGLineElement | null;
  if (!svg || !mark) return;
  placeMarker(svg, mark, year);
}
