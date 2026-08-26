import { drawPyramid, formatNumber } from "./pyramid.js";
import {
  projectSeries,
  medianAge,
  ageShare,
  maxBar,
} from "./simulation.js";
import { exportPaintedVideo, downloadBlob } from "./video-export.js";
import {
  getFlagEmoji,
  loadFlagImage,
  preloadFlags,
} from "./flags.js";
import { colorsFromFlag } from "./flag-colors.js";
import { initCountrySearch } from "./country-search.js";
import {
  projectAllCountries,
  snapshotYear,
  aggregateRegions,
  formatPop,
  REPLACEMENT_TFR,
} from "./world-sim.js";
import { renderWorldMap, hoverHtml, loadMapLibs } from "./world-map.js";

const $ = (id) => document.getElementById(id);

const els = {
  countrySelect: $("countrySelect"),
  countrySearch: $("countrySearch"),
  countryList: $("countryList"),
  tfrRange: $("tfrRange"),
  tfrInput: $("tfrInput"),
  leRange: $("leRange"),
  leInput: $("leInput"),
  migRange: $("migRange"),
  migInput: $("migInput"),
  srbRange: $("srbRange"),
  srbInput: $("srbInput"),
  startYear: $("startYear"),
  endYear: $("endYear"),
  speedRange: $("speedRange"),
  speedInput: $("speedInput"),
  btnPlay: $("btnPlay"),
  btnPause: $("btnPause"),
  btnReset: $("btnReset"),
  yearScrub: $("yearScrub"),
  yearReadout: $("yearReadout"),
  maleColor: $("maleColor"),
  femaleColor: $("femaleColor"),
  bgColor: $("bgColor"),
  textColor: $("textColor"),
  showFlag: $("showFlag"),
  showCounts: $("showCounts"),
  showAgeLabels: $("showAgeLabels"),
  showGrid: $("showGrid"),
  showPercent: $("showPercent"),
  showLegend: $("showLegend"),
  showStats: $("showStats"),
  btnExport: $("btnExport"),
  btnSnapshot: $("btnSnapshot"),
  videoFormat: $("videoFormat"),
  exportFps: $("exportFps"),
  exportStatus: $("exportStatus"),
  canvas: $("pyramidCanvas"),
  statsBar: $("statsBar"),
  statTotal: $("statTotal"),
  statMale: $("statMale"),
  statFemale: $("statFemale"),
  statMedian: $("statMedian"),
  statYouth: $("statYouth"),
  statElderly: $("statElderly"),
  statTfr: $("statTfr"),
  modeTabs: $("modeTabs"),
  panelMapOptions: $("panelMapOptions"),
  mapCountrySet: $("mapCountrySet"),
  mapMetric: $("mapMetric"),
  heatLow: $("heatLow"),
  heatHigh: $("heatHigh"),
  tfrLow: $("tfrLow"),
  tfrHigh: $("tfrHigh"),
  useCountryTfr: $("useCountryTfr"),
  useCountryLe: $("useCountryLe"),
  mapShowMissing: $("mapShowMissing"),
  mapDataHint: $("mapDataHint"),
  btnClearPins: $("btnClearPins"),
  viewPyramid: $("viewPyramid"),
  viewMap: $("viewMap"),
  worldMapSvg: $("worldMapSvg"),
  mapHoverCard: $("mapHoverCard"),
  mapStatus: $("mapStatus"),
  mapTitle: $("mapTitle"),
  mapSubtitle: $("mapSubtitle"),
};

/** Life expectancy defaults by country (approx both-sex) */
const LIFE_EXPECTANCY = {
  Serbia: 76,
  "United States": 79,
  Germany: 81,
  Japan: 85,
  China: 78,
  India: 72,
  France: 83,
  "United Kingdom": 81,
  Italy: 83,
  Spain: 83,
  Brazil: 76,
  Russia: 73,
  Nigeria: 55,
  Croatia: 78,
  "Bosnia and Herzegovina": 77,
  Montenegro: 77,
  "North Macedonia": 76,
  Hungary: 76,
  Romania: 75,
  Bulgaria: 75,
  Poland: 78,
  Sweden: 83,
  Norway: 83,
  Netherlands: 82,
  Canada: 82,
  Australia: 83,
  Mexico: 75,
  "South Korea": 84,
  Turkey: 78,
  Egypt: 72,
  "South Africa": 65,
  Kenya: 67,
  Ethiopia: 66,
  Indonesia: 72,
  Pakistan: 67,
  Bangladesh: 73,
  Vietnam: 75,
  Thailand: 77,
  Argentina: 77,
  Chile: 80,
  Ukraine: 72,
  Greece: 81,
  Portugal: 82,
  Austria: 82,
  Switzerland: 84,
  Belgium: 82,
  Denmark: 81,
  Finland: 82,
  Ireland: 82,
  "Czech Republic": 79,
  Slovakia: 78,
  Slovenia: 81,
  Albania: 79,
  World: 73,
};

/** Region-level LE fallbacks when a country is not listed above */
const REGION_LE = {
  Europe: 79,
  Americas: 76,
  Asia: 74,
  Oceania: 80,
  Africa: 64,
  Other: 72,
};

function lifeExpectancyFor(name) {
  if (LIFE_EXPECTANCY[name] != null) return LIFE_EXPECTANCY[name];
  const region = countries[name]?.region;
  return REGION_LE[region] ?? 74;
}

let countries = {};
/** Latest TFR / births from births_tfr_2026_data.json, keyed by our country name */
let tfrUpdates = {};
let frames = [];
/** Fixed people-scale for the pyramid axis (from base year max bar). */
let scaleMax = null;
/** Cached flag image for the selected country */
let currentFlagImage = null;
let frameIndex = 0;
let playing = false;
let rafId = null;
let lastTick = 0;
let yearAccumulator = 0;
let exportAbort = null;

