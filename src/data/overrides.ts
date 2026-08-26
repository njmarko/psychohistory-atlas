import type { CountryRecord } from "../store/types";

const KEY = "pt.db.overrides.v1";

export type Overlay = Record<string, Partial<CountryRecord> & { iso3?: string }>;

export function loadOverrides(): Overlay {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveOverrides(overlay: Overlay) {
  localStorage.setItem(KEY, JSON.stringify(overlay));
}

export function clearOverrides() {
  localStorage.removeItem(KEY);
}

export function applyOverrides(
  countries: Record<string, CountryRecord>,
  overlay: Overlay
): Record<string, CountryRecord> {
  const out: Record<string, CountryRecord> = { ...countries };
  for (const [key, patch] of Object.entries(overlay)) {
    const match =
      out[key] ||
      Object.values(out).find((c) => c.iso3 === key || c.iso3 === patch.iso3);
    if (!match) continue;
    const latest = { ...match.latest, ...(patch.latest ?? {}) };
    if (latest.tfr != null && latest.idealTfr != null) {
      latest.fertilityGap = latest.tfr - latest.idealTfr;
    }
    out[match.name] = {
      ...match,
      ...patch,
      name: match.name,
      latest,
      series: { ...match.series, ...(patch.series ?? {}) },
      base: { ...match.base, ...(patch.base ?? {}) },
    };
  }
  return out;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
