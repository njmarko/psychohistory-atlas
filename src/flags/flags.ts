const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

/** Codes flagcdn does not host (DC). Paths are served from this app. */
const LOCAL_FLAGS: Record<string, string> = {
  "us-dc": "./flags/us-dc.svg",
};

export function iso2ToEmoji(iso2: string | null | undefined) {
  if (!iso2) return "🏳️";
  const a = iso2.toUpperCase();
  if (a.startsWith("US-") && a.length >= 4) return iso2ToEmoji("US");
  if (a.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...a].map((c) => 127397 + c.charCodeAt(0)));
}

export function getFlagEmoji(countryName: string, iso2?: string | null) {
  if (countryName === "World") return "🌍";
  return iso2ToEmoji(iso2);
}

export function getFlagCode(countryName: string, iso2Fallback: string | null = null) {
  if (countryName === "World") return null;
  const raw = iso2Fallback ? String(iso2Fallback).toLowerCase() : null;
  if (!raw) return null;
  if (/^[a-z]{2}(-[a-z0-9]{2})?$/.test(raw)) return raw;
  return null;
}

export function flagImageUrl(countryName: string, iso2Fallback: string | null = null, width = 80) {
  const code = getFlagCode(countryName, iso2Fallback);
  if (!code) return null;
  if (LOCAL_FLAGS[code]) return LOCAL_FLAGS[code];
  return `https://flagcdn.com/w${width}/${code}.png`;
}

function loadImg(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** High-res flag for pyramid backgrounds. SVG first, then large PNG. */
export function loadFlagImage(countryName: string, iso2Fallback: string | null = null) {
  const code = getFlagCode(countryName, iso2Fallback);
  if (!code) return Promise.resolve(null);
  const key = `hi:${code}`;
  if (imageCache.has(key)) return imageCache.get(key)!;

  const promise = (async () => {
    if (LOCAL_FLAGS[code]) {
      const local = await loadImg(LOCAL_FLAGS[code]);
      if (local && local.naturalWidth > 0) return local;
    }
    const svg = await loadImg(`https://flagcdn.com/${code}.svg`);
    if (svg && svg.naturalWidth > 0) return svg;
    for (const w of [1280, 640, 320, 160]) {
      const png = await loadImg(`https://flagcdn.com/w${w}/${code}.png`);
      if (png && png.naturalWidth > 0) return png;
    }
    return null;
  })();
  imageCache.set(key, promise);
  return promise;
}

export function preloadFlags(names: { name: string; iso2?: string }[]) {
  return Promise.all(names.map((n) => loadFlagImage(n.name, n.iso2 || null)));
}
