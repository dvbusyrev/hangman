import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(rootDir, "public", "data");
const scenarios = JSON.parse(await readFile(path.join(dataDir, "scenarios.json"), "utf8"));

const required = [
  "index.html",
  "public/data/russia-boundary.geojson",
  "public/data/regions.geojson",
  "public/data/cities.geojson",
  "public/data/professions.csv",
  "public/data/vacancies.csv",
  "public/data/rent.csv",
  "public/data/sale.csv",
  "public/data/nature.json",
  "public/data/benefits.json",
  "public/cesium/Cesium.js",
  "public/cesium/Widgets/widgets.css"
];

for (const region of scenarios.regions) {
  for (const city of region.cities.filter((item) => item.ready)) {
    for (const url of [city.buildingsUrl, city.roadsUrl, city.routeUrl]) {
      if (url) required.push(`public${url}`);
    }
  }
}

const missing = [];
for (const relative of [...new Set(required)]) {
  try {
    await access(path.join(rootDir, relative));
  } catch {
    missing.push(relative);
  }
}

if (missing.length) {
  console.error("\nOFFLINE CHECK FAILED. Missing files:\n");
  missing.forEach((file) => console.error(`  - ${file}`));
  console.error("\nWhile internet is available run: npm run offline:sync\n");
  process.exit(1);
}

console.log("OFFLINE CHECK OK");
console.log(`Verified ${required.length} local files. Runtime does not need OSM/Overpass/Nominatim.`);
