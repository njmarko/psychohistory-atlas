/**
 * Multi-country / multi-region projection for world-map mode.
 * Deterministic — same inputs → same outputs. No RNG.
 */
import {
  expandToSingleYear,
  stepSingleYear,
  collapseTo5Year,
  totalPop,
  medianAge,
  ageShare,
} from "./simulation.js";

export const REPLACEMENT_TFR = 2.1;

/**
 * Project one country; store only annual aggregates (fast, compact).
 */
export function projectCountryTotals(base, params, startYear, endYear) {
  const expanded = expandToSingleYear(base.male, base.female);
  let male = expanded.male;
  let female = expanded.female;

  const series = [];
  const push = (year) => {
    const c = collapseTo5Year(male, female);
    const pop = totalPop(c.male, c.female);
    series.push({
      year,
      population: Math.round(pop),
      male: Math.round(c.male.reduce((a, b) => a + b, 0)),
      female: Math.round(c.female.reduce((a, b) => a + b, 0)),
      medianAge: medianAge(c.male, c.female),
      youthPct: ageShare(c.male, c.female, 0, 2),
      elderlyPct: ageShare(c.male, c.female, 13, 20),
    });
  };

  push(startYear);
  const steps = Math.max(0, endYear - startYear);
  for (let i = 0; i < steps; i++) {
    ({ male, female } = stepSingleYear(male, female, params));
    push(startYear + i + 1);
  }
  return series;
}

/**
 * @param {Record<string, object>} countries - countries.json entries
 * @param {string[]} names - which countries to include
 * @param {object} globalParams - { tfr?, lifeExpectancy, migration, sexRatioBirth, useCountryTfr, useCountryLe }
 * @param {Record<string, number>} leByCountry
 */
export function projectAllCountries(
  countries,
  names,
  globalParams,
  startYear,
  endYear,
  leByCountry = {}
) {
  const byCountry = {};
  for (const name of names) {
    const c = countries[name];
    if (!c?.male || !c?.female) continue;
    if (name === "World") continue;

    const tfr = globalParams.useCountryTfr
      ? Number(c.tfr) || globalParams.tfr
      : globalParams.tfr;
    const lifeExpectancy = globalParams.useCountryLe
      ? leByCountry[name] ?? globalParams.lifeExpectancy
      : globalParams.lifeExpectancy;

    const params = {
      tfr,
      lifeExpectancy,
      migration: globalParams.migration || 0,
      sexRatioBirth: globalParams.sexRatioBirth || 1.05,
    };

    byCountry[name] = {
      name,
      iso2: c.iso2 || null,
      iso3: c.iso3 || null,
      isoNum: c.isoNum != null ? c.isoNum : null,
      region: c.region || "Other",
      tfr,
      tfrYear: c.tfrYear || null,
      inTfr2026: !!c.inTfr2026,
      baseYear: c.year || startYear,
      series: projectCountryTotals(
        { male: c.male, female: c.female },
        params,
        startYear,
        endYear
      ),
    };
  }
  return byCountry;
}

/** Snapshot of all countries at a given year index (0 = start). */
export function snapshotYear(byCountry, yearIndex) {
  const out = {};
  let worldPop = 0;
  for (const [name, rec] of Object.entries(byCountry)) {
    const frame = rec.series[yearIndex] || rec.series[rec.series.length - 1];
    if (!frame) continue;
    worldPop += frame.population;
    out[name] = {
      ...frame,
      name,
      iso2: rec.iso2,
      iso3: rec.iso3,
      isoNum: rec.isoNum,
      region: rec.region,
      tfr: rec.tfr,
      tfrYear: rec.tfrYear,
      inTfr2026: rec.inTfr2026,
      tfrVsReplacement: rec.tfr / REPLACEMENT_TFR,
    };
  }
  for (const name of Object.keys(out)) {
    out[name].worldShare = worldPop > 0 ? out[name].population / worldPop : 0;
  }
  return { countries: out, worldPop, yearIndex };
}

/** Aggregate country snapshot into continents/regions. */
export function aggregateRegions(snapshot) {
  const regions = {};
  for (const rec of Object.values(snapshot.countries)) {
    const r = rec.region || "Other";
    if (!regions[r]) {
      regions[r] = {
        name: r,
        population: 0,
        male: 0,
        female: 0,
        // weighted sums for averages
        _tfrPop: 0,
        _medPop: 0,
        _youthPop: 0,
        _eldPop: 0,
        countries: [],
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
    g.worldShare = worldPop > 0 ? g.population / worldPop : 0;
    g.tfrVsReplacement = g.tfr / REPLACEMENT_TFR;
    g.year = Object.values(snapshot.countries)[0]?.year;
    delete g._tfrPop;
    delete g._medPop;
    delete g._youthPop;
    delete g._eldPop;
  }

  return { regions, worldPop, year: Object.values(snapshot.countries)[0]?.year };
}

export function formatPop(n) {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
}
