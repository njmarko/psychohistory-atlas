import * as d3 from "d3";
import { feature, mesh } from "topojson-client";
import { formatPop } from "../../sim/world";
import { METRIC_BY_ID, metricValue } from "../../data/metrics";
import { REPLACEMENT_TFR } from "../../data/sources";
import { displayName } from "../../data/serbia-kosovo";
import { regionName, t, tOr } from "../../i18n";
import { flagImageUrl, getFlagEmoji } from "../../flags/flags";
import { computeExtents, computePivot, divergingColor, sequentialColor } from "./colors";
import type { AppState, TagField } from "../../store/types";

const NAME_ALIASES: Record<string, string | null> = {
  "United States of America": "United States",
  Czechia: "Czech Republic",
  "Bosnia and Herz.": "Bosnia and Herzegovina",
  Macedonia: "North Macedonia",
  "Dem. Rep. Congo": "DR Congo",
  "Democratic Republic of the Congo": "DR Congo",
  "Central African Rep.": "Central African Republic",
  "S. Sudan": "South Sudan",
  "Dominican Rep.": "Dominican Republic",
  "Côte d'Ivoire": "Ivory Coast",
  eSwatini: "Eswatini",
  Swaziland: "Eswatini",
  "Fr. S. Antarctic Lands": null,
  Antarctica: null,
  "N. Cyprus": null,
  Somaliland: null,
  Kosovo: "Serbia",
  "Republic of Kosovo": "Serbia",
  Taiwan: "Taiwan",
  "South Korea": "South Korea",
  "North Korea": "North Korea",
  "Russian Federation": "Russia",
  "Syrian Arab Republic": "Syria",
  "Iran (Islamic Republic of)": "Iran",
  "United Republic of Tanzania": "Tanzania",
  "Lao PDR": "Laos",
  "Republic of Moldova": "Moldova",
  "Viet Nam": "Vietnam",
};

let worldTopo: any = null;
let countriesGeo: any = null;

export async function loadMapLibs() {
  if (countriesGeo) return { d3, countriesGeo, worldTopo };
  const topo = (await import("world-atlas/countries-110m.json")).default as any;
  worldTopo = topo;
  countriesGeo = feature(topo, topo.objects.countries as any);
  return { d3, countriesGeo, worldTopo };
}

function buildIndexes(snapshotCountries: Record<string, any>) {
  const iso3Index: Record<string, string> = {};
  const iso2Index: Record<string, string> = {};
  const isoNumIndex: Record<number, string> = {};
  const nameIndex: Record<string, string> = {};
  for (const [name, rec] of Object.entries(snapshotCountries)) {
    nameIndex[name] = name;
    if (rec.iso3) iso3Index[rec.iso3] = name;
    if (rec.iso2) iso2Index[rec.iso2] = name;
    if (rec.isoNum != null) isoNumIndex[Number(rec.isoNum)] = name;
  }
  iso3Index.XKX = "Serbia";
  iso2Index.XK = "Serbia";
  isoNumIndex[983] = "Serbia";
  isoNumIndex[688] = "Serbia";
  return { iso3Index, iso2Index, isoNumIndex, nameIndex };
}

function resolveDataName(props: any, indexes: ReturnType<typeof buildIndexes>, id?: unknown) {
  const a3 = props?.ISO_A3 || props?.iso_a3;
  const a2 = props?.ISO_A2 || props?.iso_a2;
  if (a3 && indexes.iso3Index[a3]) return indexes.iso3Index[a3];
  if (a2 && a2 !== "-99" && indexes.iso2Index[a2]) return indexes.iso2Index[a2];
  const rawName = props?.name || props?.NAME || props?.NAME_EN || props?.ADMIN || "";
  const aliased = NAME_ALIASES[rawName];
  if (aliased === null) return null;
  if (aliased && indexes.nameIndex[aliased]) return aliased;
  if (indexes.nameIndex[rawName]) return indexes.nameIndex[rawName];
  if (id != null) {
    const n = Number(id);
    if (indexes.isoNumIndex[n]) return indexes.isoNumIndex[n];
  }
  if (/kosovo/i.test(rawName)) return "Serbia";
  return null;
}

function isSerbiaKosovoPair(a: any, b: any, indexes: ReturnType<typeof buildIndexes>) {
  const na = resolveDataName(a.properties || {}, indexes, a.id);
  const nb = resolveDataName(b.properties || {}, indexes, b.id);
  return na === "Serbia" && nb === "Serbia" && a !== b;
}

export type MapRenderOpts = {
  mode: "countries" | "regions";
  snapshot: { countries: Record<string, any>; worldPop: number };
  regionSnapshot?: { regions: Record<string, any>; worldPop: number };
  state: AppState;
  width: number;
  height: number;
  selectedIso2ByName?: Record<string, string | null>;
  onHover: (rec: any, event: PointerEvent, meta: any) => void;
  onLeave: () => void;
  onClick: (name: string, event: PointerEvent, meta: any) => void;
  onDblClick: (name: string, event: PointerEvent) => void;
  onPinDrag: (name: string, offset: { dx: number; dy: number }, extra?: { live: boolean }) => void;
  onZoom?: (k: number, pan?: [number, number]) => void;
  onRotate?: (rot: [number, number, number]) => void;
  onPan?: (pan: [number, number]) => void;
  onHubCountry?: (name: string | null) => void;
  onGestureEnd?: () => void;
};

