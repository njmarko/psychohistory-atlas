import { loadDataset, freshYear, earliestPyramidYear } from "./data/load";
import { loadUsaStates, isUsaStateKey, usaStateKey, usaStateLabel } from "./data/usa-states";
import { METRICS } from "./data/metrics";
import { displayName } from "./data/serbia-kosovo";
import {
  applyOverrides,
  clearOverrides,
  downloadJson,
  loadOverrides,
  saveOverrides,
  type Overlay,
} from "./data/overrides";
import { getHelpHtml } from "./ui/help";
import {
  applyDomI18n,
  countryName,
  getLocale,
  isLocaleId,
  localeDef,
  LOCALES,
  setLocale,
  t,
  type LocaleId,
} from "./i18n";
import { initCountrySearch } from "./ui/country-search";
import {
  getState,
  setState,
  subscribe,
  updateAppearance,
  updateCharts,
  updateExport,
  updateHover,
  updateLayout,
  updateMap,
  updateScenario,
  updateTime,
} from "./store/app-store";
import type { AppState, CountryRecord, PyramidFrame, TagField, ViewMode } from "./store/types";
import { ageShare, maxBar, medianAge, projectSeries, totalPop } from "./sim/cohort";
import { clampBands, rebinAgeGroups } from "./sim/age-bands";
import { aggregateRegions, formatPop, paramsForCountry, projectAllCountries, snapshotFromSeries, snapshotYear, type CountryRun } from "./sim/world";
import { drawPyramid, formatNumber } from "./viz/pyramid/draw-pyramid";
import { drawTriangle } from "./viz/triangle/draw-triangle";
import {
  currentFocusLonLat,
  DEFAULT_FOCUS,
  flyToCountry,
  formatHeatmapMetric,
  hoverHtml,
  liveMapCanRecolor,
  liveMapReady,
  loadMapLibs,
  lookAtLonLat,
  nudgeLiveMap,
  recolorLiveMap,
  renderWorldMap,
  SERBIA_FOCUS,
  viewForZoom,
  type MapRenderOpts,
} from "./viz/map/world-map";
import { drawLineChart } from "./viz/charts/line-chart";
import { drawSvgLineChart, updateSvgChartMarker } from "./viz/charts/svg-line-chart";
import { renderYearStrip } from "./viz/year-strip";
import { downloadBlob, exportPaintedVideo, exportSize } from "./export/recorder";
import { colorsFromFlag } from "./flags/flag-colors";
import { getFlagEmoji, loadFlagImage } from "./flags/flags";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const MOBILE_MQ = window.matchMedia("(max-width: 900px)");
const COARSE_MQ = window.matchMedia("(pointer: coarse)");
function isMobile() {
  return MOBILE_MQ.matches;
}
function isCoarsePointer() {
  return COARSE_MQ.matches;
}

let mobileLeft = false;
let mobileRight = false;

let countries: Record<string, CountryRecord> = {};
let usaStates: Record<string, CountryRecord> = {};
let bundled: Record<string, CountryRecord> = {};
let frames: PyramidFrame[] = [];
let scaleMax = 1;
let deathScale = 1;
let birthScale = 1;
let peakScaleByCountry: Record<string, number> = {};
let frameIndex = 0;
let worldByCountry: Record<string, CountryRun> | null = null;
let flagImage: HTMLImageElement | null = null;
let playing = false;
let yearHold = false;
let rafId = 0;
let lastTick = 0;
let yearAccumulator = 0;
let hoverFrames: PyramidFrame[] = [];
let hoverIdx = 0;
let seriesAheadCache: { key: string; frames: PyramidFrame[] } | null = null;
let pyramidMinYear = 2024;
let countrySearches: ReturnType<typeof initCountrySearch>[] = [];
let metricSearch: ReturnType<typeof initCountrySearch> | null = null;
const NONE_METRIC_ID = "__none__";
let mapFlyEnabled = false;
let mapRenderPending = false;
let lastMapBox = "";
let hoverActiveName = "";
let hoverDrawnName = "";
let hoverDrawnYear = NaN;
let flagColorsFor: string | null = null;


export async function boot() {
  const loaded = await loadDataset();
  bundled = loaded.countries;
  countries = loaded.countries;
  usaStates = await loadUsaStates(countries["United States"]);
  pyramidMinYear = earliestPyramidYear(countries);
  const startEl = $("startYear") as HTMLInputElement;
  startEl.min = String(pyramidMinYear);
  const headerStart = $("headerStartYear") as HTMLInputElement | null;
  if (headerStart) headerStart.min = String(pyramidMinYear);

  setLocale(getState().locale === "sr" ? "sr" : "en");
  $("helpBody").innerHTML = getHelpHtml(getLocale());
  fillMetricSelects();
  fillTagFields();
  bindChrome();
  bindControls();
  fillChartSeries();
  hydrateDomFromState();
  bindMapKeys();
  bindPlaybackKeys();
  initTooltips();
  bindLangSwitch();

  const names = searchNames();
  const bindCombo = (inputId: string, listId: string) => {
    countrySearches.push(
      initCountrySearch({
        input: $(inputId) as HTMLInputElement,
        list: $(listId),
        names,
        labelFor: (n) => labelFor(n),
        tokensFor: (n) => searchTokens(n),
        initial: getState().country || "Serbia",
        onSelect: (name) => adoptCountry(name),
      })
    );
  };
  bindCombo("countrySearch", "countryList");
  bindCombo("headerCountrySearch", "headerCountryList");
  bindMetricCombo();
  bindMapResize();

  const s = getState();
  if (!s.country || !recOf(s.country)) setState({ country: "Serbia" });
  applyLayout(s);
  loadCountry(getState().country || "Serbia", { fly: false });
  setView(getState().view);
  applyAppI18n();
  mapFlyEnabled = true;
  loadMapLibs().catch(() => {});
  const onViewport = () => {
    if (!isMobile()) {
      mobileLeft = false;
      mobileRight = false;
    }
    applyLayout(getState());
    requestAnimationFrame(render);
  };
  if (MOBILE_MQ.addEventListener) MOBILE_MQ.addEventListener("change", onViewport);
  else (MOBILE_MQ as any).addListener(onViewport);
  window.addEventListener("resize", () => requestAnimationFrame(render));
  subscribe(() => {
    /* store already mutated; most UI is event-driven */
  });
}

const SEARCH_ALIASES: Record<string, string> = {
  "United States": "us usa america",
  "United Kingdom": "uk gb gbr britain england",
  "United Arab Emirates": "uae",
  "DR Congo": "drc congo",
  "South Korea": "korea rok",
  "North Korea": "korea dprk",
  "Czech Republic": "czechia",
  Serbia: "srb rs",
};

function searchTokens(name: string) {
  const c = recOf(name);
  const extra = SEARCH_ALIASES[usaStateLabel(name)] || SEARCH_ALIASES[name] || "";
  const local = countryName(usaStateLabel(name));
  if (!c) return [extra, local, name].filter(Boolean).join(" ");
  return [c.iso2, c.iso3, String(c.isoNum || ""), extra, local, name, usaStateLabel(name)].filter(Boolean).join(" ");
}

function labelFor(name: string) {
  const c = recOf(name);
  const flag = getFlagEmoji(usaStateLabel(name), c?.iso2);
  const shown = c ? displayName(c) : countryName(usaStateLabel(name));
  const tfr = c ? ` (${t("hover.tfr")} ${c.latest.tfr.toFixed(2)} · ${c.latest.tfrYear})` : "";
  return `${flag} ${shown}${tfr}`;
}

function searchNames() {
  if (getState().view === "usa") {
    return Object.keys(usaStates).sort((a, b) => usaStateLabel(a).localeCompare(usaStateLabel(b)));
  }
  return Object.keys(countries).sort((a, b) =>
    a === "Serbia" ? -1 : b === "Serbia" ? 1 : a.localeCompare(b)
  );
}

function syncSearchCatalog() {
  const names = searchNames();
  countrySearches.forEach((api) => api.refreshNames(names));
}

function fillMetricSelects() {
  const metric = $("mapMetric") as HTMLSelectElement;
  const pivot = $("pivotMetric") as HTMLSelectElement;
  metric.innerHTML =
    `<option value="">${t("map.metricNone")}</option>` +
    METRICS.map((m) => `<option value="${m.id}">${t(`metrics.${m.id}.label`)}</option>`).join("");
  pivot.innerHTML =
    `<option value="">${t("map.pivotSame")}</option>` +
    METRICS.map((m) => `<option value="${m.id}">${t("map.pivot")} · ${t(`metrics.${m.id}.label`)}</option>`).join("");
  metric.value = getState().map.metric || "";
}

function fillTagFields() {
  const fields: { id: TagField; label: string }[] = [
    { id: "flag", label: t("tags.flag") },
    { id: "name", label: t("tags.name") },
    { id: "population", label: t("tags.population") },
    { id: "tfr", label: t("tags.tfr") },
    { id: "tmr", label: t("tags.tmr") },
    { id: "cpm", label: t("tags.cpm") },
    { id: "vsReplacement", label: t("tags.vsReplacement") },
    { id: "fertilityGap", label: t("tags.fertilityGap") },
    { id: "medianAge", label: t("tags.medianAge") },
    { id: "elderly", label: t("tags.elderly") },
    { id: "year", label: t("tags.year") },
    { id: "netMigration", label: t("tags.netMigration") },
  ];
  const host = $("tagFields");
  const selected = new Set(getState().map.tagFields);
  host.innerHTML = fields
    .map(
      (f) =>
        `<label data-tip="${t("map.includeTag", { field: f.label.toLowerCase() })}"><input type="checkbox" data-tag="${f.id}" ${selected.has(f.id) ? "checked" : ""}/> ${f.label}</label>`
    )
    .join("");
  host.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("change", () => {
      const tagFields = [...host.querySelectorAll("input:checked")].map((el) => (el as HTMLInputElement).dataset.tag as TagField);
      updateMap({ tagFields: tagFields.length ? tagFields : ["name"] });
      render();
    });
  });
}

function layoutBucket(view: ViewMode): "pyramid" | "mapish" | "other" {
  if (view === "map" || view === "regions" || view === "triangle" || view === "usa") return "mapish";
  if (view === "pyramid") return "pyramid";
  return "other";
}

function isMapish(view: ViewMode) {
  return view === "map" || view === "regions" || view === "triangle" || view === "usa";
}

function catalog() {
  if (getState().view === "usa") return usaStates;
  return countries;
}

function recOf(name: string) {
  return countries[name] || usaStates[name];
}

function defaultPanelsFor(view: ViewMode) {
  if (view === "pyramid") return { leftOpen: true, rightOpen: true };
  if (isMapish(view)) return { leftOpen: false, rightOpen: false };
  return { leftOpen: true, rightOpen: false };
}

function rememberViewPanels(patch: Partial<AppState["layout"]> = {}) {
  const s = getState();
  const nextLeft = patch.leftOpen ?? s.layout.leftOpen;
  const nextRight = patch.rightOpen ?? s.layout.rightOpen;
  const key = layoutBucket(s.view);
  return updateLayout({
    ...patch,
    byView: {
      ...(s.layout.byView ?? {}),
      [key]: { leftOpen: nextLeft, rightOpen: nextRight },
    },
  });
}

function applyViewPanels(view: ViewMode) {
  const s = getState();
  const panels = (s.layout.byView ?? {})[layoutBucket(view)] ?? defaultPanelsFor(view);
  if (s.layout.leftOpen !== panels.leftOpen || s.layout.rightOpen !== panels.rightOpen) {
    updateLayout({ leftOpen: panels.leftOpen, rightOpen: panels.rightOpen });
  }
  applyLayout(getState());
}

function mapishMetricKey(view: ViewMode): "map" | "regions" | "triangle" | "usa" | null {
  if (view === "map" || view === "regions" || view === "triangle" || view === "usa") return view;
  return null;
}

function applyMetricForView(view: ViewMode) {
  const key = mapishMetricKey(view);
  if (!key) return;
  const metric = getState().map.metricByView[key] ?? (key === "triangle" ? "" : "tfr");
  const sel = $("mapMetric") as HTMLSelectElement | null;
  if (sel) sel.value = metric;
  if (getState().map.metric !== metric) updateMap({ metric });
}

function rememberMetricForView(metric: string) {
  const key = mapishMetricKey(getState().view) || "map";
  updateMap({ metric, metricByView: { ...getState().map.metricByView, [key]: metric } });
}

function applyPageBackground(color: string) {
  const c = color || "#0F172A";
  document.documentElement.style.setProperty("--bg", c);
  document.body.style.background = c;
}

function syncHeatmapChrome() {
  const s = getState();
  const mapish = isMapish(s.view);
  const on = Boolean(s.map.metric);
  const heat = $("heatmapControls");
  if (heat) heat.hidden = !on;
  const countryWrap = $("countryFillWrap");
  if (countryWrap) countryWrap.hidden = !mapish || on;
  const headerCountry = $("headerCountryFillWrap");
  if (headerCountry) headerCountry.hidden = !mapish || on;
  const oceanWrap = $("headerOceanWrap");
  if (oceanWrap) oceanWrap.hidden = !mapish;
  setInput("countryFill", s.map.countryFill);
  setInput("headerCountryFill", s.map.countryFill);
  setInput("oceanColor", s.map.oceanColor);
  setInput("headerOcean", s.map.oceanColor);
  setInput("headerBg", s.appearance.bgColor);
  if (!on) {
    const legend = $("mapLegend");
    if (legend) {
      legend.hidden = true;
      legend.innerHTML = "";
    }
  }
}

