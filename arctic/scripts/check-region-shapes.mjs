import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(rootDir, "public", "data", "regions.geojson");
const geoJson = JSON.parse(await readFile(file, "utf8"));

const expected = new Set(["murmansk", "nenets", "yamalo-nenets", "chukotka", "yakutia"]);
const result = [];

for (const feature of geoJson.features ?? []) {
  const id = feature?.properties?.regionId ?? feature?.id;
  if (!expected.has(id)) continue;
  const points = countPoints(feature.geometry?.coordinates);
  const source = String(feature?.properties?.source ?? "");
  result.push({ id, name: feature?.properties?.name ?? id, geometry: feature?.geometry?.type, points, source });
}

let failed = false;
for (const id of expected) {
  const item = result.find((x) => x.id === id);
  if (!item) {
    console.error(`MISSING: ${id}`);
    failed = true;
    continue;
  }
  const mock = /mock/i.test(item.source) || item.points <= 8;
  console.log(`${mock ? "BAD" : "OK "} ${item.name}: ${item.geometry}, ${item.points} coordinate points, source=${item.source || "unknown"}`);
  if (mock) failed = true;
}

if (failed) {
  console.error("\nRegion geometry check failed. Run: node scripts/fetch-osm-boundaries.mjs");
  process.exit(1);
}
console.log("\nREGION SHAPES OK — real polygon/multipolygon boundaries are ready for offline use.");

function countPoints(value) {
  if (!Array.isArray(value)) return 0;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") return 1;
  return value.reduce((sum, child) => sum + countPoints(child), 0);
}
