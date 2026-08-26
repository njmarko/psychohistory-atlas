import { AGE_LABELS, N_GROUPS, MID_AGES } from "./ages.js";

/**
 * Standard age-specific fertility schedule (shares of TFR by 5-year group).
 * Applies to women aged 15–49 (indices 3–9).
 */
const FERTILITY_SHARES = [
  0, 0, 0, // 0-14
  0.04, // 15-19
  0.18, // 20-24
  0.28, // 25-29
  0.26, // 30-34
  0.16, // 35-39
  0.07, // 40-44
  0.01, // 45-49
];

/**
 * Build approximate annual mortality rates by 5-year group for a given
 * life expectancy at birth (both sexes).
 */
function mortalityRates(lifeExpectancy) {
  const base = [
    0.0018, 0.00022, 0.00018, 0.00035, 0.00045, 0.00055, 0.0007, 0.00095,
    0.0014, 0.0022, 0.0035, 0.0055, 0.0085, 0.013, 0.021, 0.034,
    0.055, 0.09, 0.15, 0.24, 0.35,
  ];
  const le = Math.max(50, Math.min(95, lifeExpectancy));
  const factor = Math.pow(78 / le, 2.4);
  return base.map((q, i) => {
    const ageBoost = i >= 14 ? Math.pow(78 / le, 0.6) : 1;
    return Math.min(0.8, q * factor * ageBoost);
  });
}

/**
 * Expand 5-year cohorts into single-year vectors (ages 0..99 + 100+).
 * Done ONCE at the start of a projection so within-group age structure is
 * preserved: ~1/5 of each 5-year band advances into the next band each year.
 */
export function expandToSingleYear(male5, female5) {
  const male = new Float64Array(101);
  const female = new Float64Array(101);
  for (let g = 0; g < N_GROUPS; g++) {
    if (g < 20) {
      const mEach = (male5[g] || 0) / 5;
      const fEach = (female5[g] || 0) / 5;
      for (let k = 0; k < 5; k++) {
        male[g * 5 + k] = mEach;
        female[g * 5 + k] = fEach;
      }
    } else {
      male[100] = male5[g] || 0;
      female[100] = female5[g] || 0;
    }
  }
  return { male, female };
}

/**
 * Collapse single-year vectors back to 5-year groups for display.
 */
export function collapseTo5Year(male, female) {
  const m5 = new Array(N_GROUPS).fill(0);
  const f5 = new Array(N_GROUPS).fill(0);
  for (let a = 0; a < 100; a++) {
    const g = Math.floor(a / 5);
    m5[g] += male[a];
    f5[g] += female[a];
  }
  m5[20] = male[100];
  f5[20] = female[100];
  return { male: m5, female: f5 };
}

function singleYearMortality(le) {
  const q5 = mortalityRates(le);
  const q = new Float64Array(101);
  for (let a = 0; a < 100; a++) {
    const g = Math.min(19, Math.floor(a / 5));
    const t = (a % 5) / 5;
    const next = Math.min(20, g + 1);
    q[a] = q5[g] * (1 - t) + q5[next] * t;
  }
  q[100] = q5[20];
  return q;
}

/**
 * Advance single-year population by one calendar year in place.
 * Cohort aging: age a → a+1 (so the 0–4 band loses its oldest fifth into 5–9,
 * gains new births at age 0, and the rest move up one year within the band).
 */
export function stepSingleYear(male, female, params) {
  const { tfr, lifeExpectancy, migration, sexRatioBirth } = params;
  const q = singleYearMortality(lifeExpectancy);

  // 1) Survival
  for (let a = 0; a <= 100; a++) {
    const s = 1 - q[a];
    male[a] *= s;
    female[a] *= s;
  }

  // 2) Births from current (surviving) women of childbearing age
  //    TFR = 5 × Σ ASFR_g  ⇒  ASFR_g = TFR × share_g / 5
  let births = 0;
  for (let g = 3; g <= 9; g++) {
    let women = 0;
    for (let k = 0; k < 5; k++) women += female[g * 5 + k];
    const share = FERTILITY_SHARES[g] || 0;
    births += women * ((tfr * share) / 5);
  }

  const boys = births * (sexRatioBirth / (1 + sexRatioBirth));
  const girls = births - boys;

  // 3) Age everyone +1 year (oldest first so we don't overwrite)
  for (let a = 100; a >= 1; a--) {
    if (a === 100) {
      male[100] = male[100] + male[99];
      female[100] = female[100] + female[99];
    } else {
      male[a] = male[a - 1];
      female[a] = female[a - 1];
    }
  }
  male[0] = boys;
  female[0] = girls;

  // 4) Net migration (working-age heavy)
  if (migration !== 0) {
    const weights = new Float64Array(101);
    let sumW = 0;
    for (let a = 0; a <= 100; a++) {
      const w = Math.exp(-0.5 * Math.pow((a - 28) / 14, 2));
      weights[a] = w;
      sumW += w;
    }
    for (let a = 0; a <= 100; a++) {
      const add = (migration * weights[a]) / sumW;
      male[a] = Math.max(0, male[a] + add * 0.5);
      female[a] = Math.max(0, female[a] + add * 0.5);
    }
  }

  return { male, female };
}

function frameFromSingle(year, male, female) {
  const collapsed = collapseTo5Year(male, female);
  return {
    year,
    male: collapsed.male.map((v) => Math.round(v)),
    female: collapsed.female.map((v) => Math.round(v)),
  };
}

/**
 * Largest single-sex 5-year bar in a frame (for fixed chart scale).
 */
export function maxBar(frame) {
  let m = 1;
  for (let i = 0; i < N_GROUPS; i++) {
    m = Math.max(m, frame.male[i] || 0, frame.female[i] || 0);
  }
  return m;
}

/**
 * Project from base year to a target year.
 * Single-year cohorts are kept for the whole run (expand once), so people
 * who start in 0–4 move into 5–9 over five years rather than being
 * re-flattened every step.
 */
export function projectSeries(base, params, startYear, endYear) {
  const expanded = expandToSingleYear(base.male, base.female);
  let male = expanded.male;
  let female = expanded.female;

  const frames = [];
  frames.push(frameFromSingle(startYear, male, female));

  const steps = Math.max(0, endYear - startYear);
  for (let i = 0; i < steps; i++) {
    ({ male, female } = stepSingleYear(male, female, params));
    frames.push(frameFromSingle(startYear + i + 1, male, female));
  }
  return frames;
}

export function totalPop(male, female) {
  let t = 0;
  for (let i = 0; i < N_GROUPS; i++) t += (male[i] || 0) + (female[i] || 0);
  return t;
}

export function medianAge(male, female) {
  const total = totalPop(male, female);
  if (total <= 0) return 0;
  const half = total / 2;
  let cum = 0;
  for (let g = 0; g < N_GROUPS; g++) {
    const n = (male[g] || 0) + (female[g] || 0);
    if (cum + n >= half) {
      const frac = n > 0 ? (half - cum) / n : 0;
      if (AGE_LABELS[g] === "100+") return 100 + frac * 5;
      return g * 5 + frac * 5;
    }
    cum += n;
  }
  return MID_AGES[N_GROUPS - 1];
}

export function ageShare(male, female, fromGroup, toGroup) {
  const total = totalPop(male, female);
  if (total <= 0) return 0;
  let n = 0;
  for (let g = fromGroup; g <= toGroup; g++) {
    n += (male[g] || 0) + (female[g] || 0);
  }
  return (n / total) * 100;
}

export { AGE_LABELS };
