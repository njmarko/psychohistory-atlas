import { localeDef } from "../i18n";

export function formatNumber(n: number) {
  if (!Number.isFinite(n)) return "—";
  const loc = localeDef().bcp47;
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e4) return Math.round(n).toLocaleString(loc);
  return Math.round(n).toLocaleString(loc);
}

export function formatCompact(n: number) {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return String(Math.round(n));
}

export function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function mixColor(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${Math.round(A.r * (1 - t) + B.r * t)},${Math.round(A.g * (1 - t) + B.g * t)},${Math.round(A.b * (1 - t) + B.b * t)})`;
}

export function shade(hex: string, percent: number) {
  const { r, g, b } = hexToRgb(hex);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  return `rgb(${Math.round((t - r) * p + r)},${Math.round((t - g) * p + g)},${Math.round((t - b) * p + b)})`;
}

export function lerpColor(a: string, b: string, t: number) {
  const u = Math.max(0, Math.min(1, t));
  return mixColor(a, b, u);
}
