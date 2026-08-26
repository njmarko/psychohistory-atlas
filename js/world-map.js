/**
 * World / region choropleth map using D3 + world-atlas TopoJSON.
 * Fill color = population heatmap (share or absolute).
 * Optional dual mode: stroke intensity/color tracks TFR vs replacement.
 */

import { REPLACEMENT_TFR, formatPop } from "./world-sim.js";
import { flagImageUrl, getFlagEmoji } from "./flags.js";

// ISO_N3 (numeric) on natural earth → our iso3
// Natural Earth properties: ISO_A2, ISO_A3, NAME, CONTINENT

const NAME_ALIASES = {
  "United States of America": "United States",
  "Czechia": "Czech Republic",
  "Czech Republic": "Czech Republic",
  "Bosnia and Herz.": "Bosnia and Herzegovina",
  "Bosnia and Herzegovina": "Bosnia and Herzegovina",
  "North Macedonia": "North Macedonia",
  Macedonia: "North Macedonia",
  "Dem. Rep. Congo": "DR Congo",
  "Democratic Republic of the Congo": "DR Congo",
  Congo: "Congo",
  "Central African Rep.": "Central African Republic",
  "S. Sudan": "South Sudan",
  "South Sudan": "South Sudan",
  "Eq. Guinea": "Equatorial Guinea",
  "Dominican Rep.": "Dominican Republic",
  "Solomon Is.": "Solomon Islands",
  "Côte d'Ivoire": "Ivory Coast",
  "Ivory Coast": "Ivory Coast",
  eSwatini: "Eswatini",
  Swaziland: "Eswatini",
  "Timor-Leste": "Timor-Leste",
  "W. Sahara": "Western Sahara",
  "Falkland Is.": "Falkland Islands",
  "Fr. S. Antarctic Lands": null,
  Antarctica: null,
  "N. Cyprus": null,
  "Somaliland": null,
  // Treat Kosovo as part of Serbia (not a separate country in this app)
  Kosovo: "Serbia",
  "Republic of Kosovo": "Serbia",
  "Kosovo under UNSC res. 1244": "Serbia",
  Taiwan: "Taiwan",
  "South Korea": "South Korea",
  "North Korea": "North Korea",
  "Korea": "South Korea",
  "Republic of Korea": "South Korea",
  "Dem. Rep. Korea": "North Korea",
  Russia: "Russia",
  "Russian Federation": "Russia",
  Syria: "Syria",
  "Syrian Arab Republic": "Syria",
  Iran: "Iran",
  "Iran (Islamic Republic of)": "Iran",
  Venezuela: "Venezuela",
  Bolivia: "Bolivia",
  Tanzania: "Tanzania",
  "United Republic of Tanzania": "Tanzania",
  Laos: "Laos",
  "Lao PDR": "Laos",
  Moldova: "Moldova",
  "Republic of Moldova": "Moldova",
  Vietnam: "Vietnam",
  "Viet Nam": "Vietnam",
  "Brunei": "Brunei",
  "Palestine": "Palestine",
  "West Bank": "Palestine",
};

let d3 = null;
let topojson = null;
let worldTopo = null;
let countriesGeo = null;
let pathCache = null;

export async function loadMapLibs() {
  if (d3 && topojson && countriesGeo) return { d3, topojson, countriesGeo };

  // Dynamic import from CDN (ESM builds)
  const [d3mod, topomod, topo] = await Promise.all([
    import("https://cdn.jsdelivr.net/npm/d3@7/+esm"),
    import("https://cdn.jsdelivr.net/npm/topojson-client@3/+esm"),
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then((r) =>
      r.json()
    ),
  ]);
  d3 = d3mod;
  topojson = topomod;
  worldTopo = topo;
  countriesGeo = topojson.feature(worldTopo, worldTopo.objects.countries);
  return { d3, topojson, countriesGeo };
}

