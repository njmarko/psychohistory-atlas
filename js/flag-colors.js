/**
 * Extract dominant colors from a country flag for pyramid defaults.
 * Returns up to two saturated colors (prefer cooler for male, warmer for female when possible).
 */

import { loadFlagImage, getFlagCode } from "./flags.js";

const colorCache = new Map();

/**
 * @param {string} countryName
 * @param {string|null} iso2
 * @returns {Promise<{male: string, female: string}|null>}
 */
export async function colorsFromFlag(countryName, iso2 = null) {
  const key = getFlagCode(countryName, iso2) || countryName;
  if (colorCache.has(key)) return colorCache.get(key);

  const img = await loadFlagImage(countryName, iso2);
  if (!img) {
    colorCache.set(key, null);
    return null;
  }

  try {
    const colors = sampleDominant(img);
    const pair = pickMaleFemale(colors);
    colorCache.set(key, pair);
    return pair;
  } catch (e) {
    console.warn("Flag color extract failed", countryName, e);
    colorCache.set(key, null);
    return null;
  }
}

function sampleDominant(img) {
  const w = 48;
  const h = Math.max(24, Math.round((img.naturalHeight / img.naturalWidth) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Bucket by coarse hue + lightness
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 200) continue;
    const { h, s, l } = rgbToHsl(r, g, b);
    // Skip near-white / near-black / very gray (common flag backgrounds)
    if (l > 0.92 || l < 0.08) continue;
    if (s < 0.12 && l > 0.25 && l < 0.85) continue;
    const hBin = Math.round(h * 18) % 18;
    const sBin = s > 0.45 ? 1 : 0;
    const lBin = l > 0.55 ? 1 : 0;
    const k = `${hBin}_${sBin}_${lBin}`;
    let bucket = buckets.get(k);
    if (!bucket) {
      bucket = { n: 0, r: 0, g: 0, b: 0, s: 0, h: 0, l: 0 };
      buckets.set(k, bucket);
    }
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.s += s;
    bucket.h += h;
    bucket.l += l;
  }

  const list = [...buckets.values()]
    .map((b) => ({
      n: b.n,
      r: Math.round(b.r / b.n),
      g: Math.round(b.g / b.n),
      b: Math.round(b.b / b.n),
      s: b.s / b.n,
      h: b.h / b.n,
      l: b.l / b.n,
      hex: rgbToHex(Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)),
    }))
    .sort((a, b) => b.n * (0.5 + b.s) - a.n * (0.5 + a.s));

  return list;
}

function pickMaleFemale(colors) {
  const fallback = { male: "#3B82F6", female: "#F43F5E" };
  if (!colors.length) return fallback;

  // Prefer two well-separated hues
  const c0 = colors[0];
  let c1 = colors.find((c) => hueDist(c.h, c0.h) > 0.12 && colorDist(c, c0) > 60) || colors[1] || c0;

  // Assign cooler hue to male, warmer to female when possible
  const warm0 = isWarm(c0.h);
  const warm1 = isWarm(c1.h);
  let male;
  let female;
  if (warm0 && !warm1) {
    male = c1;
    female = c0;
  } else if (!warm0 && warm1) {
    male = c0;
    female = c1;
  } else {
    // both similar warmth: use first as male, second as female; slightly push if same
    male = c0;
    female = c1;
    if (c0.hex === c1.hex) {
      female = {
        ...c0,
        hex: shiftHex(c0.hex, 0.08),
      };
    }
  }

  return {
    male: ensureVivid(male.hex),
    female: ensureVivid(female.hex),
  };
}

function isWarm(h) {
  // reds, oranges, pinks, yellows
  return h < 0.15 || h > 0.9 || (h > 0.05 && h < 0.2);
}

function hueDist(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

function colorDist(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function ensureVivid(hex) {
  const { r, g, b } = hexToRgb(hex);
  let { h, s, l } = rgbToHsl(r, g, b);
  // Boost saturation / clamp lightness for chart bars
  s = Math.max(0.45, Math.min(0.9, s * 1.15));
  l = Math.max(0.35, Math.min(0.58, l));
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function shiftHex(hex, dh) {
  const { r, g, b } = hexToRgb(hex);
  let { h, s, l } = rgbToHsl(r, g, b);
  h = (h + dh) % 1;
  const rgb = hslToRgb(h, Math.max(0.5, s), l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}