function bindPairedColor(ids: string[], key: "countryFill" | "oceanColor") {
  ids.forEach((id) => {
    $(id)?.addEventListener("input", (e) => {
      const v = (e.target as HTMLInputElement).value;
      ids.forEach((other) => {
        if (other !== id) setInput(other, v);
      });
      updateMap({ [key]: v });
      render();
    });
  });
}

function syncToolbarMetric() {
  const id = getState().map.metric;
  metricSearch?.setValue(id || NONE_METRIC_ID);
}

function applyToolbarMetric(id: string) {
  const metric = id === NONE_METRIC_ID ? "" : id;
  const sel = $("mapMetric") as HTMLSelectElement | null;
  if (sel) sel.value = metric;
  rememberMetricForView(metric);
  syncToolbarMetric();
  syncHeatmapChrome();
  const view = getState().view;
  if (isMapish(view)) render();
}

function bindMetricCombo() {
  const input = $("headerMetricSearch") as HTMLInputElement | null;
  const list = $("headerMetricList");
  if (!input || !list) return;
  metricSearch = initCountrySearch({
    input,
    list,
    names: [NONE_METRIC_ID, ...METRICS.map((m) => m.id)],
    labelFor: (n) => (n === NONE_METRIC_ID ? t("map.metricNone") : t(`metrics.${n}.label`)),
    tokensFor: (n) => {
      if (n === NONE_METRIC_ID) return "none off solid fill no heatmap";
      const m = METRICS.find((x) => x.id === n);
      return m ? `${m.id} ${t(`metrics.${n}.label`)} ${t(`metrics.${n}.unit`)} ${t(`metrics.${n}.description`)}` : "";
    },
    descriptionFor: (n) => {
      if (n === NONE_METRIC_ID) return t("map.metricNoneTip");
      const m = METRICS.find((x) => x.id === n);
      if (!m) return "";
      const desc = t(`metrics.${n}.description`);
      const unit = t(`metrics.${n}.unit`);
      return unit ? `${desc} (${unit})` : desc;
    },
    initial: getState().map.metric || NONE_METRIC_ID,
    onSelect: (id) => applyToolbarMetric(id),
  });
}

function bindMapResize() {
  const wrap = $("mapWrap");
  if (!wrap || typeof ResizeObserver === "undefined") return;
  let raf = 0;
  const ro = new ResizeObserver(() => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const view = getState().view;
      if (view !== "map" && view !== "regions" && view !== "triangle") return;
      const rect = wrap.getBoundingClientRect();
      const key = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      if (key === lastMapBox) return;
      lastMapBox = key;
      render();
    });
  });
  ro.observe(wrap);
}

function bindChrome() {
  $("modeTabs").querySelectorAll(".mode-tab").forEach((btn) => {
    btn.addEventListener("click", () => setView((btn as HTMLElement).dataset.mode as ViewMode));
  });
  $("btnNavMenu")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleNavSheet();
  });
  document.querySelectorAll("#navSheet .nav-sheet-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeNavSheet();
      setView((btn as HTMLElement).dataset.mode as ViewMode);
    });
  });
  const toggleLeft = () => {
    if (isMobile()) {
      closeNavSheet();
      setMobileDrawer("left");
      return;
    }
    rememberViewPanels({ leftOpen: !getState().layout.leftOpen });
    applyLayout(getState());
    requestAnimationFrame(render);
  };
  const toggleRight = () => {
    if (isMobile()) {
      closeNavSheet();
      setMobileDrawer("right");
      if (mobileRight) renderCharts();
      return;
    }
    rememberViewPanels({ rightOpen: !getState().layout.rightOpen });
    applyLayout(getState());
    syncCountryDataLabel();
    renderCharts();
    requestAnimationFrame(render);
  };
  $("edgeLeft").addEventListener("click", toggleLeft);
  $("edgeRight").addEventListener("click", toggleRight);
  $("btnSettings")?.addEventListener("click", toggleLeft);
  $("btnCountryData")?.addEventListener("click", toggleRight);
  $("drawerScrim")?.addEventListener("click", () => {
    closeNavSheet();
    closeMobileDrawers();
  });
  bindResize("handleLeft", "left");
  bindResize("handleRight", "right");
}

function setMobileDrawer(which: "left" | "right", open?: boolean) {
  if (which === "left") {
    mobileLeft = open ?? !mobileLeft;
    if (mobileLeft) mobileRight = false;
  } else {
    mobileRight = open ?? !mobileRight;
    if (mobileRight) mobileLeft = false;
  }
  applyLayout(getState());
}

function closeMobileDrawers() {
  mobileLeft = false;
  mobileRight = false;
  applyLayout(getState());
}

function viewLabel(view: ViewMode) {
  const keys: Record<ViewMode, string> = {
    pyramid: "nav.pyramid",
    triangle: "nav.triangle",
    map: "nav.map",
    usa: "nav.usa",
    regions: "nav.regions",
    database: "nav.database",
    help: "nav.help",
  };
  return t(keys[view] || view);
}

function toggleNavSheet() {
  const sheet = $("navSheet");
  if (!sheet) return;
  if (sheet.hidden) openNavSheet();
  else closeNavSheet();
}

function openNavSheet() {
  const sheet = $("navSheet");
  const btn = $("btnNavMenu");
  if (!sheet) return;
  closeMobileDrawers();
  sheet.hidden = false;
  btn?.setAttribute("aria-expanded", "true");
  $("appRoot").classList.add("nav-sheet-open");
  const scrim = $("drawerScrim");
  if (scrim) scrim.hidden = false;
  syncNavSheet();
}

function closeNavSheet() {
  const sheet = $("navSheet");
  const btn = $("btnNavMenu");
  if (sheet) sheet.hidden = true;
  btn?.setAttribute("aria-expanded", "false");
  $("appRoot").classList.remove("nav-sheet-open");
  if (!mobileLeft && !mobileRight) {
    const scrim = $("drawerScrim");
    if (scrim) scrim.hidden = true;
  }
}

function syncNavSheet() {
  const view = getState().view;
  const label = $("navViewLabel");
  if (label) label.textContent = viewLabel(view);
  document.querySelectorAll("#navSheet .nav-sheet-item").forEach((btn) => {
    (btn as HTMLElement).classList.toggle("active", (btn as HTMLElement).dataset.mode === view);
  });
}

function bindResize(id: string, which: "left" | "right") {
  const el = $(id);
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const start = which === "left" ? getState().layout.leftWidth : getState().layout.rightWidth;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const max = Math.floor(window.innerWidth * 0.48);
      if (which === "left") {
        const w = Math.max(240, Math.min(max, start + dx));
        rememberViewPanels({ leftWidth: w, leftOpen: true });
      } else {
        const w = Math.max(240, Math.min(max, start - dx));
        rememberViewPanels({ rightWidth: w, rightOpen: true });
      }
      applyLayout(getState());
      if (which === "right") renderCharts();
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}

function applyLayout(s: AppState) {
  const root = $("appRoot");
  const mobile = isMobile();
  root.classList.toggle("mobile", mobile);
  if (mobile) {
    root.classList.remove("left-collapsed");
    root.style.setProperty("--left-w", "0px");
    root.style.setProperty("--right-w", "0px");
    $("leftSidebar").style.display = "";
    $("rightSidebar").classList.remove("collapsed");
    root.classList.toggle("drawer-left-open", mobileLeft);
    root.classList.toggle("drawer-right-open", mobileRight);
    const sheetOpen = !$("navSheet")?.hidden;
    const scrim = $("drawerScrim");
    if (scrim) scrim.hidden = !mobileLeft && !mobileRight && !sheetOpen;
    $("edgeLeft").style.display = "none";
    $("edgeRight").style.display = "none";
    $("handleLeft").style.display = "none";
    $("handleRight").style.display = "none";
    syncPanelButtons(true, mobileLeft, mobileRight);
    return;
  }
  root.classList.remove("drawer-left-open", "drawer-right-open");
  const scrim = $("drawerScrim");
  if (scrim) scrim.hidden = true;
  root.classList.toggle("left-collapsed", !s.layout.leftOpen);
  root.style.setProperty("--left-w", s.layout.leftOpen ? `${s.layout.leftWidth}px` : "0px");
  root.style.setProperty("--right-w", s.layout.rightOpen ? `${s.layout.rightWidth}px` : "0px");
  $("leftSidebar").style.display = s.layout.leftOpen ? "" : "none";
  $("rightSidebar").classList.toggle("collapsed", !s.layout.rightOpen);
  $("edgeLeft").style.display = "";
  $("edgeRight").style.display = "";
  $("edgeLeft").textContent = s.layout.leftOpen ? "‹" : "›";
  $("handleLeft").style.display = s.layout.leftOpen ? "" : "none";
  $("handleRight").style.display = s.layout.rightOpen ? "" : "none";
  syncPanelButtons(false, s.layout.leftOpen, s.layout.rightOpen);
}

function syncPanelButtons(mobile: boolean, leftOn: boolean, rightOn: boolean) {
  const settings = $("btnSettings");
  const country = $("btnCountryData");
  settings?.classList.toggle("active", leftOn);
  country?.classList.toggle("active", rightOn);
  settings?.setAttribute("aria-pressed", leftOn ? "true" : "false");
  country?.setAttribute("aria-pressed", rightOn ? "true" : "false");
  if (mobile) return;
  const leftTip = leftOn ? t("nav.settingsHide") : t("nav.settingsShow");
  const rightTip = rightOn ? t("nav.countryDataHide") : t("nav.countryDataShow");
  if (settings) settings.setAttribute("data-tip", leftTip);
  if (country) country.setAttribute("data-tip", rightTip);
}

function syncViewCopy() {
  const usa = getState().view === "usa";
  document.querySelectorAll('[data-i18n="country.label"]').forEach((el) => {
    el.textContent = usa ? t("country.labelUsa") : t("country.label");
  });
  const search = $("countrySearch") as HTMLInputElement | null;
  if (search) search.placeholder = usa ? t("country.searchUsa") : t("country.search");
  const header = $("headerCountrySearch") as HTMLInputElement | null;
  if (header) {
    header.placeholder = usa ? t("country.searchUsa") : t("country.headerSearch");
    header.setAttribute("aria-label", usa ? t("country.labelUsa") : t("country.label"));
  }
  const countryTip = document.querySelector("#panelCountry [data-i18n-tip='country.tip']") as HTMLElement | null;
  if (countryTip) countryTip.setAttribute("data-tip", usa ? t("country.tipUsa") : t("country.tip"));
  const surfField = $("mapSurface")?.closest(".field") as HTMLElement | null;
  if (surfField) surfField.hidden = usa;
  const setField = $("mapCountrySet")?.closest(".field") as HTMLElement | null;
  if (setField) setField.hidden = usa;
}

function setView(mode: ViewMode) {
  const prev = getState().view;
  const view: ViewMode = mode || "pyramid";
  let nextCountry: string | null = null;
  if (view === "usa") {
    const patch: Partial<AppState["map"]> = { surface: "map" };
    if (prev !== "usa") {
      patch.zoom = 1;
      patch.pan = [0, 0] as [number, number];
      patch.rotation = [0, 0, 0] as [number, number, number];
      patch.pins = [];
    }
    updateMap(patch);
    if (!isUsaStateKey(getState().country)) nextCountry = usaStateKey("California");
  } else if (isUsaStateKey(getState().country) && view !== "pyramid") {
    nextCountry = "United States";
  }
  setState({ view });
  document.body.className = `mode-${view}`;
  $("modeTabs").querySelectorAll(".mode-tab").forEach((btn) => {
    (btn as HTMLElement).classList.toggle("active", (btn as HTMLElement).dataset.mode === view);
  });
  closeNavSheet();
  syncNavSheet();
  const mapish = isMapish(view);
  $("viewPyramid").hidden = view !== "pyramid";
  $("viewTriangle").hidden = true;
  $("viewMap").hidden = !mapish;
  $("viewDatabase").hidden = view !== "database";
  const help = document.getElementById("viewHelp");
  if (help) help.hidden = view !== "help";
  $("panelMapOptions").hidden = !mapish;
  ($("triangleCanvas") as HTMLCanvasElement).hidden = view !== "triangle";
  $("yearStrip").hidden = !mapish;
  $("mapHeader").hidden = view === "triangle";
  const cross = document.getElementById("mapCrosshair");
  if (cross) cross.hidden = !(view === "triangle" || view === "map" || view === "regions" || view === "usa");
  const surfaceDock = document.querySelector(".map-surface-dock") as HTMLElement | null;
  if (surfaceDock) surfaceDock.hidden = view === "usa";
  syncHubCardChrome();
  if (view === "triangle") fillHubCard(getState().country);
  $("mapTitle").textContent =
    view === "usa"
      ? t("map.titleUsa")
      : view === "regions"
        ? t("map.titleRegions")
        : view === "triangle"
          ? t("map.titleTriangle")
          : t("map.titleMap");
  syncViewCopy();
  syncSearchCatalog();
  if (view === "database") renderDatabase();
  stopPlayback();
  const toolbar = $("viewToolbar");
  if (toolbar) toolbar.hidden = view === "help" || view === "database";
  applyMetricForView(view);
  const metricCombo = $("headerMetricCombo");
  if (metricCombo) metricCombo.hidden = !mapish;
  const headerColors = $("headerMapColors");
  if (headerColors) headerColors.hidden = view === "help" || view === "database";
  const legend = $("mapLegend");
  if (legend && !mapish) legend.hidden = true;
  syncHeatmapChrome();
  if (isMobile()) {
    mobileLeft = false;
    mobileRight = false;
  }
  applyViewPanels(view);
  if (nextCountry) loadCountry(nextCountry, { fly: false });
  else recompute();
  syncToolbarMetric();
  if (viewPlaysSimulation(view)) startPlayback();
}

