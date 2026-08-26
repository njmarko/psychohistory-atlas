import type { CountryRecord, SeriesPoint, SourceRef } from "../store/types";
import { SOURCES } from "./sources";
import { mergeKosovoIntoSerbia } from "./serbia-kosovo";

type LegacyCountry = {
  name: string;
  year: number;
  iso2: string;
  iso3: string;
  isoNum: number;
  region: string;
  male: number[];
  female: number[];
  population: number;
  tfr: number;
  tfrYear?: number;
  tfrSource?: string;
  inTfr2026?: boolean;
  includesKosovo?: boolean;
  note?: string;
};

type BirthGaugeRow = {
  name: string;
  tfr_2015?: string | null;
  tfr_2020?: string | null;
  tfr_2024?: string | null;
  tfr_2025?: string | null;
  tfr_2026?: string | null;
  births_2025?: string | null;
  births_2026?: string | null;
};

const TFR_NAME_MAP: Record<string, string> = {
  Czechia: "Czech Republic",
  "Bosnia & Herzeg.": "Bosnia and Herzegovina",
  "Bosnia & Herzeg": "Bosnia and Herzegovina",
  "Dominican Rep.": "Dominican Republic",
  "U. Arab Emirates": "United Arab Emirates",
};

function parseTfr(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = parseFloat(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseBirths(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = parseFloat(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function seriesFrom(points: { year: number; value: number | null; source: string }[]): SeriesPoint[] {
  return points
    .filter((p): p is { year: number; value: number; source: string } => p.value != null)
    .sort((a, b) => a.year - b.year);
}

export function normalizeLegacy(
  legacy: Record<string, LegacyCountry>,
  birthGauge?: { countries?: BirthGaugeRow[] },
  extras?: Record<string, Partial<CountryRecord>>
): Record<string, CountryRecord> {
  const bgByName = new Map<string, BirthGaugeRow>();
  for (const row of birthGauge?.countries ?? []) {
    const cleaned = String(row.name).replace(/[°*]+/g, "").trim();
    const key = TFR_NAME_MAP[cleaned] || cleaned;
    bgByName.set(key, row);
  }

  const out: Record<string, CountryRecord> = {};
  for (const [name, c] of Object.entries(legacy)) {
    if (name === "World") continue;
    const bg = bgByName.get(name);
    const tfrPts = seriesFrom([
      { year: 2015, value: parseTfr(bg?.tfr_2015), source: "birthgauge2026" },
      { year: 2020, value: parseTfr(bg?.tfr_2020), source: "birthgauge2026" },
      { year: 2024, value: parseTfr(bg?.tfr_2024) ?? c.tfr, source: bg?.tfr_2024 ? "birthgauge2026" : "wpp2024" },
      { year: 2025, value: parseTfr(bg?.tfr_2025), source: "birthgauge2026" },
      { year: 2026, value: parseTfr(bg?.tfr_2026), source: "birthgauge2026" },
    ]);
    const latestTfrPt = [...tfrPts].reverse()[0];
    const tfr = latestTfrPt?.value ?? c.tfr;
    const tfrYear = latestTfrPt?.year ?? c.tfrYear ?? c.year;
    const tfrSource: SourceRef =
      latestTfrPt?.source === "birthgauge2026" ? SOURCES.birthgauge2026 : SOURCES.wpp2024;

    const extra = extras?.[c.iso3] || extras?.[c.iso2] || extras?.[name] || {};
    const e0 = extra.latest?.e0 ?? defaultE0(c.region);
    const netMig = extra.latest?.netMigration ?? 0;

    const rec: CountryRecord = {
      name,
      iso2: c.iso2,
      iso3: c.iso3,
      isoNum: c.isoNum,
      region: (c.region as CountryRecord["region"]) || "Other",
      includesKosovo: !!c.includesKosovo,
      note: c.note,
      base: {
        year: c.year,
        male: c.male,
        female: c.female,
        population: c.population,
        source: SOURCES.poppyramid,
      },
      latest: {
        tfr,
        tfrYear,
        tfrSource,
        e0,
        e0Year: extra.latest?.e0Year ?? 2023,
        e0Source: extra.latest?.e0Source ?? SOURCES.wpp2024,
        netMigration: netMig,
        netMigrationYear: extra.latest?.netMigrationYear ?? 2023,
        netMigrationSource: extra.latest?.netMigrationSource ?? SOURCES.wpp2024,
        srb: extra.latest?.srb ?? 1.05,
        idealTfr: extra.latest?.idealTfr ?? null,
        idealTfrYear: extra.latest?.idealTfrYear ?? null,
        idealTfrSource: extra.latest?.idealTfrSource ?? null,
        idealTfrMeanAll: extra.latest?.idealTfrMeanAll ?? extra.latest?.idealTfr ?? null,
        fertilityGap:
          extra.latest?.idealTfr != null ? tfr - extra.latest.idealTfr : extra.latest?.fertilityGap ?? null,
      },
      series: {
        tfr: tfrPts.length ? tfrPts : [{ year: tfrYear, value: tfr, source: tfrSource.id }],
        population: extra.series?.population ?? [
          { year: c.year, value: c.population, source: "poppyramid" },
        ],
        e0: extra.series?.e0 ?? [{ year: extra.latest?.e0Year ?? 2023, value: e0, source: "wpp2024" }],
        netMigration: extra.series?.netMigration ?? [
          { year: extra.latest?.netMigrationYear ?? 2023, value: netMig, source: "wpp2024" },
        ],
        idealTfr: extra.series?.idealTfr ?? [],
        births: seriesFrom([
          { year: 2025, value: parseBirths(bg?.births_2025), source: "birthgauge2026" },
          { year: 2026, value: parseBirths(bg?.births_2026), source: "birthgauge2026" },
        ]),
        inflow: extra.series?.inflow,
        outflow: extra.series?.outflow,
      },
    };
    if (rec.latest.idealTfr != null) rec.latest.fertilityGap = rec.latest.tfr - rec.latest.idealTfr;
    out[name] = rec;
  }

  const kosovo = out.Kosovo || null;
  if (out.Serbia) {
    out.Serbia = mergeKosovoIntoSerbia(out.Serbia, kosovo);
  }
  delete out.Kosovo;
  return out;
}

function defaultE0(region: string) {
  return (
    {
      Europe: 79,
      Americas: 76,
      Asia: 74,
      Oceania: 80,
      Africa: 64,
      Other: 72,
    }[region] ?? 74
  );
}
