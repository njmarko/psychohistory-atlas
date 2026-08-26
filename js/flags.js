/**
 * Country name → ISO 3166-1 alpha-2 (for flagcdn) + emoji flag.
 * "World" uses a globe emoji (no ISO flag).
 */

const COUNTRY_META = {
  Albania: { code: "al", emoji: "🇦🇱" },
  Argentina: { code: "ar", emoji: "🇦🇷" },
  Australia: { code: "au", emoji: "🇦🇺" },
  Austria: { code: "at", emoji: "🇦🇹" },
  Bangladesh: { code: "bd", emoji: "🇧🇩" },
  Belgium: { code: "be", emoji: "🇧🇪" },
  "Bosnia and Herzegovina": { code: "ba", emoji: "🇧🇦" },
  Brazil: { code: "br", emoji: "🇧🇷" },
  Bulgaria: { code: "bg", emoji: "🇧🇬" },
  Canada: { code: "ca", emoji: "🇨🇦" },
  Chile: { code: "cl", emoji: "🇨🇱" },
  China: { code: "cn", emoji: "🇨🇳" },
  Croatia: { code: "hr", emoji: "🇭🇷" },
  "Czech Republic": { code: "cz", emoji: "🇨🇿" },
  Denmark: { code: "dk", emoji: "🇩🇰" },
  Egypt: { code: "eg", emoji: "🇪🇬" },
  Ethiopia: { code: "et", emoji: "🇪🇹" },
  Finland: { code: "fi", emoji: "🇫🇮" },
  France: { code: "fr", emoji: "🇫🇷" },
  Germany: { code: "de", emoji: "🇩🇪" },
  Greece: { code: "gr", emoji: "🇬🇷" },
  Hungary: { code: "hu", emoji: "🇭🇺" },
  India: { code: "in", emoji: "🇮🇳" },
  Indonesia: { code: "id", emoji: "🇮🇩" },
  Ireland: { code: "ie", emoji: "🇮🇪" },
  Italy: { code: "it", emoji: "🇮🇹" },
  Japan: { code: "jp", emoji: "🇯🇵" },
  Kenya: { code: "ke", emoji: "🇰🇪" },
  Mexico: { code: "mx", emoji: "🇲🇽" },
  Montenegro: { code: "me", emoji: "🇲🇪" },
  Netherlands: { code: "nl", emoji: "🇳🇱" },
  Nigeria: { code: "ng", emoji: "🇳🇬" },
  "North Macedonia": { code: "mk", emoji: "🇲🇰" },
  Norway: { code: "no", emoji: "🇳🇴" },
  Pakistan: { code: "pk", emoji: "🇵🇰" },
  Poland: { code: "pl", emoji: "🇵🇱" },
  Portugal: { code: "pt", emoji: "🇵🇹" },
  Romania: { code: "ro", emoji: "🇷🇴" },
  Russia: { code: "ru", emoji: "🇷🇺" },
  Serbia: { code: "rs", emoji: "🇷🇸" },
  Slovakia: { code: "sk", emoji: "🇸🇰" },
  Slovenia: { code: "si", emoji: "🇸🇮" },
  "South Africa": { code: "za", emoji: "🇿🇦" },
  "South Korea": { code: "kr", emoji: "🇰🇷" },
  Spain: { code: "es", emoji: "🇪🇸" },
  Sweden: { code: "se", emoji: "🇸🇪" },
  Switzerland: { code: "ch", emoji: "🇨🇭" },
  Thailand: { code: "th", emoji: "🇹🇭" },
  Turkey: { code: "tr", emoji: "🇹🇷" },
  Ukraine: { code: "ua", emoji: "🇺🇦" },
  "United Kingdom": { code: "gb", emoji: "🇬🇧" },
  "United States": { code: "us", emoji: "🇺🇸" },
  Vietnam: { code: "vn", emoji: "🇻🇳" },
  World: { code: null, emoji: "🌍" },
};

const imageCache = new Map();

export function getFlagEmoji(countryName) {
  return COUNTRY_META[countryName]?.emoji || "🏳️";
}

export function getFlagCode(countryName, iso2Fallback = null) {
  return COUNTRY_META[countryName]?.code || (iso2Fallback ? String(iso2Fallback).toLowerCase() : null);
}

export function flagLabel(countryName) {
  return `${getFlagEmoji(countryName)} ${countryName}`;
}

/** Direct CDN URL for a flag (usable in SVG <image href>). */
export function flagImageUrl(countryName, iso2Fallback = null, width = 80) {
  const code = getFlagCode(countryName, iso2Fallback);
  if (!code) return null;
  return `https://flagcdn.com/w${width}/${code}.png`;
}

/**
 * Load a flag image (flagcdn.com). Resolves to HTMLImageElement or null.
 * Cached; concurrent loads share one promise.
 * @param {string} countryName
 * @param {string|null} iso2Fallback - ISO alpha-2 when not in COUNTRY_META
 */
export function loadFlagImage(countryName, iso2Fallback = null) {
  const code = getFlagCode(countryName, iso2Fallback);
  if (!code) return Promise.resolve(null);

  if (imageCache.has(code)) return imageCache.get(code);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      // fallback: try 4x3 w80
      const img2 = new Image();
      img2.crossOrigin = "anonymous";
      img2.onload = () => resolve(img2);
      img2.onerror = () => resolve(null);
      img2.src = `https://flagcdn.com/w80/${code}.png`;
    };
    // w160 is crisp on retina canvases
    img.src = `https://flagcdn.com/w160/${code}.png`;
  });

  imageCache.set(code, promise);
  return promise;
}

/** Preload flags for a list of country names (best-effort). */
export function preloadFlags(names) {
  return Promise.all(names.map((n) => loadFlagImage(n)));
}
