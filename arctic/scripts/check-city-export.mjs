import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "public", "data");
const scenarios = JSON.parse(await readFile(path.join(dataDir, "scenarios.json"), "utf8"));
const requested = new Set(process.argv.slice(2).filter(Boolean));
let failed = false;

for (const region of scenarios.regions) {
  for (const city of region.cities.filter((item) => item.ready && (!requested.size || requested.has(item.id)))) {
    try {
      const buildings = JSON.parse(await readFile(path.join(dataDir, city.buildingsUrl.split("/").at(-1)), "utf8"));
      const roads = JSON.parse(await readFile(path.join(dataDir, city.roadsUrl.split("/").at(-1)), "utf8"));
      const context = city.contextUrl
        ? JSON.parse(await readFile(path.join(dataDir, city.contextUrl.split("/").at(-1)), "utf8"))
        : { features: [] };
      const coords = [];
      for (const feature of buildings.features ?? []) {
        if (feature.geometry?.type === "Polygon") coords.push(...(feature.geometry.coordinates?.[0] ?? []));
      }
      const lons = coords.map((p) => Number(p[0])).filter(Number.isFinite);
      const lats = coords.map((p) => Number(p[1])).filter(Number.isFinite);
      const spanLatKm = lats.length ? (Math.max(...lats) - Math.min(...lats)) * 111.1 : 0;
      const meanLat = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0;
      const spanLonKm = lons.length ? (Math.max(...lons) - Math.min(...lons)) * 111.1 * Math.cos(meanLat * Math.PI / 180) : 0;
      const source = String(buildings.properties?.source ?? "");
      const ok = source.includes("OpenStreetMap") && (buildings.features?.length ?? 0) > 0 && (roads.features?.length ?? 0) > 0;
      console.log(`${ok ? "OK" : "FAIL"} ${city.name}`);
      console.log(`  buildings: ${buildings.features?.length ?? 0}`);
      console.log(`  roads: ${roads.features?.length ?? 0}`);
      console.log(`  styled map objects: ${context.features?.length ?? 0}`);
      console.log(`  building extent: ~${spanLonKm.toFixed(1)} × ${spanLatKm.toFixed(1)} km`);
      console.log(`  source: ${source || "unknown"}`);
      if (!ok) failed = true;
    } catch (error) {
      console.log(`FAIL ${city.name}: ${error.message}`);
      failed = true;
    }
  }
}

if (failed) process.exitCode = 1;
else console.log("CITY EXPORT CHECK OK");