let suppressCountryClick = false;

type LiveMap = {
  scene: any;
  projection: any;
  path: any;
  surface: string;
  pan: [number, number];
  zoom: number;
  W: number;
  H: number;
  features: any[];
  indexes: ReturnType<typeof buildIndexes>;
  options: MapRenderOpts;
  hubName: string | null;
  refreshHub: () => string | null;
  mode: "countries" | "regions";
  regionByCountryName: Record<string, string>;
  fillFeature: (d: any) => string;
  pinKey: string;
};

let live: LiveMap | null = null;
let flyGen = 0;

export function cancelMapFly() {
  flyGen++;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function shortestAngleDelta(from: number, to: number) {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function flyToLonLat(lon: number, lat: number, durationMs = 500): Promise<void> {
  if (!live) return Promise.resolve();
  const surface = live.surface === "globe" ? "globe" : "map";
  const target = lookAtLonLat(surface, lon, lat, live.W, live.H, live.zoom);
  const fromPan: [number, number] = [live.pan[0], live.pan[1]];
  const fromRot = (live.projection.rotate?.() || [0, 0, 0]) as [number, number, number];
  if (surface === "globe") {
    const dLon = shortestAngleDelta(fromRot[0], target.rotation[0]);
    const dLat = target.rotation[1] - fromRot[1];
    if (Math.hypot(dLon, dLat) < 0.2) return Promise.resolve();
  } else if (Math.hypot(target.pan[0] - fromPan[0], target.pan[1] - fromPan[1]) < 3) {
    return Promise.resolve();
  }
  const gen = ++flyGen;
  const start = performance.now();
  const ms = Math.max(1, durationMs);
  return new Promise((resolve) => {
    const step = (now: number) => {
      if (gen !== flyGen || !live) {
        resolve();
        return;
      }
      const t = Math.min(1, (now - start) / ms);
      const k = easeInOutCubic(t);
      if (surface === "globe") {
        const next: [number, number, number] = [
          fromRot[0] + shortestAngleDelta(fromRot[0], target.rotation[0]) * k,
          fromRot[1] + (target.rotation[1] - fromRot[1]) * k,
          fromRot[2] + (target.rotation[2] - fromRot[2]) * k,
        ];
        live.projection.rotate(next);
        live.scene.selectAll(".scene-path").attr("d", live.path as any);
        live.options.onRotate?.(next);
      } else {
        live.pan = [
          fromPan[0] + (target.pan[0] - fromPan[0]) * k,
          fromPan[1] + (target.pan[1] - fromPan[1]) * k,
        ];
        live.scene.attr("transform", `translate(${live.pan[0]},${live.pan[1]})`);
        live.options.onPan?.(live.pan);
      }
      live.refreshHub();
      if (t < 1) requestAnimationFrame(step);
      else {
        live.options.onGestureEnd?.();
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

export function flyToCountry(name: string, durationMs = 500): Promise<void> {
  const c = countryCentroidLonLat(name);
  if (!c) return Promise.resolve();
  return flyToLonLat(c[0], c[1], durationMs);
}

export function nudgeLiveMap(dx: number, dy: number): string | null {
  if (!live) return null;
  cancelMapFly();
  if (live.surface === "globe") {
    const k = 50 / live.projection.scale();
    const r = live.projection.rotate();
    const next: [number, number, number] = [r[0] + dx * k, r[1] - dy * k, r[2]];
    live.projection.rotate(next);
    live.scene.selectAll(".scene-path").attr("d", live.path as any);
    live.options.onRotate?.(next);
  } else {
    live.pan = [live.pan[0] + dx, live.pan[1] + dy];
    live.scene.attr("transform", `translate(${live.pan[0]},${live.pan[1]})`);
    live.options.onPan?.(live.pan);
  }
  return live.refreshHub();
}

export function liveMapReady() {
  return !!live;
}

function nameMatches(resolved: string | null, target: string | null, mode: "countries" | "regions", regionBy: Record<string, string>) {
  if (!resolved || !target) return false;
  if (mode === "regions") return regionBy[resolved] === target;
  return resolved === target;
}

function outerMeshForName(name: string | null, indexes: ReturnType<typeof buildIndexes>) {
  if (!name || !worldTopo) return null;
  const mode = live?.mode || "countries";
  const regionBy = live?.regionByCountryName || {};
  return mesh(worldTopo, worldTopo.objects.countries as any, (a: any, b: any) => {
    const na = resolveDataName(a.properties || {}, indexes, a.id);
    const nb = resolveDataName(b.properties || {}, indexes, b.id);
    const aIn = nameMatches(na, name, mode, regionBy);
    const bIn = nameMatches(nb, name, mode, regionBy);
    if (a === b) return aIn;
    return aIn !== bIn;
  });
}

function setOutline(
  scene: any,
  cls: string,
  name: string | null,
  indexes: ReturnType<typeof buildIndexes>,
  path: any,
  color: string
) {
  let g = scene.select(`path.${cls}`);
  if (g.empty()) {
    g = scene
      .append("path")
      .attr("class", `scene-path ${cls}`)
      .attr("fill", "none")
      .attr("stroke-linejoin", "round")
      .attr("pointer-events", "none");
  }
  const geo = outerMeshForName(name, indexes);
  g.attr("stroke", name ? color : "none")
    .attr("stroke-width", name ? 2.2 : 0)
    .datum(geo)
    .attr("d", geo ? (path as any) : null);
}

function setHubStroke(scene: any, name: string | null, indexes: ReturnType<typeof buildIndexes>, path?: any) {
  const p = path || live?.path;
  if (!p) return;
  setOutline(scene, "hub-outline", name, indexes, p, "#fbbf24");
}

/** Geographic default: Europe center, Americas left, Asia right. */
export const DEFAULT_FOCUS: [number, number] = [20, 50];
/** Approximate centroid of Serbia (incl. Kosovo) for the first-load home view. */
export const SERBIA_FOCUS: [number, number] = [20.9, 44.1];

export function countryCentroidLonLat(name: string | null): [number, number] | null {
  if (!name || !live || !countriesGeo) return null;
  const feats = (countriesGeo.features as any[]).filter(
    (f) => resolveDataName(f.properties || {}, live!.indexes, f.id) === name
  );
  if (!feats.length) return null;
  const c =
    feats.length === 1
      ? d3.geoCentroid(feats[0])
      : d3.geoCentroid({ type: "FeatureCollection", features: feats } as any);
  if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
  return [c[0], c[1]];
}

function invertProjectionPoint(px: number, py: number): [number, number] | null {
  if (!live) return null;
  const inv = live.projection.invert?.([px, py]);
  if (!inv || !Number.isFinite(inv[0]) || !Number.isFinite(inv[1])) return null;
  const back = live.projection(inv);
  if (!back || Math.hypot(back[0] - px, back[1] - py) > 12) return null;
  return [inv[0], inv[1]];
}

/** Geographic point currently under the viewport crosshair (center). */
export function crosshairLonLat(): [number, number] | null {
  if (!live) return null;
  const cx = live.W / 2;
  const cy = live.H / 2;
  const px = live.surface === "globe" ? cx : cx - live.pan[0];
  const py = live.surface === "globe" ? cy : cy - live.pan[1];
  return invertProjectionPoint(px, py);
}

export function currentFocusLonLat(): [number, number] | null {
  return crosshairLonLat() || countryCentroidLonLat(live?.hubName || null);
}

/** Keep the crosshair's geographic point fixed while changing zoom (flat map only). */
function panKeepingCrosshair(
  W: number,
  H: number,
  pan: [number, number],
  projection: { translate: () => [number, number] },
  fromZoom: number,
  toZoom: number
): [number, number] {
  const from = Math.max(1e-6, fromZoom);
  const ratio = toZoom / from;
  if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 1e-9) return pan;
  const [tx, ty] = projection.translate();
  const px = W / 2 - pan[0];
  const py = H / 2 - pan[1];
  return [W / 2 - (tx + (px - tx) * ratio), H / 2 - (ty + (py - ty) * ratio)];
}

export function viewForZoom(nextZoom: number): { zoom: number; pan?: [number, number] } {
  const zoom = Math.max(1, Math.min(8, nextZoom));
  if (!live || live.surface !== "map") return { zoom };
  return {
    zoom,
    pan: panKeepingCrosshair(live.W, live.H, live.pan, live.projection, live.zoom, zoom),
  };
}

export function lookAtLonLat(
  surface: "map" | "globe",
  lon: number,
  lat: number,
  width: number,
  height: number,
  zoom: number
): { pan: [number, number]; rotation: [number, number, number]; zoom: number } {
  const sphere = { type: "Sphere" } as any;
  const zoomK = Math.max(1, Math.min(8, zoom || 1));
  if (surface === "globe") {
    return { pan: [0, 0], rotation: [-lon, -lat, 0], zoom: zoomK };
  }
  const projection = d3.geoNaturalEarth1().fitSize([width - 8, height - 8], sphere);
  projection.scale(projection.scale() * zoomK);
  const xy = projection([lon, lat]);
  if (!xy || !Number.isFinite(xy[0])) {
    return { pan: [0, 0], rotation: [0, 0, 0], zoom: 1 };
  }
  return {
    pan: [width / 2 - xy[0], height / 2 - xy[1]],
    rotation: [0, 0, 0],
    zoom: zoomK,
  };
}

function oceanFill(state: AppState, bg: string) {
  return state.map.oceanColor || d3.color(bg)?.brighter(0.3)?.formatHex() || bg;
}

function buildMapColoring(options: MapRenderOpts) {
  const { state, snapshot, mode } = options;
  const dataByName = mode === "regions" && options.regionSnapshot ? options.regionSnapshot.regions : snapshot.countries;
  const regionByCountryName: Record<string, string> = {};
  if (mode === "regions") {
    for (const rec of Object.values(snapshot.countries) as any[]) regionByCountryName[rec.name] = rec.region;
  }
  const metricId = state.map.metric;
  const countryFill = state.map.countryFill || "#334155";
  if (!metricId) {
    return {
      fillFor: () => countryFill,
      colorOpts: {
        mode: state.map.colorMode,
        paletteStops: state.map.paletteStops,
        low: countryFill,
        mid: countryFill,
        high: countryFill,
        pivot: 0,
        extent: 1,
        extentLow: 1,
        extentHigh: 1,
      },
      seqMin: 0,
      seqMax: 1,
      metricId: "",
      dataByName,
      regionByCountryName,
      scale: undefined as string | undefined,
    };
  }
  const records = Object.values(dataByName) as any[];
  const vals: { value: number; population: number }[] = [];
  for (const rec of records) {
    const v = metricValue(rec, metricId);
    if (v != null && Number.isFinite(v)) vals.push({ value: v, population: rec.population || 0 });
  }
  const pivotMetric = state.map.pivot.followMetric ? metricId : state.map.pivot.otherMetric || metricId;
  const pivotVals =
    pivotMetric === metricId
      ? vals
      : (records
          .map((r) => {
            const v = metricValue(r, pivotMetric);
            return v != null ? { value: v, population: r.population || 0 } : null;
          })
          .filter(Boolean) as { value: number; population: number }[]);
  const pivot = computePivot(pivotVals, state.map.pivot.stat, state.map.pivot.customValue);
  const metricVals = vals.map((v) => v.value);
  const extents = computeExtents(metricVals, pivot);
  const extent = Math.max(extents.low, extents.high);
  const seqMin = d3.min(metricVals) ?? 0;
  const seqMax = d3.max(metricVals) ?? 1;
  const colorOpts = {
    mode: state.map.colorMode,
    paletteStops: state.map.paletteStops,
    low: state.map.colors.low,
    mid: state.map.colors.mid,
    high: state.map.colors.high,
    pivot,
    extent,
    extentLow: extents.low,
    extentHigh: extents.high,
  };
  const scale = METRIC_BY_ID[metricId]?.scale;
  const fillFor = (rec: any) => {
    if (!rec) return state.map.showMissing ? "#1e293b" : "transparent";
    const v = metricValue(rec, metricId);
    if (v == null) return "#1e293b";
    if (scale === "log") {
      return sequentialColor(v, Math.max(seqMin, 1), Math.max(seqMax, 1), state.map.colors.low, state.map.colors.high, "log");
    }
    if (scale === "diverging") {
      return divergingColor(v, { ...colorOpts, paletteStops: 3 });
    }
    if (scale === "zero-linear") {
      return sequentialColor(v, 0, Math.max(seqMax, 0.0001), state.map.colors.low, state.map.colors.high, "linear");
    }
    if (state.map.colorMode === "sequential") {
      return sequentialColor(v, seqMin, seqMax, state.map.colors.low, state.map.colors.high);
    }
    if (state.map.colorMode === "tfrReplacement") {
      const tfrs = records.map((r: any) => r.tfr).filter((x: number) => Number.isFinite(x));
      const tfrExt = computeExtents(tfrs, REPLACEMENT_TFR);
      return divergingColor(rec.tfr, {
        ...colorOpts,
        pivot: REPLACEMENT_TFR,
        extent: Math.max(tfrExt.low, tfrExt.high, 1.2),
        extentLow: Math.max(tfrExt.low, 0.4),
        extentHigh: Math.max(tfrExt.high, 0.4),
      });
    }
    if (state.map.colorMode === "dual") {
      return sequentialColor(rec.worldShare || 0, 0, d3.max(records.map((r) => r.worldShare || 0)) || 1, state.map.colors.mid, state.map.colors.high, "linear");
    }
    return divergingColor(v, colorOpts);
  };
  return { fillFor, colorOpts, seqMin, seqMax, metricId, dataByName, regionByCountryName, scale };
}

export function liveMapCanRecolor(
  width: number,
  height: number,
  surface: string,
  zoom: number,
  mode: string,
  pinKey: string
) {
  if (!live) return false;
  return (
    live.W === width &&
    live.H === height &&
    live.surface === surface &&
    live.zoom === Math.max(1, Math.min(8, zoom || 1)) &&
    live.mode === mode &&
    live.pinKey === pinKey
  );
}

export function recolorLiveMap(options: MapRenderOpts) {
  if (!live) return false;
  const coloring = buildMapColoring(options);
  live.options = options;
  live.regionByCountryName = coloring.regionByCountryName;
  live.fillFeature = (d: any) => {
    const name = resolveDataName(d.properties || {}, live!.indexes, d.id);
    if (live!.mode === "regions") {
      const regionName = name ? coloring.regionByCountryName[name] : null;
      return coloring.fillFor(regionName ? coloring.dataByName[regionName] : null);
    }
    return coloring.fillFor(name ? options.snapshot.countries[name] : null);
  };
  live.scene.selectAll("path.country-feat").attr("fill", (d: any) => live!.fillFeature(d));
  paintHtmlLegend({
    metricId: coloring.metricId,
    colorOpts: coloring.colorOpts,
    seqMin: coloring.seqMin,
    seqMax: coloring.seqMax,
    state: options.state,
    scale: coloring.scale,
  });
  return true;
}

export async function renderWorldMap(svgEl: SVGSVGElement, options: MapRenderOpts) {
  cancelMapFly();
  const { state, snapshot, mode, width: W, height: H } = options;
  await loadMapLibs();
  const bg = state.appearance.bgColor;
  svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svgEl.style.background = bg;
  svgEl.innerHTML = "";

  const surface = state.map.surface || "map";
  const zoomK = Math.max(1, Math.min(8, state.map.zoom || 1));
  const rot = (state.map.rotation || [0, 0, 0]) as [number, number, number];
  const sphere = { type: "Sphere" } as any;
  const projection =
    surface === "globe"
      ? d3.geoOrthographic().fitSize([W - 24, H - 24], sphere).rotate(rot).clipAngle(90)
      : d3.geoNaturalEarth1().fitSize([W - 8, H - 8], sphere);
  projection.scale(projection.scale() * zoomK);
  let pan = ([...(state.map.pan || [0, 0])] as [number, number]);
  const path = d3.geoPath(projection);
  const g = d3.select(svgEl);
  svgEl.style.cursor = "grab";
  g.append("rect").attr("width", W).attr("height", H).attr("fill", bg);
  const scene = g
    .append("g")
    .attr("class", "map-scene")
    .attr("transform", surface === "globe" ? null : `translate(${pan[0]},${pan[1]})`);
  scene
    .append("path")
    .datum(sphere)
    .attr("class", "scene-path ocean-feat")
    .attr("d", path as any)
    .attr("fill", oceanFill(state, bg))
    .attr("stroke", "#334155")
    .attr("stroke-width", 0.6);

  const indexes = buildIndexes(snapshot.countries);
  const selectedSet = new Set(state.map.pins);
  const coloring = buildMapColoring(options);
  const { fillFor, colorOpts, seqMin, seqMax, metricId, dataByName, regionByCountryName } = coloring;

  const features = countriesGeo.features as any[];
  scene
    .append("g")
    .attr("class", "countries")
    .selectAll("path")
    .data(features)
    .join("path")
    .attr("class", "scene-path country-feat")
    .attr("d", path as any)
    .attr("fill", (d: any) => {
      const name = resolveDataName(d.properties || {}, indexes, d.id);
      if (mode === "regions") {
        const regionName = name ? regionByCountryName[name] : null;
        return fillFor(regionName ? dataByName[regionName] : null);
      }
      return fillFor(name ? snapshot.countries[name] : null);
    })
    .attr("stroke", "none")
    .style("cursor", "pointer")
    .on("pointerenter", function (this: any, event: any, d: any) {
      if (suppressCountryClick) return;
      const name = resolveDataName(d.properties || {}, indexes, d.id);
      const hoverName = mode === "regions" ? (name ? regionByCountryName[name] : null) : name;
      setOutline(scene, "hover-outline", hoverName, indexes, path, "#f8fafc");
      if (mode === "regions") {
        const regionName = name ? regionByCountryName[name] : null;
        options.onHover(regionName ? dataByName[regionName] : null, event, { kind: "region", countryName: name, mapName: d.properties?.name });
      } else {
        options.onHover(name ? snapshot.countries[name] : null, event, { kind: "country", countryName: name, mapName: d.properties?.name, iso2: name ? snapshot.countries[name]?.iso2 : null });
      }
    })
    .on("pointermove", function (event: any, d: any) {
      if (suppressCountryClick) return;
      const name = resolveDataName(d.properties || {}, indexes, d.id);
      if (mode === "regions") {
        const regionName = name ? regionByCountryName[name] : null;
        options.onHover(regionName ? dataByName[regionName] : null, event, { kind: "region", countryName: name, mapName: d.properties?.name });
      } else {
        options.onHover(name ? snapshot.countries[name] : null, event, { kind: "country", countryName: name, mapName: d.properties?.name, iso2: name ? snapshot.countries[name]?.iso2 : null });
      }
    })
    .on("pointerleave", function () {
      setOutline(scene, "hover-outline", null, indexes, path, "#f8fafc");
      options.onLeave();
    })
    .on("click", function (event: any, d: any) {
      if (event.defaultPrevented || suppressCountryClick) return;
      event.stopPropagation();
      const name = resolveDataName(d.properties || {}, indexes, d.id);
      if (mode === "regions") {
        const regionName = name ? regionByCountryName[name] : null;
        if (regionName) options.onClick(regionName, event, { kind: "region" });
      } else if (name) options.onClick(name, event, { kind: "country" });
    })
    .on("dblclick", function (event: any, d: any) {
      event.stopPropagation();
      const name = resolveDataName(d.properties || {}, indexes, d.id);
      if (mode !== "regions" && name) options.onDblClick(name, event);
    });

  if (worldTopo) {
    const border = mesh(worldTopo, worldTopo.objects.countries as any, (a: any, b: any) => {
      if (a === b) return true;
      if (isSerbiaKosovoPair(a, b, indexes)) return false;
      return true;
    });
    scene
      .append("path")
      .datum(border)
      .attr("class", "scene-path")
      .attr("d", path as any)
      .attr("fill", "none")
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 0.35)
      .attr("pointer-events", "none");
  }

  if (selectedSet.size) {
    drawPins(scene, {
      path,
      features,
      indexes,
      mode,
      selectedSet,
      selectedIso2ByName: options.selectedIso2ByName || {},
      pinOffsets: state.map.pinOffsets,
      snapshot,
      dataByName,
      regionByCountryName,
      W,
      H,
      tagFields: state.map.tagFields,
      tagOpacity: state.map.tagOpacity / 100,
      onPinDrag: options.onPinDrag,
      pan: surface === "map" ? pan : [0, 0],
    });
  }

  paintHtmlLegend({
    metricId,
    colorOpts,
    seqMin,
    seqMax,
    state,
    scale: coloring.scale,
  });

  const pickHub = (p: [number, number]) => {
    const inv = projection.invert?.(p);
    if (!inv) return null;
    for (const f of features) {
      try {
        if (d3.geoContains(f, inv)) {
          const found = resolveDataName(f.properties || {}, indexes, f.id);
          if (found) return found;
        }
      } catch {
        /* skip */
      }
    }
    return null;
  };

  const svgSel = d3.select(svgEl);
  svgSel.on("wheel.zoommap", (event: WheelEvent) => {
    cancelMapFly();
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.11;
    const next = Math.max(1, Math.min(8, zoomK * factor));
    if (next === zoomK) return;
    const currentPan = live?.pan || pan;
    const nextPan =
      surface === "map" ? panKeepingCrosshair(W, H, currentPan, projection, zoomK, next) : undefined;
    options.onZoom?.(next, nextPan);
  });
  svgSel.call(
    d3
      .drag()
      .filter((event: any) => !event.target?.closest?.(".selection-pin"))
      .clickDistance(8)
      .on("start", () => {
        cancelMapFly();
        suppressCountryClick = false;
        svgEl.style.cursor = "grabbing";
      })
      .on("drag", (event: any) => {
        suppressCountryClick = true;
        options.onLeave?.();
        if (surface === "globe") {
          const k = 50 / projection.scale();
          const r = projection.rotate();
          const next: [number, number, number] = [r[0] + event.dx * k, r[1] - event.dy * k, r[2]];
          projection.rotate(next);
          scene.selectAll(".scene-path").attr("d", path as any);
          options.onRotate?.(next);
        } else {
          pan = [pan[0] + event.dx, pan[1] + event.dy];
          scene.attr("transform", `translate(${pan[0]},${pan[1]})`);
          options.onPan?.(pan);
        }
        if (live) {
          live.pan = pan;
          live.refreshHub();
        }
      })
      .on("end", () => {
        svgEl.style.cursor = "grab";
        if (suppressCountryClick) {
          if (surface === "globe") options.onRotate?.(projection.rotate() as [number, number, number]);
          else options.onPan?.(pan);
          options.onGestureEnd?.();
        }
        window.setTimeout(() => {
          suppressCountryClick = false;
        }, 0);
      }) as any
  );

  const refreshHub = () => {
    const p = live?.pan || pan;
    const screen: [number, number] =
      surface === "globe" ? [W / 2, H / 2] : [W / 2 - p[0], H / 2 - p[1]];
    const name = pickHub(screen);
    setHubStroke(scene, name, indexes, path);
    if (live) live.hubName = name;
    options.onHubCountry?.(name);
    return name;
  };

  live = {
    scene,
    projection,
    path,
    surface,
    pan,
    zoom: zoomK,
    W,
    H,
    features,
    indexes,
    options,
    hubName: null,
    refreshHub,
    mode,
    regionByCountryName,
    fillFeature: (d: any) => {
      const name = resolveDataName(d.properties || {}, indexes, d.id);
      if (mode === "regions") {
        const regionName = name ? regionByCountryName[name] : null;
        return fillFor(regionName ? dataByName[regionName] : null);
      }
      return fillFor(name ? snapshot.countries[name] : null);
    },
    pinKey: [...selectedSet].sort().join(","),
  };

  refreshHub();

  return { path, projection, pivot: colorOpts.pivot };
}

function paintHtmlLegend({
  metricId,
  colorOpts,
  seqMin,
  seqMax,
  state,
  scale,
}: any) {
  const el = document.getElementById("mapLegend");
  if (!el) return;
  if (!metricId) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const def = METRIC_BY_ID[metricId];
  const sequential = scale !== "diverging" && (scale === "log" || scale === "zero-linear" || state.map.colorMode === "sequential");
  const three = scale === "diverging" || (!sequential && state.map.paletteStops === 3);
  const metricLabel = tOr(`metrics.${metricId}.label`, def?.label || metricId);
  const title = scale === "log"
    ? t("map.legendLog", { label: metricLabel })
    : scale === "zero-linear"
      ? t("map.legendZero", { label: metricLabel })
      : sequential
        ? t("map.legendSeq", { label: metricLabel })
        : t("map.legendDiv", { label: metricLabel, v: formatLegend(colorOpts.pivot, tOr(`metrics.${metricId}.unit`, def?.unit || "")) });
  const steps = 16;
  let swatches = "";
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    let fill: string;
    if (scale === "log") {
      fill = sequentialColor(seqMin + t * (seqMax - seqMin), Math.max(seqMin, 1), Math.max(seqMax, 1), colorOpts.low, colorOpts.high, "log");
    } else if (scale === "diverging") {
      const v =
        t <= 0.5
          ? colorOpts.pivot - (1 - t * 2) * (colorOpts.extentLow || colorOpts.extent)
          : colorOpts.pivot + (t * 2 - 1) * (colorOpts.extentHigh || colorOpts.extent);
      fill = divergingColor(v, { ...colorOpts, paletteStops: 3 });
    } else if (scale === "zero-linear") {
      fill = sequentialColor(t * Math.max(seqMax, 0.0001), 0, Math.max(seqMax, 0.0001), colorOpts.low, colorOpts.high, "linear");
    } else if (sequential) {
      fill = sequentialColor(seqMin + t * (seqMax - seqMin), seqMin, seqMax, colorOpts.low, colorOpts.high);
    } else {
      const v =
        t <= 0.5
          ? colorOpts.pivot - (1 - t * 2) * (colorOpts.extentLow || colorOpts.extent)
          : colorOpts.pivot + (t * 2 - 1) * (colorOpts.extentHigh || colorOpts.extent);
      fill = divergingColor(v, colorOpts);
    }
    swatches += `<span class="map-legend-swatch" style="background:${fill}"></span>`;
  }
  const ends = sequential
    ? `<span>${t("map.legendLow")}</span><span>${t("map.legendHigh")}</span>`
    : three
      ? `<span>${t("map.legendBelow")}</span><span>${t("map.legendAvg", { v: formatLegend(colorOpts.pivot) })}</span><span>${t("map.legendAbove")}</span>`
      : `<span>${t("map.legendLow")} / ${t("map.legendBelow")}</span><span>${t("map.legendHigh")} / ${t("map.legendAbove")}</span>`;
  el.hidden = false;
  el.innerHTML = `<div class="map-legend-title">${title}</div><div class="map-legend-bar">${swatches}</div><div class="map-legend-ends">${ends}</div>`;
}

function formatLegend(v: number, unit?: string) {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const s = abs >= 1e6 ? (v / 1e6).toFixed(2) + "M" : abs >= 100 ? v.toFixed(0) : v.toFixed(2);
  return unit ? `${s}` : s;
}

function drawPins(
  g: any,
  {
    path,
    features,
    indexes,
    mode,
    selectedSet,
    selectedIso2ByName,
    pinOffsets,
    snapshot,
    dataByName,
    regionByCountryName,
    W,
    H,
    tagFields,
    tagOpacity,
    onPinDrag,
    pan,
  }: any
) {
  const names = [...selectedSet].sort();
  for (const selectedName of names) {
    let rec: any = null;
    let centroid: [number, number] | null = null;
    if (mode === "regions") {
      rec = dataByName[selectedName];
      let sx = 0, sy = 0, sw = 0;
      for (const f of features) {
        const name = resolveDataName(f.properties || {}, indexes, f.id);
        if (!name || regionByCountryName[name] !== selectedName) continue;
        const a = Math.abs(path.area(f));
        const c = path.centroid(f);
        if (!a || !Number.isFinite(c[0])) continue;
        sx += c[0] * a;
        sy += c[1] * a;
        sw += a;
      }
      if (sw > 0) centroid = [sx / sw, sy / sw];
    } else {
      rec = snapshot.countries[selectedName];
      let best: any = null, bestArea = -1;
      for (const f of features) {
        const name = resolveDataName(f.properties || {}, indexes, f.id);
        if (name !== selectedName) continue;
        const a = Math.abs(path.area(f));
        if (a > bestArea) {
          bestArea = a;
          best = f;
        }
      }
      if (best) centroid = path.centroid(best);
    }
    if (!rec || !centroid || !Number.isFinite(centroid[0])) continue;

    const lines = tagLines(rec, tagFields, mode);
    const boxW = 200;
    const boxH = 16 + lines.length * 16;
    const panX = pan?.[0] || 0;
    const panY = pan?.[1] || 0;
    const visLeft = 6 - panX;
    const visTop = 6 - panY;
    const visRight = W - 6 - panX;
    const visBottom = H - 6 - panY;
    const defX = Math.max(visLeft, Math.min(visRight - boxW, centroid[0] - boxW / 2));
    const defY = Math.max(visTop, Math.min(visBottom - boxH, centroid[1] - boxH - 16));
    const userOff = pinOffsets[selectedName] || { dx: 0, dy: 0 };
    let curDx = userOff.dx || 0;
    let curDy = userOff.dy || 0;

    const pin = g.append("g").attr("class", "selection-pin").style("cursor", "grab");
    const stem = pin
      .append("line")
      .attr("x2", centroid[0])
      .attr("y2", centroid[1])
      .attr("stroke", "#fbbf24")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "3 2")
      .attr("opacity", tagOpacity)
      .style("pointer-events", "none");
    pin.append("circle").attr("cx", centroid[0]).attr("cy", centroid[1]).attr("r", 4).attr("fill", "#fbbf24").attr("opacity", tagOpacity).style("pointer-events", "none");

    const card = pin.append("g").attr("transform", `translate(${curDx},${curDy})`).attr("opacity", tagOpacity);
    card.append("rect").attr("x", defX).attr("y", defY).attr("width", boxW).attr("height", boxH).attr("rx", 8).attr("fill", "rgba(15,23,42,0.94)").attr("stroke", "#fbbf24").attr("stroke-width", 1.5);

    let iso2 = selectedIso2ByName[selectedName] || rec.iso2;
    const flagUrl = mode === "regions" || !tagFields.includes("flag") ? null : flagImageUrl(selectedName, iso2, 80);
    let textLeft = defX + 10;
    if (flagUrl) {
      card.append("image").attr("href", flagUrl).attr("x", textLeft).attr("y", defY + 8).attr("width", 28).attr("height", 18);
      textLeft += 36;
    }
    lines.forEach((line: string, i: number) => {
      card
        .append("text")
        .attr("x", i === 0 ? textLeft : defX + 10)
        .attr("y", defY + 18 + i * 16)
        .attr("fill", i === 0 ? "#f8fafc" : "#fbbf24")
        .attr("font-size", i === 0 ? 13 : 11)
        .attr("font-weight", i === 0 ? 700 : 500)
        .attr("font-family", i === 0 ? "DM Sans, system-ui" : "JetBrains Mono, monospace")
        .text(line);
    });

    const updateStem = (dx: number, dy: number) => {
      stem.attr("x1", Math.max(defX + dx + 8, Math.min(defX + dx + boxW - 8, centroid![0]))).attr("y1", defY + dy + boxH);
    };
    updateStem(curDx, curDy);
    card.call(
      d3
        .drag()
        .clickDistance(4)
        .on("start", (event: any) => {
          event.sourceEvent?.stopPropagation();
          pin.style("cursor", "grabbing");
        })
        .on("drag", (event: any) => {
          event.sourceEvent?.stopPropagation();
          curDx += event.dx;
          curDy += event.dy;
          const nx = Math.max(visLeft, Math.min(visRight - boxW, defX + curDx));
          const ny = Math.max(visTop, Math.min(visBottom - boxH, defY + curDy));
          curDx = nx - defX;
          curDy = ny - defY;
          card.attr("transform", `translate(${curDx},${curDy})`);
          updateStem(curDx, curDy);
          onPinDrag(selectedName, { dx: curDx, dy: curDy }, { live: true });
        })
        .on("end", (event: any) => {
          event.sourceEvent?.stopPropagation();
          pin.style("cursor", "grab");
          onPinDrag(selectedName, { dx: curDx, dy: curDy }, { live: false });
        })
    );
  }
}

function tagLines(rec: any, fields: TagField[], mode: string) {
  const lines: string[] = [];
  const name = mode === "regions" ? regionName(rec.name) : displayName(rec);
  if (fields.includes("name")) lines.push(name);
  if (fields.includes("population")) lines.push(`${formatPop(rec.population)} ${t("metrics.population.unit")}`);
  if (fields.includes("tfr")) lines.push(`${t("hover.tfr")} ${Number(rec.tfr).toFixed(2)}`);
  if (fields.includes("vsReplacement")) {
    const d = rec.tfr / REPLACEMENT_TFR - 1;
    lines.push(`${d >= 0 ? "+" : ""}${(d * 100).toFixed(0)}% ${t("tags.vsReplacement")}`);
  }
  if (fields.includes("fertilityGap") && rec.fertilityGap != null) lines.push(`${t("hover.gap")} ${rec.fertilityGap >= 0 ? "+" : ""}${Number(rec.fertilityGap).toFixed(2)}`);
  if (fields.includes("medianAge")) lines.push(`${t("hover.median")} ${Number(rec.medianAge).toFixed(1)}`);
  if (fields.includes("elderly")) lines.push(`${t("hover.elderly")} ${Number(rec.elderlyPct).toFixed(1)}%`);
  if (fields.includes("year")) lines.push(`${t("hover.year")} ${rec.year}`);
  if (fields.includes("netMigration") && rec.netMigration != null) lines.push(`${t("tags.netMigration")} ${formatPop(rec.netMigration)}`);
  return lines.length ? lines : [name];
}

export function formatHeatmapMetric(rec: any, metricId?: string | null) {
  const id = metricId || "";
  const def = METRIC_BY_ID[id];
  if (!id || !rec) return null;
  const v = metricValue(rec, id);
  const label = tOr(`metrics.${id}.label`, def?.label || id);
  if (v == null || !Number.isFinite(v)) return { label, text: "—" };
  const unit = tOr(`metrics.${id}.unit`, def?.unit || "");
  let text: string;
  if (id === "population" || id === "netMigration" || unit === "people") text = formatPop(v);
  else if (unit === "%" || id === "popShare" || id === "elderly" || id === "youth") text = `${v.toFixed(2)}%`;
  else if (id === "medianAge" || id === "e0") text = v.toFixed(1) + (unit ? ` ${unit}` : "");
  else if (id === "netMigrationRate") text = `${v >= 0 ? "+" : ""}${v.toFixed(2)} ${unit}`;
  else if (id === "tfrVsReplacement" || id === "fertilityGap") text = `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  else text = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  if (unit && unit !== "people" && unit !== "%" && id !== "medianAge" && id !== "e0" && id !== "netMigrationRate") {
    text += ` ${unit}`;
  }
  return { label, text };
}

export function hoverHtml(rec: any, meta: any = {}) {
  if (!rec) {
    return `<div class="map-hover-title">${meta.mapName || t("map.noData")}</div><div class="map-hover-muted">${t("map.noSim")}</div>`;
  }
  const title = meta.kind === "region" ? regionName(rec.name) : displayName(rec);
  const metric = formatHeatmapMetric(rec, meta.metricId);
  const metricRow = metric
    ? `<div class="map-hover-row heatmap-metric"><span>${metric.label}</span><strong>${metric.text}</strong></div>`
    : "";
  const gap =
    rec.fertilityGap != null
      ? `<div class="map-hover-row"><span>${t("hover.gap")}</span><strong>${Number(rec.fertilityGap).toFixed(2)}</strong></div>`
      : "";
  return `
    <div class="map-hover-title">${title}</div>
    ${metricRow}
    <div class="map-hover-row"><span>${t("hover.year")}</span><strong>${rec.year ?? "—"}</strong></div>
    <div class="map-hover-row"><span>${t("hover.population")}</span><strong>${formatPop(rec.population)}</strong></div>
    <div class="map-hover-row"><span>${t("hover.tfr")}</span><strong>${Number(rec.tfr).toFixed(2)}</strong></div>
    ${gap}
    <div class="map-hover-row"><span>${t("hover.median")}</span><strong>${Number(rec.medianAge).toFixed(1)}</strong></div>
    <div class="map-hover-row"><span>${t("hover.elderly")}</span><strong>${Number(rec.elderlyPct).toFixed(1)}%</strong></div>
  `;
}
