import { REPLACEMENT_TFR } from "./sources";
import type { IdealMode } from "../store/types";

export type MetricRecord = {
  name: string;
  population: number;
  worldShare?: number;
  tfr: number;
  medianAge: number;
  youthPct: number;
  elderlyPct: number;
  e0?: number;
  netMigration?: number;
  idealTfr?: number | null;
  fertilityGap?: number | null;
  tmr?: number | null;
  cpm?: number | null;
  year?: number;
};

export type MetricScale = "diverging" | "log" | "zero-linear";

export type MetricDef = {
  id: string;
  label: string;
  unit: string;
  description: string;
  scale?: MetricScale;
  get: (rec: MetricRecord, ctx?: { idealMode?: IdealMode }) => number | null;
};

export const METRICS: MetricDef[] = [
  {
    id: "tfr",
    label: "Total fertility rate",
    unit: "children / woman",
    description: "Children per woman. BirthGauge when present, otherwise WPP or the slider",
    get: (r) => r.tfr,
  },
  {
    id: "tmr",
    label: "Total maternal rate",
    unit: "share of women",
    description: "TFR₁ — share of women who become mothers (first-birth TFR). BirthGauge 2025 for US states.",
    get: (r) => (r.tmr != null && Number.isFinite(r.tmr) ? r.tmr : null),
  },
  {
    id: "cpm",
    label: "Children per mother",
    unit: "children / mother",
    description: "TFR / TMR. How many children mothers have at current period fertility. BirthGauge 2025 for US states.",
    get: (r) => (r.cpm != null && Number.isFinite(r.cpm) ? r.cpm : null),
  },
  {
    id: "popShare",
    label: "Population share of world",
    unit: "%",
    description: "This country’s population as a share of all countries in the current simulation. Diverging colors around the mean",
    scale: "diverging",
    get: (r) => (r.worldShare != null ? r.worldShare * 100 : null),
  },
  {
    id: "population",
    label: "Absolute population",
    unit: "people",
    description: "Headcount in the current year. Colored on a log scale, not around the average",
    scale: "log",
    get: (r) => r.population,
  },
  {
    id: "tfrVsReplacement",
    label: "TFR vs replacement 2.1",
    unit: "children",
    description: "TFR minus replacement level 2.1",
    get: (r) => (Number.isFinite(r.tfr) ? r.tfr - REPLACEMENT_TFR : null),
  },
  {
    id: "fertilityGap",
    label: "Fertility gap (TFR − ideal)",
    unit: "children",
    description: "Estimated TFR minus mean ideal fertility of reproductive-age women",
    get: (r) => (r.fertilityGap != null && Number.isFinite(r.fertilityGap) ? r.fertilityGap : null),
  },
  {
    id: "medianAge",
    label: "Median age",
    unit: "years",
    description: "Age at which half the population is younger",
    get: (r) => r.medianAge,
  },
  {
    id: "elderly",
    label: "Share aged 65+",
    unit: "%",
    description: "Elderly share of the population",
    get: (r) => r.elderlyPct,
  },
  {
    id: "youth",
    label: "Share aged 0–14",
    unit: "%",
    description: "Youth share of the population",
    get: (r) => r.youthPct,
  },
  {
    id: "e0",
    label: "Life expectancy at birth",
    unit: "years",
    description: "Both-sex life expectancy at birth (UN WPP, or the slider if country e0 is off)",
    get: (r) => (r.e0 != null && r.e0 > 0 ? r.e0 : null),
  },
  {
    id: "netMigration",
    label: "Net migration (persons / year)",
    unit: "people",
    description: "Immigrants minus emigrants from UN WPP (heatmap uses the data series even if the simulation’s migration Use box is off)",
    get: (r) => (r.netMigration != null ? r.netMigration : null),
  },
  {
    id: "netMigrationRate",
    label: "Net migration per 1,000",
    unit: "per 1,000",
    description: "UN WPP net migration per 1,000 people in the current year",
    get: (r) =>
      r.netMigration != null && r.population > 0 ? (r.netMigration / r.population) * 1000 : null,
  },
];

export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m]));

export function metricValue(rec: MetricRecord, id: string): number | null {
  const def = METRIC_BY_ID[id];
  if (!def) return rec.worldShare != null ? rec.worldShare * 100 : null;
  const v = def.get(rec);
  return v != null && Number.isFinite(v) ? v : null;
}
