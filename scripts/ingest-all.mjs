/**
 * Optional ingest: pull DHS ideals + OWID series and merge into public/data/country-extras.json.
 * Safe to skip: the app already loads bundled extras + BirthGauge + countries.json.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import https from "https";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extrasPath = join(root, "public", "data", "country-extras.json");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`${url} ${res.statusCode}`));
          res.resume();
          return;
        }
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function ingestDhs(extras) {
  const url =
    "https://api.dhsprogram.com/rest/dhs/data?indicatorIds=PR_IDLC_W_MNA&breakdown=national&perpage=8000&f=json";
  console.log("Fetching DHS PR_IDLC_W_MNA…");
  const json = await fetchJson(url);
  const rows = json.Data || json.data || [];
  const byIso = new Map();
  for (const row of rows) {
    const iso = row.ISOCode || row.DHS_CountryCode;
    const year = Number(row.SurveyYear);
    const val = Number(row.Value);
    if (!iso || !Number.isFinite(year) || !Number.isFinite(val)) continue;
    if (!byIso.has(iso)) byIso.set(iso, []);
    byIso.get(iso).push({ year, value: val, source: "dhs" });
  }
  let n = 0;
  for (const [iso2, pts] of byIso) {
    pts.sort((a, b) => a.year - b.year);
    const latest = pts[pts.length - 1];
    const mean = pts.reduce((s, p) => s + p.value, 0) / pts.length;
    const key = Object.keys(extras).find((k) => extras[k]._iso2 === iso2) || iso2;
    extras[key] = extras[key] || { latest: {}, series: {} };
    extras[key].latest = {
      ...(extras[key].latest || {}),
      idealTfr: latest.value,
      idealTfrYear: latest.year,
      idealTfrMeanAll: mean,
    };
    extras[key].series = { ...(extras[key].series || {}), idealTfr: pts };
    n++;
  }
  console.log(`DHS ideals: ${n} countries`);
}

async function main() {
  mkdirSync(join(root, "public", "data"), { recursive: true });
  const extras = existsSync(extrasPath) ? JSON.parse(readFileSync(extrasPath, "utf8")) : {};
  try {
    await ingestDhs(extras);
  } catch (e) {
    console.warn("DHS fetch skipped:", e.message);
  }
  writeFileSync(extrasPath, JSON.stringify(extras, null, 2));
  console.log("Wrote", extrasPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(0);
});