function bindControls() {
  const link = (rangeId: string, inputId: string, fn: () => void) => {
    const range = $(rangeId) as HTMLInputElement;
    const input = $(inputId) as HTMLInputElement;
    range.addEventListener("input", () => {
      input.value = range.value;
      fn();
    });
    input.addEventListener("change", () => {
      range.value = input.value;
      fn();
    });
  };
  link("tfrRange", "tfrInput", () => {
    updateScenario({ tfr: Number(($("tfrInput") as HTMLInputElement).value) });
    recompute();
  });
  link("leRange", "leInput", () => {
    updateScenario({ lifeExpectancy: Number(($("leInput") as HTMLInputElement).value) });
    recompute();
  });
  link("migRange", "migInput", () => {
    updateScenario({ migration: Number(($("migInput") as HTMLInputElement).value) });
    recompute();
  });
  link("srbRange", "srbInput", () => {
    updateScenario({ sexRatioBirth: Number(($("srbInput") as HTMLInputElement).value) });
    recompute();
  });
  link("speedRange", "speedInput", () => {
    updateTime({ yearsPerSecond: Number(($("speedInput") as HTMLInputElement).value) });
  });
  link("tagOpacity", "tagOpacityNum", () => {
    updateMap({ tagOpacity: Number(($("tagOpacity") as HTMLInputElement).value) });
    render();
  });
  link("labelOutlineWidth", "labelOutlineWidthNum", () => {
    syncAppearanceFromDom();
    render();
  });
  link("hoverSpeedRange", "hoverSpeedInput", () => {
    updateHover({ yearsPerSecond: Number(($("hoverSpeedInput") as HTMLInputElement).value) });
  });
  link("hoverSize", "hoverSizeNum", () => {
    updateHover({ size: Number(($("hoverSizeNum") as HTMLInputElement).value) });
  });
  link("hoverTitleSize", "hoverTitleSizeNum", () => {
    updateHover({ titleSize: Number(($("hoverTitleSizeNum") as HTMLInputElement).value) });
  });
  link("hoverAgeSize", "hoverAgeSizeNum", () => {
    updateHover({ ageSize: Number(($("hoverAgeSizeNum") as HTMLInputElement).value) });
  });
  link("hoverSpanYears", "hoverSpanYearsNum", () => {
    updateMap({ hoverSpanYears: Number(($("hoverSpanYearsNum") as HTMLInputElement).value) || 100 });
    rebuildPeakScales();
  });
  link("hoverOpacity", "hoverOpacityNum", () => {
    updateHover({ opacity: Number(($("hoverOpacityNum") as HTMLInputElement).value) });
  });
  $("hoverFlagWindow")?.addEventListener("change", () => {
    updateHover({ flagWindow: ($("hoverFlagWindow") as HTMLInputElement).checked });
  });
  $("chartShowWpp")?.addEventListener("change", () => {
    updateCharts({ showWpp: ($("chartShowWpp") as HTMLInputElement).checked });
    renderCharts();
  });
  $("chartWppColor")?.addEventListener("input", () => {
    updateCharts({ wppColor: ($("chartWppColor") as HTMLInputElement).value });
    renderCharts();
  });
  $("useWppMediumRates")?.addEventListener("change", () => {
    updateScenario({ useWppMediumRates: ($("useWppMediumRates") as HTMLInputElement).checked });
    recompute();
  });
  ["applyTfr", "applyLe", "applyMig", "applySrb"].forEach((id) => {
    $(id)?.addEventListener("change", () => {
      updateScenario({
        applyTfr: ($("applyTfr") as HTMLInputElement).checked,
        applyLe: ($("applyLe") as HTMLInputElement).checked,
        applyMig: ($("applyMig") as HTMLInputElement).checked,
        applySrb: ($("applySrb") as HTMLInputElement).checked,
      });
      recompute();
    });
  });
  $("triangleAnimate")?.addEventListener("change", () => {
    updateMap({ triangleAnimate: ($("triangleAnimate") as HTMLInputElement).checked });
    if (getState().view === "triangle") startTriangleAnim();
  });
  $("hubCardHide")?.addEventListener("click", () => {
    updateMap({ hubCard: false });
    syncHubCardChrome();
  });
  $("hubCardShow")?.addEventListener("click", () => {
    updateMap({ hubCard: true });
    syncHubCardChrome();
    fillHubCard(getState().country);
  });

  $("startYear").addEventListener("change", () => {
    syncHeaderYears();
    updateTime({ startYear: Number(($("startYear") as HTMLInputElement).value) });
    recompute();
  });
  $("endYear").addEventListener("change", () => {
    syncHeaderYears();
    updateTime({ endYear: Number(($("endYear") as HTMLInputElement).value) });
    recompute();
  });
  $("headerStartYear")?.addEventListener("change", () => {
    const src = $("headerStartYear") as HTMLInputElement;
    ($("startYear") as HTMLInputElement).value = src.value;
    ($("startYear") as HTMLInputElement).dispatchEvent(new Event("change"));
  });
  $("headerEndYear")?.addEventListener("change", () => {
    const src = $("headerEndYear") as HTMLInputElement;
    ($("endYear") as HTMLInputElement).value = src.value;
    ($("endYear") as HTMLInputElement).dispatchEvent(new Event("change"));
  });
  $("fitToLength").addEventListener("change", () => {
    const on = ($("fitToLength") as HTMLInputElement).checked;
    $("durationWrap").hidden = !on;
    updateExport({ fitToLength: on });
    applyFitSpeed();
  });
  $("durationSec").addEventListener("change", () => {
    updateExport({ durationSec: Number(($("durationSec") as HTMLInputElement).value) });
    applyFitSpeed();
  });

  [
    "maleColor",
    "femaleColor",
    "bgColor",
    "textColor",
    "showFlag",
    "flagWindow",
    "flagColors",
    "showCounts",
    "showAgeLabels",
    "showGrid",
    "showPercent",
    "showLegend",
    "labelOutline",
    "labelOutlineColor",
    "triangleTextColor",
  ].forEach((id) => {
    $(id).addEventListener("input", () => {
      if (id === "bgColor") {
        const v = ($("bgColor") as HTMLInputElement).value;
        setInput("headerBg", v);
        applyPageBackground(v);
      }
      syncAppearanceFromDom();
      render();
    });
  });
  $("headerBg")?.addEventListener("input", () => {
    const v = ($("headerBg") as HTMLInputElement).value;
    setInput("bgColor", v);
    applyPageBackground(v);
    syncAppearanceFromDom();
    render();
  });
  ["pyramidBands", "trianglePopBands", "triangleMortBands", "triangleFertBands"].forEach((id) => {
    $(id).addEventListener("change", () => {
      syncAppearanceFromDom();
      render();
    });
  });
  $("showStats").addEventListener("change", () => {
    syncAppearanceFromDom();
    $("statsBar").classList.toggle("hidden", !($("showStats") as HTMLInputElement).checked);
  });
  $("hoverMatchSpeed").addEventListener("change", () => {
    const on = ($("hoverMatchSpeed") as HTMLInputElement).checked;
    updateHover({ matchSpeed: on });
    $("hoverSpeedWrap").hidden = on;
  });
  $("hoverBands").addEventListener("change", () => {
    updateHover({ bands: clampBands(Number(($("hoverBands") as HTMLInputElement).value)) });
  });
  $("hoverShowAge").addEventListener("change", () => {
    updateHover({ showAgeLabels: ($("hoverShowAge") as HTMLInputElement).checked });
  });
  $("hoverShowCounts").addEventListener("change", () => {
    updateHover({ showCounts: ($("hoverShowCounts") as HTMLInputElement).checked });
  });
  $("chartBg").addEventListener("input", () => {
    updateCharts({ bg: ($("chartBg") as HTMLInputElement).value });
    renderCharts();
  });
  $("chartText").addEventListener("input", () => {
    updateCharts({ text: ($("chartText") as HTMLInputElement).value });
    renderCharts();
  });

  $("yearScrub").addEventListener("input", () => {
    yearHold = true;
    stopPlayback();
    setYear(Number(($("yearScrub") as HTMLInputElement).value));
  });
  $("btnPlay").addEventListener("click", startPlayback);
  $("btnPause").addEventListener("click", stopPlayback);
  $("btnHeaderPlay")?.addEventListener("click", togglePlayback);
  $("btnReset").addEventListener("click", () => {
    stopPlayback();
    setYear(yearRange().startYear);
  });
  $("btnExport").addEventListener("click", runExport);
  $("btnSnapshot").addEventListener("click", snapshotPng);

  $("mapSurface")?.addEventListener("change", () => {
    switchSurface(($("mapSurface") as HTMLSelectElement).value as "map" | "globe");
  });
  document.querySelectorAll("#surfaceToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const surface = (btn as HTMLElement).dataset.surface as "map" | "globe";
      ($("mapSurface") as HTMLSelectElement).value = surface;
      switchSurface(surface);
    });
  });
  $("btnZoomIn")?.addEventListener("click", () => {
    applyMapZoom((getState().map.zoom || 1) * 1.2);
  });
  $("btnZoomOut")?.addEventListener("click", () => {
    applyMapZoom((getState().map.zoom || 1) / 1.2);
  });
  $("btnZoomReset")?.addEventListener("click", () => {
    updateMap({ zoom: 1, rotation: [0, 0, 0], pan: [0, 0] });
    render();
  });
  ["mapCountrySet", "mapMetric", "colorMode", "pivotStat", "pivotMetric", "paletteStops", "useCountryTfr", "useCountryLe", "useUnE0ByYear", "useCountryMig", "mapShowMissing", "idealMeanAll", "hoverMini"].forEach((id) => {
    $(id)?.addEventListener("change", () => {
      syncMapFromDom();
      if (id === "paletteStops") {
        $("midColorWrap").hidden = ($("paletteStops") as HTMLSelectElement).value === "2";
        if (($("paletteStops") as HTMLSelectElement).value === "3") {
          ($("colorMode") as HTMLSelectElement).value = "diverging";
        }
      }
      if (id === "pivotStat") $("customPivotWrap").hidden = ($("pivotStat") as HTMLSelectElement).value !== "custom";
      if (["useCountryTfr", "useCountryLe", "useUnE0ByYear", "useCountryMig", "mapCountrySet", "idealMeanAll", "useWppMediumRates"].includes(id)) recompute();
      else render();
    });
  });
  ["heatLow", "heatMid", "heatHigh"].forEach((id) => $(id).addEventListener("input", () => {
    syncMapFromDom();
    render();
  }));
  bindPairedColor(["countryFill", "headerCountryFill"], "countryFill");
  bindPairedColor(["oceanColor", "headerOcean"], "oceanColor");
  $("customPivot").addEventListener("change", () => {
    syncMapFromDom();
    render();
  });
  $("btnClearPins").addEventListener("click", () => {
    updateMap({ pins: [], pinOffsets: {} });
    render();
  });

  ["exportLayout", "exportRes", "exportAspect", "videoFormat", "exportFps", "customW", "customH"].forEach((id) => {
    $(id).addEventListener("change", syncExportFromDom);
  });
  $("exportRes").addEventListener("change", () => {
    $("customResWrap").hidden = ($("exportRes") as HTMLSelectElement).value !== "custom";
  });

  $("btnDbExport").addEventListener("click", () => downloadJson("population-overrides.json", loadOverrides()));
  $("btnDbReset").addEventListener("click", () => {
    clearOverrides();
    countries = { ...bundled };
    renderDatabase();
    loadCountry(getState().country);
  });
  $("dbImport").addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const json = JSON.parse(await file.text());
    saveOverrides(json);
    countries = applyOverrides(bundled, json);
    renderDatabase();
    loadCountry(getState().country);
  });
  $("dbSearch").addEventListener("input", renderDatabase);
}

function syncAppearanceFromDom() {
  updateAppearance({
    maleColor: ($("maleColor") as HTMLInputElement).value,
    femaleColor: ($("femaleColor") as HTMLInputElement).value,
    bgColor: ($("bgColor") as HTMLInputElement).value,
    textColor: ($("textColor") as HTMLInputElement).value,
    showFlag: ($("showFlag") as HTMLInputElement).checked,
    flagWindow: ($("flagWindow") as HTMLInputElement).checked,
    flagColors: ($("flagColors") as HTMLInputElement).checked,
    showCounts: ($("showCounts") as HTMLInputElement).checked,
    showAgeLabels: ($("showAgeLabels") as HTMLInputElement).checked,
    showGrid: ($("showGrid") as HTMLInputElement).checked,
    showPercent: ($("showPercent") as HTMLInputElement).checked,
    showLegend: ($("showLegend") as HTMLInputElement).checked,
    showStats: ($("showStats") as HTMLInputElement).checked,
    labelOutline: ($("labelOutline") as HTMLInputElement).checked,
    labelOutlineColor: ($("labelOutlineColor") as HTMLInputElement).value,
    labelOutlineWidth: Number(($("labelOutlineWidthNum") as HTMLInputElement).value) || 0,
    triangleTextColor: ($("triangleTextColor") as HTMLInputElement).value,
    pyramidBands: clampBands(Number(($("pyramidBands") as HTMLInputElement).value)),
    trianglePopBands: clampBands(Number(($("trianglePopBands") as HTMLInputElement).value)),
    triangleMortBands: clampBands(Number(($("triangleMortBands") as HTMLInputElement).value)),
    triangleFertBands: clampBands(Number(($("triangleFertBands") as HTMLInputElement).value)),
  });
}

