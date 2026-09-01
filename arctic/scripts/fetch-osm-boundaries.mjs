import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(rootDir, "public", "data");
const nominatimBaseUrl = "https://nominatim.openstreetmap.org/lookup";
const userAgent = "arctic-life-prototype/0.1 local-data-import";

const russiaBoundary = {
  id: "russia",
  name: "Россия",
  osmId: 60189,
  polygonThreshold: 0.04
};

const arcticRegions = [
  {
    id: "murmansk",
    name: "Мурманская область",
    osmId: 2099216,
    polygonThreshold: 0.01
  },
  {
    id: "nenets",
    name: "Ненецкий автономный округ",
    osmId: 274048,
    polygonThreshold: 0.01
  },
  {
    id: "arkhangelsk",
    name: "Архангельская область",
    osmId: 140337,
    polygonThreshold: 0.015
  },
  {
    id: "chukotka",
    name: "Чукотский автономный округ",
    osmId: 151231,
    polygonThreshold: 0.015
  },
  {
    id: "yakutia",
    name: "Республика Саха (Якутия)",
    osmId: 151234,
    polygonThreshold: 0.015
  }
];

await mkdir(dataDir, { recursive: true });

const country = await fetchBoundary(russiaBoundary);
const regions = [];

for (const region of arcticRegions) {
  regions.push(await fetchBoundary(region));
  await delay(1100);
}

await writeGeoJson("russia-boundary.geojson", {
  type: "FeatureCollection",
  features: [country]
});

await writeGeoJson("regions.geojson", {
  type: "FeatureCollection",
  features: regions
});

console.log(`Saved ${path.join(dataDir, "russia-boundary.geojson")}`);
console.log(`Saved ${path.join(dataDir, "regions.geojson")}`);

async function fetchBoundary(config) {
  const url = new URL(nominatimBaseUrl);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("osm_ids", `R${config.osmId}`);
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("polygon_threshold", String(config.polygonThreshold));
  url.searchParams.set("accept-language", "ru");

  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim request failed for ${config.name}: ${response.status}`);
  }

  const [place] = await response.json();

  if (!place?.geojson) {
    throw new Error(`Nominatim did not return GeoJSON for ${config.name}`);
  }

  return {
    type: "Feature",
    id: config.id,
    properties: {
      regionId: config.id,
      name: config.name,
      osmType: place.osm_type,
      osmId: place.osm_id,
      category: place.category,
      boundaryType: place.type,
      source: "OpenStreetMap via Nominatim",
      licence: place.licence
    },
    geometry: place.geojson
  };
}

async function writeGeoJson(fileName, data) {
  await writeFile(path.join(dataDir, fileName), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
