import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(rootDir, "public", "data");
const scenarios = JSON.parse(await readFile(path.join(dataDir, "scenarios.json"), "utf8"));

await mkdir(dataDir, { recursive: true });

const endpoints = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];

const targets = scenarios.regions.flatMap((region) =>
  region.cities
    .filter((city) => city.ready && city.buildingsUrl && Array.isArray(city.route) && city.route.length >= 2)
    .map((city) => ({ region, city }))
);

for (const { region, city } of targets) {
  const bbox = routeBbox(city.route, city.osmPadding ?? 0.006);
  console.log(`\n${region.name} / ${city.name}`);
  console.log(`bbox: ${bbox.join(",")}`);

  const overpass = await fetchOverpass(buildingQuery(bbox));
  const geojson = overpassToGeoJson(overpass, city);
  if (!geojson.features.length) {
    throw new Error(`OSM returned zero buildings for ${city.name}; adjust route/osmPadding in scenarios.json`);
  }

  const fileName = city.buildingsUrl.split("/").at(-1);
  await writeFile(path.join(dataDir, fileName), `${JSON.stringify(geojson, null, 2)}\n`, "utf8");
  console.log(`saved ${fileName}: ${geojson.features.length} REAL OSM buildings`);
  await delay(900);
}

function buildingQuery([south, west, north, east]) {
  // out geom returns the coordinates of each OSM building way directly.
  return `[out:json][timeout:60];\nway["building"](${south},${west},${north},${east});\nout tags geom;`;
}

async function fetchOverpass(query) {
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      console.log(`trying ${endpoint}`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "arctic-life-prototype/0.6 (one-off OSM demo import)"
        },
        body: new URLSearchParams({ data: query })
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`endpoint failed: ${error.message}`);
    }
  }
  throw lastError ?? new Error("All Overpass endpoints failed");
}

function overpassToGeoJson(data, city) {
  const features = (data.elements ?? [])
    .filter((element) => element.type === "way" && element.tags?.building && Array.isArray(element.geometry))
    .map((way) => wayToFeature(way))
    .filter(Boolean);

  assignScenarioBuildingIds(features, city.route);

  return {
    type: "FeatureCollection",
    properties: {
      cityId: city.id,
      cityName: city.name,
      source: "OpenStreetMap via Overpass API",
      osmBaseTimestamp: data.osm3s?.timestamp_osm_base ?? null,
      generatedAt: new Date().toISOString(),
      attribution: "© OpenStreetMap contributors",
      license: "ODbL"
    },
    features
  };
}

function wayToFeature(way) {
  const coordinates = way.geometry.map(({ lon, lat }) => [Number(lon), Number(lat)]);
  if (coordinates.length < 3) return null;
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first]);
  if (coordinates.length < 4) return null;

  const tags = way.tags ?? {};
  const levels = numeric(tags["building:levels"]);
  const explicitHeight = parseMeters(tags.height ?? tags["building:height"]);
  const height = explicitHeight ?? (levels ? Math.max(3, levels * 3.1) : stableHeight(way.id));
  const address = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ");
  const osmBuildingId = `osm-way-${way.id}`;

  return {
    type: "Feature",
    id: osmBuildingId,
    properties: {
      buildingId: osmBuildingId,
      osmBuildingId,
      osmType: "way",
      osmId: way.id,
      building: tags.building,
      name: tags.name ?? null,
      address: address || null,
      levels,
      height,
      source: "OpenStreetMap"
    },
    geometry: { type: "Polygon", coordinates: [coordinates] }
  };
}

function assignScenarioBuildingIds(features, route) {
  const available = new Set(features.map((_, index) => index));
  const focuses = route.filter((point) => point.buildingId);

  for (const focus of focuses) {
    let bestIndex = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const index of available) {
      const centroid = polygonCentroid(features[index].geometry.coordinates[0]);
      const distance = squaredDistance(centroid, [Number(focus.lon), Number(focus.lat)]);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    if (bestIndex == null) continue;
    const feature = features[bestIndex];
    feature.properties.scenarioBuildingId = focus.buildingId;
    feature.properties.buildingId = focus.buildingId;
    // Keep the genuine OSM id separately. Scenario id only binds the demo offer/card to this real footprint.
    feature.id = focus.buildingId;
    available.delete(bestIndex);
  }
}

function polygonCentroid(ring) {
  const count = Math.max(1, ring.length - 1);
  let lon = 0;
  let lat = 0;
  for (let index = 0; index < count; index += 1) {
    lon += Number(ring[index][0]);
    lat += Number(ring[index][1]);
  }
  return [lon / count, lat / count];
}

function routeBbox(route, padding) {
  const lats = route.map((point) => Number(point.lat));
  const lons = route.map((point) => Number(point.lon));
  return [
    Math.min(...lats) - padding,
    Math.min(...lons) - padding,
    Math.max(...lats) + padding,
    Math.max(...lons) + padding
  ];
}

function squaredDistance(a, b) {
  const dx = Number(a[0]) - Number(b[0]);
  const dy = Number(a[1]) - Number(b[1]);
  return dx * dx + dy * dy;
}

function stableHeight(osmId) {
  return 9 + (Number(osmId) % 7) * 3;
}

function parseMeters(value) {
  if (value == null) return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function numeric(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