function resolveDataName(props, iso3Index, iso2Index, nameIndex) {
  const a3 = props.ISO_A3 || props.iso_a3 || props.ADM0_A3;
  const a2 = props.ISO_A2 || props.iso_a2;
  // world-atlas countries-110m uses id = ISO numeric as string, properties only name sometimes
  // Actually world-atlas 2 countries have properties: name only in some builds; id is numeric ISO
  if (a3 && iso3Index[a3]) return iso3Index[a3];
  if (a2 && a2 !== "-99" && iso2Index[a2]) return iso2Index[a2];

  const rawName = props.name || props.NAME || props.NAME_EN || props.ADMIN || "";
  // Alias first so "Kosovo" → "Serbia" even if a separate Kosovo key existed
  const aliased = NAME_ALIASES[rawName];
  if (aliased != null) {
    if (aliased === null) return null;
    if (nameIndex[aliased]) return aliased;
  }
  if (nameIndex[rawName]) return nameIndex[rawName];
  if (aliased && nameIndex[aliased]) return aliased;
  return null;
}

/**
 * Build lookup from our country records.
 */
export function buildIndexes(byCountryOrSnapshot) {
  const iso3Index = {};
  const iso2Index = {};
  const isoNumIndex = {};
  const nameIndex = {};
  for (const [name, rec] of Object.entries(byCountryOrSnapshot)) {
    nameIndex[name] = name;
    if (rec.iso3) iso3Index[rec.iso3] = name;
    if (rec.iso2) iso2Index[rec.iso2] = name;
    if (rec.isoNum != null) isoNumIndex[Number(rec.isoNum)] = name;
  }
  return { iso3Index, iso2Index, isoNumIndex, nameIndex };
}

/**
 * Sequential color for population share / size.
 * t in [0,1]; lowColor → highColor (user-customizable).
 */
export function popColor(t, d3, lowColor = "#ffffff", highColor = "#0284c7") {
  const u = Math.max(0, Math.min(1, t));
  // slight gamma so mid values stay readable
  const eased = Math.pow(u, 0.85);
  try {
    return d3.interpolateRgb(lowColor, highColor)(eased);
  } catch {
    return highColor;
  }
}

/**
 * TFR vs replacement: lowColor at low fertility, mid neutral at ~2.1, highColor above.
 * If only low/high given, interpolates through a muted midpoint.
 */
export function tfrColor(tfr, d3, lowColor = "#3b82f6", highColor = "#ef4444", midColor = null) {
  const ratio = tfr / REPLACEMENT_TFR;
  // 0.5× replacement → 0, 1× → 0.5, 2.5× → 1
  const t =
    (Math.log(Math.max(0.25, Math.min(3, ratio))) - Math.log(0.25)) /
    (Math.log(3) - Math.log(0.25));
  const mid = midColor || "#cbd5e1";
  try {
    if (t <= 0.5) {
      return d3.interpolateRgb(lowColor, mid)(t * 2);
    }
    return d3.interpolateRgb(mid, highColor)((t - 0.5) * 2);
  } catch {
    return highColor;
  }
}

export function metricValue(rec, metric) {
  if (!rec) return null;
  switch (metric) {
    case "popShare":
      return rec.worldShare;
    case "population":
      return rec.population;
    case "tfr":
      return rec.tfr;
    case "tfrRatio":
      return rec.tfr / REPLACEMENT_TFR;
    default:
      return rec.worldShare;
  }
}

/**
 * Draw choropleth into an SVG element.
 */
