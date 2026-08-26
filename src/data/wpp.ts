import type { CountryRecord, SeriesPoint } from "../store/types";
import { SOURCES } from "./sources";

type Packed = Record<string, { e?: [number, number][]; m?: [number, number][] }>;

const SHARDS = ["tfr", "population", "e0", "net-migration", "births", "median-age", "srb"] as const;

function unpack(pts: [number, number][] | undefined, source: string): SeriesPoint[] {
  if (!pts?.length) return [];
  return pts.map(([year, value]) => ({ year, value, source }));
}

function preferExisting(base: SeriesPoint[], extra: SeriesPoint[]): SeriesPoint[] {
  const map = new Map<number, SeriesPoint>();
  for (const p of extra) map.set(p.year, p);
  for (const p of base) map.set(p.year, p);
  return [...map.values()].sort((a, b) => a.year - b.year);
}

function last(pts: SeriesPoint[]): SeriesPoint | undefined {
  return pts.length ? pts[pts.length - 1] : undefined;
}

export async function loadWppShards(): Promise<Record<string, Packed>> {
  try {
    const manRes = await fetch("./data/wpp2024/manifest.json");
    if (!manRes.ok) return {};
    const man = await manRes.json();
    const files: string[] = (man.shards || []).map((s: { file: string }) => s.file);
    const ids = files.length ? files : SHARDS.map((s) => `${s}.json`);
    const loaded = await Promise.all(
      ids.map(async (file) => {
        const r = await fetch(`./data/wpp2024/${file}`);
        if (!r.ok) return [file, {}] as const;
        return [file, (await r.json()) as Packed] as const;
      })
    );
    const byId: Record<string, Packed> = {};
    for (const [file, json] of loaded) {
      const id = file.replace(/\.json$/, "");
      byId[id] = json;
    }
    return byId;
  } catch {
    return {};
  }
}

export function applyWppToCountries(
  countries: Record<string, CountryRecord>,
  shards: Record<string, Packed>
) {
  if (!Object.keys(shards).length) return countries;
  const src = SOURCES.wpp2024.id;
  const byIso: Record<string, CountryRecord> = {};
  for (const rec of Object.values(countries)) {
    if (rec.iso3) byIso[rec.iso3] = rec;
  }
  byIso.XKX = byIso.XKX || countries.Kosovo;

  const attach = (iso3: string, rec: CountryRecord) => {
    const tfrE = unpack(shards.tfr?.[iso3]?.e, src);
    const popE = unpack(shards.population?.[iso3]?.e, src);
    const e0E = unpack(shards.e0?.[iso3]?.e, src);
    const migE = unpack(shards["net-migration"]?.[iso3]?.e, src);
    const birthE = unpack(shards.births?.[iso3]?.e, src);
    const srbE = unpack(shards.srb?.[iso3]?.e, src);
    rec.series = {
      ...rec.series,
      tfr: preferExisting(rec.series.tfr || [], tfrE),
      population: preferExisting(rec.series.population || [], popE),
      e0: preferExisting(rec.series.e0 || [], e0E),
      netMigration: preferExisting(rec.series.netMigration || [], migE),
      births: preferExisting(rec.series.births || [], birthE),
    };
    rec.wppMedium = {
      tfr: unpack(shards.tfr?.[iso3]?.m, src),
      population: unpack(shards.population?.[iso3]?.m, src),
      e0: unpack(shards.e0?.[iso3]?.m, src),
      netMigration: unpack(shards["net-migration"]?.[iso3]?.m, src),
      births: unpack(shards.births?.[iso3]?.m, src),
      medianAge: unpack(shards["median-age"]?.[iso3]?.m, src),
    };
    const e0Last = last(e0E);
    if (e0Last && (rec.latest.e0Year == null || rec.latest.e0Year <= e0Last.year)) {
      rec.latest.e0 = e0Last.value;
      rec.latest.e0Year = e0Last.year;
      rec.latest.e0Source = SOURCES.wpp2024;
    }
    const migLast = last(migE);
    if (migLast) {
      rec.latest.netMigration = migLast.value;
      rec.latest.netMigrationYear = migLast.year;
      rec.latest.netMigrationSource = SOURCES.wpp2024;
    }
    const srbLast = last(srbE);
    if (srbLast) rec.latest.srb = srbLast.value;
    return rec;
  };

  for (const rec of Object.values(countries)) {
    if (rec.iso3) attach(rec.iso3, rec);
  }
  const serbia = countries.Serbia;
  if (serbia && shards.tfr?.XKX) {
    const fake = {
      ...serbia,
      iso3: "XKX",
      series: { tfr: [], population: [], e0: [], netMigration: [], idealTfr: [], births: [] },
      latest: { ...serbia.latest },
    } as CountryRecord;
    attach("XKX", fake);
    const popS = last(unpack(shards.population?.SRB?.e, src))?.value || 1;
    const popK = last(unpack(shards.population?.XKX?.e, src))?.value || 1;
    const merge = (a: SeriesPoint[] = [], b: SeriesPoint[] = [], mode: "sum" | "wavg") => {
      const map = new Map<number, { v: number; w: number; source: string }>();
      for (const p of a) map.set(p.year, { v: p.value, w: popS, source: p.source });
      for (const p of b) {
        const prev = map.get(p.year);
        if (!prev) map.set(p.year, { v: p.value, w: popK, source: p.source });
        else if (mode === "sum") map.set(p.year, { v: prev.v + p.value, w: prev.w + popK, source: prev.source });
        else {
          const w = prev.w + popK;
          map.set(p.year, { v: (prev.v * prev.w + p.value * popK) / w, w, source: prev.source });
        }
      }
      return [...map.entries()].sort((x, y) => x[0] - y[0]).map(([year, x]) => ({ year, value: x.v, source: x.source }));
    };
    serbia.series.population = merge(serbia.series.population, fake.series.population, "sum");
    serbia.series.netMigration = merge(serbia.series.netMigration, fake.series.netMigration, "sum");
    serbia.series.births = merge(serbia.series.births || [], fake.series.births || [], "sum");
    serbia.series.tfr = merge(serbia.series.tfr, fake.series.tfr, "wavg");
    serbia.series.e0 = merge(serbia.series.e0, fake.series.e0, "wavg");
    if (serbia.wppMedium && fake.wppMedium) {
      serbia.wppMedium.population = merge(serbia.wppMedium.population, fake.wppMedium.population, "sum");
      serbia.wppMedium.netMigration = merge(serbia.wppMedium.netMigration, fake.wppMedium.netMigration, "sum");
      serbia.wppMedium.births = merge(serbia.wppMedium.births, fake.wppMedium.births, "sum");
      serbia.wppMedium.tfr = merge(serbia.wppMedium.tfr, fake.wppMedium.tfr, "wavg");
      serbia.wppMedium.e0 = merge(serbia.wppMedium.e0, fake.wppMedium.e0, "wavg");
    }
  }
  return countries;
}