function chartSpecs(): { id: string; title: string; unit: string }[] {
  return [
    { id: "tfr", title: t("charts.tfr"), unit: "" },
    { id: "pop", title: t("charts.pop"), unit: "" },
    { id: "e0", title: t("charts.e0"), unit: t("metrics.e0.unit") },
    { id: "mig", title: t("charts.mig"), unit: t("metrics.netMigration.unit") },
    { id: "ideal", title: t("charts.ideal"), unit: "" },
    { id: "births", title: t("charts.births"), unit: "" },
    { id: "inflow", title: t("charts.inflow"), unit: "" },
  ];
}

function fillChartSeries() {
  const host = $("chartSeries");
  if (!host) return;
  const series = getState().charts.series;
  host.innerHTML = chartSpecs().map((s) => {
    const cur = series[s.id] || { on: true, color: "#38bdf8" };
    return `<label data-tip="${t("charts.showSeries", { title: s.title })}">
      <input type="checkbox" data-series="${s.id}" ${cur.on ? "checked" : ""}/>
      <span>${s.title}</span>
      <input type="color" data-series-color="${s.id}" value="${cur.color}" />
    </label>`;
  }).join("");
  host.querySelectorAll("input[data-series]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const id = (inp as HTMLInputElement).dataset.series!;
      const on = (inp as HTMLInputElement).checked;
      updateCharts({ series: { ...getState().charts.series, [id]: { ...getState().charts.series[id], on } } });
      renderCharts();
    });
  });
  host.querySelectorAll("input[data-series-color]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const id = (inp as HTMLInputElement).dataset.seriesColor!;
      const color = (inp as HTMLInputElement).value;
      updateCharts({ series: { ...getState().charts.series, [id]: { ...getState().charts.series[id], color } } });
      renderCharts();
    });
  });
}

function setInput(id: string, value: string | number | boolean) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!el) return;
  if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = Boolean(value);
  else el.value = String(value);
}

function hydrateDomFromState() {
  const s = getState();
  setInput("speedRange", s.time.yearsPerSecond);
  setInput("speedInput", s.time.yearsPerSecond);
  setInput("maleColor", s.appearance.maleColor);
  setInput("femaleColor", s.appearance.femaleColor);
  setInput("bgColor", s.appearance.bgColor);
  setInput("headerBg", s.appearance.bgColor);
  applyPageBackground(s.appearance.bgColor);
  setInput("textColor", s.appearance.textColor);
  setInput("showFlag", s.appearance.showFlag);
  setInput("flagWindow", s.appearance.flagWindow);
  setInput("flagColors", s.appearance.flagColors);
  setInput("showCounts", s.appearance.showCounts);
  setInput("showAgeLabels", s.appearance.showAgeLabels);
  setInput("showGrid", s.appearance.showGrid);
  setInput("showPercent", s.appearance.showPercent);
  setInput("showLegend", s.appearance.showLegend);
  setInput("showStats", s.appearance.showStats);
  setInput("labelOutline", s.appearance.labelOutline);
  setInput("labelOutlineColor", s.appearance.labelOutlineColor);
  setInput("labelOutlineWidth", s.appearance.labelOutlineWidth);
  setInput("labelOutlineWidthNum", s.appearance.labelOutlineWidth);
  setInput("triangleTextColor", s.appearance.triangleTextColor);
  setInput("pyramidBands", s.appearance.pyramidBands);
  setInput("trianglePopBands", s.appearance.trianglePopBands);
  setInput("triangleMortBands", s.appearance.triangleMortBands);
  setInput("triangleFertBands", s.appearance.triangleFertBands);
  setInput("hoverMini", s.map.hoverMini);
  setInput("hoverSpanYears", s.map.hoverSpanYears);
  setInput("hoverSpanYearsNum", s.map.hoverSpanYears);
  setInput("hoverMatchSpeed", s.hover.matchSpeed);
  setInput("hoverSpeedRange", s.hover.yearsPerSecond);
  setInput("hoverSpeedInput", s.hover.yearsPerSecond);
  setInput("hoverSize", s.hover.size);
  setInput("hoverSizeNum", s.hover.size);
  setInput("hoverTitleSize", s.hover.titleSize);
  setInput("hoverTitleSizeNum", s.hover.titleSize);
  setInput("hoverAgeSize", s.hover.ageSize);
  setInput("hoverAgeSizeNum", s.hover.ageSize);
  setInput("hoverBands", s.hover.bands);
  setInput("hoverShowAge", s.hover.showAgeLabels);
  setInput("hoverShowCounts", s.hover.showCounts);
  setInput("hoverFlagWindow", s.hover.flagWindow);
  setInput("hoverOpacity", s.hover.opacity);
  setInput("hoverOpacityNum", s.hover.opacity);
  $("hoverSpeedWrap").hidden = s.hover.matchSpeed;
  setInput("chartBg", s.charts.bg);
  setInput("chartText", s.charts.text);
  setInput("chartShowWpp", s.charts.showWpp);
  setInput("chartWppColor", s.charts.wppColor);
  setInput("useWppMediumRates", s.scenario.useWppMediumRates);
  setInput("useCountryTfr", s.scenario.useCountryTfr);
  setInput("useCountryLe", s.scenario.useCountryLe);
  setInput("useUnE0ByYear", s.scenario.useUnE0ByYear);
  setInput("useCountryMig", s.scenario.useCountryMig);
  setInput("applyTfr", s.scenario.applyTfr);
  setInput("applyLe", s.scenario.applyLe);
  setInput("applyMig", s.scenario.applyMig);
  setInput("applySrb", s.scenario.applySrb);
  setInput("triangleAnimate", s.map.triangleAnimate);
  setInput("mapSurface", s.map.surface);
  setInput("tagOpacity", s.map.tagOpacity);
  setInput("tagOpacityNum", s.map.tagOpacity);
  $("statsBar").classList.toggle("hidden", !s.appearance.showStats);
  $("midColorWrap").hidden = s.map.paletteStops === 2;
  setInput("countryFill", s.map.countryFill);
  setInput("headerCountryFill", s.map.countryFill);
  setInput("oceanColor", s.map.oceanColor);
  setInput("headerOcean", s.map.oceanColor);
  setInput("mapMetric", s.map.metric || "");
  syncHeatmapChrome();
  setInput("videoFormat", s.exportOpts.format);
  setInput("exportFps", s.exportOpts.fps);
  syncSurfaceButtons();
}

function mapNavKey(e: KeyboardEvent): "left" | "right" | "up" | "down" | null {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "ArrowLeft" || k === "a") return "left";
  if (k === "ArrowRight" || k === "d") return "right";
  if (k === "ArrowUp" || k === "w") return "up";
  if (k === "ArrowDown" || k === "s") return "down";
  return null;
}

function bindMapKeys() {
  const held = new Set<string>();
  let raf = 0;
  let last = 0;
  let shift = false;
  const tick = (ts: number) => {
    if (!held.size) {
      raf = 0;
      last = 0;
      return;
    }
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    const view = getState().view;
    if (view !== "map" && view !== "regions" && view !== "triangle") {
      raf = requestAnimationFrame(tick);
      return;
    }
    const mul = shift ? 2.5 : 1;
    const px = 420 * dt * mul;
    let dx = 0;
    let dy = 0;
    if (held.has("left")) dx += px;
    if (held.has("right")) dx -= px;
    if (held.has("up")) dy += px;
    if (held.has("down")) dy -= px;
    if (dx || dy) {
      if (liveMapReady()) nudgeLiveMap(dx, dy);
      else {
        const map = getState().map;
        if (map.surface === "globe") {
          const k = 0.18 * mul;
          const r = [...map.rotation] as [number, number, number];
          updateMap({ rotation: [r[0] + dx * k, r[1] - dy * k, r[2]] });
          render();
        } else {
          updateMap({ pan: [map.pan[0] + dx, map.pan[1] + dy] });
          render();
        }
      }
    }
    raf = requestAnimationFrame(tick);
  };
  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const view = getState().view;
    if (view !== "map" && view !== "regions" && view !== "triangle") return;
    const dir = mapNavKey(e);
    if (!dir) return;
    e.preventDefault();
    shift = e.shiftKey;
    held.add(dir);
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(tick);
    }
  });
  window.addEventListener("keyup", (e) => {
    const dir = mapNavKey(e);
    if (dir) held.delete(dir);
    if (!e.shiftKey) shift = false;
  });
  window.addEventListener("blur", () => {
    held.clear();
  });
}

function yearsInRange() {
  const { startYear, endYear } = yearRange();
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years;
}

function simStartYear() {
  return yearRange().startYear;
}

function setYear(year: number) {
  const { startYear, endYear } = yearRange();
  const y = Math.max(startYear, Math.min(endYear, Math.round(year)));
  frameIndex = y - startYear;
  updateTime({ currentYear: y });
  render();
}

function isPristineMapView(m: AppState["map"]) {
  const pan0 = !m.pan || (m.pan[0] === 0 && m.pan[1] === 0);
  const rot0 = !m.rotation || (m.rotation[0] === 0 && m.rotation[1] === 0);
  if (m.surface === "globe") return rot0;
  return pan0;
}

function focusSerbiaIfPristine(W: number, H: number) {
  if (getState().view === "usa") return;
  const m = getState().map;
  if (!isPristineMapView(m)) return;
  const zoom = m.zoom <= 1.05 ? 2.6 : m.zoom;
  const view = lookAtLonLat(m.surface, SERBIA_FOCUS[0], SERBIA_FOCUS[1], W, H, zoom);
  updateMap({ pan: view.pan, rotation: view.rotation, zoom: view.zoom });
}

function applyMapZoom(nextZoom: number) {
  const view = viewForZoom(nextZoom);
  updateMap(view.pan ? { zoom: view.zoom, pan: view.pan } : { zoom: view.zoom });
  render();
}

function switchSurface(surface: "map" | "globe") {
  const wrap = $("mapWrap");
  const rect = wrap.getBoundingClientRect();
  const W = Math.max(640, Math.floor(rect.width));
  const H = Math.max(360, Math.floor(rect.height));
  const zoom = getState().map.zoom || 1;
  const focus = currentFocusLonLat();
  const [lon, lat] = focus || DEFAULT_FOCUS;
  const view = lookAtLonLat(surface, lon, lat, W, H, focus ? zoom : 1);
  updateMap({
    surface,
    pan: view.pan,
    rotation: view.rotation,
    zoom: view.zoom,
  });
  syncSurfaceButtons();
  render();
}

function syncYearChrome(year: number) {
  const scrub = $("yearScrub") as HTMLInputElement;
  if (document.activeElement !== scrub) scrub.value = String(year);
  $("yearReadout").textContent = String(year);
  const statYear = document.getElementById("statYear");
  if (statYear) statYear.textContent = String(year);
  const strip = $("yearStrip");
  const view = getState().view;
  const show = isMapish(view);
  strip.hidden = !show;
  if (show) {
    renderYearStrip(strip, yearsInRange(), year, (y) => {
      yearHold = true;
      stopPlayback();
      setYear(y);
    });
  }
}

function syncMapFromDom() {
  const follow = ($("pivotMetric") as HTMLSelectElement).value === "";
  const metric = ($("mapMetric") as HTMLSelectElement).value;
  const key = mapishMetricKey(getState().view) || "map";
  updateMap({
    metric,
    metricByView: { ...getState().map.metricByView, [key]: metric },
    countryFill: ($("countryFill") as HTMLInputElement)?.value || getState().map.countryFill,
    oceanColor: ($("oceanColor") as HTMLInputElement)?.value || getState().map.oceanColor,
    countrySet: ($("mapCountrySet") as HTMLSelectElement).value as "all" | "tfr2026",
    colorMode: ($("colorMode") as HTMLSelectElement).value as any,
    paletteStops: Number(($("paletteStops") as HTMLSelectElement).value) === 2 ? 2 : 3,
    colors: {
      low: ($("heatLow") as HTMLInputElement).value,
      mid: ($("heatMid") as HTMLInputElement).value,
      high: ($("heatHigh") as HTMLInputElement).value,
    },
    pivot: {
      followMetric: follow,
      stat: ($("pivotStat") as HTMLSelectElement).value as any,
      otherMetric: follow ? null : ($("pivotMetric") as HTMLSelectElement).value,
      customValue: Number(($("customPivot") as HTMLInputElement).value),
    },
    showMissing: ($("mapShowMissing") as HTMLInputElement).checked,
    hoverMini: ($("hoverMini") as HTMLInputElement).checked,
    hoverSpanYears: Number(($("hoverSpanYearsNum") as HTMLInputElement)?.value) || getState().map.hoverSpanYears,
    idealMode: ($("idealMeanAll") as HTMLInputElement).checked ? "meanAll" : "latest",
    surface: ($("mapSurface") as HTMLSelectElement).value as "map" | "globe",
  });
  updateScenario({
    useCountryTfr: ($("useCountryTfr") as HTMLInputElement).checked,
    useCountryLe: ($("useCountryLe") as HTMLInputElement).checked,
    useUnE0ByYear: ($("useUnE0ByYear") as HTMLInputElement)?.checked !== false,
    useCountryMig: ($("useCountryMig") as HTMLInputElement).checked,
    useWppMediumRates: ($("useWppMediumRates") as HTMLInputElement)?.checked || false,
  });
  syncSurfaceButtons();
  syncToolbarMetric();
  syncHeatmapChrome();
}

function syncSurfaceButtons() {
  const s = getState().map.surface;
  document.querySelectorAll("#surfaceToggle button").forEach((btn) => {
    btn.classList.toggle("active", (btn as HTMLElement).dataset.surface === s);
  });
  const sel = $("mapSurface") as HTMLSelectElement | null;
  if (sel) sel.value = s;
}