export async function renderWorldMap(svgEl, options) {
  const {
    mode = "countries", // countries | regions
    snapshot, // { countries, worldPop }
    regionSnapshot, // { regions, worldPop }
    metric = "popShare", // popShare | population | tfr | dual
    bgColor = "#0F172A",
    /** Heatmap low end (e.g. reddish) */
    heatLow = "#fef08a",
    /** Heatmap high end (e.g. blue/green) */
    heatHigh = "#1d4ed8",
    /** For TFR mode: color below replacement */
    tfrLow = "#3b82f6",
    /** For TFR mode: color above replacement */
    tfrHigh = "#ef4444",
    /**
     * Selected country/region names to pin (multi-select).
     * Accepts string[] or a single string for compatibility.
     */
    selectedNames = null,
    /** @deprecated use selectedNames */
    selectedName = null,
    /** Optional map of name → ISO2 for flags */
    selectedIso2ByName = null,
    /** Optional ISO2 when only one selection (compat) */
    selectedIso2 = null,
    /**
     * User-dragged pin offsets: { [name]: { dx, dy } }
     * Applied so labels can be moved off the country.
     */
    pinOffsets = null,
    width = 960,
    height = 520,
    onHover = () => {},
    onLeave = () => {},
    onClick = () => {},
    onDblClick = () => {},
    /** Called while / after dragging a pin: (name, {dx, dy}) */
    onPinDrag = () => {},
  } = options;

  const colorOpts = { heatLow, heatHigh, tfrLow, tfrHigh };
  const selectedSet = toSelectedSet(selectedNames, selectedName);

  await loadMapLibs();

  const W = width;
  const H = height;
  svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svgEl.style.background = bgColor;
  svgEl.innerHTML = "";

  const projection = d3
    .geoNaturalEarth1()
    .fitSize([W - 8, H - 8], { type: "Sphere" });
  const path = d3.geoPath(projection);

  const g = d3.select(svgEl);
  g.append("rect")
    .attr("width", W)
    .attr("height", H)
    .attr("fill", bgColor);

  g.append("path")
    .datum({ type: "Sphere" })
    .attr("d", path)
    .attr("fill", d3.color(bgColor).brighter(0.3))
    .attr("stroke", "#334155")
    .attr("stroke-width", 0.6);

  // Build value domain
  let values = [];
  let dataByName = {};
  let regionByCountryName = {};

  if (mode === "regions" && regionSnapshot) {
    dataByName = regionSnapshot.regions;
    // map each country feature to its region name via our country list
    for (const rec of Object.values(snapshot.countries)) {
      regionByCountryName[rec.name] = rec.region;
    }
    values = Object.values(dataByName).map((r) => metricValue(r, metric === "dual" ? "popShare" : metric));
  } else {
    dataByName = snapshot.countries;
    values = Object.values(dataByName).map((r) =>
      metricValue(r, metric === "dual" ? "popShare" : metric)
    );
  }

  values = values.filter((v) => v != null && Number.isFinite(v) && v > 0);
  let scale;
  const fillMetric = metric === "dual" ? "popShare" : metric;

  if (fillMetric === "tfr" || fillMetric === "tfrRatio") {
    // color handled per-feature via tfrColor
    scale = null;
  } else if (fillMetric === "population") {
    const max = d3.max(values) || 1;
    scale = d3.scaleSqrt().domain([0, max]).range([0, 1]);
  } else {
    // popShare — log-ish so large countries don't dominate too hard
    const max = d3.max(values) || 1;
    scale = d3.scaleSqrt().domain([0, max]).range([0, 1]);
  }

  const indexes = buildIndexes(snapshot.countries);

  // Natural Earth via world-atlas: features have .id = ISO 3166-1 numeric, .properties.name
  // We also match by iso3 if we can map numeric id → iso3 (optional)

  const noDataFill = "#1e293b";
  const features = countriesGeo.features;

  const paths = g
    .append("g")
    .attr("class", "countries")
    .selectAll("path")
    .data(features)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 0.35)
    .attr("fill", (d) => {
      const name = resolveDataName(d.properties || {}, indexes.iso3Index, indexes.iso2Index, indexes.nameIndex)
        || matchByNumericId(d.id, indexes)
        || null;

      if (mode === "regions") {
        const regionName = name ? regionByCountryName[name] : null;
        const rec = regionName ? dataByName[regionName] : null;
        if (!rec) return noDataFill;
        return colorForRecord(rec, metric, scale, d3, colorOpts);
      }

      const rec = name ? snapshot.countries[name] : null;
      if (!rec) return noDataFill;
      return colorForRecord(rec, metric, scale, d3, colorOpts);
    })
    .attr("data-name", (d) => {
      return (
        resolveDataName(d.properties || {}, indexes.iso3Index, indexes.iso2Index, indexes.nameIndex) ||
        matchByNumericId(d.id, indexes) ||
        d.properties?.name ||
        ""
      );
    })
    .style("cursor", "pointer")
    .attr("stroke", (d) => strokeForFeature(d, metric, indexes, mode, regionByCountryName, dataByName, snapshot, selectedSet, tfrLow, tfrHigh, d3))
    .attr("stroke-width", (d) => {
      const name =
        resolveDataName(d.properties || {}, indexes.iso3Index, indexes.iso2Index, indexes.nameIndex) ||
        matchByNumericId(d.id, indexes);
      if (mode === "regions") {
        const regionName = name ? regionByCountryName[name] : null;
        return regionName && selectedSet.has(regionName) ? 1.6 : metric === "dual" ? 0.9 : 0.35;
      }
      return name && selectedSet.has(name) ? 1.8 : metric === "dual" ? 0.9 : 0.35;
    })
    .on("pointerenter", function (event, d) {
      const name =
        resolveDataName(d.properties || {}, indexes.iso3Index, indexes.iso2Index, indexes.nameIndex) ||
        matchByNumericId(d.id, indexes);
      const isSel =
        mode === "regions"
          ? name && selectedSet.has(regionByCountryName[name])
          : name && selectedSet.has(name);
      if (!isSel) d3.select(this).attr("stroke", "#f8fafc").attr("stroke-width", 1.2);
      if (mode === "regions") {
        const regionName = name ? regionByCountryName[name] : null;
        const rec = regionName ? dataByName[regionName] : null;
        onHover(rec, event, { kind: "region", countryName: name, mapName: d.properties?.name });
      } else {
        const rec = name ? snapshot.countries[name] : null;
        onHover(rec, event, { kind: "country", countryName: name, mapName: d.properties?.name });
      }
    })
    .on("pointermove", function (event, d) {
      const name =
        resolveDataName(d.properties || {}, indexes.iso3Index, indexes.iso2Index, indexes.nameIndex) ||
        matchByNumericId(d.id, indexes);
      if (mode === "regions") {
        const regionName = name ? regionByCountryName[name] : null;
        const rec = regionName ? dataByName[regionName] : null;
        onHover(rec, event, { kind: "region", countryName: name, mapName: d.properties?.name });
      } else {
        const rec = name ? snapshot.countries[name] : null;
        onHover(rec, event, { kind: "country", countryName: name, mapName: d.properties?.name });
      }
    })
    .on("pointerleave", function (event, d) {
      const name =
        resolveDataName(d.properties || {}, indexes.iso3Index, indexes.iso2Index, indexes.nameIndex) ||
        matchByNumericId(d.id, indexes);
      d3.select(this)
        .attr(
          "stroke",
          strokeForFeature(d, metric, indexes, mode, regionByCountryName, dataByName, snapshot, selectedSet, tfrLow, tfrHigh, d3)
        )
        .attr("stroke-width", () => {
          if (mode === "regions") {
            const regionName = name ? regionByCountryName[name] : null;
            return regionName && selectedSet.has(regionName) ? 1.6 : metric === "dual" ? 0.9 : 0.35;
          }
          return name && selectedSet.has(name) ? 1.8 : metric === "dual" ? 0.9 : 0.35;
        });
      onLeave();
    })
    .on("click", function (event, d) {
      event.stopPropagation();
      const name =
        resolveDataName(d.properties || {}, indexes.iso3Index, indexes.iso2Index, indexes.nameIndex) ||
        matchByNumericId(d.id, indexes);
      if (mode === "regions") {
        const regionName = name ? regionByCountryName[name] : null;
        if (regionName) onClick(regionName, event, { kind: "region" });
      } else if (name) {
        onClick(name, event, { kind: "country" });
      }
    })
    .on("dblclick", function (event, d) {
      event.stopPropagation();
      const name =
        resolveDataName(d.properties || {}, indexes.iso3Index, indexes.iso2Index, indexes.nameIndex) ||
        matchByNumericId(d.id, indexes);
      if (mode !== "regions" && name) onDblClick(name, event);
    });

  // Pin labels above all selected countries / regions
  if (selectedSet.size > 0) {
    drawSelectionPins(g, {
      d3,
      path,
      features,
      indexes,
      mode,
      selectedSet,
      selectedIso2ByName: selectedIso2ByName || (selectedIso2 && selectedName ? { [selectedName]: selectedIso2 } : {}),
      pinOffsets: pinOffsets || {},
      snapshot,
      dataByName,
      regionByCountryName,
      W,
      H,
      onPinDrag,
    });
  }

  // Legend
  drawLegend(g, { W, H, metric, scale, d3, values, colorOpts });

  return { path, projection };
}

