import {
  ageShare,
  medianAge,
  projectSeries,
  totalPop,
  type YearParams,
} from "./cohort";
import type { CountryRecord, PyramidFrame, SimParams } from "../store/types";
import { seriesValueAt, seriesValueInRange } from "../data/load";
import { REPLACEMENT_TFR } from "../data/sources";

export { REPLACEMENT_TFR };

export type CountryRun = {
  name: string;
  iso2: string;
  iso3: string;
  isoNum: number;
  region: string;
  tfr: number;
  tfrYear: number | null;
  inTfr2026: boolean;
  e0: number;
  netMigration: number;
  idealTfr: number | null;
  fertilityGap: number | null;
  series: PyramidFrame[];
  rec: CountryRecord;
};

export function paramsForCountry(
  rec: CountryRecord,
  global: SimParams & {
    useCountryTfr: boolean;
    useCountryLe: boolean;
    useCountryMig: boolean;
    useWppMediumRates?: boolean;
    useUnE0ByYear?: boolean;
    applyTfr?: boolean;
    applyLe?: boolean;
    applyMig?: boolean;
    applySrb?: boolean;
  }
): YearParams {
  const wpp = rec.wppMedium;
  const wppFrom = (pts?: { year: number }[]) => (pts && pts.length ? pts[0].year : 9999);
  const useWpp = !!global.useWppMediumRates && !!wpp;
  const applyTfr = global.applyTfr !== false;
  const applyLe = global.applyLe !== false;
  const applyMig = !!global.applyMig;
  const applySrb = global.applySrb !== false;
  return (year: number) => {
    const tfr = !applyTfr || global.useCountryTfr
      ? (useWpp && year >= wppFrom(wpp!.tfr) ? seriesValueAt(wpp!.tfr, year) : null) ??
        seriesValueAt(rec.series.tfr, year) ??
        rec.latest.tfr
      : global.tfr;
    const unE0 =
      global.useUnE0ByYear !== false
        ? seriesValueInRange(rec.series.e0, year) ?? seriesValueInRange(wpp?.e0, year)
        : null;
    const lifeExpectancy =
      unE0 != null
        ? unE0
        : !applyLe || global.useCountryLe
          ? (useWpp && year >= wppFrom(wpp!.e0) ? seriesValueAt(wpp!.e0, year) : null) ??
            seriesValueAt(rec.series.e0, year) ??
            rec.latest.e0
          : global.lifeExpectancy;
    const migration = !applyMig
      ? 0
      : global.useCountryMig
        ? (useWpp && year >= wppFrom(wpp!.netMigration) ? seriesValueAt(wpp!.netMigration, year) : null) ??
          seriesValueAt(rec.series.netMigration, year) ??
          rec.latest.netMigration ??
          0
        : global.migration;
    return {
      tfr: tfr ?? global.tfr,
      lifeExpectancy: lifeExpectancy ?? global.lifeExpectancy,
      migration: migration ?? 0,
      sexRatioBirth: applySrb ? rec.latest.srb || global.sexRatioBirth || 1.05 : 1.05,
    };
  };
}

export function projectAllCountries(
  countries: Record<string, CountryRecord>,
  names: string[],
  global: SimParams & {
    useCountryTfr: boolean;
    useCountryLe: boolean;
    useCountryMig: boolean;
    applyMig?: boolean;
    applyTfr?: boolean;
    applyLe?: boolean;
    applySrb?: boolean;
    useWppMediumRates?: boolean;
    useUnE0ByYear?: boolean;
    idealMode?: "latest" | "meanAll";
  },
  startYear: number,
  endYear: number
): Record<string, CountryRun> {
  const byCountry: Record<string, CountryRun> = {};
  for (const name of names) {
    const c = countries[name];
    if (!c?.base?.male) continue;
    const tfr = global.applyTfr === false || global.useCountryTfr ? c.latest.tfr : global.tfr;
    byCountry[name] = {
      name,
      iso2: c.iso2,
      iso3: c.iso3,
      isoNum: c.isoNum,
      region: c.region,
      tfr,
      tfrYear: c.latest.tfrYear,
      inTfr2026: c.latest.tfrSource.id === "birthgauge2026",
      e0: global.applyLe === false || global.useCountryLe ? c.latest.e0 : global.lifeExpectancy,
      netMigration: global.applyMig ? (global.useCountryMig ? c.latest.netMigration : global.migration) : 0,
      idealTfr:
        global.idealMode === "meanAll"
          ? c.latest.idealTfrMeanAll ?? c.latest.idealTfr
          : c.latest.idealTfr,
      fertilityGap: (() => {
        const ideal =
          global.idealMode === "meanAll"
            ? c.latest.idealTfrMeanAll ?? c.latest.idealTfr
            : c.latest.idealTfr;
        return ideal != null ? tfr - ideal : null;
      })(),
      series: projectSeries(c.base, paramsForCountry(c, global), startYear, endYear),
      rec: c,
    };
  }
  return byCountry;
}

