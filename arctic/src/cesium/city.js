const Cesium = window.Cesium;

if (!Cesium) {
  throw new Error("Cesium browser script is not loaded. Check /cesium/Cesium.js and run npm install or npm run cesium:copy.");
}
import { disableFreeCamera, flyToCamera, readEntityProperty } from "./map.js";

const colors = {
  neutral: Cesium.Color.fromCssColorString("#d9e1e4").withAlpha(0.88),
  work: Cesium.Color.fromCssColorString("#f1d75a").withAlpha(0.92),
  rent: Cesium.Color.fromCssColorString("#6bb6e7").withAlpha(0.92),
  sale: Cesium.Color.fromCssColorString("#79cb8c").withAlpha(0.92),
  selected: Cesium.Color.fromCssColorString("#ffffff").withAlpha(1)
};

const osmCityCache = new Map();
const overpassEndpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

export async function enterCityScene(viewer, city, { offerByBuilding = new Map(), onBuildingPick } = {}) {
  viewer.dataSources.removeAll();
  viewer.entities.removeAll();
  disableFreeCamera(viewer);

  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#dce8ed");
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#d7e1e4");

  const buildings = await loadCityBuildingData(city);
  const source = await Cesium.GeoJsonDataSource.load(buildings, { clampToGround: false });
  await viewer.dataSources.add(source);

  const entityById = new Map();
  const summaries = [];

  source.entities.values.forEach((entity) => {
    if (!entity.polygon) return;
    const buildingId = readEntityProperty(entity, "buildingId") || entity.id;
    const height = Number(readEntityProperty(entity, "height") || 18);
    entity.name = buildingId;
    entity.polygon.height = 0;
    entity.polygon.extrudedHeight = height;
    entity.polygon.material = materialForOffer(offerByBuilding.get(buildingId));
    entity.polygon.outline = true;
    entity.polygon.outlineColor = Cesium.Color.fromCssColorString("#65757c").withAlpha(0.8);
    entityById.set(buildingId, entity);
    summaries.push({ id: buildingId, height });
  });

  const pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  pickHandler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    const buildingId = picked?.id?.name || readEntityProperty(picked?.id, "buildingId");
    if (buildingId && entityById.has(buildingId)) onBuildingPick?.(buildingId);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  await flyToCamera(viewer, city.camera, 0.9);

  return {
    buildings: summaries,
    entityById,
    setOffers(nextOfferByBuilding) {
      entityById.forEach((entity, buildingId) => {
        entity.polygon.material = materialForOffer(nextOfferByBuilding.get(buildingId));
      });
    },
    highlight(buildingId, nextOfferByBuilding = offerByBuilding) {
      entityById.forEach((entity, id) => {
        entity.polygon.material = id === buildingId
          ? colors.selected
          : materialForOffer(nextOfferByBuilding.get(id));
      });
    },
    destroy() {
      if (!pickHandler.isDestroyed()) pickHandler.destroy();
    }
  };
}

async function loadCityBuildingData(city) {
  if (osmCityCache.has(city.id)) return osmCityCache.get(city.id);

  try {
    const geojson = await fetchOsmBuildings(city);
    if (geojson.features.length) {
      osmCityCache.set(city.id, geojson);
      console.info(`${city.name}: loaded ${geojson.features.length} real OSM buildings.`);
      return geojson;
    }
  } catch (error) {
    console.warn(`${city.name}: live OSM buildings unavailable; using local GeoJSON fallback.`, error);
  }

  // The fallback file allows an offline demo. `npm run data:osm-buildings` can replace it with
  // the same real OSM geometry before the presentation.
  const response = await fetch(city.buildingsUrl);
  if (!response.ok) throw new Error(`Cannot load ${city.buildingsUrl}: ${response.status}`);
  const fallback = await response.json();
  osmCityCache.set(city.id, fallback);
  return fallback;
}