function toSelectedSet(selectedNames, selectedName) {
  const set = new Set();
  if (Array.isArray(selectedNames)) {
    for (const n of selectedNames) if (n) set.add(n);
  } else if (selectedNames instanceof Set) {
    for (const n of selectedNames) if (n) set.add(n);
  } else if (selectedNames && typeof selectedNames === "string") {
    set.add(selectedNames);
  }
  if (selectedName) set.add(selectedName);
  return set;
}

function strokeForFeature(
  d,
  metric,
  indexes,
  mode,
  regionByCountryName,
  dataByName,
  snapshot,
  selectedSet,
  tfrLow,
  tfrHigh,
  d3
) {
  const name =
    resolveDataName(d.properties || {}, indexes.iso3Index, indexes.iso2Index, indexes.nameIndex) ||
    matchByNumericId(d.id, indexes);

  if (mode === "regions") {
    const regionName = name ? regionByCountryName[name] : null;
    if (regionName && selectedSet.has(regionName)) return "#fbbf24";
  } else if (name && selectedSet.has(name)) {
    return "#fbbf24";
  }

  if (metric === "dual") {
    if (mode === "regions") {
      const regionName = name ? regionByCountryName[name] : null;
      const rec = regionName ? dataByName[regionName] : null;
      return rec ? tfrColor(rec.tfr, d3, tfrLow, tfrHigh) : "#0f172a";
    }
    const rec = name ? snapshot.countries[name] : null;
    return rec ? tfrColor(rec.tfr, d3, tfrLow, tfrHigh) : "#0f172a";
  }
  return "#0f172a";
}

