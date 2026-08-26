import { lerpColor } from "../format";
import type { ColorMode } from "../../store/types";
import type { MetricRecord } from "../../data/metrics";
import { metricValue } from "../../data/metrics";

export type ColorOpts = {
  mode: ColorMode;
  paletteStops: 2 | 3;
  low: string;
  mid: string;
  high: string;
  pivot: number;
  extent: number;
  extentLow: number;
  extentHigh: number;
  sequentialMin?: number;
  sequentialMax?: number;
};

export function computePivot(
  values: { value: number; population: number }[],
  stat: "mean" | "median" | "popWeighted" | "custom",
  custom?: number | null
) {
  const xs = values.map((v) => v.value).filter((v) => Number.isFinite(v));
  if (!xs.length) return 0;
  if (stat === "custom" && custom != null && Number.isFinite(custom)) return custom;
  if (stat === "median") {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
  if (stat === "popWeighted") {
    let num = 0, den = 0;
    for (const v of values) {
      num += v.value * (v.population || 0);
      den += v.population || 0;
    }
    return den ? num / den : mean(xs);
  }
  return mean(xs);
}

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function computeExtents(values: number[], pivot: number) {
  let low = 0;
  let high = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v <= pivot) low = Math.max(low, pivot - v);
    else high = Math.max(high, v - pivot);
  }
  const fallback = Math.max(Math.abs(pivot) * 1e-6, 1e-6);
  return { low: low > 0 ? low : fallback, high: high > 0 ? high : fallback };
}

export function computeExtent(values: number[], pivot: number) {
  const { low, high } = computeExtents(values, pivot);
  return Math.max(low, high);
}

export function divergingColor(value: number, opts: ColorOpts) {
  const span = value >= opts.pivot ? opts.extentHigh || opts.extent || 1 : opts.extentLow || opts.extent || 1;
  const t = (value - opts.pivot) / span;
  const u = Math.max(-1, Math.min(1, t));
  if (opts.paletteStops === 2) {
    return lerpColor(opts.low, opts.high, (u + 1) / 2);
  }
  const band = 0.12;
  if (Math.abs(u) <= band) return opts.mid;
  if (u < 0) {
    const s = (-u - band) / (1 - band);
    return lerpColor(opts.mid, opts.low, s);
  }
  const s = (u - band) / (1 - band);
  return lerpColor(opts.mid, opts.high, s);
}

export function sequentialColor(
  value: number,
  min: number,
  max: number,
  low: string,
  high: string,
  kind: "auto" | "log" | "linear" = "auto"
) {
  if (!(max > min)) return lerpColor(low, high, 0.5);
  const v = Math.max(min, Math.min(max, value));
  const useLog = kind === "log" || (kind === "auto" && min > 0 && max / min >= 50);
  let t: number;
  if (useLog && min > 0) {
    t = (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min));
  } else {
    t = (v - min) / (max - min);
    if (kind !== "linear") t = Math.pow(Math.max(0, t), 0.85);
  }
  return lerpColor(low, high, Math.max(0, Math.min(1, t)));
}

export function collectValues(records: MetricRecord[], metricId: string) {
  const out: { value: number; population: number; rec: MetricRecord }[] = [];
  for (const rec of records) {
    const v = metricValue(rec, metricId);
    if (v == null || !Number.isFinite(v)) continue;
    out.push({ value: v, population: rec.population || 0, rec });
  }
  return out;
}
