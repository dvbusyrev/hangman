import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(rootDir, "public", "data");
const scenarios = JSON.parse(await readFile(path.join(dataDir, "scenarios.json"), "utf8"));
await mkdir(dataDir, { recursive: true });

const requestedCityIds = new Set(process.argv.slice(2).filter(Boolean));
const endpoints = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];

const publicRoadTypes = new Set([
  "motorway", "trunk", "primary", "secondary", "tertiary",
  "unclassified", "residential", "living_street", "service", "pedestrian", "road"
]);

const targets = scenarios.regions.flatMap((region) =>
  region.cities
    .filter((city) => city.ready && city.buildingsUrl && city.roadsUrl && Array.isArray(city.route) && city.route.length >= 2)
    .filter((city) => !requestedCityIds.size || requestedCityIds.has(city.id))
    .map((city) => ({ region, city }))
);

if (!targets.length) {
  console.error("No matching cities. Known ids:");
  scenarios.regions.flatMap((r) => r.cities).forEach((city) => console.error(`  ${city.id}`));
  process.exit(1);
}

for (const { region, city } of targets) {
  const bbox = Array.isArray(city.osmBbox) && city.osmBbox.length === 4
    ? city.osmBbox.map(Number)
    : routeBbox(city.route, city.osmPadding ?? 0.006);

  console.log(`\n${region.name} / ${city.name}`);
  console.log(`bbox: ${bbox.join(",")}`);

  const core = await fetchOverpass(coreCityQuery(bbox), `${city.name}: buildings + streets`);
  const { buildings, roads } = overpassToCoreGeoJson(core, city);
  if (!buildings.features.length) throw new Error(`OSM returned zero buildings for ${city.name}`);
  if (!roads.features.length) throw new Error(`OSM returned zero public roads for ${city.name}`);

  let context;
  try {
    const contextData = await fetchOverpass(contextQuery(bbox), `${city.name}: styled map objects`);
    context = overpassToContextGeoJson(contextData, city);
  } catch (error) {
    console.warn(`${city.name}: context map download failed (${error.message}); city geometry is still usable.`);
    context = emptyContext(city);
  }

  const route = makeRoadCameraRoute(roads, city);
  const buildingFile = city.buildingsUrl.split("/").at(-1);
  const roadFile = city.roadsUrl.split("/").at(-1);
  const routeFile = city.routeUrl?.split("/").at(-1);
  const contextFile = city.contextUrl?.split("/").at(-1);

  const writes = [
    writeFile(path.join(dataDir, buildingFile), `${JSON.stringify(buildings)}\n`, "utf8"),
    writeFile(path.join(dataDir, roadFile), `${JSON.stringify(roads)}\n`, "utf8")
  ];
  if (routeFile) {
    writes.push(writeFile(
      path.join(dataDir, routeFile),
      `${JSON.stringify({ source: "OpenStreetMap", cityId: city.id, route })}\n`,
      "utf8"
    ));
  }
  if (contextFile) {
    writes.push(writeFile(path.join(dataDir, contextFile), `${JSON.stringify(context)}\n`, "utf8"));
  }
  await Promise.all(writes);

  console.log(`saved ${buildingFile}: ${buildings.features.length} REAL OSM building footprints`);
  console.log(`saved ${roadFile}: ${roads.features.length} public OSM road ways`);
  if (contextFile) console.log(`saved ${contextFile}: ${context.features.length} styled OSM map objects`);
  if (routeFile) console.log(`saved ${routeFile}: ${route.length} compatibility camera points`);
  await delay(700);
}

function coreCityQuery([south, west, north, east]) {
  const highwayRegex = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|road";
  return `[out:json][timeout:90];\n(\nway["building"](${south},${west},${north},${east});\nway["highway"~"^(${highwayRegex})$"](${south},${west},${north},${east});\n);\nout tags geom;`;
}