function centroidForSelection(
  selectedName,
  mode,
  path,
  features,
  indexes,
  snapshot,
  dataByName,
  regionByCountryName
) {
  let rec = null;
  let centroid = null;

  if (mode === "regions") {
    rec = dataByName[selectedName] || null;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (const f of features) {
      const name =
        resolveDataName(f.properties || {}, indexes.iso3Index, indexes.iso2Index, indexes.nameIndex) ||
        matchByNumericId(f.id, indexes);
      if (!name || regionByCountryName[name] !== selectedName) continue;
      const a = Math.abs(path.area(f));
      if (!a || !Number.isFinite(a)) continue;
      const c = path.centroid(f);
      if (!Number.isFinite(c[0])) continue;
      sx += c[0] * a;
      sy += c[1] * a;
      sw += a;
    }
    if (sw > 0) centroid = [sx / sw, sy / sw];
  } else {
    rec = snapshot.countries[selectedName] || null;
    let best = null;
    let bestArea = -1;
    for (const f of features) {
      const name =
        resolveDataName(f.properties || {}, indexes.iso3Index, indexes.iso2Index, indexes.nameIndex) ||
        matchByNumericId(f.id, indexes);
      if (name !== selectedName) continue;
      const a = Math.abs(path.area(f));
      if (a > bestArea) {
        bestArea = a;
        best = f;
      }
    }
    if (best) centroid = path.centroid(best);
  }

  return { rec, centroid };
}

/**
 * Draw flag + name + population pins for every selected area.
 * Nudges labels slightly when they would stack on top of each other.
 */
