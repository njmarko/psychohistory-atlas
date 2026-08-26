/**
 * Download 2024 age–sex pyramids from populationpyramid.net (UN WPP).
 * Node 16+: uses https module (no global fetch required).
 */
import https from "https";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "countries.json");

const ENTRIES = [
  ["Afghanistan", 4, "AF", "AFG", "Asia"],
  ["Albania", 8, "AL", "ALB", "Europe"],
  ["Algeria", 12, "DZ", "DZA", "Africa"],
  ["Angola", 24, "AO", "AGO", "Africa"],
  ["Argentina", 32, "AR", "ARG", "Americas"],
  ["Armenia", 51, "AM", "ARM", "Asia"],
  ["Australia", 36, "AU", "AUS", "Oceania"],
  ["Austria", 40, "AT", "AUT", "Europe"],
  ["Azerbaijan", 31, "AZ", "AZE", "Asia"],
  ["Bahrain", 48, "BH", "BHR", "Asia"],
  ["Bangladesh", 50, "BD", "BGD", "Asia"],
  ["Belarus", 112, "BY", "BLR", "Europe"],
  ["Belgium", 56, "BE", "BEL", "Europe"],
  ["Belize", 84, "BZ", "BLZ", "Americas"],
  ["Benin", 204, "BJ", "BEN", "Africa"],
  ["Bhutan", 64, "BT", "BTN", "Asia"],
  ["Bolivia", 68, "BO", "BOL", "Americas"],
  ["Bosnia and Herzegovina", 70, "BA", "BIH", "Europe"],
  ["Botswana", 72, "BW", "BWA", "Africa"],
  ["Brazil", 76, "BR", "BRA", "Americas"],
  ["Bulgaria", 100, "BG", "BGR", "Europe"],
  ["Burkina Faso", 854, "BF", "BFA", "Africa"],
  ["Burundi", 108, "BI", "BDI", "Africa"],
  ["Cambodia", 116, "KH", "KHM", "Asia"],
  ["Cameroon", 120, "CM", "CMR", "Africa"],
  ["Canada", 124, "CA", "CAN", "Americas"],
  ["Central African Republic", 140, "CF", "CAF", "Africa"],
  ["Chad", 148, "TD", "TCD", "Africa"],
  ["Chile", 152, "CL", "CHL", "Americas"],
  ["China", 156, "CN", "CHN", "Asia"],
  ["Colombia", 170, "CO", "COL", "Americas"],
  ["Congo", 178, "CG", "COG", "Africa"],
  ["Costa Rica", 188, "CR", "CRI", "Americas"],
  ["Croatia", 191, "HR", "HRV", "Europe"],
  ["Cuba", 192, "CU", "CUB", "Americas"],
  ["Cyprus", 196, "CY", "CYP", "Asia"],
  ["Czech Republic", 203, "CZ", "CZE", "Europe"],
  ["Denmark", 208, "DK", "DNK", "Europe"],
  ["Dominican Republic", 214, "DO", "DOM", "Americas"],
  ["DR Congo", 180, "CD", "COD", "Africa"],
  ["Ecuador", 218, "EC", "ECU", "Americas"],
  ["Egypt", 818, "EG", "EGY", "Africa"],
  ["El Salvador", 222, "SV", "SLV", "Americas"],
  ["Eritrea", 232, "ER", "ERI", "Africa"],
  ["Estonia", 233, "EE", "EST", "Europe"],
  ["Eswatini", 748, "SZ", "SWZ", "Africa"],
  ["Ethiopia", 231, "ET", "ETH", "Africa"],
  ["Finland", 246, "FI", "FIN", "Europe"],
  ["France", 250, "FR", "FRA", "Europe"],
  ["Gabon", 266, "GA", "GAB", "Africa"],
  ["Gambia", 270, "GM", "GMB", "Africa"],
  ["Georgia", 268, "GE", "GEO", "Asia"],
  ["Germany", 276, "DE", "DEU", "Europe"],
  ["Ghana", 288, "GH", "GHA", "Africa"],
  ["Greece", 300, "GR", "GRC", "Europe"],
  ["Guatemala", 320, "GT", "GTM", "Americas"],
  ["Guinea", 324, "GN", "GIN", "Africa"],
  ["Guinea-Bissau", 624, "GW", "GNB", "Africa"],
  ["Haiti", 332, "HT", "HTI", "Americas"],
  ["Honduras", 340, "HN", "HND", "Americas"],
  ["Hungary", 348, "HU", "HUN", "Europe"],
  ["Iceland", 352, "IS", "ISL", "Europe"],
  ["India", 356, "IN", "IND", "Asia"],
  ["Indonesia", 360, "ID", "IDN", "Asia"],
  ["Iran", 364, "IR", "IRN", "Asia"],
  ["Iraq", 368, "IQ", "IRQ", "Asia"],
  ["Ireland", 372, "IE", "IRL", "Europe"],
  ["Israel", 376, "IL", "ISR", "Asia"],
  ["Italy", 380, "IT", "ITA", "Europe"],
  ["Jamaica", 388, "JM", "JAM", "Americas"],
  ["Japan", 392, "JP", "JPN", "Asia"],
  ["Jordan", 400, "JO", "JOR", "Asia"],
  ["Kazakhstan", 398, "KZ", "KAZ", "Asia"],
  ["Kenya", 404, "KE", "KEN", "Africa"],
  ["Kuwait", 414, "KW", "KWT", "Asia"],
  ["Kyrgyzstan", 417, "KG", "KGZ", "Asia"],
  ["Laos", 418, "LA", "LAO", "Asia"],
  ["Latvia", 428, "LV", "LVA", "Europe"],
  ["Lebanon", 422, "LB", "LBN", "Asia"],
  ["Lesotho", 426, "LS", "LSO", "Africa"],
  ["Liberia", 430, "LR", "LBR", "Africa"],
  ["Libya", 434, "LY", "LBY", "Africa"],
  ["Lithuania", 440, "LT", "LTU", "Europe"],
  ["Luxembourg", 442, "LU", "LUX", "Europe"],
  ["Madagascar", 450, "MG", "MDG", "Africa"],
  ["Malawi", 454, "MW", "MWI", "Africa"],
  ["Malaysia", 458, "MY", "MYS", "Asia"],
  ["Mali", 466, "ML", "MLI", "Africa"],
  ["Malta", 470, "MT", "MLT", "Europe"],
  ["Mauritania", 478, "MR", "MRT", "Africa"],
  ["Mauritius", 480, "MU", "MUS", "Africa"],
  ["Mexico", 484, "MX", "MEX", "Americas"],
  ["Moldova", 498, "MD", "MDA", "Europe"],
  ["Mongolia", 496, "MN", "MNG", "Asia"],
  ["Montenegro", 499, "ME", "MNE", "Europe"],
  ["Morocco", 504, "MA", "MAR", "Africa"],
  ["Mozambique", 508, "MZ", "MOZ", "Africa"],
  ["Myanmar", 104, "MM", "MMR", "Asia"],
  ["Namibia", 516, "NA", "NAM", "Africa"],
  ["Nepal", 524, "NP", "NPL", "Asia"],
  ["Netherlands", 528, "NL", "NLD", "Europe"],
  ["New Zealand", 554, "NZ", "NZL", "Oceania"],
  ["Nicaragua", 558, "NI", "NIC", "Americas"],
  ["Niger", 562, "NE", "NER", "Africa"],
  ["Nigeria", 566, "NG", "NGA", "Africa"],
  ["North Korea", 408, "KP", "PRK", "Asia"],
  ["North Macedonia", 807, "MK", "MKD", "Europe"],
  ["Norway", 578, "NO", "NOR", "Europe"],
  ["Oman", 512, "OM", "OMN", "Asia"],
  ["Pakistan", 586, "PK", "PAK", "Asia"],
  ["Panama", 591, "PA", "PAN", "Americas"],
  ["Papua New Guinea", 598, "PG", "PNG", "Oceania"],
  ["Paraguay", 600, "PY", "PRY", "Americas"],
  ["Peru", 604, "PE", "PER", "Americas"],
  ["Philippines", 608, "PH", "PHL", "Asia"],
  ["Poland", 616, "PL", "POL", "Europe"],
  ["Portugal", 620, "PT", "PRT", "Europe"],
  ["Qatar", 634, "QA", "QAT", "Asia"],
  ["Romania", 642, "RO", "ROU", "Europe"],
  ["Russia", 643, "RU", "RUS", "Europe"],
  ["Rwanda", 646, "RW", "RWA", "Africa"],
  ["Saudi Arabia", 682, "SA", "SAU", "Asia"],
  ["Senegal", 686, "SN", "SEN", "Africa"],
  ["Serbia", 688, "RS", "SRB", "Europe"],
  ["Sierra Leone", 694, "SL", "SLE", "Africa"],
  ["Singapore", 702, "SG", "SGP", "Asia"],
  ["Slovakia", 703, "SK", "SVK", "Europe"],
  ["Slovenia", 705, "SI", "SVN", "Europe"],
  ["Somalia", 706, "SO", "SOM", "Africa"],
  ["South Africa", 710, "ZA", "ZAF", "Africa"],
  ["South Korea", 410, "KR", "KOR", "Asia"],
  ["South Sudan", 728, "SS", "SSD", "Africa"],
  ["Spain", 724, "ES", "ESP", "Europe"],
  ["Sri Lanka", 144, "LK", "LKA", "Asia"],
  ["Sudan", 729, "SD", "SDN", "Africa"],
  ["Sweden", 752, "SE", "SWE", "Europe"],
  ["Switzerland", 756, "CH", "CHE", "Europe"],
  ["Syria", 760, "SY", "SYR", "Asia"],
  ["Taiwan", 158, "TW", "TWN", "Asia"],
  ["Tajikistan", 762, "TJ", "TJK", "Asia"],
  ["Tanzania", 834, "TZ", "TZA", "Africa"],
  ["Thailand", 764, "TH", "THA", "Asia"],
  ["Togo", 768, "TG", "TGO", "Africa"],
  ["Trinidad and Tobago", 780, "TT", "TTO", "Americas"],
  ["Tunisia", 788, "TN", "TUN", "Africa"],
  ["Turkey", 792, "TR", "TUR", "Asia"],
  ["Turkmenistan", 795, "TM", "TKM", "Asia"],
  ["Uganda", 800, "UG", "UGA", "Africa"],
  ["Ukraine", 804, "UA", "UKR", "Europe"],
  ["United Arab Emirates", 784, "AE", "ARE", "Asia"],
  ["United Kingdom", 826, "GB", "GBR", "Europe"],
  ["United States", 840, "US", "USA", "Americas"],
  ["Uruguay", 858, "UY", "URY", "Americas"],
  ["Uzbekistan", 860, "UZ", "UZB", "Asia"],
  ["Venezuela", 862, "VE", "VEN", "Americas"],
  ["Vietnam", 704, "VN", "VNM", "Asia"],
  ["Yemen", 887, "YE", "YEM", "Asia"],
  ["Zambia", 894, "ZM", "ZMB", "Africa"],
  ["Zimbabwe", 716, "ZW", "ZWE", "Africa"],
];

