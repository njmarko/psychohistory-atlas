const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

export function iso2ToEmoji(iso2: string | null | undefined) {
  if (!iso2 || iso2.length !== 2) return "🏳️";
  const a = iso2.toUpperCase();
  return String.fromCodePoint(...[...a].map((c) => 127397 + c.charCodeAt(0)));
}

export function getFlagEmoji(countryName: string, iso2?: string | null) {
  if (countryName === "World") return "🌍";
  return iso2ToEmoji(iso2);
}

export function getFlagCode(countryName: string, iso2Fallback: string | null = null) {
  if (countryName === "World") return null;
  return iso2Fallback ? String(iso2Fallback).toLowerCase() : null;
}

export function flagImageUrl(countryName: string, iso2Fallback: string | null = null, width = 80) {
  const code = getFlagCode(countryName, iso2Fallback);
  if (!code) return null;
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