function drawSelectionPins(
  g,
  {
    d3,
    path,
    features,
    indexes,
    mode,
    selectedSet,
    selectedIso2ByName = {},
    pinOffsets = {},
    snapshot,
    dataByName,
    regionByCountryName,
    W,
    H,
    onPinDrag = () => {},
  }
) {
  const placed = [];
  const names = [...selectedSet].sort();

  for (let i = 0; i < names.length; i++) {
    const selectedName = names[i];
    const { rec, centroid } = centroidForSelection(
      selectedName,
      mode,
      path,
      features,
      indexes,
      snapshot,
      dataByName,
      regionByCountryName
    );
    if (!rec || !centroid || !Number.isFinite(centroid[0])) continue;

    const [cx, cy] = centroid;
    const popText = formatPop(rec.population);
    const emoji = mode === "regions" ? "🌐" : getFlagEmoji(selectedName);
    const iso2 = selectedIso2ByName[selectedName] || rec.iso2;
    const flagUrl = mode === "regions" ? null : flagImageUrl(selectedName, iso2, 80);
    const title =
      mode === "regions"
        ? selectedName
        : selectedName === "Serbia"
          ? "Serbia (incl. Kosovo)"
          : selectedName;

    const flagW = 28;
    const flagH = 18;
    const padX = 10;
    const padY = 8;
    const nameFont = 13;
    const popFont = 12;
    const nameW = Math.min(200, title.length * 7.2);
    const popW = Math.min(140, (popText + " people").length * 7.2);
    const contentW = Math.max(nameW, popW) + (flagUrl || emoji ? flagW + 8 : 0);
    const boxW = contentW + padX * 2;
    const boxH = 44;
    const gap = 10;
    const userOff = pinOffsets[selectedName] || { dx: 0, dy: 0 };

    // Default resting position (no user drag) with auto-nudge
    let defX = cx - boxW / 2;
    let defY = cy - boxH - gap - 8;
    if (!userOff.dx && !userOff.dy) {
      for (let attempt = 0; attempt < 12; attempt++) {
        let hit = false;
        for (const p of placed) {
          if (rectsOverlap(defX, defY, boxW, boxH, p.x, p.y, p.w, p.h, 6)) {
            hit = true;
            break;
          }
        }
        if (!hit) break;
        defY -= 18;
        if (attempt % 2 === 1) defX += (attempt % 4 === 1 ? 1 : -1) * 24;
      }
    }
    defX = Math.max(6, Math.min(W - boxW - 6, defX));
    defY = Math.max(6, Math.min(H - boxH - 6, defY));

    let curDx = userOff.dx || 0;
    let curDy = userOff.dy || 0;
    // clamp initial user offset so card stays on map
    {
      const nx = Math.max(6, Math.min(W - boxW - 6, defX + curDx));
      const ny = Math.max(6, Math.min(H - boxH - 6, defY + curDy));
      curDx = nx - defX;
      curDy = ny - defY;
    }

    placed.push({
      x: defX + curDx,
      y: defY + curDy,
      w: boxW,
      h: boxH,
    });

    const pin = g
      .append("g")
      .attr("class", "selection-pin")
      .attr("data-name", selectedName)
      .style("cursor", "grab");

    const stem = pin
      .append("line")
      .attr("class", "pin-stem")
      .attr("x2", cx)
      .attr("y2", cy)
      .attr("stroke", "#fbbf24")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "3 2")
      .attr("opacity", 0.9)
      .style("pointer-events", "none");

    pin
      .append("circle")
      .attr("class", "pin-anchor")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", 4)
      .attr("fill", "#fbbf24")
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 1)
      .style("pointer-events", "none");

    // Card drawn at default coords; moved via transform(dx,dy)
    const card = pin
      .append("g")
      .attr("class", "pin-card")
      .attr("transform", `translate(${curDx},${curDy})`);

    card
      .append("rect")
      .attr("x", defX + 2)
      .attr("y", defY + 3)
      .attr("width", boxW)
      .attr("height", boxH)
      .attr("rx", 8)
      .attr("fill", "rgba(0,0,0,0.35)");

    card
      .append("rect")
      .attr("class", "pin-bg")
      .attr("x", defX)
      .attr("y", defY)
      .attr("width", boxW)
      .attr("height", boxH)
      .attr("rx", 8)
      .attr("fill", "rgba(15, 23, 42, 0.94)")
      .attr("stroke", "#fbbf24")
      .attr("stroke-width", 1.5);

    let textLeft = defX + padX;
    if (flagUrl) {
      card
        .append("image")
        .attr("href", flagUrl)
        .attr("x", textLeft)
        .attr("y", defY + (boxH - flagH) / 2)
        .attr("width", flagW)
        .attr("height", flagH)
        .attr("preserveAspectRatio", "xMidYMid slice");
      card
        .append("rect")
        .attr("x", textLeft)
        .attr("y", defY + (boxH - flagH) / 2)
        .attr("width", flagW)
        .attr("height", flagH)
        .attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,0.25)")
        .attr("stroke-width", 0.8);
      textLeft += flagW + 8;
    } else if (emoji) {
      card
        .append("text")
        .attr("x", textLeft)
        .attr("y", defY + boxH / 2 + 1)
        .attr("dominant-baseline", "middle")
        .attr("font-size", 16)
        .text(emoji);
      textLeft += 22;
    }

    card
      .append("text")
      .attr("x", textLeft)
      .attr("y", defY + padY + nameFont - 2)
      .attr("fill", "#f8fafc")
      .attr("font-size", nameFont)
      .attr("font-weight", 700)
      .attr("font-family", "DM Sans, system-ui, sans-serif")
      .text(title);

    card
      .append("text")
      .attr("x", textLeft)
      .attr("y", defY + boxH - padY)
      .attr("fill", "#fbbf24")
      .attr("font-size", popFont)
      .attr("font-weight", 600)
      .attr("font-family", "JetBrains Mono, ui-monospace, monospace")
      .text(popText + " people");

    card
      .append("text")
      .attr("x", defX + boxW - 10)
      .attr("y", defY + 14)
      .attr("text-anchor", "end")
      .attr("fill", "#64748b")
      .attr("font-size", 10)
      .attr("font-family", "system-ui, sans-serif")
      .text("⠿");

    const updateStem = (dx, dy) => {
      const bx = defX + dx;
      const by = defY + dy;
      stem
        .attr("x1", Math.max(bx + 8, Math.min(bx + boxW - 8, cx)))
        .attr("y1", by + boxH);
    };
    updateStem(curDx, curDy);

    card.call(
      d3
        .drag()
        .clickDistance(4)
        .on("start", function (event) {
          event.sourceEvent?.stopPropagation();
          pin.style("cursor", "grabbing");
          pin.raise();
        })
        .on("drag", function (event) {
          event.sourceEvent?.stopPropagation();
          curDx += event.dx;
          curDy += event.dy;
          const nx = Math.max(6, Math.min(W - boxW - 6, defX + curDx));
          const ny = Math.max(6, Math.min(H - boxH - 6, defY + curDy));
          curDx = nx - defX;
          curDy = ny - defY;
          card.attr("transform", `translate(${curDx},${curDy})`);
          updateStem(curDx, curDy);
          onPinDrag(selectedName, { dx: curDx, dy: curDy }, { live: true });
        })
        .on("end", function (event) {
          event.sourceEvent?.stopPropagation();
          pin.style("cursor", "grab");
          onPinDrag(selectedName, { dx: curDx, dy: curDy }, { live: false });
        })
    );
  }
}