// Rough default TFR (UN-ish) when BirthGauge file has no match
const DEFAULT_TFR = {
  Afghanistan: 4.5, Albania: 1.36, Algeria: 2.8, Angola: 5.1, Argentina: 1.5,
  Armenia: 1.6, Australia: 1.5, Austria: 1.32, Azerbaijan: 1.7, Bahrain: 1.8,
  Bangladesh: 1.98, Belarus: 1.4, Belgium: 1.47, Belize: 2.0, Benin: 4.9,
  Bhutan: 1.9, Bolivia: 2.5, "Bosnia and Herzegovina": 1.35, Botswana: 2.7,
  Brazil: 1.62, Bulgaria: 1.81, "Burkina Faso": 4.7, Burundi: 5.0, Cambodia: 2.3,
  Cameroon: 4.4, Canada: 1.25, "Central African Republic": 5.8, Chad: 6.1,
  Chile: 1.17, China: 1.09, Colombia: 1.7, Congo: 4.3, "Costa Rica": 1.5,
  Croatia: 1.46, Cuba: 1.4, Cyprus: 1.3, "Czech Republic": 1.45, Denmark: 1.5,
  "Dominican Republic": 2.2, "DR Congo": 6.0, Ecuador: 2.0, Egypt: 2.88,
  "El Salvador": 1.8, Eritrea: 3.8, Estonia: 1.3, Eswatini: 2.8, Ethiopia: 4.14,
  Finland: 1.26, France: 1.68, Gabon: 3.5, Gambia: 4.5, Georgia: 1.8,
  Germany: 1.46, Ghana: 3.5, Greece: 1.32, Guatemala: 2.4, Guinea: 4.6,
  "Guinea-Bissau": 4.3, Haiti: 2.8, Honduras: 2.3, Hungary: 1.51, Iceland: 1.56,
  India: 2.0, Indonesia: 2.18, Iran: 1.7, Iraq: 3.4, Ireland: 1.6, Israel: 2.9,
  Italy: 1.24, Jamaica: 1.4, Japan: 1.2, Jordan: 2.6, Kazakhstan: 3.0,
  Kenya: 3.34, Kuwait: 2.1, Kyrgyzstan: 2.9, Laos: 2.5, Latvia: 1.4,
  Lebanon: 2.1, Lesotho: 2.9, Liberia: 4.1, Libya: 2.2, Lithuania: 1.3,
  Luxembourg: 1.4, Madagascar: 3.9, Malawi: 3.8, Malaysia: 1.8, Mali: 5.8,
  Malta: 1.1, Mauritania: 4.3, Mauritius: 1.4, Mexico: 1.8, Moldova: 1.7,
  Mongolia: 2.7, Montenegro: 1.75, Morocco: 2.2, Mozambique: 4.7, Myanmar: 2.1,
  Namibia: 3.2, Nepal: 1.9, Netherlands: 1.43, "New Zealand": 1.55,
  Nicaragua: 2.2, Niger: 6.7, Nigeria: 5.24, "North Korea": 1.8,
  "North Macedonia": 1.5, Norway: 1.41, Oman: 2.5, Pakistan: 3.41, Panama: 2.2,
  "Papua New Guinea": 3.3, Paraguay: 2.4, Peru: 2.1, Philippines: 2.7,
  Poland: 1.26, Portugal: 1.44, Qatar: 1.8, Romania: 1.71, Russia: 1.42,
  Rwanda: 3.7, "Saudi Arabia": 2.3, Senegal: 4.3, Serbia: 1.7, "Sierra Leone": 3.9,
  Singapore: 1.0, Slovakia: 1.49, Slovenia: 1.55, Somalia: 6.1, "South Africa": 2.32,
  "South Korea": 0.72, "South Sudan": 4.5, Spain: 1.19, "Sri Lanka": 1.9,
  Sudan: 4.3, Sweden: 1.45, Switzerland: 1.39, Syria: 2.7, Taiwan: 0.9,
  Tajikistan: 3.1, Tanzania: 4.6, Thailand: 1.21, Togo: 4.1,
  "Trinidad and Tobago": 1.6, Tunisia: 1.9, Turkey: 1.63, Turkmenistan: 2.6,
  Uganda: 4.4, Ukraine: 1.22, "United Arab Emirates": 1.4, "United Kingdom": 1.4,
  "United States": 1.55, Uruguay: 1.4, Uzbekistan: 3.2, Venezuela: 2.2,
  Vietnam: 1.91, Yemen: 3.6, Zambia: 4.2, Zimbabwe: 3.4,
};

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Accept: "application/json" } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error("HTTP " + res.statusCode));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const results = {};
let ok = 0;
let fail = 0;

for (const [name, id, iso2, iso3, region] of ENTRIES) {
  try {
    const j = await getJson(`https://www.populationpyramid.net/api/pp/${id}/2024/`);
    if (!j.population || !j.male || !j.female) throw new Error("bad payload");
    const male = j.male.map((m) => Math.round(m.v * 1000));
    const female = j.female.map((f) => Math.round(f.v * 1000));
    results[name] = {
      name,
      year: 2024,
      iso2,
      iso3,
      region,
      male,
      female,
      population: Math.round(j.population * 1000),
      tfr: DEFAULT_TFR[name] ?? 2.0,
    };
    ok++;
    if (ok % 15 === 0) console.log(`progress ${ok}/${ENTRIES.length}`);
    await sleep(40);
  } catch (e) {
    fail++;
    console.log("FAIL", name, e.message);
  }
}

writeFileSync(OUT, JSON.stringify(results));
console.log(`DONE ok=${ok} fail=${fail} → ${OUT}`);