/** @type {'pyramid'|'map'|'regions'} */
let viewMode = "pyramid";
/** Multi-country projection results */
let worldByCountry = null;
let worldYearCount = 0;
let mapRenderPending = false;
/** Country/region names pinned on the map (multi-select; flag + population labels) */
let selectedMapNames = new Set();
/** User-dragged pin offsets: name → { dx, dy } */
let pinOffsets = {};
/** Avoid re-applying flag colors when user already customized this session */
let flagColorsAppliedFor = null;
let countrySearchApi = null;

/** Map names from BirthGauge file → our countries.json keys */
const TFR_NAME_MAP = {
  "Czechia": "Czech Republic",
  "Bosnia & Herzeg.": "Bosnia and Herzegovina",
  "Bosnia & Herzeg": "Bosnia and Herzegovina",
  "Dominican Rep.": "Dominican Republic",
  "U. Arab Emirates": "United Arab Emirates",
  "Russia": "Russia",
  "Poland": "Poland",
  "Romania": "Romania",
  "Bulgaria": "Bulgaria",
  "Colombia": "Colombia",
  "Belarus": "Belarus",
  "Azerbaijan": "Azerbaijan",
  "Kyrgyzstan": "Kyrgyzstan",
  "Tajikistan": "Tajikistan",
  "Kuwait": "Kuwait",
  "Saudi Arabia": "Saudi Arabia",
  "Oman": "Oman",
};