function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2, pad = 0) {
  return !(
    x1 + w1 + pad < x2 ||
    x2 + w2 + pad < x1 ||
    y1 + h1 + pad < y2 ||
    y2 + h2 + pad < y1
  );
}

function colorForRecord(rec, metric, scale, d3, colorOpts = {}) {
  const { heatLow = "#ffffff", heatHigh = "#0284c7", tfrLow = "#3b82f6", tfrHigh = "#ef4444" } =
    colorOpts;
  if (metric === "tfr" || metric === "tfrRatio") {
    return tfrColor(rec.tfr, d3, tfrLow, tfrHigh);
  }
  if (metric === "dual") {
    const t = scale ? scale(rec.worldShare || 0) : 0;
    return popColor(t, d3, heatLow, heatHigh);
  }
  if (metric === "population") {
    const t = scale ? scale(rec.population || 0) : 0;
    return popColor(t, d3, heatLow, heatHigh);
  }
  // popShare default
  const t = scale ? scale(rec.worldShare || 0) : 0;
  return popColor(t, d3, heatLow, heatHigh);
}

function matchByNumericId(id, indexes) {
  // world-atlas uses numeric ISO 3166-1 as feature id
  if (id == null || !indexes.isoNumIndex) return null;
  const n = Number(id);
  if (Number.isFinite(n) && indexes.isoNumIndex[n]) return indexes.isoNumIndex[n];
  const s = String(id).replace(/^0+/, "") || "0";
  const n2 = Number(s);
  return indexes.isoNumIndex[n2] || null;
}

