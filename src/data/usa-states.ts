import type { CountryRecord, SourceRef } from "../store/types";
import { SOURCES } from "./sources";

export const USA_STATE_PREFIX = "US::";

export function isUsaStateKey(name: string) {
  return name.startsWith(USA_STATE_PREFIX);
}

export function usaStateKey(name: string) {
  return name.startsWith(USA_STATE_PREFIX) ? name : USA_STATE_PREFIX + name;
}

export function usaStateLabel(name: string) {
  return name.startsWith(USA_STATE_PREFIX) ? name.slice(USA_STATE_PREFIX.length) : name;
}

type PackedState = {
  fips: string;
  abbr: string;
  iso2: string;
  tfr: number;
  tmr: number;
  cpm: number;
  population: number;
};

type UsaFile = {
  source: SourceRef;
  populationSource: SourceRef;
  national: { name: string; tfr: number; tmr: number; cpm: number; population: number };
  states: Record<string, PackedState>;
};

function scalePyramid(base: number[], share: number) {
  return base.map((n) => Math.max(0, (n || 0) * share));
}

export async function loadUsaStates(us: CountryRecord | undefined): Promise<Record<string, CountryRecord>> {
  const res = await fetch("./data/usa-states.json");
  if (!res.ok) return {};
  const raw = (await res.json()) as UsaFile;
  const src = raw.source || SOURCES.birthgauge2025us;
  const popSrc = raw.populationSource;
  const usPop = Math.max(1, us?.base?.population || raw.national?.population || 1);
  const out: Record<string, CountryRecord> = {};
  for (const [name, st] of Object.entries(raw.states || {})) {
    const share = (st.population || 0) / usPop;
    const male = us?.base?.male ? scalePyramid(us.base.male, share) : [];
    const female = us?.base?.female ? scalePyramid(us.base.female, share) : [];
    const year = src.year || 2025;
    const e0 = us?.latest?.e0 ?? 78;
    const e0Year = us?.latest?.e0Year ?? year;
    out[usaStateKey(name)] = {
      name,
      iso2: st.iso2,
      iso3: `US${st.abbr}`,
      isoNum: Number(st.fips) || 0,
      region: "Americas",
      note: "Age–sex scaled from the United States WPP pyramid by Census state population. TFR from BirthGauge 2025.",
      base: {
        year: us?.base?.year || year,
        male,
        female,
        population: st.population,
        source: popSrc || src,
      },
      latest: {
        tfr: st.tfr,
        tfrYear: year,
        tfrSource: src,
        e0,
        e0Year,
        e0Source: us?.latest?.e0Source,
        netMigration: 0,
        netMigrationYear: year,
        netMigrationSource: src,
        srb: us?.latest?.srb || 1.05,
        idealTfr: null,
        idealTfrYear: null,
        idealTfrSource: null,
        idealTfrMeanAll: null,
        fertilityGap: null,
        tmr: st.tmr,
        tmrYear: year,
        cpm: st.cpm,
        cpmYear: year,
      },
      series: {
        tfr: [{ year, value: st.tfr, source: src.id }],
        population: [{ year, value: st.population, source: popSrc?.id || src.id }],
        e0: us?.series?.e0?.length ? us.series.e0.map((p) => ({ ...p })) : [{ year: e0Year, value: e0, source: "wpp2024" }],
        netMigration: [{ year, value: 0, source: src.id }],
        idealTfr: [],
      },
    };
  }
  return out;
}