function contextQuery([south, west, north, east]) {
  return `[out:json][timeout:90];\n(\nway["landuse"](${south},${west},${north},${east});\nway["natural"~"^(water|wood|scrub|heath|wetland|coastline)$"](${south},${west},${north},${east});\nway["water"](${south},${west},${north},${east});\nway["waterway"](${south},${west},${north},${east});\nway["leisure"~"^(park|garden|playground|pitch|recreation_ground)$"](${south},${west},${north},${east});\nway["amenity"~"^(parking|school|kindergarten|hospital|clinic)$"](${south},${west},${north},${east});\nway["railway"](${south},${west},${north},${east});\n);\nout tags geom;`;
}

async function fetchOverpass(query, label) {
  let lastError = null;
  for (const endpoint of endpoints) {
    let timer;
    try {
      console.log(`trying ${endpoint} (${label})`);
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 70000);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "arctic-life-prototype/1.0 (one-off local OSM export)"
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`endpoint failed: ${error.message}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("All Overpass endpoints failed");
}

function overpassToCoreGeoJson(data, city) {
  const buildingFeatures = [];
  const roadFeatures = [];
  for (const element of data.elements ?? []) {
    if (element.type !== "way" || !Array.isArray(element.geometry)) continue;
    if (element.tags?.building) {
      const feature = buildingWayToFeature(element);
      if (feature) buildingFeatures.push(feature);
    } else if (publicRoadTypes.has(element.tags?.highway) && !["private", "no"].includes(element.tags?.access)) {
      const feature = roadWayToFeature(element);
      if (feature) roadFeatures.push(feature);
    }
  }

  const common = commonProperties(data, city);
  return {
    buildings: {
      type: "FeatureCollection",
      properties: { ...common, layer: "buildings", fullCityExport: true },
      features: buildingFeatures
    },
    roads: {
      type: "FeatureCollection",
      properties: { ...common, layer: "public-roads" },
      features: roadFeatures
    }
  };
}

function overpassToContextGeoJson(data, city) {
  const features = [];
  for (const element of data.elements ?? []) {
    if (element.type !== "way" || !Array.isArray(element.geometry) || element.geometry.length < 2) continue;
    const feature = contextWayToFeature(element);
    if (feature) features.push(feature);
  }
  return {
    type: "FeatureCollection",
    properties: { ...commonProperties(data, city), layer: "map-context" },
    features
  };
}

function emptyContext(city) {
  return {
    type: "FeatureCollection",
    properties: {
      cityId: city.id,
      cityName: city.name,
      source: "OpenStreetMap via Overpass API",
      layer: "map-context",
      attribution: "© OpenStreetMap contributors",
      license: "ODbL"
    },
    features: []
  };
}

function commonProperties(data, city) {
  return {
    cityId: city.id,
    cityName: city.name,
    source: "OpenStreetMap via Overpass API",
    osmBaseTimestamp: data.osm3s?.timestamp_osm_base ?? null,
    generatedAt: new Date().toISOString(),
    attribution: "© OpenStreetMap contributors",
    license: "ODbL"
  };
}

function buildingWayToFeature(way) {
  const coordinates = way.geometry.map(({ lon, lat }) => [Number(lon), Number(lat)]);
  if (coordinates.length < 3) return null;
  closeRing(coordinates);
  if (coordinates.length < 4) return null;
  const tags = way.tags ?? {};
  const levels = numeric(tags["building:levels"]);
  const explicitHeight = parseMeters(tags.height ?? tags["building:height"]);
  const height = explicitHeight ?? (levels ? Math.max(3, levels * 3.1) : stableHeight(way.id));
  const address = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ");
  const [centerLon, centerLat] = polygonCentroid(coordinates);
  const osmBuildingId = `osm-way-${way.id}`;
  return {
    type: "Feature",
    id: osmBuildingId,
    properties: {
      buildingId: osmBuildingId,
      osmBuildingId,
      osmId: way.id,
      building: tags.building,
      levels,
      height,
      minHeight: parseMeters(tags.min_height),
      roofShape: tags["roof:shape"] ?? null,
      buildingMaterial: tags["building:material"] ?? null,
      facadeMaterial: tags["building:facade:material"] ?? null,
      name: tags.name ?? null,
      address: address || null,
      centerLon,
      centerLat,
      source: "OpenStreetMap"
    },
    geometry: { type: "Polygon", coordinates: [coordinates] }
  };
}

function roadWayToFeature(way) {
  const coordinates = way.geometry.map(({ lon, lat }) => [Number(lon), Number(lat)]);
  if (coordinates.length < 2) return null;
  const tags = way.tags ?? {};
  return {
    type: "Feature",
    id: `osm-road-${way.id}`,
    properties: {
      roadId: `osm-road-${way.id}`,
      osmId: way.id,
      highway: tags.highway,
      name: tags.name ?? null,
      surface: tags.surface ?? null,
      lanes: numeric(tags.lanes),
      maxspeed: tags.maxspeed ?? null,
      source: "OpenStreetMap"
    },
    geometry: { type: "LineString", coordinates }
  };
}

function contextWayToFeature(way) {
  const tags = way.tags ?? {};
  const coordinates = way.geometry.map(({ lon, lat }) => [Number(lon), Number(lat)]);
  const isArea = coordinates.length >= 3 && sameCoordinate(coordinates[0], coordinates.at(-1));
  let kind = null;
  if (tags.landuse || tags.leisure || tags.amenity || tags.natural === "water" || tags.water || tags.natural === "wood") kind = "area";
  else if (tags.railway) kind = "railway";
  else if (tags.waterway) kind = "waterway";
  else if (tags.natural === "coastline") kind = "coastline";
  if (!kind) return null;

  const properties = {
    osmId: way.id,
    kind,
    landuse: tags.landuse ?? null,
    natural: tags.natural ?? null,
    water: tags.water ?? null,
    waterway: tags.waterway ?? null,
    leisure: tags.leisure ?? null,
    amenity: tags.amenity ?? null,
    railway: tags.railway ?? null,
    name: tags.name ?? null,
    source: "OpenStreetMap"
  };

  if (isArea && kind === "area") {
    return { type: "Feature", id: `osm-context-${way.id}`, properties, geometry: { type: "Polygon", coordinates: [coordinates] } };
  }
  return { type: "Feature", id: `osm-context-${way.id}`, properties, geometry: { type: "LineString", coordinates } };
}

function makeRoadCameraRoute(roads, city) {
  const features = roads.features.filter((feature) => feature.geometry?.type === "LineString" && feature.geometry.coordinates.length >= 2);
  const guide = city.route;
  const guideCenter = [
    guide.reduce((sum, point) => sum + Number(point.lon), 0) / guide.length,
    guide.reduce((sum, point) => sum + Number(point.lat), 0) / guide.length
  ];
  const ranked = features.map((feature) => {
    const coordinates = feature.geometry.coordinates;
    const length = lineLengthMeters(coordinates);
    const distance = Math.min(...coordinates.map((point) => haversineMeters(point, guideCenter)));
    return { feature, score: Math.min(length, 1400) + roadClassBonus(feature.properties?.highway) - distance * 0.65 };
  }).sort((a, b) => b.score - a.score);
  if (!ranked.length) throw new Error(`${city.name}: no usable public road`);

  let coordinates = ranked[0].feature.geometry.coordinates.map((point) => [Number(point[0]), Number(point[1])]);
  coordinates = extendRoadLine(coordinates, features, 1100);
  const guideStart = [Number(guide[0].lon), Number(guide[0].lat)];
  if (haversineMeters(coordinates.at(-1), guideStart) < haversineMeters(coordinates[0], guideStart)) coordinates.reverse();

  const densified = densifyLine(coordinates, 16);
  const maxPoints = 160;
  const sampled = densified.length > maxPoints
    ? Array.from({ length: maxPoints }, (_, i) => densified[Math.round(i * (densified.length - 1) / (maxPoints - 1))])
    : densified;
  return sampled.map((point, index) => {
    const next = sampled[Math.min(index + 1, sampled.length - 1)];
    const prev = sampled[Math.max(0, index - 1)];
    const heading = index === sampled.length - 1 ? bearingDegrees(prev, point) : bearingDegrees(point, next);
    return {
      lon: point[0], lat: point[1],
      height: Number(city.routeHeight ?? 2.2),
      heading,
      pitch: Number(city.routePitch ?? -1.5)
    };
  });
}

function extendRoadLine(seed, features, targetMeters) {
  const lines = features.map((feature) => feature.geometry.coordinates.map((point) => [Number(point[0]), Number(point[1])]));
  const used = new Set();
  lines.forEach((line, index) => {
    if (sameCoordinate(line[0], seed[0]) && sameCoordinate(line.at(-1), seed.at(-1))) used.add(index);
    if (sameCoordinate(line[0], seed.at(-1)) && sameCoordinate(line.at(-1), seed[0])) used.add(index);
  });
  let route = [...seed];
  let guard = 0;
  while (lineLengthMeters(route) < targetMeters && guard < 20) {
    guard += 1;
    const end = route.at(-1);
    let best = null;
    lines.forEach((line, index) => {
      if (used.has(index) || line.length < 2) return;
      const dStart = haversineMeters(end, line[0]);
      const dEnd = haversineMeters(end, line.at(-1));
      const distance = Math.min(dStart, dEnd);
      if (distance > 22) return;
      if (!best || distance < best.distance) best = { index, line, reverse: dEnd < dStart, distance };
    });
    if (!best) break;
    used.add(best.index);
    const append = best.reverse ? [...best.line].reverse() : best.line;
    route.push(...append.slice(1));
  }
  return route;
}

function closeRing(coordinates) {
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (!sameCoordinate(first, last)) coordinates.push([...first]);
}

function sameCoordinate(a, b) {
  return Math.abs(Number(a?.[0]) - Number(b?.[0])) < 1e-8 && Math.abs(Number(a?.[1]) - Number(b?.[1])) < 1e-8;
}

function polygonCentroid(ring) {
  const count = Math.max(1, ring.length - 1);
  let lon = 0, lat = 0;
  for (let i = 0; i < count; i += 1) { lon += Number(ring[i][0]); lat += Number(ring[i][1]); }
  return [lon / count, lat / count];
}

function routeBbox(route, padding) {
  const lats = route.map((point) => Number(point.lat));
  const lons = route.map((point) => Number(point.lon));
  return [Math.min(...lats) - padding, Math.min(...lons) - padding, Math.max(...lats) + padding, Math.max(...lons) + padding];
}

function lineLengthMeters(coordinates) {
  let sum = 0;
  for (let i = 1; i < coordinates.length; i += 1) sum += haversineMeters(coordinates[i - 1], coordinates[i]);
  return sum;
}

function densifyLine(coordinates, stepMeters) {
  const result = [coordinates[0]];
  for (let i = 1; i < coordinates.length; i += 1) {
    const a = coordinates[i - 1], b = coordinates[i];
    const distance = haversineMeters(a, b);
    const steps = Math.max(1, Math.ceil(distance / stepMeters));
    for (let part = 1; part <= steps; part += 1) {
      const t = part / steps;
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

function roadClassBonus(highway) {
  const rank = { motorway: 340, trunk: 320, primary: 300, secondary: 260, tertiary: 220, residential: 150, unclassified: 130, living_street: 100 };
  return rank[highway] ?? 0;
}

function bearingDegrees(a, b) {
  const lon1 = Number(a[0]) * Math.PI / 180, lat1 = Number(a[1]) * Math.PI / 180;
  const lon2 = Number(b[0]) * Math.PI / 180, lat2 = Number(b[1]) * Math.PI / 180;
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function haversineMeters(a, b) {
  const radius = 6371000;
  const lat1 = Number(a[1]) * Math.PI / 180, lat2 = Number(b[1]) * Math.PI / 180;
  const dLat = lat2 - lat1, dLon = (Number(b[0]) - Number(a[0])) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function stableHeight(osmId) { return 8 + (Number(osmId) % 9) * 2.5; }
function parseMeters(value) {
  if (value == null) return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function numeric(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