export function snapshotFromSeries(all: Record<string, CountryRecord>, year: number) {
  const out: Record<string, ReturnType<typeof frameToSnap>> = {};
  let worldPop = 0;
  for (const [name, rec] of Object.entries(all)) {
    if (!rec?.base?.male) continue;
    const pop = seriesValueAt(rec.series.population, year) ?? rec.base.population;
    const tfr = seriesValueAt(rec.series.tfr, year) ?? rec.latest.tfr;
    const e0 = seriesValueAt(rec.series.e0, year) ?? rec.latest.e0;
    const mig = seriesValueAt(rec.series.netMigration, year) ?? rec.latest.netMigration ?? 0;
    const frame: PyramidFrame = {
      year,
      male: rec.base.male,
      female: rec.base.female,
      tfr,
      lifeExpectancy: e0,
      netMigration: mig,
    };
    const fakeRun: CountryRun = {
      name,
      iso2: rec.iso2,
      iso3: rec.iso3,
      isoNum: rec.isoNum,
      region: rec.region,
      tfr,
      tfrYear: year,
      inTfr2026: rec.latest.tfrSource?.id === "birthgauge2026",
      e0,
      netMigration: mig,
      idealTfr: rec.latest.idealTfr,
      fertilityGap: rec.latest.idealTfr != null ? tfr - rec.latest.idealTfr : rec.latest.fertilityGap,
      series: [frame],
      rec,
    };
    const snap = frameToSnap(name, fakeRun, frame);
    snap.population = Math.round(pop || 0);
    snap.tfr = tfr;
    snap.e0 = e0;
    snap.netMigration = mig;
    snap.year = year;
    worldPop += snap.population;
    out[name] = snap;
  }
  for (const name of Object.keys(out)) {
    out[name].worldShare = worldPop > 0 ? out[name].population / worldPop : 0;
  }
  return { countries: out, worldPop, yearIndex: 0 };
}

export function snapshotYear(byCountry: Record<string, CountryRun>, yearIndex: number) {
  const out: Record<string, ReturnType<typeof frameToSnap>> = {};
  let worldPop = 0;
  for (const [name, rec] of Object.entries(byCountry)) {
    const frame = rec.series[yearIndex] || rec.series[rec.series.length - 1];
    if (!frame) continue;
    const snap = frameToSnap(name, rec, frame);
    worldPop += snap.population;
    out[name] = snap;
  }
  for (const name of Object.keys(out)) {
    out[name].worldShare = worldPop > 0 ? out[name].population / worldPop : 0;
  }
  return { countries: out, worldPop, yearIndex };
}

function frameToSnap(name: string, rec: CountryRun, frame: PyramidFrame) {
  const population = Math.round(totalPop(frame.male, frame.female));
  const tfr = frame.tfr ?? rec.tfr;
  const e0 = frame.lifeExpectancy ?? rec.e0;
  const netMigration =
    seriesValueAt(rec.rec.series.netMigration, frame.year) ??
    rec.rec.latest.netMigration ??
    rec.netMigration ??
    0;
  const fertilityGap = rec.idealTfr != null ? tfr - rec.idealTfr : rec.fertilityGap;
  return {
    year: frame.year,
    name,
    iso2: rec.iso2,
    iso3: rec.iso3,
    isoNum: rec.isoNum,
    region: rec.region,
    population,
    male: Math.round(frame.male.reduce((a, b) => a + b, 0)),
    female: Math.round(frame.female.reduce((a, b) => a + b, 0)),
    medianAge: medianAge(frame.male, frame.female),
    youthPct: ageShare(frame.male, frame.female, 0, 2),
    elderlyPct: ageShare(frame.male, frame.female, 13, 20),
    tfr,
    tfrYear: rec.tfrYear,
    e0,
    netMigration,
    idealTfr: rec.idealTfr,
    fertilityGap,
    tfrVsReplacement: tfr - REPLACEMENT_TFR,
    worldShare: 0,
    frame,
  };
}

export function aggregateRegions(snapshot: ReturnType<typeof snapshotYear>) {
  const regions: Record<string, any> = {};
  for (const rec of Object.values(snapshot.countries)) {
    const r = rec.region || "Other";
    if (!regions[r]) {
      regions[r] = {
        name: r,
        population: 0,
        male: 0,
        female: 0,
        _tfrPop: 0,
        _medPop: 0,
        _youthPop: 0,
        _eldPop: 0,
        _e0Pop: 0,
        _mig: 0,
        _idealPop: 0,
        _idealW: 0,
        countries: [] as string[],
      };
    }
    const g = regions[r];
    g.population += rec.population;
    g.male += rec.male;
    g.female += rec.female;
    g._tfrPop += rec.tfr * rec.population;
    g._medPop += rec.medianAge * rec.population;
    g._youthPop += rec.youthPct * rec.population;
    g._eldPop += rec.elderlyPct * rec.population;
    g._e0Pop += (rec.e0 || 0) * rec.population;
    g._mig += rec.netMigration || 0;
    if (rec.idealTfr != null) {
      g._idealPop += rec.idealTfr * rec.population;
      g._idealW += rec.population;
    }
    g.countries.push(rec.name);
  }

  let worldPop = 0;
  for (const g of Object.values(regions)) worldPop += g.population;
  for (const g of Object.values(regions)) {
    const p = g.population || 1;
    g.tfr = g._tfrPop / p;
    g.medianAge = g._medPop / p;
    g.youthPct = g._youthPop / p;
    g.elderlyPct = g._eldPop / p;
    g.e0 = g._e0Pop / p;
    g.netMigration = g._mig;
    g.idealTfr = g._idealW ? g._idealPop / g._idealW : null;
    g.fertilityGap = g.idealTfr != null ? g.tfr - g.idealTfr : null;
    g.worldShare = worldPop > 0 ? g.population / worldPop : 0;
    g.tfrVsReplacement = g.tfr - REPLACEMENT_TFR;
    g.year = Object.values(snapshot.countries)[0]?.year;
    delete g._tfrPop;
    delete g._medPop;
    delete g._youthPop;
    delete g._eldPop;
    delete g._e0Pop;
    delete g._mig;
    delete g._idealPop;
    delete g._idealW;
  }
  return { regions, worldPop, year: Object.values(snapshot.countries)[0]?.year };
}

export function formatPop(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
}
