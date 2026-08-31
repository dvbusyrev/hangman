import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "public", "data");
const files = [
  "murmansk-buildings.geojson",
  "naryan-mar-buildings.geojson",
  "anadyr-buildings.geojson",
  "tiksi-buildings.geojson"
];

let failed = false;
for (const name of files) {
  const full = path.join(dataDir, name);
  try {
    await access(full);
    const data = JSON.parse(await readFile(full, "utf8"));
    const features = Array.isArray(data.features) ? data.features : [];
    const polygons = features.filter((f) => f.geometry?.type === "Polygon");
    const osmIds = new Set(polygons.map((f) => String(f.properties?.osmBuildingId ?? f.id ?? "")).filter((id) => id.startsWith("osm-way-")));
    const shapes = new Set(polygons.map((f) => JSON.stringify(f.geometry.coordinates)));
    const buildingTypes = new Set(polygons.map((f) => f.properties?.building).filter(Boolean));
    const vertexCounts = new Set(polygons.map((f) => f.geometry.coordinates?.[0]?.length ?? 0));
    const heights = new Set(polygons.map((f) => Number(f.properties?.height)).filter(Number.isFinite).map((v) => v.toFixed(2)));
    const ok = polygons.length > 0 && osmIds.size === polygons.length && shapes.size === polygons.length;
    console.log(`${ok ? "OK" : "FAIL"} ${name}`);
    console.log(`  polygons: ${polygons.length}; unique OSM ids: ${osmIds.size}; unique footprints: ${shapes.size}`);
    console.log(`  OSM building tags: ${buildingTypes.size}; vertex-count variants: ${vertexCounts.size}; cached heights: ${heights.size}`);
    if (!ok) failed = true;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
else console.log("OSM BUILDINGS CHECK OK");