function syncExportFromDom() {
  updateExport({
    layout: ($("exportLayout") as HTMLSelectElement).value as any,
    resolution: ($("exportRes") as HTMLSelectElement).value as any,
    aspect: ($("exportAspect") as HTMLSelectElement).value as any,
    format: ($("videoFormat") as HTMLSelectElement).value as any,
    fps: Number(($("exportFps") as HTMLInputElement).value) || 60,
    customWidth: Number(($("customW") as HTMLInputElement).value) || 1920,
    customHeight: Number(($("customH") as HTMLInputElement).value) || 1080,
  });
}

function applyFitSpeed() {
  const s = getState();
  if (!s.exportOpts.fitToLength) {
    ($("speedRange") as HTMLInputElement).disabled = false;
    ($("speedInput") as HTMLInputElement).disabled = false;
    return;
  }
  const years = Math.max(1, s.time.endYear - s.time.startYear);
  const speed = years / Math.max(1, s.exportOpts.durationSec);
  ($("speedInput") as HTMLInputElement).value = String(Math.round(speed * 10) / 10);
  ($("speedRange") as HTMLInputElement).value = String(Math.min(30, speed));
  ($("speedRange") as HTMLInputElement).disabled = true;
  ($("speedInput") as HTMLInputElement).disabled = true;
  updateTime({ yearsPerSecond: speed, fitDurationSec: s.exportOpts.durationSec });
}

function syncCountryCombos(name: string) {
  for (const search of countrySearches) search.setValue(name);
}

function syncCountryDataLabel(name = getState().country) {
  const c = recOf(name);
  const sub = $("rightSubtitle");
  if (sub) sub.textContent = c ? displayName(c) : t("charts.empty");
}

let pendingFlyName: string | null = null;

function focusCountryOnMap(name: string) {
  if (!mapFlyEnabled) return;
  const view = getState().view;
  if (!isMapish(view)) return;
  pendingFlyName = name;
  tryFlyToPending();
}

function tryFlyToPending() {
  if (!pendingFlyName || !mapFlyEnabled) return;
  if (mapRenderPending || !liveMapReady()) return;
  const name = pendingFlyName;
  pendingFlyName = null;
  flyToCountry(name, 500);
}

function viewPlaysSimulation(view: ViewMode) {
  return view === "pyramid" || isMapish(view);
}

function adoptCountry(name: string) {
  if (!name || !recOf(name)) return;
  const view = getState().view;
  loadCountry(name);
  if (viewPlaysSimulation(view)) startPlayback();
}

function loadCountry(name: string, opts?: { keepYears?: boolean; fly?: boolean }) {
  const c = recOf(name);
  if (!c) return;
  setState({ country: name });
  syncCountryCombos(name);
  syncCountryDataLabel(name);
  const tfr = c.latest.tfr;
  ($("tfrRange") as HTMLInputElement).value = String(tfr);
  ($("tfrInput") as HTMLInputElement).value = String(tfr);
  ($("leRange") as HTMLInputElement).value = String(c.latest.e0);
  ($("leInput") as HTMLInputElement).value = String(c.latest.e0);
  ($("migRange") as HTMLInputElement).value = String(Math.max(-200000, Math.min(200000, c.latest.netMigration || 0)));
  ($("migInput") as HTMLInputElement).value = String(c.latest.netMigration || 0);
  if (!opts?.keepYears) {
    const start = freshYear(c);
    const end = start + 100;
    ($("startYear") as HTMLInputElement).value = String(start);
    ($("endYear") as HTMLInputElement).value = String(end);
    syncHeaderYears();
    updateTime({ startYear: start, endYear: end, currentYear: start });
  }
  updateScenario({
    tfr,
    lifeExpectancy: c.latest.e0,
    migration: c.latest.netMigration || 0,
    sexRatioBirth: c.latest.srb || 1.05,
  });
  renderSourceCard(c);
  syncCountryDataLabel(name);
  frameIndex = 0;
  flagImage = null;
  flagColorsFor = null;
  loadFlagImage(name, c.iso2).then((img) => {
    flagImage = img;
    render();
  });
  if (getState().appearance.flagColors) {
    colorsFromFlag(name, c.iso2).then((pair) => {
      if (!pair || getState().country !== name) return;
      flagColorsFor = name;
      ($("maleColor") as HTMLInputElement).value = pair.male;
      ($("femaleColor") as HTMLInputElement).value = pair.female;
      syncAppearanceFromDom();
      render();
    });
  }
  recompute();
  renderCharts();
  if (opts?.fly !== false) focusCountryOnMap(name);
}

function sourceLabel(id?: string, fallback?: string) {
  if (id && t(`sources.${id}`) !== `sources.${id}`) return t(`sources.${id}`);
  return fallback || id || "";
}

function renderSourceCard(c: CountryRecord) {
  const gap =
    c.latest.fertilityGap != null
      ? t("source.gap", { n: c.latest.fertilityGap.toFixed(2) })
      : t("source.noIdeal");
  $("sourceCard").textContent = [
    displayName(c),
    t("source.ageSex", { year: c.base.year, src: sourceLabel(c.base.source.id, c.base.source.label) }),
    t("source.tfr", { n: c.latest.tfr.toFixed(2), year: c.latest.tfrYear, src: sourceLabel(c.latest.tfrSource.id, c.latest.tfrSource.label) }),
    c.latest.tmr != null ? t("source.tmr", { n: c.latest.tmr.toFixed(3), year: c.latest.tmrYear ?? c.latest.tfrYear }) : "",
    c.latest.cpm != null ? t("source.cpm", { n: c.latest.cpm.toFixed(2), year: c.latest.cpmYear ?? c.latest.tfrYear }) : "",
    c.latest.idealTfr != null
      ? t("source.ideals", {
          n: c.latest.idealTfr.toFixed(2),
          year: c.latest.idealTfrYear ?? "",
          src: sourceLabel(c.latest.idealTfrSource?.id, c.latest.idealTfrSource?.label || ""),
        })
      : t("source.idealsMissing"),
    t("source.e0", { n: c.latest.e0.toFixed(1), year: c.latest.e0Year }),
    t("source.mig", { n: formatPop(c.latest.netMigration), year: c.latest.netMigrationYear }),
    gap,
    t("source.simStart", { year: freshYear(c), base: c.base.year }),
  ].filter(Boolean).join("\n");
}

function simParams() {
  return {
    tfr: Number(($("tfrInput") as HTMLInputElement).value),
    lifeExpectancy: Number(($("leInput") as HTMLInputElement).value),
    migration: Number(($("migInput") as HTMLInputElement).value),
    sexRatioBirth: Number(($("srbInput") as HTMLInputElement).value),
    useCountryTfr: ($("useCountryTfr") as HTMLInputElement).checked,
    useCountryLe: ($("useCountryLe") as HTMLInputElement).checked,
    useUnE0ByYear: ($("useUnE0ByYear") as HTMLInputElement)?.checked !== false,
    useCountryMig: ($("useCountryMig") as HTMLInputElement).checked,
    useWppMediumRates: ($("useWppMediumRates") as HTMLInputElement)?.checked || getState().scenario.useWppMediumRates,
    applyTfr: ($("applyTfr") as HTMLInputElement)?.checked !== false,
    applyLe: ($("applyLe") as HTMLInputElement)?.checked !== false,
    applyMig: !!($("applyMig") as HTMLInputElement)?.checked,
    applySrb: ($("applySrb") as HTMLInputElement)?.checked !== false,
  };
}

function syncHeaderYears() {
  const start = $("startYear") as HTMLInputElement;
  const end = $("endYear") as HTMLInputElement;
  const hs = $("headerStartYear") as HTMLInputElement | null;
  const he = $("headerEndYear") as HTMLInputElement | null;
  if (hs && document.activeElement !== hs) {
    hs.value = start.value;
    hs.min = String(pyramidMinYear);
  }
  if (he && document.activeElement !== he) he.value = end.value;
}

function yearRange() {
  const el = $("startYear") as HTMLInputElement;
  let startYear = Number(el.value) || pyramidMinYear;
  if (startYear < pyramidMinYear) {
    startYear = pyramidMinYear;
    if (document.activeElement !== el) el.value = String(startYear);
  }
  let endYear = Number(($("endYear") as HTMLInputElement).value) || startYear + 100;
  if (endYear < startYear) endYear = startYear;
  if (endYear - startYear > 200) endYear = startYear + 200;
  if (Number(el.value) !== startYear && document.activeElement !== el) el.value = String(startYear);
  const endEl = $("endYear") as HTMLInputElement;
  if (Number(endEl.value) !== endYear && document.activeElement !== endEl) endEl.value = String(endYear);
  syncHeaderYears();
  return { startYear, endYear };
}

function mapNames() {
  if (getState().view === "usa") return Object.keys(usaStates);
  const set = ($("mapCountrySet") as HTMLSelectElement).value;
  return Object.keys(countries).filter((n) => {
    if (!countries[n]?.base?.male) return false;
    if (set === "tfr2026") return countries[n].latest.tfrSource.id === "birthgauge2026";
    return true;
  });
}

function recompute() {
  seriesAheadCache = null;
  const view = getState().view;
  const { startYear, endYear } = yearRange();
  updateTime({ startYear, endYear });
  applyFitSpeed();
  if (view === "help" || view === "database") {
    if (view === "database") renderDatabase();
    return;
  }
  if (isMapish(view)) {
    const t0 = performance.now();
    worldByCountry = projectAllCountries(
      catalog(),
      mapNames(),
      { ...simParams(), idealMode: getState().map.idealMode },
      startYear,
      endYear
    );
    frameIndex = Math.min(frameIndex, endYear - startYear);
    ($("yearScrub") as HTMLInputElement).min = String(startYear);
    ($("yearScrub") as HTMLInputElement).max = String(endYear);
    $("mapStatus").textContent = t(view === "usa" ? "map.readyUsa" : "map.ready", {
      n: mapNames().length,
      ms: (performance.now() - t0).toFixed(0),
    });
    $("mapDataHint").textContent = t(view === "usa" ? "map.hintUsa" : "map.hint", { n: mapNames().length });
    rebuildPeakScales();
    if (view !== "triangle") {
      frames = [];
      render();
      return;
    }
  }
  const c = recOf(getState().country);
  if (!c) return;
  const params = paramsForCountry(c, simParams());
  frames = projectSeries(c.base, params, startYear, endYear);
  frameIndex = Math.min(frameIndex, frames.length - 1);
  const peaks = trianglePeakScales(frames, 0, frames.length - 1);
  scaleMax = peaks.pop;
  deathScale = peaks.death;
  birthScale = peaks.birth;
  ($("yearScrub") as HTMLInputElement).min = String(frames[0].year);
  ($("yearScrub") as HTMLInputElement).max = String(frames[frames.length - 1].year);
  render();
}

function peakBarInSeries(series: PyramidFrame[], i0: number, i1: number) {
  let m = 1;
  const a = Math.max(0, i0);
  const b = Math.min(series.length - 1, i1);
  for (let i = a; i <= b; i++) {
    const f = series[i];
    if (f) m = Math.max(m, maxBar(f));
  }
  return m * 1.08;
}

/** Frames from `fromYear` through `fromYear + span`, extending the world series if needed. */
function seriesAhead(name: string, fromYear: number, span: number): PyramidFrame[] {
  const c = recOf(name);
  if (!c) return [];
  const spanYears = Math.max(1, Math.round(span));
  const wantEnd = fromYear + spanYears;
  const key = `${name}:${fromYear}:${spanYears}:${wantEnd}`;
  if (seriesAheadCache?.key === key) return seriesAheadCache.frames;
  const run = worldByCountry?.[name];
  const series = run?.series || [];
  const startY = series[0]?.year ?? simStartYear();
  const startIdx = Math.max(0, fromYear - startY);
  let out: PyramidFrame[] = [];
  if (series.length && startIdx < series.length) {
    const endIdx = Math.min(series.length - 1, startIdx + spanYears);
    out = series.slice(startIdx, endIdx + 1);
  }
  const last = out[out.length - 1];
  if (last && last.year < wantEnd) {
    const extra = projectSeries(
      { male: last.male, female: last.female },
      paramsForCountry(c, simParams()),
      last.year,
      wantEnd
    );
    out = out.concat(extra.slice(1));
  } else if (!out.length && c.base?.male) {
    out = projectSeries(c.base, paramsForCountry(c, simParams()), fromYear, wantEnd);
  }
  seriesAheadCache = { key, frames: out };
  return out;
}

function peakRebinned(
  series: PyramidFrame[],
  pick: (f: PyramidFrame) => { male?: number[]; female?: number[] },
  bands: number,
  i0: number,
  i1: number
) {
  let m = 1;
  const a = Math.max(0, i0);
  const b = Math.min(series.length - 1, i1);
  const n = clampBands(bands);
  for (let i = a; i <= b; i++) {
    const f = series[i];
    if (!f) continue;
    const src = pick(f);
    const r = rebinAgeGroups(src.male || [], src.female || [], n);
    for (let k = 0; k < r.male.length; k++) m = Math.max(m, r.male[k] || 0, r.female[k] || 0);
  }
  return Math.max(1, m) * 1.08;
}

function trianglePeakScales(series: PyramidFrame[], i0: number, i1: number) {
  const app = getState().appearance;
  return {
    pop: peakRebinned(series, (f) => f, app.trianglePopBands, i0, i1),
    death: peakRebinned(
      series,
      (f) => ({ male: f.deathsMale || [], female: f.deathsFemale || [] }),
      app.triangleMortBands,
      i0,
      i1
    ),
    birth: peakRebinned(
      series,
      (f) => ({ male: f.birthsByMotherMale || [], female: f.birthsByMotherFemale || [] }),
      app.triangleFertBands,
      i0,
      i1
    ),
  };
}

function rebuildPeakScales() {
  peakScaleByCountry = {};
  if (!worldByCountry) return;
  for (const [name, run] of Object.entries(worldByCountry)) {
    peakScaleByCountry[name] = peakBarInSeries(run.series, 0, run.series.length - 1);
  }
}

