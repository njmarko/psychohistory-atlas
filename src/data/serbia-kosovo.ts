import type { CountryRecord, SeriesPoint } from "../store/types";
import { countryName } from "../i18n";

function zipSum(a: number[] = [], b: number[] = []) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) out[i] = (a[i] || 0) + (b[i] || 0);
  return out;
}

function weighted(a: number, wa: number, b: number, wb: number) {
  const w = wa + wb;
  if (w <= 0) return a || b;
  return (a * wa + b * wb) / w;
}

function mergeSeries(a: SeriesPoint[] = [], b: SeriesPoint[] = [], mode: "sum" | "wavg", wa = 1, wb = 1): SeriesPoint[] {
  const map = new Map<number, { v: number; w: number; source: string }>();
  for (const p of a) map.set(p.year, { v: p.value, w: wa, source: p.source });
  for (const p of b) {
    const prev = map.get(p.year);
    if (!prev) {
      map.set(p.year, { v: p.value, w: wb, source: p.source });
    } else if (mode === "sum") {
      map.set(p.year, { v: prev.v + p.value, w: prev.w + wb, source: prev.source });
    } else {
      const w = prev.w + wb;
      map.set(p.year, { v: (prev.v * prev.w + p.value * wb) / w, w, source: prev.source });
    }
  }
  return [...map.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([year, x]) => ({ year, value: x.v, source: x.source }));
}

/** Combine Kosovo into Serbia (values). Geometry is handled in the map layer. */
export function mergeKosovoIntoSerbia(
  serbia: CountryRecord,
  kosovo: CountryRecord | null
): CountryRecord {
  if (!kosovo) {
    return { ...serbia, includesKosovo: true };
  }
  const popS = serbia.base.population || 1;
  const popK = kosovo.base.population || 1;
  const tfr = weighted(serbia.latest.tfr, popS, kosovo.latest.tfr, popK);
  const e0 = weighted(serbia.latest.e0, popS, kosovo.latest.e0, popK);
  const idealA = serbia.latest.idealTfr;
  const idealB = kosovo.latest.idealTfr;
  const ideal =
    idealA != null && idealB != null
      ? weighted(idealA, popS, idealB, popK)
      : idealA ?? idealB;

  const male = zipSum(serbia.base.male, kosovo.base.male);
  const female = zipSum(serbia.base.female, kosovo.base.female);
  const population = male.reduce((s, v, i) => s + v + (female[i] || 0), 0);

  return {
    ...serbia,
    includesKosovo: true,
    base: {
      ...serbia.base,
      male,
      female,
      population,
    },
    latest: {
      ...serbia.latest,
      tfr,
      e0,
      netMigration: (serbia.latest.netMigration || 0) + (kosovo.latest.netMigration || 0),
      idealTfr: ideal,
      fertilityGap: ideal != null ? tfr - ideal : null,
    },
    series: {
      tfr: mergeSeries(serbia.series.tfr, kosovo.series.tfr, "wavg", popS, popK),
      population: mergeSeries(serbia.series.population, kosovo.series.population, "sum"),
      e0: mergeSeries(serbia.series.e0, kosovo.series.e0, "wavg", popS, popK),
      netMigration: mergeSeries(serbia.series.netMigration, kosovo.series.netMigration, "sum"),
      idealTfr: mergeSeries(serbia.series.idealTfr, kosovo.series.idealTfr, "wavg", popS, popK),
      births: mergeSeries(serbia.series.births || [], kosovo.series.births || [], "sum"),
    },
    wppMedium:
      serbia.wppMedium || kosovo.wppMedium
        ? {
            tfr: mergeSeries(serbia.wppMedium?.tfr || [], kosovo.wppMedium?.tfr || [], "wavg", popS, popK),
            population: mergeSeries(serbia.wppMedium?.population || [], kosovo.wppMedium?.population || [], "sum"),
            e0: mergeSeries(serbia.wppMedium?.e0 || [], kosovo.wppMedium?.e0 || [], "wavg", popS, popK),
            netMigration: mergeSeries(serbia.wppMedium?.netMigration || [], kosovo.wppMedium?.netMigration || [], "sum"),
            births: mergeSeries(serbia.wppMedium?.births || [], kosovo.wppMedium?.births || [], "sum"),
          }
        : serbia.wppMedium,
  };
}

export function displayName(rec: { name: string; includesKosovo?: boolean }) {
  return countryName(rec.name);
}