function stripFootnotes(name) {
  return String(name)
    .replace(/[°*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** European-style decimals: "1,70" → 1.70 */
function parseTfr(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = parseFloat(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function resolveCountryKey(rawName) {
  const cleaned = stripFootnotes(rawName);
  if (TFR_NAME_MAP[cleaned]) return TFR_NAME_MAP[cleaned];
  if (countries[cleaned]) return cleaned;
  // fuzzy: case-insensitive match
  const lower = cleaned.toLowerCase();
  for (const key of Object.keys(countries)) {
    if (key.toLowerCase() === lower) return key;
  }
  return cleaned;
}

function latestTfrFromRecord(rec) {
  for (const year of [2026, 2025, 2024, 2020, 2015]) {
    const v = parseTfr(rec[`tfr_${year}`]);
    if (v != null) return { tfr: v, year };
  }
  return null;
}

function applyTfrUpdates(tfrFile) {
  tfrUpdates = {};
  if (!tfrFile?.countries) return;
  for (const rec of tfrFile.countries) {
    const key = resolveCountryKey(rec.name);
    const latest = latestTfrFromRecord(rec);
    if (!latest) continue;
    tfrUpdates[key] = {
      tfr: latest.tfr,
      tfrYear: latest.year,
      rawName: rec.name,
      history: {
        2015: parseTfr(rec.tfr_2015),
        2020: parseTfr(rec.tfr_2020),
        2024: parseTfr(rec.tfr_2024),
        2025: parseTfr(rec.tfr_2025),
        2026: parseTfr(rec.tfr_2026),
      },
    };
    // Override default TFR on matching pyramid countries
    if (countries[key]) {
      countries[key].tfr = latest.tfr;
      countries[key].tfrYear = latest.year;
      countries[key].tfrSource = "births_tfr_2026_data.json";
      countries[key].inTfr2026 = true;
    }
  }
}

// ---------- init ----------
async function init() {
  const [resCountries, resTfr] = await Promise.all([
    fetch("data/countries.json"),
    fetch("data/births_tfr_2026_data.json"),
  ]);
  if (!resCountries.ok) throw new Error("Could not load data/countries.json");
  countries = await resCountries.json();

  if (resTfr.ok) {
    try {
      applyTfrUpdates(await resTfr.json());
    } catch (e) {
      console.warn("Could not parse births_tfr_2026_data.json", e);
    }
  } else {
    console.warn("births_tfr_2026_data.json not found — using embedded TFR defaults");
  }

  const names = Object.keys(countries).sort((a, b) => a.localeCompare(b));
  // Put Serbia first as default
  names.sort((a, b) => (a === "Serbia" ? -1 : b === "Serbia" ? 1 : a.localeCompare(b)));

  const labelFor = (name) => {
    const flag = getFlagEmoji(name);
    const upd = tfrUpdates[name];
    const kosovoTag = countries[name]?.includesKosovo ? " · incl. Kosovo" : "";
    return upd
      ? `${flag} ${name} (TFR ${upd.tfr.toFixed(2)} · ${upd.tfrYear}${kosovoTag})`
      : `${flag} ${name}${kosovoTag ? ` (${kosovoTag.trim().replace(/^·\s*/, "")})` : ""}`;
  };

  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = labelFor(name);
    els.countrySelect.appendChild(opt);
  }
  els.countrySelect.value = "Serbia";

  if (els.countrySearch && els.countryList) {
    countrySearchApi = initCountrySearch({
      input: els.countrySearch,
      list: els.countryList,
      select: els.countrySelect,
      names,
      labelFor,
      initial: "Serbia",
      onSelect: (name) => {
        stopPlayback();
        loadCountry(name);
      },
    });
  }

  bindControls();
  initTooltips();
  updateMapDataHint();
  // Preload flags in background; load Serbia first for instant title flag
  await ensureFlag("Serbia");
  preloadFlags(names.slice(0, 40)).catch(() => {});
  // Warm map libraries (non-blocking)
  loadMapLibs().catch((e) => console.warn("Map libs preload failed", e));

  loadCountry("Serbia");
  window.addEventListener("resize", () => requestAnimationFrame(render));
  // Size canvas container initially
  fitCanvas();
  render();
}

function updateMapDataHint() {
  if (!els.mapDataHint) return;
  const all = Object.keys(countries).filter((n) => n !== "World").length;
  const tfrN = Object.values(countries).filter((c) => c.inTfr2026).length;
  els.mapDataHint.textContent = `${all} countries with age–sex data · ${tfrN} also in the 2026 TFR file · replacement TFR = ${REPLACEMENT_TFR}`;
}

/**
 * Richer hover tooltips for elements with [data-tip].
 * Native [title] remains as a fallback; we strip it while the custom tip is shown
 * so the browser balloon does not stack on top.
 */
function initTooltips() {
  const tip = document.getElementById("tooltip");
  if (!tip) return;

  let activeEl = null;
  let showTimer = null;
  const savedTitles = new WeakMap();

  const restoreTitles = (el) => {
    if (!el) return;
    if (savedTitles.has(el)) {
      el.setAttribute("title", savedTitles.get(el));
      savedTitles.delete(el);
    }
    el.querySelectorAll("[data-title-saved]").forEach((child) => {
      child.setAttribute("title", child.getAttribute("data-title-saved"));
      child.removeAttribute("data-title-saved");
    });
  };

  const suppressTitles = (el) => {
    if (el.hasAttribute("title")) {
      savedTitles.set(el, el.getAttribute("title"));
      el.removeAttribute("title");
    }
    el.querySelectorAll("[title]").forEach((child) => {
      child.setAttribute("data-title-saved", child.getAttribute("title"));
      child.removeAttribute("title");
    });
  };

  const hide = () => {
    clearTimeout(showTimer);
    tip.classList.remove("visible");
    tip.hidden = true;
    tip.textContent = "";
    restoreTitles(activeEl);
    activeEl = null;
  };

  const place = (clientX, clientY) => {
    const pad = 12;
    // measure after content is set
    const w = tip.offsetWidth || 280;
    const h = tip.offsetHeight || 80;
    let x = clientX + 14;
    let y = clientY + 16;
    if (x + w > window.innerWidth - pad) x = clientX - w - 12;
    if (y + h > window.innerHeight - pad) y = clientY - h - 10;
    tip.style.left = `${Math.max(pad, x)}px`;
    tip.style.top = `${Math.max(pad, y)}px`;
  };

  const showFor = (el, clientX, clientY) => {
    const text = el.getAttribute("data-tip");
    if (!text) return;
    if (activeEl === el && tip.classList.contains("visible")) {
      place(clientX, clientY);
      return;
    }
    hide();
    activeEl = el;
    suppressTitles(el);
    showTimer = setTimeout(() => {
      if (activeEl !== el) return;
      tip.hidden = false;
      tip.textContent = text;
      tip.classList.add("visible");
      place(clientX, clientY);
    }, 250);
  };

  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest?.("[data-tip]");
    if (!el) return;
    // ignore moving between children of the same tip host
    const from = e.relatedTarget;
    if (from && el.contains(from)) return;
    showFor(el, e.clientX, e.clientY);
  });

  document.addEventListener("pointermove", (e) => {
    if (!activeEl || !tip.classList.contains("visible")) return;
    if (!e.target.closest?.("[data-tip]")) return;
    place(e.clientX, e.clientY);
  });

  document.addEventListener("pointerout", (e) => {
    const el = e.target.closest?.("[data-tip]");
    if (!el || el !== activeEl) return;
    const to = e.relatedTarget;
    if (to && el.contains(to)) return;
    hide();
  });

  document.addEventListener("scroll", hide, true);
  window.addEventListener("blur", hide);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
}

async function ensureFlag(name) {
  currentFlagImage = await loadFlagImage(name);
}

function fitCanvas() {
  const wrap = els.canvas.parentElement;
  const rect = wrap.getBoundingClientRect();
  // CSS size drives drawing via clientWidth/Height in drawPyramid
  els.canvas.style.width = Math.min(rect.width - 8, 1200) + "px";
  els.canvas.style.height = Math.min(rect.height - 8, 900) + "px";
}

function bindControls() {
  const link = (range, input, onChange) => {
    range.addEventListener("input", () => {
      input.value = range.value;
      onChange();
    });
    input.addEventListener("change", () => {
      range.value = input.value;
      onChange();
    });
  };

  link(els.tfrRange, els.tfrInput, () => {
    recomputeProjection();
  });
  link(els.leRange, els.leInput, () => recomputeProjection());
  link(els.migRange, els.migInput, () => recomputeProjection());
  link(els.srbRange, els.srbInput, () => recomputeProjection());
  link(els.speedRange, els.speedInput, () => {});

  els.countrySelect.addEventListener("change", () => {
    // Fallback if hidden select is changed programmatically
    stopPlayback();
    const name = els.countrySelect.value;
    countrySearchApi?.setValue(name);
    loadCountry(name);
  });

  els.startYear.addEventListener("change", () => recomputeProjection());
  els.endYear.addEventListener("change", () => recomputeProjection());

  [
    els.maleColor,
    els.femaleColor,
    els.bgColor,
    els.textColor,
    els.showFlag,
    els.showCounts,
    els.showAgeLabels,
    els.showGrid,
    els.showPercent,
    els.showLegend,
  ].forEach((el) => el.addEventListener("input", () => render()));

  els.showStats.addEventListener("change", () => {
    els.statsBar.classList.toggle("hidden", !els.showStats.checked);
  });

  els.yearScrub.addEventListener("input", () => {
    stopPlayback();
    const year = Number(els.yearScrub.value);
    const start = Number(els.yearScrub.min) || year;
    if (viewMode === "map" || viewMode === "regions") {
      frameIndex = Math.max(0, year - start);
    } else {
      frameIndex = frames.findIndex((f) => f.year === year);
      if (frameIndex < 0) frameIndex = 0;
    }
    render();
  });

  els.btnPlay.addEventListener("click", () => startPlayback());
  els.btnPause.addEventListener("click", () => stopPlayback());
  els.btnReset.addEventListener("click", () => {
    stopPlayback();
    frameIndex = 0;
    render();
  });

  els.btnExport.addEventListener("click", () => runExport());
  els.btnSnapshot.addEventListener("click", () => snapshotPng());

  // View modes
  els.modeTabs?.querySelectorAll(".mode-tab").forEach((btn) => {
    btn.addEventListener("click", () => setViewMode(btn.dataset.mode));
  });

  ["mapCountrySet", "mapMetric", "useCountryTfr", "useCountryLe"].forEach((id) => {
    const el = els[id];
    if (!el) return;
    el.addEventListener("change", () => {
      if (viewMode === "pyramid") return;
      recomputeProjection();
    });
  });
  els.mapMetric?.addEventListener("change", () => {
    if (viewMode !== "pyramid") renderMap();
  });
  ["heatLow", "heatHigh", "tfrLow", "tfrHigh"].forEach((id) => {
    els[id]?.addEventListener("input", () => {
      if (viewMode !== "pyramid") renderMap();
    });
  });

  els.btnClearPins?.addEventListener("click", () => {
    selectedMapNames = new Set();
    pinOffsets = {};
    if (viewMode !== "pyramid") renderMap();
  });

  window.addEventListener("resize", () => {
    fitCanvas();
    render();
  });
}

function setViewMode(mode) {
  if (!mode || mode === viewMode) {
    // still allow re-click to force
  }
  viewMode = mode === "map" || mode === "regions" ? mode : "pyramid";
  document.body.classList.remove("mode-pyramid", "mode-map", "mode-regions");
  document.body.classList.add(`mode-${viewMode}`);

  els.modeTabs?.querySelectorAll(".mode-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === viewMode);
  });

  const isMap = viewMode === "map" || viewMode === "regions";
  if (els.viewPyramid) els.viewPyramid.hidden = isMap;
  if (els.viewMap) els.viewMap.hidden = !isMap;
  if (els.panelMapOptions) els.panelMapOptions.hidden = !isMap;

  if (els.mapTitle) {
    els.mapTitle.textContent =
      viewMode === "regions"
        ? "World regions heatmap"
        : "World population heatmap";
  }
  if (els.mapSubtitle) {
    els.mapSubtitle.textContent =
      viewMode === "regions"
        ? "Click regions to pin multiple labels · click again to unpin · hover for details"
        : "Click to pin · drag the card to move it · click again to unpin · double-click for pyramid";
  }
  // clear pins when leaving map modes
  if (viewMode === "pyramid") {
    selectedMapNames = new Set();
    // keep pinOffsets so re-pinning remembers positions
  }

  stopPlayback();
  recomputeProjection();
}

function loadCountry(name) {
  const c = countries[name];
  if (!c) return;

  if (els.countrySelect) els.countrySelect.value = name;
  countrySearchApi?.setValue(name);

  const tfr = c.tfr;
  els.tfrRange.value = tfr;
  els.tfrInput.value = tfr;
  const le = lifeExpectancyFor(name);
  els.leRange.value = le;
  els.leInput.value = le;
  els.migRange.value = 0;
  els.migInput.value = 0;

  const baseYear = c.year || 2024;
  els.startYear.value = baseYear;
  if (Number(els.endYear.value) <= baseYear) els.endYear.value = baseYear + 76;

  // Hint under fertility control
  const hint = document.querySelector("label.field .hint");
  if (hint) {
    const yr = c.tfrYear ? ` (${c.tfrYear})` : "";
    const src = c.tfrSource ? " · latest national/BirthGauge data" : "";
    const flag = getFlagEmoji(name);
    hint.textContent = `Replacement ≈ 2.1 · ${flag} ${name} default TFR ≈ ${Number(tfr).toFixed(2)}${yr}${src}`;
  }

  // Reset scrub position when switching country
  frameIndex = 0;
  // Load flag image (async); re-render when ready so title updates
  currentFlagImage = null;
  ensureFlag(name).then(() => render());
  // Default male/female bar colors from flag (once per country load)
  applyFlagPyramidColors(name, c.iso2);
  recomputeProjection();
}

async function applyFlagPyramidColors(name, iso2) {
  if (flagColorsAppliedFor === name) return;
  flagColorsAppliedFor = name;
  try {
    const pair = await colorsFromFlag(name, iso2);
    if (!pair) return;
    // Only apply if still on this country
    if (els.countrySelect.value !== name) return;
    if (els.maleColor) els.maleColor.value = pair.male;
    if (els.femaleColor) els.femaleColor.value = pair.female;
    render();
  } catch (e) {
    console.warn("Could not apply flag colors", e);
  }
}

function simParams() {
  return {
    tfr: Number(els.tfrInput.value),
    lifeExpectancy: Number(els.leInput.value),
    migration: Number(els.migInput.value),
    sexRatioBirth: Number(els.srbInput.value),
  };
}

function yearRange() {
  const startYear = Number(els.startYear.value) || 2024;
  let endYear = Number(els.endYear.value) || startYear + 50;
  if (endYear < startYear) endYear = startYear;
  if (endYear - startYear > 200) endYear = startYear + 200;
  return { startYear, endYear };
}

function mapCountryNames() {
  const set = els.mapCountrySet?.value || "all";
  return Object.keys(countries).filter((n) => {
    if (n === "World") return false;
    if (!countries[n]?.male) return false;
    if (set === "tfr2026") return !!countries[n].inTfr2026;
    return true;
  });
}

function recomputeProjection() {
  const { startYear, endYear } = yearRange();

  if (viewMode === "map" || viewMode === "regions") {
    recomputeWorld(startYear, endYear);
    return;
  }

  const name = els.countrySelect.value;
  const c = countries[name];
  if (!c) return;

  const base = {
    male: c.male.slice(),
    female: c.female.slice(),
  };

  frames = projectSeries(base, simParams(), startYear, endYear);
  frameIndex = Math.min(frameIndex, frames.length - 1);

  // Lock bar scale to the starting population so decline/growth is visible.
  scaleMax = maxBar(frames[0]) * 1.08;

  els.yearScrub.min = frames[0].year;
  els.yearScrub.max = frames[frames.length - 1].year;
  els.yearScrub.value = frames[frameIndex].year;

  render();
}

function recomputeWorld(startYear, endYear) {
  const names = mapCountryNames();
  const params = {
    ...simParams(),
    useCountryTfr: els.useCountryTfr?.checked !== false,
    useCountryLe: els.useCountryLe?.checked !== false,
  };

  const leByCountry = {};
  for (const n of names) leByCountry[n] = lifeExpectancyFor(n);

  if (els.mapStatus) {
    els.mapStatus.textContent = `Simulating ${names.length} countries ${startYear}–${endYear}…`;
  }

  // Sync — fast enough (~100ms for 159×76)
  const t0 = performance.now();
  worldByCountry = projectAllCountries(
    countries,
    names,
    params,
    startYear,
    endYear,
    leByCountry
  );
  worldYearCount = endYear - startYear + 1;
  frameIndex = Math.min(frameIndex, worldYearCount - 1);
  if (frameIndex < 0) frameIndex = 0;

  els.yearScrub.min = startYear;
  els.yearScrub.max = endYear;
  els.yearScrub.value = startYear + frameIndex;

  // Pyramid frames unused in map mode but keep scrub year display
  frames = [];
  for (let y = startYear; y <= endYear; y++) {
    frames.push({ year: y, male: [], female: [] });
  }

  if (els.mapStatus) {
    els.mapStatus.textContent = `Ready · ${names.length} countries · ${(
      performance.now() - t0
    ).toFixed(0)} ms · hover for details`;
  }
  updateMapDataHint();
  render();
}

function drawOptions(frame) {
  const name = els.countrySelect.value;
  return {
    countryName: name,
    maleColor: els.maleColor.value,
    femaleColor: els.femaleColor.value,
    bgColor: els.bgColor.value,
    textColor: els.textColor.value,
    showFlag: els.showFlag.checked,
    showCounts: els.showCounts.checked,
    showAgeLabels: els.showAgeLabels.checked,
    showGrid: els.showGrid.checked,
    showPercent: els.showPercent.checked,
    showLegend: els.showLegend.checked,
    tfr: Number(els.tfrInput.value),
    scaleMax,
    flagImage: currentFlagImage,
    flagEmoji: getFlagEmoji(name),
  };
}

function render() {
  if (viewMode === "map" || viewMode === "regions") {
    renderMap();
    return;
  }
  if (!frames.length) return;
  const frame = frames[frameIndex];
  els.yearScrub.value = frame.year;
  els.yearReadout.textContent = String(frame.year);

  fitCanvas();
  drawPyramid(els.canvas, frame, drawOptions(frame));
  updateStats(frame);
}

function updateStats(frame) {
  const m = frame.male.reduce((a, b) => a + b, 0);
  const f = frame.female.reduce((a, b) => a + b, 0);
  const t = m + f;
  els.statTotal.textContent = formatNumber(t);
  els.statMale.textContent = formatNumber(m);
  els.statFemale.textContent = formatNumber(f);
  els.statMedian.textContent = medianAge(frame.male, frame.female).toFixed(1);
  els.statYouth.textContent = ageShare(frame.male, frame.female, 0, 2).toFixed(1) + "%";
  els.statElderly.textContent = ageShare(frame.male, frame.female, 13, 20).toFixed(1) + "%";
  els.statTfr.textContent = Number(els.tfrInput.value).toFixed(2);
}

function updateStatsFromSnapshot(snapshot, regionSnap) {
  if (viewMode === "regions" && regionSnap) {
    let male = 0;
    let female = 0;
    let med = 0;
    let youth = 0;
    let eld = 0;
    let tfr = 0;
    let pop = regionSnap.worldPop || 0;
    for (const r of Object.values(regionSnap.regions)) {
      male += r.male;
      female += r.female;
      med += r.medianAge * r.population;
      youth += r.youthPct * r.population;
      eld += r.elderlyPct * r.population;
      tfr += r.tfr * r.population;
    }
    const p = pop || 1;
    els.statTotal.textContent = formatNumber(pop);
    els.statMale.textContent = formatNumber(male);
    els.statFemale.textContent = formatNumber(female);
    els.statMedian.textContent = (med / p).toFixed(1);
    els.statYouth.textContent = (youth / p).toFixed(1) + "%";
    els.statElderly.textContent = (eld / p).toFixed(1) + "%";
    els.statTfr.textContent = (tfr / p).toFixed(2);
    return;
  }

  let male = 0;
  let female = 0;
  let med = 0;
  let youth = 0;
  let eld = 0;
  let tfr = 0;
  const pop = snapshot.worldPop || 0;
  for (const c of Object.values(snapshot.countries)) {
    male += c.male;
    female += c.female;
    med += c.medianAge * c.population;
    youth += c.youthPct * c.population;
    eld += c.elderlyPct * c.population;
    tfr += c.tfr * c.population;
  }
  const p = pop || 1;
  els.statTotal.textContent = formatNumber(pop);
  els.statMale.textContent = formatNumber(male);
  els.statFemale.textContent = formatNumber(female);
  els.statMedian.textContent = (med / p).toFixed(1);
  els.statYouth.textContent = (youth / p).toFixed(1) + "%";
  els.statElderly.textContent = (eld / p).toFixed(1) + "%";
  els.statTfr.textContent = (tfr / p).toFixed(2);
}

async function renderMap() {
  if (!worldByCountry || !els.worldMapSvg) return;
  const startYear = Number(els.yearScrub.min) || 2024;
  const year = startYear + frameIndex;
  els.yearScrub.value = year;
  els.yearReadout.textContent = String(year);

  const snapshot = snapshotYear(worldByCountry, frameIndex);
  const regionSnap = aggregateRegions(snapshot);
  updateStatsFromSnapshot(snapshot, regionSnap);

  if (els.mapSubtitle) {
    const metric = els.mapMetric?.value || "popShare";
    const metricLabel = {
      popShare: "fill = population share of world",
      population: "fill = absolute population",
      tfr: `fill = TFR vs replacement ${REPLACEMENT_TFR}`,
      dual: "fill = pop share · border = TFR vs 2.1",
    }[metric];
    const nPinned = selectedMapNames.size;
    const pinNote =
      nPinned === 0
        ? " · click to pin countries"
        : nPinned === 1
          ? ` · pinned: ${[...selectedMapNames][0]}`
          : ` · pinned: ${nPinned} countries`;
    els.mapSubtitle.textContent = `Year ${year} · world ${formatPop(snapshot.worldPop)} · ${metricLabel}${pinNote}`;
  }

  const wrap = els.worldMapSvg.parentElement;
  const rect = wrap.getBoundingClientRect();
  const width = Math.max(640, Math.floor(rect.width));
  const height = Math.max(360, Math.floor(rect.height));

  if (mapRenderPending) return;
  mapRenderPending = true;
  try {
    const selectedIso2ByName = {};
    for (const n of selectedMapNames) {
      selectedIso2ByName[n] =
        countries[n]?.iso2 || snapshot.countries[n]?.iso2 || null;
    }

    await renderWorldMap(els.worldMapSvg, {
      mode: viewMode === "regions" ? "regions" : "countries",
      snapshot,
      regionSnapshot: regionSnap,
      metric: els.mapMetric?.value || "popShare",
      bgColor: els.bgColor?.value || "#0F172A",
      heatLow: els.heatLow?.value || "#FFFFFF",
      heatHigh: els.heatHigh?.value || "#0284C7",
      tfrLow: els.tfrLow?.value || "#3B82F6",
      tfrHigh: els.tfrHigh?.value || "#EF4444",
      selectedNames: [...selectedMapNames],
      selectedIso2ByName,
      pinOffsets,
      width,
      height,
      onPinDrag: (name, offset) => {
        pinOffsets[name] = { dx: offset.dx, dy: offset.dy };
      },
      onHover: (rec, event, meta) => {
        if (!els.mapHoverCard) return;
        if (!rec && !els.mapShowMissing?.checked) {
          els.mapHoverCard.hidden = true;
          return;
        }
        els.mapHoverCard.hidden = false;
        els.mapHoverCard.innerHTML = hoverHtml(rec, meta);
        const pad = 12;
        const card = els.mapHoverCard;
        const w = card.offsetWidth || 220;
        const h = card.offsetHeight || 160;
        const bounds = wrap.getBoundingClientRect();
        let x = event.clientX - bounds.left + 14;
        let y = event.clientY - bounds.top + 14;
        if (x + w > bounds.width - pad) x = event.clientX - bounds.left - w - 10;
        if (y + h > bounds.height - pad) y = event.clientY - bounds.top - h - 10;
        card.style.left = `${Math.max(pad, x)}px`;
        card.style.top = `${Math.max(pad, y)}px`;
      },
      onLeave: () => {
        if (els.mapHoverCard) els.mapHoverCard.hidden = true;
      },
      onClick: (name, _event, meta) => {
        // Toggle pin — multi-select
        if (meta?.kind === "region") {
          if (selectedMapNames.has(name)) {
            selectedMapNames.delete(name);
            delete pinOffsets[name];
          } else selectedMapNames.add(name);
        } else {
          if (!snapshot.countries[name] && !countries[name]) return;
          if (selectedMapNames.has(name)) {
            selectedMapNames.delete(name);
            delete pinOffsets[name];
          } else selectedMapNames.add(name);
          // keep pyramid country selector on last clicked country
          if (selectedMapNames.has(name) && countries[name]) {
            if (els.countrySelect) els.countrySelect.value = name;
            countrySearchApi?.setValue(name);
          }
        }
        renderMap();
      },
      onDblClick: (name) => {
        if (!countries[name]) return;
        if (els.countrySelect) els.countrySelect.value = name;
        countrySearchApi?.setValue(name);
        setViewMode("pyramid");
        loadCountry(name);
      },
    });
  } catch (err) {
    console.error(err);
    if (els.mapStatus) {
      els.mapStatus.textContent = "Map render failed: " + (err.message || err);
    }
  } finally {
    mapRenderPending = false;
  }
}

// ---------- playback ----------
function maxFrameIndex() {
  if (viewMode === "map" || viewMode === "regions") {
    return Math.max(0, worldYearCount - 1);
  }
  return Math.max(0, frames.length - 1);
}

function startPlayback() {
  if (viewMode === "map" || viewMode === "regions") {
    if (!worldByCountry) return;
  } else if (!frames.length) {
    return;
  }
  if (frameIndex >= maxFrameIndex()) frameIndex = 0;
  playing = true;
  els.btnPlay.disabled = true;
  els.btnPause.disabled = false;
  lastTick = performance.now();
  yearAccumulator = 0;
  rafId = requestAnimationFrame(tick);
}

function stopPlayback() {
  playing = false;
  els.btnPlay.disabled = false;
  els.btnPause.disabled = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function tick(now) {
  if (!playing) return;
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  const speed = Number(els.speedInput.value) || 5; // years per second
  yearAccumulator += dt * speed;
  const maxIdx = maxFrameIndex();

  while (yearAccumulator >= 1 && frameIndex < maxIdx) {
    yearAccumulator -= 1;
    frameIndex += 1;
  }

  render();

  if (frameIndex >= maxIdx) {
    stopPlayback();
    return;
  }
  rafId = requestAnimationFrame(tick);
}

// ---------- export ----------
async function runExport() {
  stopPlayback();

  els.btnExport.disabled = true;
  els.exportStatus.hidden = false;
  els.exportStatus.className = "export-status recording";
  els.exportStatus.textContent = "Recording timelapse…";

  exportAbort = new AbortController();
  const speed = Number(els.speedInput.value) || 5;
  const fps = Number(els.exportFps.value) || 30;

  try {
    if (viewMode === "map" || viewMode === "regions") {
      await runMapExport(speed, fps, exportAbort.signal);
    } else {
      await runPyramidExport(speed, fps, exportAbort.signal);
    }
  } catch (err) {
    if (err.name === "AbortError") {
      els.exportStatus.textContent = "Export cancelled.";
    } else {
      console.error(err);
      els.exportStatus.className = "export-status";
      els.exportStatus.textContent = "Export failed: " + (err.message || err);
    }
  } finally {
    els.btnExport.disabled = false;
    exportAbort = null;
    fitCanvas();
    render();
  }
}

async function runPyramidExport(speed, fps, signal) {
  if (!frames.length) throw new Error("No frames");
  const name = els.countrySelect.value.replace(/\s+/g, "_");
  const y0 = frames[0].year;
  const y1 = frames[frames.length - 1].year;

  const exportW = 1280;
  const exportH = 960;
  // Include stats strip under pyramid so video matches on-screen layout
  const statsH = els.showStats?.checked !== false ? 80 : 0;
  const canvas = document.createElement("canvas");
  canvas.width = exportW;
  canvas.height = exportH + statsH;

  const { blob, ext } = await exportPaintedVideo({
    canvas,
    frameCount: frames.length,
    yearForIndex: (i) => frames[i].year,
    yearsPerSecond: speed,
    fps,
    mimePreference: els.videoFormat.value,
    signal,
    onProgress: ({ year, percent }) => {
      els.exportStatus.textContent = `Recording pyramid… year ${year} (${percent.toFixed(0)}%)`;
    },
    renderFrame: async (i, c) => {
      frameIndex = i;
      const frame = frames[i];
      // Draw pyramid into a temp canvas then composite with stats
      const pyr = document.createElement("canvas");
      pyr.width = exportW;
      pyr.height = exportH;
      // drawPyramid uses clientWidth — set CSS size too
      pyr.style.width = exportW + "px";
      pyr.style.height = exportH + "px";
      // Temporarily attach for clientWidth
      pyr.style.position = "fixed";
      pyr.style.left = "-99999px";
      document.body.appendChild(pyr);
      try {
        drawPyramid(pyr, frame, drawOptions(frame));
        const ctx = c.getContext("2d");
        ctx.fillStyle = els.bgColor?.value || "#0F172A";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(pyr, 0, 0, exportW, exportH);
        if (statsH > 0) {
          paintStatsBar(ctx, 0, exportH, exportW, statsH, {
            total: frame.male.reduce((a, b) => a + b, 0) + frame.female.reduce((a, b) => a + b, 0),
            male: frame.male.reduce((a, b) => a + b, 0),
            female: frame.female.reduce((a, b) => a + b, 0),
            median: medianAge(frame.male, frame.female),
            youth: ageShare(frame.male, frame.female, 0, 2),
            elderly: ageShare(frame.male, frame.female, 13, 20),
            tfr: Number(els.tfrInput.value),
            year: frame.year,
            label: els.countrySelect.value,
          });
        }
      } finally {
        pyr.remove();
      }
    },
  });

  const filename = `population_pyramid_${name}_${y0}-${y1}.${ext}`;
  downloadBlob(blob, filename);
  els.exportStatus.className = "export-status done";
  els.exportStatus.textContent = `Saved ${filename} (${(blob.size / 1e6).toFixed(1)} MB) · includes stats bar`;
}

async function runMapExport(speed, fps, signal) {
  if (!worldByCountry) throw new Error("No world simulation");
  const startYear = Number(els.yearScrub.min) || 2024;
  const frameCount = worldYearCount;
  const y0 = startYear;
  const y1 = startYear + frameCount - 1;

  const exportW = 1400;
  const statsH = 88;
  const mapH = 720;
  const canvas = document.createElement("canvas");
  canvas.width = exportW;
  canvas.height = mapH + statsH;

  // Ensure map view is visible for SVG layout
  if (els.viewMap) els.viewMap.hidden = false;

  const { blob, ext } = await exportPaintedVideo({
    canvas,
    frameCount,
    yearForIndex: (i) => startYear + i,
    yearsPerSecond: speed,
    fps,
    mimePreference: els.videoFormat.value,
    signal,
    onProgress: ({ year, percent }) => {
      els.exportStatus.textContent = `Recording map… year ${year} (${percent.toFixed(0)}%)`;
    },
    renderFrame: async (i, c) => {
      frameIndex = i;
      // Force map render without pending guard
      mapRenderPending = false;
      await renderMapForExport(exportW, mapH);
      await waitForPaint();

      const ctx = c.getContext("2d");
      const bg = els.bgColor?.value || "#0F172A";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, c.width, c.height);

      // Title strip
      const snapshot = snapshotYear(worldByCountry, i);
      const regionSnap = aggregateRegions(snapshot);
      ctx.fillStyle = bg;
      // Rasterize SVG
      const svgImg = await svgElementToImage(els.worldMapSvg, exportW, mapH);
      ctx.drawImage(svgImg, 0, 0, exportW, mapH);

      // Stats from world aggregate (same as on-screen bottom bar)
      const stats = computeWorldStats(snapshot, regionSnap);
      paintStatsBar(ctx, 0, mapH, exportW, statsH, {
        ...stats,
        year: startYear + i,
        label: viewMode === "regions" ? "World regions" : "World map",
      });
    },
  });

  const filename = `world_${viewMode}_${y0}-${y1}.${ext}`;
  downloadBlob(blob, filename);
  els.exportStatus.className = "export-status done";
  els.exportStatus.textContent = `Saved ${filename} (${(blob.size / 1e6).toFixed(1)} MB) · map + stats bar`;
}

/** Like renderMap but ignores pending lock and uses fixed size for export */
async function renderMapForExport(width, height) {
  if (!worldByCountry || !els.worldMapSvg) return;
  const snapshot = snapshotYear(worldByCountry, frameIndex);
  const regionSnap = aggregateRegions(snapshot);
  updateStatsFromSnapshot(snapshot, regionSnap);

  const selectedIso2ByName = {};
  for (const n of selectedMapNames) {
    selectedIso2ByName[n] = countries[n]?.iso2 || snapshot.countries[n]?.iso2 || null;
  }

  await renderWorldMap(els.worldMapSvg, {
    mode: viewMode === "regions" ? "regions" : "countries",
    snapshot,
    regionSnapshot: regionSnap,
    metric: els.mapMetric?.value || "popShare",
    bgColor: els.bgColor?.value || "#0F172A",
    heatLow: els.heatLow?.value || "#FFFFFF",
    heatHigh: els.heatHigh?.value || "#0284C7",
    tfrLow: els.tfrLow?.value || "#3B82F6",
    tfrHigh: els.tfrHigh?.value || "#EF4444",
    selectedNames: [...selectedMapNames],
    selectedIso2ByName,
    pinOffsets,
    width,
    height,
    onHover: () => {},
    onLeave: () => {},
    onClick: () => {},
    onDblClick: () => {},
    onPinDrag: () => {},
  });
}

function computeWorldStats(snapshot, regionSnap) {
  if (viewMode === "regions" && regionSnap) {
    let male = 0;
    let female = 0;
    let med = 0;
    let youth = 0;
    let eld = 0;
    let tfr = 0;
    const pop = regionSnap.worldPop || 0;
    for (const r of Object.values(regionSnap.regions)) {
      male += r.male;
      female += r.female;
      med += r.medianAge * r.population;
      youth += r.youthPct * r.population;
      eld += r.elderlyPct * r.population;
      tfr += r.tfr * r.population;
    }
    const p = pop || 1;
    return {
      total: pop,
      male,
      female,
      median: med / p,
      youth: youth / p,
      elderly: eld / p,
      tfr: tfr / p,
    };
  }
  let male = 0;
  let female = 0;
  let med = 0;
  let youth = 0;
  let eld = 0;
  let tfr = 0;
  const pop = snapshot.worldPop || 0;
  for (const c of Object.values(snapshot.countries)) {
    male += c.male;
    female += c.female;
    med += c.medianAge * c.population;
    youth += c.youthPct * c.population;
    eld += c.elderlyPct * c.population;
    tfr += c.tfr * c.population;
  }
  const p = pop || 1;
  return {
    total: pop,
    male,
    female,
    median: med / p,
    youth: youth / p,
    elderly: eld / p,
    tfr: tfr / p,
  };
}

function paintStatsBar(ctx, x, y, w, h, stats) {
  const bg = "#0b1220";
  const border = "#1f2a3d";
  const muted = "#94a3b8";
  const text = "#e2e8f0";
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 0.5);
  ctx.lineTo(x + w, y + 0.5);
  ctx.stroke();

  const items = [
    ["Year", String(stats.year ?? "—")],
    ["Total", formatNumber(stats.total)],
    ["Male", formatNumber(stats.male)],
    ["Female", formatNumber(stats.female)],
    ["Median age", Number(stats.median).toFixed(1)],
    ["0–14 %", Number(stats.youth).toFixed(1) + "%"],
    ["65+ %", Number(stats.elderly).toFixed(1) + "%"],
    ["TFR", Number(stats.tfr).toFixed(2)],
  ];

  const colW = w / items.length;
  items.forEach(([label, value], i) => {
    const cx = x + colW * i + colW / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = muted;
    ctx.font = "600 11px DM Sans, system-ui, sans-serif";
    ctx.fillText(label.toUpperCase(), cx, y + 28);
    ctx.fillStyle = text;
    ctx.font = "500 16px JetBrains Mono, ui-monospace, monospace";
    ctx.fillText(value, cx, y + 54);
  });

  if (stats.label) {
    ctx.textAlign = "left";
    ctx.fillStyle = muted;
    ctx.font = "500 11px DM Sans, system-ui, sans-serif";
    ctx.fillText(stats.label, x + 12, y + h - 10);
  }
}

function svgElementToImage(svgEl, width, height) {
  return new Promise((resolve, reject) => {
    const clone = svgEl.cloneNode(true);
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    // Ensure xmlns for standalone rasterization
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to rasterize map SVG"));
    };
    img.src = url;
  });
}

function waitForPaint() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function snapshotPng() {
  if (viewMode === "map" || viewMode === "regions") {
    // Rasterize SVG map
    const svg = els.worldMapSvg;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const year = els.yearReadout.textContent || "year";
    downloadBlob(blob, `world_map_${viewMode}_${year}.svg`);
    return;
  }
  if (!frames.length) return;
  render();
  const name = els.countrySelect.value.replace(/\s+/g, "_");
  const year = frames[frameIndex].year;
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `population_pyramid_${name}_${year}.png`);
  }, "image/png");
}

init().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#f88;padding:2rem">Failed to start: ${err.message}\n\nServe this folder over HTTP (not file://), e.g.:\n  npx serve .\n  or python -m http.server</pre>`;
});