function calendarYear() {
  const { startYear, endYear } = yearRange();
  const y = getState().time.currentYear;
  return Math.max(startYear, Math.min(endYear, Number.isFinite(y) ? y : startYear));
}

function simFrameFor(year: number): PyramidFrame | null {
  if (!frames.length) return null;
  const idx = year - simStartYear();
  const src = frames[Math.max(0, Math.min(frames.length - 1, idx))];
  if (!src) return null;
  return src.year === year ? src : { ...src, year };
}

function pyramidOpts(frame: PyramidFrame) {
  const s = getState();
  const c = recOf(s.country);
  return {
    countryName: c ? displayName(c) : s.country,
    maleColor: s.appearance.maleColor,
    femaleColor: s.appearance.femaleColor,
    bgColor: s.appearance.bgColor,
    textColor: s.appearance.textColor,
    showFlag: s.appearance.showFlag,
    flagWindow: s.appearance.flagWindow,
    overlay: getState().view === "triangle",
    showCounts: s.appearance.showCounts,
    showAgeLabels: s.appearance.showAgeLabels,
    showGrid: s.appearance.showGrid,
    showPercent: s.appearance.showPercent,
    showLegend: s.appearance.showLegend,
    tfr: s.scenario.tfr,
    scaleMax,
    flagImage,
    flagEmoji: getFlagEmoji(s.country, c?.iso2),
    bands: s.appearance.pyramidBands,
    outline: s.appearance.labelOutline,
    outlineColor: s.appearance.labelOutlineColor,
    outlineWidth: s.appearance.labelOutlineWidth,
    triangleTextColor: s.appearance.triangleTextColor,
    popBands: s.appearance.trianglePopBands,
    mortBands: s.appearance.triangleMortBands,
    fertBands: s.appearance.triangleFertBands,
  };
}

function fitCanvas(canvas: HTMLCanvasElement) {
  const wrap = canvas.parentElement;
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  canvas.style.width = Math.min(rect.width - 8, 1400) + "px";
  canvas.style.height = Math.min(rect.height - 8, 1000) + "px";
}

function render() {
  const view = getState().view;
  if (view === "database" || view === "help") return;
  const year = calendarYear();
  frameIndex = year - simStartYear();
  updateTime({ currentYear: year });
  syncYearChrome(year);
  if (isMapish(view)) {
    renderMap();
    if (view === "triangle") {
      if (playing || yearHold) {
        stopTriangleAnim();
        renderTriangleOverlay();
      } else {
        startTriangleAnim();
      }
    } else {
      stopTriangleAnim();
      if (hoverMiniVisible()) drawHoverMiniFrame();
    }
    renderCharts();
    return;
  }
  const frame = simFrameFor(year);
  if (!frame) return;
  fitCanvas($("pyramidCanvas") as HTMLCanvasElement);
  drawPyramid($("pyramidCanvas") as HTMLCanvasElement, frame, pyramidOpts(frame));
  updateStats(frame);
  renderCharts();
}

function renderTriangleOverlay() {
  const year = calendarYear();
  const frame = simFrameFor(year);
  if (!frame) return;
  const canvas = $("triangleCanvas") as HTMLCanvasElement;
  const wrap = $("mapWrap");
  const rect = wrap.getBoundingClientRect();
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  const c = recOf(getState().country);
  const series = frames.length ? frames : worldByCountry?.[getState().country]?.series || [frame];
  const peaks = trianglePeakScales(series, 0, series.length - 1);
  scaleMax = peaks.pop;
  deathScale = peaks.death;
  birthScale = peaks.birth;
  drawTriangle(canvas, frame, {
    ...pyramidOpts(frame),
    countryName: c ? displayName(c) : getState().country,
    popScale: peaks.pop,
    deathScale: peaks.death,
    birthScale: peaks.birth,
    overlay: true,
  });
  updateStats(frame);
  fillHubCard(getState().country);
}

function updateStats(frame: PyramidFrame) {
  const m = frame.male.reduce((a, b) => a + b, 0);
  const f = frame.female.reduce((a, b) => a + b, 0);
  const statYear = document.getElementById("statYear");
  if (statYear) statYear.textContent = String(frame.year);
  $("statTotal").textContent = formatNumber(m + f);
  $("statMale").textContent = formatNumber(m);
  $("statFemale").textContent = formatNumber(f);
  $("statMedian").textContent = medianAge(frame.male, frame.female).toFixed(1);
  $("statYouth").textContent = ageShare(frame.male, frame.female, 0, 2).toFixed(1) + "%";
  $("statElderly").textContent = ageShare(frame.male, frame.female, 13, 20).toFixed(1) + "%";
  $("statTfr").textContent = Number(($("tfrInput") as HTMLInputElement).value).toFixed(2);
}

async function renderMap() {
  if (!worldByCountry) return;
  const year = calendarYear();
  syncYearChrome(year);
  const start = simStartYear();
  const snapshot =
    year >= start
      ? snapshotYear(worldByCountry, year - start)
      : snapshotFromSeries(catalog(), year);
  const regionSnap = aggregateRegions(snapshot);
  const pop = snapshot.worldPop;
  const focused = snapshot.countries[getState().country];
  $("statTotal").textContent = formatNumber(pop);
  const statYear = document.getElementById("statYear");
  if (statYear) statYear.textContent = String(year);
  if (focused) {
    $("statMale").textContent = formatNumber(focused.male);
    $("statFemale").textContent = formatNumber(focused.female);
    $("statMedian").textContent = Number(focused.medianAge).toFixed(1);
    $("statYouth").textContent = Number(focused.youthPct).toFixed(1) + "%";
    $("statElderly").textContent = Number(focused.elderlyPct).toFixed(1) + "%";
    $("statTfr").textContent = Number(focused.tfr).toFixed(2);
  }
  $("mapSubtitle").textContent = t(getState().view === "usa" ? "map.subtitleUsa" : "map.subtitle", {
    year,
    pop: formatPop(pop),
  });

  while (mapRenderPending) await new Promise((r) => setTimeout(r, 16));
  mapRenderPending = true;
  try {
    const wrap = $("worldMapSvg").parentElement!;
    const rect = wrap.getBoundingClientRect();
    lastMapBox = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    const W = Math.max(120, Math.floor(rect.width));
    const H = Math.max(120, Math.floor(rect.height));
    focusSerbiaIfPristine(W, H);
    const iso: Record<string, string | null> = {};
    for (const n of getState().map.pins) iso[n] = recOf(n)?.iso2 || null;
    const mapOpts: MapRenderOpts = {
      mode: getState().view === "regions" ? "regions" : "countries",
      atlas: getState().view === "usa" ? "usa" : "world",
      snapshot,
      regionSnapshot: regionSnap,
      state: getState(),
      width: W,
      height: H,
      selectedIso2ByName: iso,
      onHover: (rec, event, meta) => {
        if (getState().view === "triangle") return;
        const stack = $("mapHoverStack");
        const card = $("mapHoverCard");
        stack.hidden = false;
        const metricId = getState().map.metric;
        card.innerHTML = hoverHtml(rec, { ...meta, metricId });
        const strip = $("mapHoverMetric");
        const metric = rec ? formatHeatmapMetric(rec, metricId) : null;
        const hv = getState().hover;
        const size = Math.max(200, hv.size || 480);
        const box = isMobile() ? Math.min(200, Math.max(160, rect.width - 24)) : size;
        const pyrH = Math.round(box * (2 / 3));
        const showMini = !!(getState().map.hoverMini && rec && meta.kind === "country" && rec.name);
        if (strip) {
          strip.hidden = !showMini || !metric;
          strip.innerHTML = metric ? `<span>${metric.label}</span><strong>${metric.text}</strong>` : "";
        }
        stack.classList.toggle("has-pyramid", showMini);
        stack.style.width = showMini ? box + "px" : "";
        const op = isMobile() ? Math.min(0.72, (hv.opacity ?? 92) / 100) : Math.max(0.2, Math.min(1, (hv.opacity ?? 92) / 100));
        stack.style.opacity = String(op);
        if (showMini) startHoverMini(rec.name);
        else {
          ($("hoverMiniCanvas") as HTMLCanvasElement).style.display = "none";
          hoverActiveName = "";
        }
        const sw = stack.offsetWidth || box;
        const sh = stack.offsetHeight || (showMini ? pyrH : 160);
        const x = Math.min(event.offsetX + 14, rect.width - sw - 12);
        const y = Math.min(event.offsetY + 14, rect.height - sh - 12);
        stack.style.left = Math.max(8, x) + "px";
        stack.style.top = Math.max(8, y) + "px";
      },
      onLeave: () => {
        if (getState().view === "triangle") return;
        if (isCoarsePointer() || isMobile()) return;
        $("mapHoverStack").hidden = true;
        stopHoverMini();
      },
      onZoom: (k, pan) => {
        updateMap(pan ? { zoom: k, pan } : { zoom: k });
        renderMap();
      },
      onRotate: (rot) => {
        updateMap({ rotation: rot });
      },
      onPan: (pan) => {
        updateMap({ pan });
      },
      onGestureEnd: () => {
        renderMap();
      },
      onHubCountry: (name) => {
        if (getState().view !== "triangle" || !name) return;
        adoptHubCountry(name);
      },
      onClick: (name) => {
        const pins = new Set(getState().map.pins);
        if (pins.has(name)) pins.delete(name);
        else pins.add(name);
        updateMap({ pins: [...pins] });
        setState({ country: name });
        syncCountryCombos(name);
        syncCountryDataLabel(name);
        if (getState().map.hoverMini && (isMobile() || isCoarsePointer()) && getState().view !== "triangle") {
          $("mapHoverStack").hidden = false;
          $("mapHoverStack").classList.add("has-pyramid");
          startHoverMini(name);
        }
        render();
        renderCharts();
      },
      onDblClick: (name) => {
        setView("pyramid");
        loadCountry(name);
      },
      onPinDrag: (name, offset) => {
        updateMap({ pinOffsets: { ...getState().map.pinOffsets, [name]: offset } });
      },
    };
    const surface = getState().view === "usa" ? "map" : getState().map.surface || "map";
    const zoom = getState().map.zoom || 1;
    const pinKey = [...getState().map.pins].sort().join(",");
    const atlas = getState().view === "usa" ? "usa" : "world";
    if (liveMapCanRecolor(W, H, surface, zoom, mapOpts.mode, pinKey, atlas) && recolorLiveMap(mapOpts)) {
      /* keep hover outlines */
    } else {
      await renderWorldMap($("worldMapSvg") as unknown as SVGSVGElement, mapOpts);
    }
  } finally {
    mapRenderPending = false;
    tryFlyToPending();
  }
}

let hoverFlag: HTMLImageElement | null = null;
let hoverFlagFor = "";

function hoverMiniVisible() {
  const stack = $("mapHoverStack");
  return !!(stack && !stack.hidden && hoverActiveName);
}

function hoverSeriesFor(name: string): PyramidFrame[] {
  const series = worldByCountry?.[name]?.series;
  if (series?.length) return series;
  const { startYear, endYear } = yearRange();
  return seriesAhead(name, startYear, Math.max(1, endYear - startYear));
}

function drawHoverMiniFrame() {
  const name = hoverActiveName;
  const c = recOf(name);
  if (!c) return;
  const series = hoverSeriesFor(name);
  if (!series.length) return;
  hoverFrames = series;
  const year = calendarYear();
  hoverIdx = Math.max(0, Math.min(series.length - 1, year - (series[0]?.year ?? simStartYear())));
  const fr = series[hoverIdx];
  if (!fr) return;
  hoverDrawnName = name;
  hoverDrawnYear = year;
  const canvas = $("hoverMiniCanvas") as HTMLCanvasElement;
  const app = getState().appearance;
  const hv = getState().hover;
  drawPyramid(canvas, fr, {
    countryName: displayName(c),
    maleColor: app.maleColor,
    femaleColor: app.femaleColor,
    bgColor: app.bgColor,
    textColor: app.textColor,
    showCounts: hv.showCounts,
    showGrid: false,
    showLegend: false,
    showAgeLabels: hv.showAgeLabels,
    showFlag: true,
    flagWindow: hv.flagWindow,
    flagImage: hoverFlag,
    scaleMax: peakScaleByCountry[name] || peakBarInSeries(series, 0, series.length - 1),
    flagEmoji: getFlagEmoji(name, c.iso2),
    tfr: c.latest.tfr,
    bands: hv.bands,
    titleSize: hv.titleSize,
    ageSize: hv.ageSize,
    outline: app.labelOutline,
    outlineColor: app.labelOutlineColor,
    outlineWidth: Math.max(1, app.labelOutlineWidth * 0.7),
  });
}

function startHoverMini(name: string) {
  const c = recOf(name);
  if (!c) return;
  const h = getState().hover;
  const canvas = $("hoverMiniCanvas") as HTMLCanvasElement;
  const size = Math.max(200, h.size || 480);
  const box = isMobile() ? Math.min(200, Math.max(160, window.innerWidth - 24)) : size;
  hoverActiveName = name;
  hoverFrames = hoverSeriesFor(name);
  if (!hoverFrames.length) return;
  canvas.style.display = "block";
  canvas.style.width = box + "px";
  canvas.style.height = Math.round(box * (2 / 3)) + "px";
  if (hoverFlagFor !== name) {
    hoverFlag = name === getState().country ? flagImage : null;
    hoverFlagFor = name;
    loadFlagImage(name, c.iso2).then((img) => {
      if (hoverFlagFor !== name) return;
      hoverFlag = img;
      if (hoverMiniVisible()) drawHoverMiniFrame();
    });
  } else if (hoverDrawnName === name && hoverDrawnYear === calendarYear()) {
    return;
  }
  drawHoverMiniFrame();
}

