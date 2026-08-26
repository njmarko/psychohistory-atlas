import { DEFAULT_STATE, type AppState } from "./types";

type Listener = (state: AppState) => void;

const KEY = "pt.ui.v2";

function loadUi(): Partial<AppState> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<AppState>;
  } catch {
    return {};
  }
}

function persistUi(state: AppState) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        layout: state.layout,
        map: {
          metric: state.map.metric,
          colorMode: state.map.colorMode,
          paletteStops: state.map.paletteStops,
          colors: state.map.colors,
          pivot: state.map.pivot,
          tagFields: state.map.tagFields,
          tagOpacity: state.map.tagOpacity,
          hoverMini: state.map.hoverMini,
          hoverSpanYears: state.map.hoverSpanYears,
          hubCard: state.map.hubCard,
          triangleAnimate: state.map.triangleAnimate,
          idealMode: state.map.idealMode,
          countrySet: state.map.countrySet,
          surface: state.map.surface,
          zoom: state.map.zoom,
          rotation: state.map.rotation,
          pan: state.map.pan,
        },
        appearance: state.appearance,
        hover: state.hover,
        charts: state.charts,
        time: { yearsPerSecond: state.time.yearsPerSecond },
        scenario: {
          useCountryTfr: state.scenario.useCountryTfr,
          useCountryLe: state.scenario.useCountryLe,
          useCountryMig: state.scenario.useCountryMig,
          useWppMediumRates: state.scenario.useWppMediumRates,
          applyTfr: state.scenario.applyTfr,
          applyLe: state.scenario.applyLe,
          applyMig: state.scenario.applyMig,
          applySrb: state.scenario.applySrb,
        },
        exportOpts: state.exportOpts,
        country: state.country,
        locale: state.locale,
        view: state.view === "database" || state.view === "help" ? "pyramid" : state.view,
      })
    );
  } catch {
    /* ignore quota */
  }
}

function isMapishView(view: AppState["view"]) {
  return view === "map" || view === "regions" || view === "triangle";
}

function hydrateLayout(saved: Partial<AppState["layout"]> | undefined, view: AppState["view"]): AppState["layout"] {
  const layout = { ...DEFAULT_STATE.layout, ...(saved ?? {}), byView: { ...DEFAULT_STATE.layout.byView, ...(saved?.byView ?? {}) } };
  if ((saved?.panelDefaults ?? 0) < 2) {
    layout.byView.pyramid = { leftOpen: true, rightOpen: true };
    layout.panelDefaults = 2;
  }
  if (!layout.byView.pyramid) {
    layout.byView.pyramid = { leftOpen: true, rightOpen: true };
  }
  const key = isMapishView(view) ? "mapish" : view === "pyramid" ? "pyramid" : "other";
  const panels =
    layout.byView[key] ??
    (isMapishView(view)
      ? { leftOpen: false, rightOpen: false }
      : view === "pyramid"
        ? { leftOpen: true, rightOpen: true }
        : { leftOpen: true, rightOpen: false });
  return { ...layout, leftOpen: panels.leftOpen, rightOpen: panels.rightOpen };
}

let state: AppState = {
  ...DEFAULT_STATE,
  ...loadUi(),
  layout: hydrateLayout(loadUi().layout, (loadUi().view as AppState["view"]) || DEFAULT_STATE.view),
  map: (() => {
    const saved = loadUi().map as any;
    const rawSpan =
      saved?.hoverSpanYears != null
        ? Number(saved.hoverSpanYears)
        : saved?.hoverSpan === "end"
          ? 200
          : saved?.hoverSpan
            ? Number(saved.hoverSpan)
            : DEFAULT_STATE.map.hoverSpanYears;
    const hoverSpanYears = rawSpan === 20 || rawSpan === 50 ? 100 : rawSpan;
    return { ...DEFAULT_STATE.map, ...(saved ?? {}), hoverSpanYears };
  })(),
  appearance: { ...DEFAULT_STATE.appearance, ...(loadUi().appearance ?? {}) },
  hover: (() => {
    const h = { ...DEFAULT_STATE.hover, ...(loadUi().hover ?? {}) };
    if (h.size === 320 || h.size === 420 || h.size === 440 || h.size === 560 || h.size === 720) h.size = DEFAULT_STATE.hover.size;
    return h;
  })(),
  charts: {
    ...DEFAULT_STATE.charts,
    ...(loadUi().charts ?? {}),
    series: { ...DEFAULT_STATE.charts.series, ...((loadUi().charts as any)?.series ?? {}) },
  },
  exportOpts: (() => {
    const e = { ...DEFAULT_STATE.exportOpts, ...(loadUi().exportOpts ?? {}) };
    if (e.format === "webm") e.format = DEFAULT_STATE.exportOpts.format;
    return e;
  })(),
  time: { ...DEFAULT_STATE.time, ...((loadUi() as any).time ?? {}) },
  scenario: { ...DEFAULT_STATE.scenario, ...((loadUi() as any).scenario ?? {}) },
  locale: (loadUi() as { locale?: string }).locale === "sr" ? "sr" : "en",
};

const listeners = new Set<Listener>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => AppState)): AppState {
  const next = typeof patch === "function" ? patch(state) : { ...state, ...patch };
  state = next;
  persistUi(state);
  listeners.forEach((fn) => fn(state));
  return state;
}

export function updateMap(patch: Partial<AppState["map"]>): AppState {
  return setState((s) => ({ ...s, map: { ...s.map, ...patch } }));
}

export function updateAppearance(patch: Partial<AppState["appearance"]>): AppState {
  return setState((s) => ({ ...s, appearance: { ...s.appearance, ...patch } }));
}

export function updateScenario(patch: Partial<AppState["scenario"]>): AppState {
  return setState((s) => ({ ...s, scenario: { ...s.scenario, ...patch } }));
}

export function updateTime(patch: Partial<AppState["time"]>): AppState {
  return setState((s) => ({ ...s, time: { ...s.time, ...patch } }));
}

export function updateLayout(patch: Partial<AppState["layout"]>): AppState {
  return setState((s) => ({ ...s, layout: { ...s.layout, ...patch } }));
}

export function updateExport(patch: Partial<AppState["exportOpts"]>): AppState {
  return setState((s) => ({ ...s, exportOpts: { ...s.exportOpts, ...patch } }));
}

export function updateHover(patch: Partial<AppState["hover"]>): AppState {
  return setState((s) => ({ ...s, hover: { ...s.hover, ...patch } }));
}

export function updateCharts(patch: Partial<AppState["charts"]>): AppState {
  return setState((s) => ({ ...s, charts: { ...s.charts, ...patch } }));
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
