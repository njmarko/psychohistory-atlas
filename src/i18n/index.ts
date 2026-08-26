import { en, type Messages } from "./en";
import { sr } from "./sr";
import { COUNTRY_NAMES } from "./countries";
import { I18N_OPTIONS, I18N_PLACEHOLDER, I18N_TEXT, I18N_TIP } from "./bind";

export type LocaleId = "en" | "sr";

export type LocaleDef = {
  id: LocaleId;
  bcp47: string;
  flag: string;
  nativeName: string;
  short: string;
};

/** Add a language: append a row here, add a catalog file, and (optionally) country names. */
export const LOCALES: LocaleDef[] = [
  { id: "en", bcp47: "en", flag: "🇬🇧", nativeName: "English", short: "EN" },
  { id: "sr", bcp47: "sr-Cyrl", flag: "🇷🇸", nativeName: "Српски", short: "СР" },
];

const CATALOGS: Record<LocaleId, Messages> = { en, sr };

let current: LocaleId = "en";

export function isLocaleId(v: unknown): v is LocaleId {
  return v === "en" || v === "sr";
}

export function getLocale(): LocaleId {
  return current;
}

export function localeDef(id: LocaleId = current): LocaleDef {
  return LOCALES.find((l) => l.id === id) || LOCALES[0];
}

function lookup(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function t(path: string, vars?: Record<string, string | number>): string {
  const raw = lookup(CATALOGS[current], path) ?? lookup(en, path);
  let s = typeof raw === "string" ? raw : path;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

export function tOr(path: string, fallback: string, vars?: Record<string, string | number>): string {
  const raw = lookup(CATALOGS[current], path) ?? lookup(en, path);
  if (typeof raw !== "string") return fallback;
  return t(path, vars);
}

export function countryName(english: string): string {
  if (current === "en") return english;
  return COUNTRY_NAMES[current]?.[english] || english;
}

export function regionName(english: string): string {
  const v = lookup(CATALOGS[current], `regions.${english}`);
  return typeof v === "string" ? v : english;
}

export function setLocale(id: LocaleId) {
  current = id;
  const def = localeDef(id);
  document.documentElement.lang = def.bcp47;
}

export function applyDomI18n() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const text = t(key);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.placeholder != null) el.placeholder = text;
    } else {
      el.textContent = text;
    }
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-tip]").forEach((el) => {
    const key = el.getAttribute("data-i18n-tip");
    if (key) el.setAttribute("data-tip", t(key));
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key && "placeholder" in el) (el as HTMLInputElement).placeholder = t(key);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key));
  });
  const title = t("meta.title");
  if (title) document.title = title;
  applyBoundI18n();
}

function applyBoundI18n() {
  for (const [sel, key, kind] of I18N_TEXT) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const text = t(key);
    if (kind === "self") el.textContent = text;
    else if (kind === "check") {
      const span = el.closest("label")?.querySelector("span");
      if (span) span.textContent = text;
    } else if (kind === "compact") {
      const span = el.closest("label")?.querySelector("span");
      if (span) span.textContent = text;
    } else if (kind === "stat") {
      const lab = el.parentElement?.querySelector(".stat-label");
      if (lab) lab.textContent = text;
    } else if (kind === "toolbarYear") {
      const span = el.closest("label")?.querySelector("span");
      if (span) span.textContent = text;
    } else {
      const span = el.closest("label")?.querySelector(":scope > span");
      if (span && !span.querySelector("input, label")) span.textContent = text;
    }
  }
  for (const [sel, key] of I18N_TIP) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const tip = t(key);
    el.setAttribute("data-tip", tip);
    const host = el.closest("label, .stat, .field, .check, .view-toolbar-year");
    if (host && host !== el) host.setAttribute("data-tip", tip);
  }
  for (const [sel, key] of I18N_PLACEHOLDER) {
    const el = document.querySelector<HTMLInputElement>(sel);
    if (el) el.placeholder = t(key);
  }
  for (const [sel, map] of I18N_OPTIONS) {
    const box = document.querySelector<HTMLSelectElement>(sel);
    if (!box) continue;
    for (const opt of Array.from(box.options)) {
      const k = map[opt.value];
      if (k) opt.textContent = t(k);
    }
  }
}