let chartTimer = 0;
function adoptHubCountry(name: string) {
  if (!name) return;
  const c = recOf(name);
  if (!c) return;
  fillHubCard(name);
  if (name === getState().country) return;
  const run = worldByCountry?.[name];
  if (!run) return;
  setState({ country: name });
  frames = run.series;
  frameIndex = Math.min(frameIndex, frames.length - 1);
  const peaks = trianglePeakScales(frames, 0, frames.length - 1);
  scaleMax = peaks.pop;
  deathScale = peaks.death;
  birthScale = peaks.birth;
  syncCountryCombos(name);
  syncCountryDataLabel(name);
  syncSlidersFromCountry(c);
  renderSourceCard(c);
  flagImage = null;
  loadFlagImage(name, c.iso2).then((img) => {
    if (getState().country !== name) return;
    flagImage = img;
    if (getState().view === "triangle" && playing) renderTriangleOverlay();
  });
  if (getState().view === "triangle" && !playing) startTriangleAnim();
  else if (getState().view === "triangle") renderTriangleOverlay();
  if (frames[Math.max(0, frameIndex)]) updateStats(frames[Math.max(0, frameIndex)]);
  window.clearTimeout(chartTimer);
  chartTimer = window.setTimeout(() => renderCharts(), 80);
}

function syncSlidersFromCountry(c: CountryRecord) {
  const tfr = c.latest.tfr;
  ($("tfrRange") as HTMLInputElement).value = String(tfr);
  ($("tfrInput") as HTMLInputElement).value = String(tfr);
  ($("leRange") as HTMLInputElement).value = String(c.latest.e0);
  ($("leInput") as HTMLInputElement).value = String(c.latest.e0);
  ($("migRange") as HTMLInputElement).value = String(Math.max(-200000, Math.min(200000, c.latest.netMigration || 0)));
  ($("migInput") as HTMLInputElement).value = String(c.latest.netMigration || 0);
  ($("srbRange") as HTMLInputElement).value = String(c.latest.srb || 1.05);
  ($("srbInput") as HTMLInputElement).value = String(c.latest.srb || 1.05);
  updateScenario({
    tfr,
    lifeExpectancy: c.latest.e0,
    migration: c.latest.netMigration || 0,
    sexRatioBirth: c.latest.srb || 1.05,
  });
}

function syncHubCardChrome() {
  const triangle = getState().view === "triangle";
  const open = triangle && getState().map.hubCard;
  const card = document.getElementById("hubCard");
  const show = document.getElementById("hubCardShow");
  if (card) card.hidden = !open;
  if (show) show.hidden = !triangle || getState().map.hubCard;
}

function fillHubCard(name: string | null) {
  syncHubCardChrome();
  if (getState().view !== "triangle" || !getState().map.hubCard || !name) return;
  const body = document.getElementById("hubCardBody");
  const title = document.getElementById("hubCardTitle");
  const c = recOf(name);
  const year = calendarYear();
  const start = simStartYear();
  const rec =
    year >= start && worldByCountry
      ? snapshotYear(worldByCountry, Math.max(0, year - start)).countries[name]
      : snapshotFromSeries(catalog(), year).countries[name];
  if (title) title.textContent = c ? displayName(c) : name;
  if (body) {
    body.innerHTML = hoverHtml(rec || c, {
      kind: "country",
      countryName: name,
      iso2: c?.iso2,
      metricId: getState().map.metric,
    });
  }
}

let triAnimTimer = 0;
let triAnimRaf = 0;
let triAnimGen = 0;
let triAnimIdx = 0;
let triAnimFrames: PyramidFrame[] = [];
let triAnimKey = "";

function stopTriangleAnim() {
  clearTimeout(triAnimTimer);
  cancelAnimationFrame(triAnimRaf);
  triAnimTimer = 0;
  triAnimRaf = 0;
  triAnimGen++;
  triAnimKey = "";
}

function startTriangleAnim() {
  if (getState().view !== "triangle") {
    stopTriangleAnim();
    return;
  }
  if (playing || !getState().map.triangleAnimate) {
    stopTriangleAnim();
    renderTriangleOverlay();
    return;
  }
  const name = getState().country;
  const c = recOf(name);
  if (!c) {
    renderTriangleOverlay();
    return;
  }
  const span = Math.max(5, getState().map.hoverSpanYears || 100);
  const fromYear = calendarYear();
  const app = getState().appearance;
  const key = `${name}:${fromYear}:${span}:${app.trianglePopBands}:${app.triangleMortBands}:${app.triangleFertBands}`;
  if (key === triAnimKey && (triAnimTimer || triAnimRaf)) return;
  stopTriangleAnim();
  triAnimKey = key;
  const gen = triAnimGen;
  triAnimFrames = seriesAhead(name, fromYear, span);
  if (!triAnimFrames.length) {
    renderTriangleOverlay();
    return;
  }
  triAnimIdx = 0;
  const speed = getState().time.yearsPerSecond || 15;
  const delay = Math.max(20, 1000 / Math.max(0.25, speed));
  const canvas = $("triangleCanvas") as HTMLCanvasElement;
  const wrap = $("mapWrap");
  const rect = wrap.getBoundingClientRect();
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  const peaks = trianglePeakScales(triAnimFrames, 0, triAnimFrames.length - 1);
  scaleMax = peaks.pop;
  deathScale = peaks.death;
  birthScale = peaks.birth;
  const tick = () => {
    if (gen !== triAnimGen) return;
    if (getState().view !== "triangle" || playing || !triAnimFrames.length) return;
    const fr = triAnimFrames[triAnimIdx % triAnimFrames.length];
    drawTriangle(canvas, fr, {
      ...pyramidOpts(fr),
      countryName: displayName(c),
      popScale: peaks.pop,
      deathScale: peaks.death,
      birthScale: peaks.birth,
      overlay: true,
    });
    triAnimIdx++;
    if (gen !== triAnimGen) return;
    triAnimTimer = window.setTimeout(() => {
      if (gen !== triAnimGen) return;
      triAnimRaf = requestAnimationFrame(tick);
    }, delay) as unknown as number;
  };
  tick();
}

function stopHoverMini() {
  hoverActiveName = "";
  hoverFrames = [];
  hoverDrawnName = "";
  hoverDrawnYear = NaN;
  ($("hoverMiniCanvas") as HTMLCanvasElement).style.display = "none";
  $("mapHoverStack")?.classList.remove("has-pyramid");
}

function syncPlayButtons() {
  const play = $("btnPlay") as HTMLButtonElement | null;
  const pause = $("btnPause") as HTMLButtonElement | null;
  if (play) play.disabled = playing;
  if (pause) pause.disabled = !playing;
  const header = $("btnHeaderPlay") as HTMLButtonElement | null;
  if (!header) return;
  header.textContent = playing ? t("sim.stop") : t("sim.play");
  header.classList.toggle("playing", playing);
  header.setAttribute("aria-pressed", playing ? "true" : "false");
  header.setAttribute("data-tip", playing ? t("sim.stopTip") : t("sim.playTip"));
}

function togglePlayback() {
  if (playing) stopPlayback();
  else startPlayback();
}

function applyAppI18n() {
  applyDomI18n();
  const def = localeDef();
  const flag = $("langFlag");
  const code = $("langCode");
  if (flag) flag.textContent = def.flag;
  if (code) code.textContent = def.short;
  $("helpBody").innerHTML = getHelpHtml(getLocale());
  const metricVal = ($("mapMetric") as HTMLSelectElement | null)?.value ?? "";
  const pivotVal = ($("pivotMetric") as HTMLSelectElement | null)?.value;
  fillMetricSelects();
  ($("mapMetric") as HTMLSelectElement).value = metricVal;
  if (pivotVal != null) ($("pivotMetric") as HTMLSelectElement).value = pivotVal;
  fillTagFields();
  fillChartSeries();
  countrySearches.forEach((api) => {
    const v = api.getValue();
    if (v) api.setValue(v);
  });
  if (metricSearch) {
    const v = metricSearch.getValue();
    metricSearch.setValue(v || NONE_METRIC_ID);
  }
  syncHeatmapChrome();
  syncPlayButtons();
  syncNavSheet();
  const c = recOf(getState().country);
  if (c) renderSourceCard(c);
  syncCountryDataLabel();
  syncViewCopy();
  lastChartSig = "";
  if (getState().view === "database") renderDatabase();
  render();
}

function bindLangSwitch() {
  const btn = $("btnLang");
  const menu = $("langMenu");
  if (!btn || !menu) return;
  const renderMenu = () => {
    menu.innerHTML = LOCALES.map((loc) => {
      const on = loc.id === getLocale() ? " active" : "";
      return `<li><button type="button" class="${on}" role="option" data-locale="${loc.id}" aria-selected="${loc.id === getLocale()}">${loc.flag} ${loc.nativeName}</button></li>`;
    }).join("");
  };
  renderMenu();
  const close = () => {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) renderMenu();
  });
  menu.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button[data-locale]") as HTMLButtonElement | null;
    if (!b) return;
    const id = b.dataset.locale;
    if (!isLocaleId(id) || id === getLocale()) {
      close();
      return;
    }
    setLocale(id as LocaleId);
    setState({ locale: id as LocaleId });
    close();
    applyAppI18n();
  });
  document.addEventListener("click", () => close());
}

function startPlayback() {
  if (playing) return;
  const view = getState().view;
  if (!viewPlaysSimulation(view)) return;
  yearHold = false;
  stopTriangleAnim();
  const { endYear } = yearRange();
  if (calendarYear() >= endYear) {
    setYear(simStartYear());
  }
  playing = true;
  syncPlayButtons();
  lastTick = 0;
  yearAccumulator = 0;
  rafId = requestAnimationFrame(tick);
  if (hoverMiniVisible()) drawHoverMiniFrame();
}

function stopPlayback() {
  playing = false;
  syncPlayButtons();
  cancelAnimationFrame(rafId);
  if (hoverMiniVisible()) drawHoverMiniFrame();
}

function bindPlaybackKeys() {
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.key !== " ") return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (t && t.closest("button, [role='button']")) return;
    const view = getState().view;
    if (view === "help" || view === "database") return;
    e.preventDefault();
    togglePlayback();
  });
}

function tick(ts: number) {
  if (!playing) return;
  if (!lastTick) lastTick = ts;
  const dt = (ts - lastTick) / 1000;
  lastTick = ts;
  yearAccumulator += dt * getState().time.yearsPerSecond;
  const steps = Math.floor(yearAccumulator);
  if (steps >= 1) {
    yearAccumulator -= steps;
    const { startYear, endYear } = yearRange();
    let y = calendarYear() + steps;
    const span = Math.max(1, endYear - startYear);
    if (y > endYear) y = startYear + ((y - startYear) % (span + 1));
    if (y > endYear) y = startYear;
    frameIndex = y - startYear;
    updateTime({ currentYear: y });
    render();
  }
  rafId = requestAnimationFrame(tick);
}

let lastChartSig = "";

function chartSignature() {
  const s = getState();
  const host = document.getElementById("chartStack");
  return JSON.stringify({
    country: s.country,
    w: host?.clientWidth || 0,
    bg: s.charts.bg,
    text: s.charts.text,
    showWpp: s.charts.showWpp,
    wppColor: s.charts.wppColor,
    series: s.charts.series,
    locale: s.locale,
  });
}

function chartsPanelOpen() {
  return isMobile() ? mobileRight : getState().layout.rightOpen;
}

function renderCharts() {
  if (!chartsPanelOpen()) return;
  const c = recOf(getState().country);
  const host = $("chartStack");
  if (!c) {
    host.innerHTML = `<p class="hint">${t("charts.empty")}</p>`;
    lastChartSig = "";
    return;
  }
  const year = getState().time.currentYear;
  const sig = chartSignature();
  if (sig === lastChartSig && host.querySelector(".chart-year-mark")) {
    host.querySelectorAll(".chart-card").forEach((card) => updateSvgChartMarker(card as HTMLElement, year));
    return;
  }
  lastChartSig = sig;
  const cfg = getState().charts;
  const wpp = c.wppMedium;
  const pointsFor: Record<string, typeof c.series.tfr> = {
    tfr: c.series.tfr,
    pop: c.series.population,
    e0: c.series.e0,
    mig: c.series.netMigration,
    ideal: c.series.idealTfr,
    births: c.series.births || [],
    inflow: c.series.inflow || [],
  };
  const wppFor: Record<string, typeof c.series.tfr> = {
    tfr: wpp?.tfr || [],
    pop: wpp?.population || [],
    e0: wpp?.e0 || [],
    mig: wpp?.netMigration || [],
    births: wpp?.births || [],
    ideal: [],
    inflow: [],
  };
  host.innerHTML = "";
  for (const spec of chartSpecs()) {
    const seriesOpt = cfg.series[spec.id] || { on: true, color: "#38bdf8" };
    if (!seriesOpt.on) continue;
    const card = document.createElement("div");
    card.className = "chart-card";
    host.appendChild(card);
    const overlayPts = cfg.showWpp ? wppFor[spec.id] || [] : [];
    drawSvgLineChart(
      card,
      {
        id: spec.id,
        title: spec.title,
        unit: spec.unit,
        points: pointsFor[spec.id] || [],
        color: seriesOpt.color,
      },
      {
        bg: cfg.bg,
        text: cfg.text,
        markerYear: year,
        overlay: overlayPts.length
          ? { id: spec.id + "-wpp", title: spec.title, unit: spec.unit, points: overlayPts, color: cfg.wppColor }
          : null,
      }
    );
  }
  if (!host.childElementCount) {
    host.innerHTML = `<p class="hint">${t("charts.hidden")}</p>`;
  }
}

