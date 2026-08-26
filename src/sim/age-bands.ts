import { AGE_LABELS, N_GROUPS } from "./ages";

export function clampBands(n: number) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return N_GROUPS;
  return Math.max(1, Math.min(100, v));
}

/** Re-bin 5-year UN groups into `nBands` equal ranges covering 0–100. */
export function rebinAgeGroups(male: number[] = [], female: number[] = [], nBands: number) {
  const n = clampBands(nBands);
  if (n === N_GROUPS) {
    return {
      male: male.slice(0, N_GROUPS),
      female: female.slice(0, N_GROUPS),
      labels: AGE_LABELS.map(String),
    };
  }
  const m = new Array(n).fill(0);
  const f = new Array(n).fill(0);
  for (let g = 0; g < N_GROUPS; g++) {
    const age0 = g >= 20 ? 100 : g * 5;
    const age1 = g >= 20 ? 105 : g * 5 + 5;
    const mid = (age0 + age1) / 2;
    const b = Math.min(n - 1, Math.floor((Math.min(99.9, mid) / 100) * n));
    m[b] += male[g] || 0;
    f[b] += female[g] || 0;
  }
  const labels: string[] = [];
  for (let b = 0; b < n; b++) {
    const a0 = Math.round((b * 100) / n);
    const a1 = Math.round(((b + 1) * 100) / n) - 1;
    labels.push(b === n - 1 ? `${a0}+` : `${a0}–${a1}`);
  }
  return { male: m, female: f, labels };
}