function drawLegend(g, { W, H, metric, scale, d3, values, colorOpts = {} }) {
  const { heatLow = "#ffffff", heatHigh = "#0284c7", tfrLow = "#3b82f6", tfrHigh = "#ef4444" } =
    colorOpts;
  const legend = g.append("g").attr("transform", `translate(16, ${H - 48})`);
  legend
    .append("rect")
    .attr("x", -8)
    .attr("y", -14)
    .attr("width", 280)
    .attr("height", 44)
    .attr("rx", 6)
    .attr("fill", "rgba(15,23,42,0.85)")
    .attr("stroke", "#334155");

  let label = "Population share of world";
  if (metric === "population") label = "Population size";
  if (metric === "tfr" || metric === "tfrRatio") label = `TFR vs replacement (${REPLACEMENT_TFR})`;
  if (metric === "dual") label = "Fill: pop. share · Border: TFR vs 2.1";

  legend
    .append("text")
    .attr("x", 0)
    .attr("y", 0)
    .attr("fill", "#94a3b8")
    .attr("font-size", 10)
    .attr("font-family", "DM Sans, system-ui, sans-serif")
    .text(label);

  if (metric === "tfr" || metric === "tfrRatio") {
    const tfrs = [1.0, 1.5, 2.1, 3.0, 4.5];
    tfrs.forEach((tfr, i) => {
      legend
        .append("rect")
        .attr("x", i * 48)
        .attr("y", 8)
        .attr("width", 44)
        .attr("height", 10)
        .attr("fill", tfrColor(tfr, d3, tfrLow, tfrHigh));
      legend
        .append("text")
        .attr("x", i * 48 + 22)
        .attr("y", 28)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b")
        .attr("font-size", 9)
        .attr("font-family", "JetBrains Mono, monospace")
        .text(tfr.toFixed(1));
    });
  } else if (scale) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      legend
        .append("rect")
        .attr("x", i * 36)
        .attr("y", 8)
        .attr("width", 34)
        .attr("height", 10)
        .attr("fill", popColor(t, d3, heatLow, heatHigh));
    }
    legend
      .append("text")
      .attr("x", 0)
      .attr("y", 28)
      .attr("fill", "#64748b")
      .attr("font-size", 9)
      .text("low");
    legend
      .append("text")
      .attr("x", (n - 1) * 36 + 34)
      .attr("y", 28)
      .attr("text-anchor", "end")
      .attr("fill", "#64748b")
      .attr("font-size", 9)
      .text("high");
  }
}

export function hoverHtml(rec, meta = {}) {
  if (!rec) {
    return `<div class="map-hover-title">${meta.mapName || "No data"}</div>
      <div class="map-hover-muted">No simulation data for this area</div>`;
  }
  const isRegion = meta.kind === "region";
  const kosovoNote =
    !isRegion &&
    rec.name === "Serbia" &&
    meta.mapName &&
    /kosovo/i.test(meta.mapName)
      ? " (incl. Kosovo)"
      : !isRegion && rec.name === "Serbia"
        ? " (incl. Kosovo)"
        : "";
  const title = isRegion ? `🌐 ${rec.name}` : `${rec.name}${kosovoNote}`;
  const tfrNote =
    rec.tfr >= REPLACEMENT_TFR
      ? `above replacement (+${(((rec.tfr / REPLACEMENT_TFR) - 1) * 100).toFixed(0)}%)`
      : `below replacement (${(((rec.tfr / REPLACEMENT_TFR) - 1) * 100).toFixed(0)}%)`;

  return `
    <div class="map-hover-title">${title}</div>
    <div class="map-hover-row"><span>Year</span><strong>${rec.year ?? "—"}</strong></div>
    <div class="map-hover-row"><span>Population</span><strong>${formatPop(rec.population)}</strong></div>
    <div class="map-hover-row"><span>World share</span><strong>${((rec.worldShare || 0) * 100).toFixed(2)}%</strong></div>
    <div class="map-hover-row"><span>TFR</span><strong>${Number(rec.tfr).toFixed(2)}</strong></div>
    <div class="map-hover-row"><span>vs replacement</span><strong>${tfrNote}</strong></div>
    <div class="map-hover-row"><span>Median age</span><strong>${Number(rec.medianAge).toFixed(1)}</strong></div>
    <div class="map-hover-row"><span>0–14 %</span><strong>${Number(rec.youthPct).toFixed(1)}%</strong></div>
    <div class="map-hover-row"><span>65+ %</span><strong>${Number(rec.elderlyPct).toFixed(1)}%</strong></div>
    ${
      isRegion && rec.countries
        ? `<div class="map-hover-muted">${rec.countries.length} countries in region</div>`
        : rec.region
          ? `<div class="map-hover-muted">Region: ${rec.region}</div>`
          : ""
    }
  `;
}