function renderDatabase() {
  const q = ($("dbSearch") as HTMLInputElement).value.trim().toLowerCase();
  const rows = Object.values(countries)
    .filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.iso3.toLowerCase().includes(q) ||
        countryName(c.name).toLowerCase().includes(q)
    )
    .sort((a, b) => countryName(a.name).localeCompare(countryName(b.name), localeDef().bcp47));
  const table = $("dbTable") as HTMLTableElement;
  table.innerHTML = `<thead><tr><th>${t("db.colCountry")}</th><th>${t("db.colTfr")}</th><th>${t("db.colTfrYear")}</th><th>${t("db.colE0")}</th><th>${t("db.colMig")}</th><th>${t("db.colIdeal")}</th><th>${t("db.colIdealYear")}</th></tr></thead><tbody></tbody>`;
  const body = table.tBodies[0];
  for (const c of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${displayName(c)}</td>
      <td><input data-k="${c.name}" data-f="tfr" type="number" step="0.01" value="${c.latest.tfr}"/></td>
      <td><input data-k="${c.name}" data-f="tfrYear" type="number" value="${c.latest.tfrYear}"/></td>
      <td><input data-k="${c.name}" data-f="e0" type="number" step="0.1" value="${c.latest.e0}"/></td>
      <td><input data-k="${c.name}" data-f="netMigration" type="number" value="${c.latest.netMigration}"/></td>
      <td><input data-k="${c.name}" data-f="idealTfr" type="number" step="0.01" value="${c.latest.idealTfr ?? ""}"/></td>
      <td><input data-k="${c.name}" data-f="idealTfrYear" type="number" value="${c.latest.idealTfrYear ?? ""}"/></td>`;
    body.appendChild(tr);
  }
  table.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("change", () => {
      const name = (inp as HTMLInputElement).dataset.k!;
      const f = (inp as HTMLInputElement).dataset.f!;
      const raw = (inp as HTMLInputElement).value;
      const rec = countries[name];
      if (!rec) return;
      const n = raw === "" ? null : Number(raw);
      const latest: any = { ...rec.latest };
      latest[f] = n;
      if (latest.tfr != null && latest.idealTfr != null) latest.fertilityGap = latest.tfr - latest.idealTfr;
      countries[name] = { ...rec, latest };
      const ov = loadOverrides();
      ov[rec.iso3] = { iso3: rec.iso3, latest };
      saveOverrides(ov);
    });
  });
}

async function runExport() {
  stopPlayback();
  const status = $("exportStatus");
  status.hidden = false;
  status.className = "export-status recording";
  const s = getState();
  const { width, height } = exportSize(s.exportOpts);
  const speed = s.exportOpts.fitToLength
    ? Math.max(0.1, (s.time.endYear - s.time.startYear) / Math.max(1, s.exportOpts.durationSec))
    : s.time.yearsPerSecond;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const view: string = s.view;
  const count =
    isMapish(view as ViewMode)
      ? worldByCountry
        ? Object.values(worldByCountry)[0].series.length
        : frames.length
      : frames.length;
  const layout = s.exportOpts.layout;
  try {
    const { blob, ext } = await exportPaintedVideo({
      canvas,
      frameCount: count,
      yearForIndex: (i) => s.time.startYear + i,
      yearsPerSecond: speed,
      fps: s.exportOpts.fps,
      mimePreference: s.exportOpts.format,
      onProgress: ({ year, percent }) => {
        status.textContent = t("export.recording", { year, percent: percent.toFixed(0) });
      },
      renderFrame: async (i, c) => {
        const year = s.time.startYear + i;
        updateTime({ currentYear: year });
        frameIndex = Math.max(0, year - simStartYear());
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = s.appearance.bgColor;
        ctx.fillRect(0, 0, c.width, c.height);
        const boxes = exportLayoutBoxes(layout, width, height, view);
        const mapish = isMapish(view as ViewMode);
        if (mapish) {
          await renderMap();
          const img = await svgToImage($("worldMapSvg") as unknown as SVGSVGElement, boxes.view.w, boxes.view.h);
          ctx.drawImage(img, boxes.view.x, boxes.view.y, boxes.view.w, boxes.view.h);
          if (view === "triangle") {
            const frame = simFrameFor(year);
            if (frame) {
              const series = frames.length ? frames : worldByCountry?.[s.country]?.series || [frame];
              const peaks = trianglePeakScales(series, 0, series.length - 1);
              const tmp = scratch(boxes.view.w, boxes.view.h);
              drawTriangle(tmp, frame, {
                ...pyramidOpts(frame),
                popScale: peaks.pop,
                deathScale: peaks.death,
                birthScale: peaks.birth,
                countryName: displayName(recOf(s.country) || { name: s.country }),
                overlay: true,
              });
              ctx.drawImage(tmp, boxes.view.x, boxes.view.y, boxes.view.w, boxes.view.h);
            }
          }
        } else {
          const frame = frames[i] || simFrameFor(year);
          if (frame) {
            updateStats(frame);
            const tmp = scratch(boxes.view.w, boxes.view.h);
            drawPyramid(tmp, frame, pyramidOpts(frame));
            ctx.drawImage(tmp, boxes.view.x, boxes.view.y, boxes.view.w, boxes.view.h);
          }
        }
        if (boxes.graphs) {
          paintGraphs(ctx, boxes.graphs.x, boxes.graphs.y, boxes.graphs.w, boxes.graphs.h);
          ctx.fillStyle = "rgba(51, 65, 85, 0.85)";
          ctx.fillRect(boxes.graphs.x, 0, 1, height);
        }
        if (boxes.strip) paintExportYearStrip(ctx, boxes.strip, year);
        if (boxes.stats) paintExportStats(ctx, boxes.stats);
      },
    });
    const filename = `population_${s.country}_${s.time.startYear}-${s.time.endYear}.${ext}`;
    downloadBlob(blob, filename);
    status.className = "export-status done";
    status.textContent = t("export.saved", { filename, mb: (blob.size / 1e6).toFixed(1) });
  } catch (err: any) {
    status.className = "export-status";
    status.textContent = t("export.failed", { err: err.message || err });
  }
  render();
}

function scratch(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.style.width = w + "px";
  c.style.height = h + "px";
  c.style.position = "fixed";
  c.style.left = "-99999px";
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 0);
  return c;
}

type ExportBox = { x: number; y: number; w: number; h: number };

function exportLayoutBoxes(layout: string, width: number, height: number, view: string) {
  const withGraphs = layout === "mapGraphs" || layout === "pyramidGraphs" || layout === "viewGraphsStats";
  const withStats = layout === "viewStats" || layout === "viewGraphsStats";
  const mapish = view === "triangle" || view === "map" || view === "regions" || view === "usa";
  const graphW = withGraphs ? Math.round(width * 0.36) : 0;
  const colW = width - graphW;
  const stripH = withStats && mapish ? Math.max(40, Math.round(height * 0.05)) : 0;
  const statsH = withStats ? Math.max(64, Math.round(height * 0.078)) : 0;
  const bottomH = stripH + statsH;
  return {
    view: { x: 0, y: 0, w: colW, h: height - bottomH } as ExportBox,
    graphs: withGraphs ? ({ x: colW, y: 0, w: graphW, h: height } as ExportBox) : null,
    strip: stripH ? ({ x: 0, y: height - bottomH, w: colW, h: stripH } as ExportBox) : null,
    stats: statsH ? ({ x: 0, y: height - statsH, w: colW, h: statsH } as ExportBox) : null,
  };
}

function paintGraphs(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const c = recOf(getState().country);
  if (!c) return;
  const cfg = getState().charts;
  const year = getState().time.currentYear;
  const pointsFor: Record<string, typeof c.series.tfr> = {
    tfr: c.series.tfr,
    pop: c.series.population,
    e0: c.series.e0,
    mig: c.series.netMigration,
    ideal: c.series.idealTfr,
    births: c.series.births || [],
    inflow: c.series.inflow || [],
  };
  const wpp = c.wppMedium;
  const wppFor: Record<string, typeof c.series.tfr> = {
    tfr: wpp?.tfr || [],
    pop: wpp?.population || [],
    e0: wpp?.e0 || [],
    mig: wpp?.netMigration || [],
    births: wpp?.births || [],
    ideal: [],
    inflow: [],
  };
  const specs = chartSpecs().filter((spec) => (cfg.series[spec.id] || { on: true }).on);
  if (!specs.length) {
    ctx.fillStyle = cfg.bg;
    ctx.fillRect(x, y, w, h);
    return;
  }
  const gap = 2;
  const each = Math.max(48, Math.floor((h - gap * (specs.length + 1)) / specs.length));
  specs.forEach((spec, i) => {
    const gy = y + gap + i * (each + gap);
    const gh = i === specs.length - 1 ? y + h - gy : each;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = gh;
    const seriesOpt = cfg.series[spec.id] || { on: true, color: "#38bdf8" };
    const overlayPts = cfg.showWpp ? wppFor[spec.id] || [] : [];
    drawLineChart(
      tmp,
      {
        id: spec.id,
        title: spec.title,
        unit: spec.unit,
        points: pointsFor[spec.id] || [],
        color: seriesOpt.color,
      },
      {
        bg: cfg.bg,
        text: cfg.text,
        markerYear: year,
        overlay: overlayPts.length
          ? { id: spec.id + "-wpp", title: spec.title, unit: spec.unit, points: overlayPts, color: cfg.wppColor }
          : null,
      }
    );
    ctx.drawImage(tmp, x, gy, w, gh);
  });
}

function paintExportStats(ctx: CanvasRenderingContext2D, box: ExportBox) {
  const { x, y, w, h } = box;
  ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(51, 65, 85, 0.95)";
  ctx.fillRect(x, y, w, 1);
  const items: [string, string][] = [
    [t("stats.year"), $("statYear").textContent || "—"],
    [t("stats.total"), $("statTotal").textContent || "—"],
    [t("stats.male"), $("statMale").textContent || "—"],
    [t("stats.female"), $("statFemale").textContent || "—"],
    [t("stats.median"), $("statMedian").textContent || "—"],
    [t("stats.youth"), $("statYouth").textContent || "—"],
    [t("stats.elderly"), $("statElderly").textContent || "—"],
    [t("stats.tfr"), $("statTfr").textContent || "—"],
  ];
  const slot = w / items.length;
  items.forEach(([label, value], i) => {
    const cx = x + slot * (i + 0.5);
    ctx.fillStyle = "#94a3b8";
    ctx.font = `600 ${Math.round(h * 0.2)}px "DM Sans", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label.toUpperCase(), cx, y + h * 0.14);
    ctx.fillStyle = "#f8fafc";
    ctx.font = `500 ${Math.round(h * 0.34)}px "JetBrains Mono", monospace`;
    ctx.fillText(value, cx, y + h * 0.44);
  });
}

function paintExportYearStrip(ctx: CanvasRenderingContext2D, box: ExportBox, current: number) {
  const { x, y, w, h } = box;
  const years = yearsInRange();
  const min = years[0];
  const max = years[years.length - 1] ?? min;
  const span = Math.max(1, max - min);
  ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(51, 65, 85, 0.95)";
  ctx.fillRect(x, y, w, 1);
  const pad = Math.max(18, w * 0.03);
  const xOf = (yr: number) => x + pad + ((yr - min) / span) * (w - pad * 2);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + pad, y + h * 0.68);
  ctx.lineTo(x + w - pad, y + h * 0.68);
  ctx.stroke();
  const step = span > 80 ? 10 : span > 40 ? 5 : 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `500 ${Math.round(h * 0.26)}px "JetBrains Mono", monospace`;
  for (let yr = min; yr <= max; yr += step) {
    const px = xOf(yr);
    ctx.fillStyle = "#475569";
    ctx.fillRect(px, y + h * 0.56, 1, h * 0.2);
    if (yr === min || yr === max || yr % (step * (span > 80 ? 2 : 1)) === 0) {
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(String(yr), px, y + 3);
    }
  }
  const cx = xOf(current);
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(cx, y + h * 0.5);
  ctx.lineTo(cx - 6, y + h * 0.22);
  ctx.lineTo(cx + 6, y + h * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - 1.5, y + h * 0.5, 3, h * 0.32);
  ctx.font = `700 ${Math.round(h * 0.3)}px "DM Sans", system-ui, sans-serif`;
  ctx.fillText(String(current), cx, y + 2);
}

async function svgToImage(svg: SVGSVGElement, w: number, h: number) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.width = w;
  img.height = h;
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("svg raster failed"));
    img.src = url;
  });
  URL.revokeObjectURL(url);
  return img;
}

function snapshotPng() {
  const view = getState().view;
  const canvas =
    view === "triangle" ? ($("triangleCanvas") as HTMLCanvasElement) : ($("pyramidCanvas") as HTMLCanvasElement);
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `snapshot_${getState().country}_${getState().time.currentYear}.png`);
  });
}

function initTooltips() {
  const tip = $("tooltip");
  let active: Element | null = null;
  const hide = () => {
    tip.hidden = true;
    tip.classList.remove("visible");
    active = null;
  };
  document.addEventListener("pointerover", (e) => {
    const el = (e.target as HTMLElement).closest?.("[data-tip]");
    if (!el) return;
    active = el;
    tip.hidden = false;
    tip.textContent = el.getAttribute("data-tip");
    tip.classList.add("visible");
    tip.style.left = e.clientX + 14 + "px";
    tip.style.top = e.clientY + 16 + "px";
  });
  document.addEventListener("pointerout", (e) => {
    const el = (e.target as HTMLElement).closest?.("[data-tip]");
    if (el && el === active) hide();
  });
}