async function fetchOsmBuildings(city) {
  const bbox = routeBbox(city.route, city.id === "anadyr" ? 0.007 : 0.0045);
  const [south, west, north, east] = bbox;
  const query = `[out:json][timeout:35];\n(\n  way["building"](${south},${west},${north},${east});\n);\nout body;\n>;\nout skel qt;`;

  let lastError = null;
  for (const endpoint of overpassEndpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      return overpassToGeoJson(data, city);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("All Overpass endpoints failed");
}

function overpassToGeoJson(data, city) {
  const nodeById = new Map();
  const ways = [];
  for (const element of data.elements ?? []) {
    if (element.type === "node") nodeById.set(element.id, [element.lon, element.lat]);
    if (element.type === "way" && element.tags?.building) ways.push(element);
  }

  const features = ways.map((way) => wayToFeature(way, nodeById)).filter(Boolean);
  assignScenarioBuildingIds(features, city.route);

  return {
    type: "FeatureCollection",
    properties: {
      cityId: city.id,
      cityName: city.name,
      source: "OpenStreetMap via Overpass API",
      attribution: "© OpenStreetMap contributors"
    },
    features
  };
}

function wayToFeature(way, nodeById) {
  const coordinates = (way.nodes ?? []).map((id) => nodeById.get(id)).filter(Boolean);
  if (coordinates.length < 4) return null;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first]);

  const tags = way.tags ?? {};
  const levels = numberOrNull(tags["building:levels"]);
  const explicitHeight = parseMeters(tags.height ?? tags["building:height"]);
  const height = explicitHeight ?? (levels ? Math.max(3, levels * 3.1) : 9 + (Number(way.id) % 7) * 3);
  const address = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ");

  return {
    type: "Feature",
    id: `osm-way-${way.id}`,
    properties: {
      buildingId: `osm-way-${way.id}`,
      osmId: way.id,
      name: tags.name ?? null,
      address: address || null,
      height,
      levels,
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
      const dx = centroid[0] - Number(focus.lon);
      const dy = centroid[1] - Number(focus.lat);
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    if (bestIndex == null) continue;
    features[bestIndex].properties.originalBuildingId = features[bestIndex].properties.buildingId;
    features[bestIndex].properties.buildingId = focus.buildingId;
    features[bestIndex].id = focus.buildingId;
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

function parseMeters(value) {
  if (value == null) return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function numberOrNull(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createRouteController(viewer, city, { initialProgress = 0, onProgress } = {}) {
  const route = Array.isArray(city.route) && city.route.length >= 2 ? city.route : fallbackRoute(city);
  let progress = clamp(initialProgress, 0, 1);
  let wheelLocked = false;

  const canvas = viewer.scene.canvas;
  const onWheel = (event) => {
    event.preventDefault();
    if (wheelLocked) return;
    wheelLocked = true;
    requestAnimationFrame(() => {
      const direction = Math.sign(event.deltaY);
      progress = clamp(progress + direction * 0.075, 0, 1);
      applyProgress(false);
      wheelLocked = false;
    });
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });

  function applyProgress(animate = false) {
    const camera = interpolateRoute(route, progress);
    const destination = Cesium.Cartesian3.fromDegrees(camera.lon, camera.lat, camera.height);
    const orientation = {
      heading: Cesium.Math.toRadians(camera.heading ?? 0),
      pitch: Cesium.Math.toRadians(camera.pitch ?? -12),
      roll: 0
    };

    if (animate) {
      viewer.camera.flyTo({ destination, orientation, duration: 0.25 });
    } else {
      viewer.camera.setView({ destination, orientation });
    }

    const focusBuildingId = nearestFocusBuilding(route, progress);
    onProgress?.({ progress, buildingId: focusBuildingId });
  }

  applyProgress(false);

  return {
    getProgress: () => progress,
    setProgress(value) {
      progress = clamp(value, 0, 1);
      applyProgress(true);
    },
    destroy() {
      canvas.removeEventListener("wheel", onWheel);
    }
  };
}

function interpolateRoute(route, progress) {
  const scaled = progress * (route.length - 1);
  const index = Math.min(Math.floor(scaled), route.length - 2);
  const local = scaled - index;
  const a = route[index];
  const b = route[index + 1];
  const lerp = (key, fallback = 0) => Number(a[key] ?? fallback) + (Number(b[key] ?? a[key] ?? fallback) - Number(a[key] ?? fallback)) * local;

  return {
    lon: lerp("lon"),
    lat: lerp("lat"),
    height: lerp("height", 90),
    heading: lerp("heading", 0),
    pitch: lerp("pitch", -12)
  };
}

function nearestFocusBuilding(route, progress) {
  const target = progress * (route.length - 1);
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  route.forEach((point, index) => {
    if (!point.buildingId) return;
    const distance = Math.abs(index - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point.buildingId;
    }
  });
  return bestDistance <= 0.9 ? best : null;
}

function fallbackRoute(city) {
  const lon = city.camera.lon;
  const lat = city.camera.lat;
  return [
    { lon: lon - 0.006, lat: lat - 0.003, height: 95, heading: 65, pitch: -13 },
    { lon, lat, height: 90, heading: 65, pitch: -13 },
    { lon: lon + 0.006, lat: lat + 0.002, height: 90, heading: 65, pitch: -13 }
  ];
}

function materialForOffer(offer) {
  if (!offer) return colors.neutral;
  return colors[offer.kind] ?? colors.neutral;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
