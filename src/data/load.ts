import type { CountryRecord, DatasetMeta } from "../store/types";
import { normalizeLegacy } from "./legacy";
import { applyOverrides, loadOverrides } from "./overrides";
import { SOURCES } from "./sources";
import { applyWppToCountries, loadWppShards } from "./wpp";

export type LoadedData = {
  countries: Record<string, CountryRecord>;
  meta: DatasetMeta;
};

export async function loadDataset(): Promise<LoadedData> {
  const [countriesRes, tfrRes, extrasRes] = await Promise.all([
    fetch("./data/countries.json"),
    fetch("./data/births_tfr_2026_data.json"),
    fetch("./data/country-extras.json"),
  ]);
  if (!countriesRes.ok) throw new Error("Could not load data/countries.json");
  const raw = await countriesRes.json();

  let birthGauge = undefined;
  if (tfrRes.ok) {
    try {
      birthGauge = await tfrRes.json();
    } catch {
      /* ignore */
    }
  }
  let extras: Record<string, Partial<CountryRecord>> = {};
  if (extrasRes.ok) {
    try {
      extras = await extrasRes.json();
    } catch {
      extras = {};
    }
  }

  const first = Object.values(raw)[0] as { base?: unknown; male?: unknown };
  let countries: Record<string, CountryRecord>;
  if (first && first.base && typeof first.base === "object") {
    countries = raw as Record<string, CountryRecord>;
    delete countries.Kosovo;
  } else {
    countries = normalizeLegacy(raw, birthGauge, extras);
  }

  countries = applyOverrides(countries, loadOverrides());
  const wpp = await loadWppShards();
  countries = applyWppToCountries(countries, wpp);

  return {
    countries,
    meta: {
      sources: Object.values(SOURCES),
      notes: [
        "TFR 2025–2026 from BirthGauge / national statistical offices when present.",
        "UN WPP 2024 GEN/01 indicators (CC BY 3.0 IGO) fill historical series and optional Medium projections.",
      ],
    },
  };
}

export function freshYear(c: CountryRecord) {
  const years = [c.base.year, c.latest.tfrYear, c.latest.e0Year, c.latest.netMigrationYear].filter(
    (y) => Number.isFinite(y)
  );
  return Math.max(...years);
}

function minYearIn(series?: { year: number }[] | null) {
  if (!series?.length) return null;
  let m = Infinity;
  for (const p of series) if (Number.isFinite(p.year) && p.year < m) m = p.year;
  return Number.isFinite(m) ? m : null;
}

/** Earliest year we have an age–sex pyramid (needed to run the simulation). */
export function earliestPyramidYear(countries: Record<string, CountryRecord>) {
  let min = Infinity;
  for (const c of Object.values(countries)) {
    if (c.base?.male?.length && Number.isFinite(c.base.year)) min = Math.min(min, c.base.year);
  }
  return Number.isFinite(min) ? min : 2024;
}

/** Earliest calendar year present in any loaded series (WPP Estimates start 1950). */
export function earliestDataYear(countries: Record<string, CountryRecord>) {
  let min = Infinity;
  for (const c of Object.values(countries)) {
    const candidates = [
      c.base.year,
      minYearIn(c.series.tfr),
      minYearIn(c.series.population),
      minYearIn(c.series.e0),
      minYearIn(c.series.netMigration),
      minYearIn(c.series.births),
      minYearIn(c.series.idealTfr),
      minYearIn(c.wppMedium?.tfr),
      minYearIn(c.wppMedium?.population),
      minYearIn(c.wppMedium?.e0),
    ];
    for (const y of candidates) if (y != null && y < min) min = y;
  }
  return Number.isFinite(min) ? min : 1950;
}

export function seriesValueAt(series: { year: number; value: number }[] | undefined, year: number): number | null {
  if (!series?.length) return null;
  const exact = series.find((p) => p.year === year);
  if (exact) return exact.value;
  const sorted = [...series].sort((a, b) => a.year - b.year);
  if (year <= sorted[0].year) return sorted[0].value;
  if (year >= sorted[sorted.length - 1].year) return sorted[sorted.length - 1].value;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].year >= year) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const t = (year - a.year) / (b.year - a.year);
      return a.value + (b.value - a.value) * t;
    }
  }
  return sorted[sorted.length - 1].value;
}
