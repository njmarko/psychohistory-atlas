import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "public", "data", "countries.json");
if (!existsSync(path)) {
  console.error("missing public/data/countries.json");
  process.exit(1);
}
const data = JSON.parse(readFileSync(path, "utf8"));
const names = Object.keys(data);
if (names.includes("Kosovo")) {
  console.error("Kosovo must be merged into Serbia, not a separate key");
  process.exit(1);
}
if (!data.Serbia) {
  console.error("Serbia missing");
  process.exit(1);
}
const s = data.Serbia;
const rec = s.base || s;
if (!rec.male || rec.male.length !== 21) {
  console.error("Serbia age–sex missing or wrong length");
  process.exit(1);
}
if (s.includesKosovo === false) {
  console.error("Serbia should include Kosovo");
  process.exit(1);
}
let withTfr = 0;
for (const c of Object.values(data)) {
  const tfr = c.latest?.tfr ?? c.tfr;
  if (tfr != null) withTfr++;
}
console.log(`OK ${names.length} countries, ${withTfr} with TFR, Serbia includes Kosovo`);
