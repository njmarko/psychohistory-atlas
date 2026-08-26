import { AGE_LABELS, N_GROUPS, MID_AGES } from "./ages";
import type { PyramidFrame, SimParams } from "../store/types";

const FERTILITY_SHARES = [
  0, 0, 0, 0.04, 0.18, 0.28, 0.26, 0.16, 0.07, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

function mortalityRates(lifeExpectancy: number): number[] {
  const base = [
    0.0018, 0.00022, 0.00018, 0.00035, 0.00045, 0.00055, 0.0007, 0.00095, 0.0014, 0.0022, 0.0035,
    0.0055, 0.0085, 0.013, 0.021, 0.034, 0.055, 0.09, 0.15, 0.24, 0.35,
  ];
  const le = Math.max(50, Math.min(95, lifeExpectancy));
  const factor = Math.pow(78 / le, 2.4);
  return base.map((q, i) => {
    const ageBoost = i >= 14 ? Math.pow(78 / le, 0.6) : 1;
    return Math.min(0.8, q * factor * ageBoost);
  });
}

export function expandToSingleYear(male5: number[], female5: number[]) {
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

export function collapseTo5Year(male: Float64Array, female: Float64Array) {
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

function singleYearMortality(le: number) {
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

function zeros21(): number[] {
  return new Array(N_GROUPS).fill(0);
}

export type StepResult = {
  male: Float64Array;
  female: Float64Array;
  deathsMale5: number[];
  deathsFemale5: number[];
  birthsByMotherMale5: number[];
  birthsByMotherFemale5: number[];
  birthsTotal: number;
  deathsTotal: number;
};

export function stepSingleYear(
  male: Float64Array,
  female: Float64Array,
  params: SimParams
): StepResult {
  const { tfr, lifeExpectancy, migration, sexRatioBirth } = params;
  const q = singleYearMortality(lifeExpectancy);

  const deathsMale5 = zeros21();
  const deathsFemale5 = zeros21();
  let deathsTotal = 0;

  for (let a = 0; a <= 100; a++) {
    const g = a === 100 ? 20 : Math.min(19, Math.floor(a / 5));
    const dm = male[a] * q[a];
    const df = female[a] * q[a];
    deathsMale5[g] += dm;
    deathsFemale5[g] += df;
    deathsTotal += dm + df;
    male[a] *= 1 - q[a];
    female[a] *= 1 - q[a];
  }

  const birthsByMotherMale5 = zeros21();
  const birthsByMotherFemale5 = zeros21();
  let births = 0;
  const boyShare = sexRatioBirth / (1 + sexRatioBirth);
  for (let g = 3; g <= 9; g++) {
    let women = 0;
    for (let k = 0; k < 5; k++) women += female[g * 5 + k];
    const share = FERTILITY_SHARES[g] || 0;
    const b = women * ((tfr * share) / 5);
    births += b;
    birthsByMotherMale5[g] = b * boyShare;
    birthsByMotherFemale5[g] = b * (1 - boyShare);
  }

  const boys = births * boyShare;
  const girls = births - boys;

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

  return {
    male,
    female,
    deathsMale5,
    deathsFemale5,
    birthsByMotherMale5,
    birthsByMotherFemale5,
    birthsTotal: births,
    deathsTotal,
  };
}

function frameFromSingle(
  year: number,
  male: Float64Array,
  female: Float64Array,
  extra?: Partial<PyramidFrame>
): PyramidFrame {
  const collapsed = collapseTo5Year(male, female);
  return {
    year,
    male: collapsed.male.map((v) => Math.round(v)),
    female: collapsed.female.map((v) => Math.round(v)),
    ...extra,
  };
}

export function maxBar(frame: { male: number[]; female: number[] }) {
  let m = 1;
  for (let i = 0; i < N_GROUPS; i++) {
    m = Math.max(m, frame.male[i] || 0, frame.female[i] || 0);
  }
  return m;
}

export type YearParams = SimParams | ((year: number) => SimParams);

function vitalsFromStep(stepped: StepResult) {
  return {
    deathsMale: stepped.deathsMale5.map((v) => Math.round(v)),
    deathsFemale: stepped.deathsFemale5.map((v) => Math.round(v)),
    birthsByMotherMale: stepped.birthsByMotherMale5.map((v) => Math.round(v)),
    birthsByMotherFemale: stepped.birthsByMotherFemale5.map((v) => Math.round(v)),
    birthsTotal: Math.round(stepped.birthsTotal),
    deathsTotal: Math.round(stepped.deathsTotal),
  };
}

export function projectSeries(
  base: { male: number[]; female: number[] },
  params: YearParams,
  startYear: number,
  endYear: number
): PyramidFrame[] {
  const expanded = expandToSingleYear(base.male, base.female);
  let male = expanded.male;
  let female = expanded.female;
  const frames: PyramidFrame[] = [];
  const steps = Math.max(0, endYear - startYear);
  for (let i = 0; i <= steps; i++) {
    const year = startYear + i;
    const p = typeof params === "function" ? params(year) : params;
    const nextM = new Float64Array(male);
    const nextF = new Float64Array(female);
    const stepped = stepSingleYear(nextM, nextF, p);
    frames.push(
      frameFromSingle(year, male, female, {
        ...vitalsFromStep(stepped),
        tfr: p.tfr,
        lifeExpectancy: p.lifeExpectancy,
        netMigration: p.migration,
      })
    );
    if (i < steps) {
      male = nextM;
      female = nextF;
    }
  }
  return frames;
}

export function totalPop(male: number[], female: number[]) {
  let t = 0;
  for (let i = 0; i < N_GROUPS; i++) t += (male[i] || 0) + (female[i] || 0);
  return t;
}

export function medianAge(male: number[], female: number[]) {
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

export function ageShare(male: number[], female: number[], fromGroup: number, toGroup: number) {
  const total = totalPop(male, female);
  if (total <= 0) return 0;
  let n = 0;
  for (let g = fromGroup; g <= toGroup; g++) n += (male[g] || 0) + (female[g] || 0);
  return (n / total) * 100;
}

export { AGE_LABELS };
