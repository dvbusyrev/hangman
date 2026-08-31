const Cesium = window.Cesium;

if (!Cesium) {
  throw new Error("Cesium browser script is not loaded. Check /cesium/Cesium.js and run npm install or npm run cesium:copy.");
}

const fallbackInitialCamera = {
  lon: 104,
  lat: 70,
  height: 7900000,
  heading: 0,
  pitch: -90
};

export function createArcticViewer(container, config = {}) {
  const viewer = new Cesium.Viewer(container, {
    animation: false,
    baseLayer: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    shouldAnimate: false,
    timeline: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider()
  });

  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#dfeaf0");
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#edf3f5");
  viewer.scene.skyBox.show = false;
  viewer.scene.sun.show = false;
  viewer.scene.moon.show = false;
  viewer.scene.globe.enableLighting = false;

  if (config.map?.onlineOsm !== false) addOnlineOsmLayer(viewer, { alpha: 0.96 });
  disableFreeCamera(viewer);
  flyToCamera(viewer, config.map?.initialCamera ?? fallbackInitialCamera, 0);
  return viewer;
}

export function addOnlineOsmLayer(viewer, { alpha = 1 } = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  try {
    const provider = new Cesium.UrlTemplateImageryProvider({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      maximumLevel: 19,
      credit: new Cesium.Credit("© OpenStreetMap contributors")
    });
    const layer = viewer.imageryLayers.addImageryProvider(provider);
    layer.alpha = alpha;
    return layer;
  } catch (error) {
    console.info("Online OSM raster is unavailable; local layers remain active.", error);
    return null;
  }
}

export async function setupRegionMap(viewer, scenarios, { onRegionPick, onCityPick, config = {} } = {}) {
  applyRegionLighting(viewer);
  const scenarioById = new Map(scenarios.regions.map((region) => [region.id, region]));
  const cityById = new Map();
  scenarios.regions.forEach((region) => region.cities.forEach((city) => cityById.set(city.id, city)));

  await addRussiaLayer(viewer, config);

  const regionGeoJson = await loadLocalGeoJson("/data/regions.geojson");
  assertRealRegionShapes(regionGeoJson);
  const regionSpheres = buildRegionBoundingSpheres(regionGeoJson, scenarioById);

  // Do not clamp regional polygons/lines to ground. At regional zoom terrain is irrelevant,
  // while non-ground geometry is dramatically faster and produces smoother thin outlines.
  const regionSource = await Cesium.GeoJsonDataSource.load(regionGeoJson, { clampToGround: false });
  await viewer.dataSources.add(regionSource);
  const regionEntities = new Map();

  regionSource.entities.values.forEach((entity) => {
    const regionId = readEntityProperty(entity, "regionId") || entity.id;
    if (!entity.polygon || !scenarioById.has(regionId)) return;
    entity.polygon.height = Number(config.map?.regionStyle?.fillHeightMeters ?? 0);
    entity.polygon.outline = false;
    if (!regionEntities.has(regionId)) regionEntities.set(regionId, []);
    regionEntities.get(regionId).push(entity);
    styleRegion(entity, "default", config);
  });

  addFastRegionBoundaries(viewer, regionGeoJson, scenarioById, config);
  scenarios.regions.forEach((region) => addRegionLabel(viewer, region));

  const cityEntities = await addCityLayer(viewer);
  setCitiesVisible(cityEntities, null);

  let selectedRegionId = null;
  let hoveredRegionId = null;
  let lastHoverPickAt = 0;
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  const hoverPickInterval = Math.max(16, Number(config.map?.regionStyle?.hoverPickIntervalMs ?? 70));

  // Region selection is an interactive map: keep one stable hand cursor instead of flickering
  // between default/pointer while detailed polygons are being picked.
  viewer.scene.canvas.style.cursor = "pointer";

  // Hover changes only the fill material. Picking is throttled so detailed MultiPolygons do not
  // make the pointer stutter while the mouse moves across their coastline.
  handler.setInputAction((movement) => {
    const now = performance.now();
    if (now - lastHoverPickAt < hoverPickInterval) return;
    lastHoverPickAt = now;

    const picked = viewer.scene.pick(movement.endPosition);
    const nextRegionId = resolvePickedRegionId(picked, scenarioById, cityById);
    if (nextRegionId === hoveredRegionId) return;

    if (hoveredRegionId && hoveredRegionId !== selectedRegionId) {
      (regionEntities.get(hoveredRegionId) ?? []).forEach((entity) => styleRegion(entity, "default", config));
    }

    hoveredRegionId = nextRegionId;
    if (hoveredRegionId && hoveredRegionId !== selectedRegionId) {
      (regionEntities.get(hoveredRegionId) ?? []).forEach((entity) => styleRegion(entity, "hover", config));
    }
    viewer.scene.requestRender();
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    if (!Cesium.defined(picked) || !picked.id) return;

    const cityId = readEntityProperty(picked.id, "cityId");
    if (cityId && cityById.has(cityId)) {
      const city = cityById.get(cityId);
      if (city?.ready) onCityPick?.(city);
      return;
    }

    const regionId = resolvePickedRegionId(picked, scenarioById, cityById);
    const region = scenarioById.get(regionId);
    if (region) onRegionPick?.(region);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  return {
    async selectRegion(regionId) {
      if (selectedRegionId && selectedRegionId !== regionId) {
        const previousState = selectedRegionId === hoveredRegionId ? "hover" : "default";
        (regionEntities.get(selectedRegionId) ?? []).forEach((entity) => styleRegion(entity, previousState, config));
      }
      selectedRegionId = regionId;
      (regionEntities.get(regionId) ?? []).forEach((entity) => styleRegion(entity, "selected", config));

      const region = scenarioById.get(regionId);
      if (region) {
        const sphere = regionSpheres.get(regionId);
        if (sphere) await flyToRegionCentered(viewer, sphere, region, config, 0.8);
        else await flyToCamera(viewer, resolveRegionCamera(region, config), 0.8);
        setCitiesVisible(cityEntities, regionId);
      }
      viewer.scene.requestRender();
    },
    async showOverview(regionId = selectedRegionId) {
      selectedRegionId = regionId ?? null;
      regionEntities.forEach((entities, id) => {
        const nextState = id === selectedRegionId ? "selected" : id === hoveredRegionId ? "hover" : "default";
        entities.forEach((entity) => styleRegion(entity, nextState, config));
      });
      setCitiesVisible(cityEntities, null);
      await flyToCamera(viewer, config.map?.initialCamera ?? fallbackInitialCamera, 0.65);
      viewer.scene.requestRender();
    },
    destroy() {
      viewer.scene.canvas.style.cursor = "default";
      if (!handler.isDestroyed()) handler.destroy();
    }
  };
}

function resolvePickedRegionId(picked, scenarioById, cityById) {
  if (!Cesium.defined(picked) || !picked.id) return null;
  const cityId = readEntityProperty(picked.id, "cityId");
  if (cityId && cityById.has(cityId)) {
    const cityRegionId = readEntityProperty(picked.id, "regionId");
    return scenarioById.has(cityRegionId) ? cityRegionId : null;
  }
  const regionId = readEntityProperty(picked.id, "regionId") || picked.id.id;
  return scenarioById.has(regionId) ? regionId : null;
}

function applyRegionLighting(viewer) {
  viewer.scene.globe.enableLighting = false;
  viewer.scene.sun.show = false;
  viewer.scene.moon.show = false;
  viewer.scene.skyBox.show = false;
}

function resolveRegionCamera(region, config) {
  const base = region.camera ?? {
    lon: region.center?.lon ?? 90,
    lat: region.center?.lat ?? 68,
    height: 1200000,
    heading: 0,
    pitch: -72
  };
  const view = config.map?.regionViews?.[region.id] ?? {};
  return {
    lon: Number(view.lon ?? base.lon) + Number(view.offsetLon ?? 0),
    lat: Number(view.lat ?? base.lat) + Number(view.offsetLat ?? 0),
    height: Number(view.height ?? base.height),
    heading: Number(view.heading ?? base.heading ?? 0),
    pitch: Number(view.pitch ?? base.pitch ?? -72)
  };
}

function flyToRegionCentered(viewer, sphere, region, config, duration = 0.8) {
  const base = region.camera ?? {};
  const view = config.map?.regionViews?.[region.id] ?? {};
  const range = Math.max(1000, Number(view.range ?? view.height ?? base.height ?? sphere.radius * 2.6));
  const heading = Cesium.Math.toRadians(Number(view.heading ?? base.heading ?? 0));
  // A top-down selected-region view keeps the actual shape geometrically centered instead of
  // pushing it toward the lower edge of the window with a perspective pitch.
  const pitch = Cesium.Math.toRadians(Number(view.centerPitch ?? -90));

  return new Promise((resolve) => {
    viewer.camera.flyToBoundingSphere(sphere, {
      offset: new Cesium.HeadingPitchRange(heading, pitch, range),
      duration,
      complete: resolve,
      cancel: resolve
    });
  });
}

function buildRegionBoundingSpheres(geoJson, scenarioById) {
  const result = new Map();
  for (const feature of geoJson.features ?? []) {
    const regionId = feature?.properties?.regionId ?? feature?.id;
    if (!scenarioById.has(regionId)) continue;
    const positions = sampledCartesianPositions(feature.geometry, 18000);
    if (positions.length >= 3) result.set(regionId, Cesium.BoundingSphere.fromPoints(positions));
  }
  return result;
}

function sampledCartesianPositions(geometry, maxPoints) {
  const coordinates = geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];

  const raw = [];
  const stack = [coordinates];
  while (stack.length) {
    const value = stack.pop();
    if (!Array.isArray(value)) continue;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      const lon = Number(value[0]);
      const lat = Number(value[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) raw.push([lon, lat]);
      continue;
    }
    for (let index = value.length - 1; index >= 0; index -= 1) stack.push(value[index]);
  }

  if (!raw.length) return [];
  const stride = Math.max(1, Math.ceil(raw.length / Math.max(3, maxPoints)));
  const positions = [];
  for (let index = 0; index < raw.length; index += stride) {
    positions.push(Cesium.Cartesian3.fromDegrees(raw[index][0], raw[index][1], 0));
  }
  const last = raw.at(-1);
  if (last && (raw.length - 1) % stride !== 0) positions.push(Cesium.Cartesian3.fromDegrees(last[0], last[1], 0));
  return positions;
}

async function addRussiaLayer(viewer, config) {
  try {
    const russiaGeoJson = await loadLocalGeoJson("/data/russia-boundary.geojson");
    const source = await Cesium.GeoJsonDataSource.load(russiaGeoJson, { clampToGround: false });
    await viewer.dataSources.add(source);
    const alpha = Number(config.map?.regionStyle?.russiaAlpha ?? 0.12);
    source.entities.values.forEach((entity) => {
      if (!entity.polygon) return;
      entity.polygon.height = 0;
      entity.polygon.material = Cesium.Color.fromCssColorString("#dbe7eb").withAlpha(alpha);
      entity.polygon.outline = false;
    });
  } catch (error) {
    console.warn("Local Russia boundary is unavailable.", error);
  }
}

async function addCityLayer(viewer) {
  const citySource = await Cesium.GeoJsonDataSource.load("/data/cities.geojson", { clampToGround: false });
  await viewer.dataSources.add(citySource);

  const cityEntities = [];
  citySource.entities.values.forEach((entity) => {
    if (!entity.position) return;
    const cityId = readEntityProperty(entity, "cityId") || entity.id;
    const regionId = readEntityProperty(entity, "regionId");
    const name = readEntityProperty(entity, "name") || cityId;
    const ready = Boolean(readEntityProperty(entity, "ready"));

    entity.billboard = undefined;
    entity.point = new Cesium.PointGraphics({
      pixelSize: ready ? 13 : 10,
      color: ready ? Cesium.Color.fromCssColorString("#ffcc33") : Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString("#173f50"),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    });
    entity.label = new Cesium.LabelGraphics({
      text: name,
      font: "600 14px system-ui, sans-serif",
      fillColor: Cesium.Color.fromCssColorString("#102f3b"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -22),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    });
    cityEntities.push({ entity, cityId, regionId, ready });
  });
  return cityEntities;
}

function setCitiesVisible(cityEntities, regionId) {
  cityEntities.forEach(({ entity, regionId: entityRegionId, ready }) => {
    entity.show = Boolean(ready && regionId && entityRegionId === regionId);
  });
}

export function flyToCamera(viewer, camera, duration = 1) {
  return new Promise((resolve) => {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(Number(camera.lon), Number(camera.lat), Number(camera.height)),
      orientation: {
        heading: Cesium.Math.toRadians(Number(camera.heading ?? 0)),
        pitch: Cesium.Math.toRadians(Number(camera.pitch ?? -65)),
        roll: 0
      },
      duration,
      complete: resolve,
      cancel: resolve
    });
  });
}

export function readEntityProperty(entity, propertyName) {
  if (!entity) return null;
  const property = entity.properties?.[propertyName];
  return property ? property.getValue(Cesium.JulianDate.now()) : null;
}

export function disableFreeCamera(viewer) {
  const controller = viewer.scene.screenSpaceCameraController;
  controller.enableRotate = false;
  controller.enableTranslate = false;
  controller.enableZoom = false;
  controller.enableTilt = false;
  controller.enableLook = false;
}

async function loadLocalGeoJson(url) {
  const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Cannot load ${url}: HTTP ${response.status}`);
  return response.json();
}

function assertRealRegionShapes(geoJson) {
  const features = Array.isArray(geoJson?.features) ? geoJson.features : [];
  if (!features.length) throw new Error("regions.geojson does not contain region features");
  const suspicious = features.filter((feature) => {
    const source = String(feature?.properties?.source ?? "").toLowerCase();
    return source.includes("mock") || countGeometryPoints(feature?.geometry) <= 8;
  });
  if (suspicious.length) {
    const names = suspicious.map((f) => f?.properties?.name || f?.properties?.regionId || "unknown").join(", ");
    throw new Error(
      `regions.geojson still contains mock/rectangle geometry for: ${names}. ` +
      "Run npm run data:osm-boundaries while online, then reload the page."
    );
  }
}

function countGeometryPoints(geometry) {
  let count = 0;
  const walk = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      count += 1;
      return;
    }
    value.forEach(walk);
  };
  walk(geometry?.coordinates);
  return count;
}

function styleRegion(entity, state, config) {
  if (!entity.polygon) return;
  const style = config.map?.regionStyle ?? {};
  let alpha = Number(style.defaultAlpha ?? 0.30);
  let color = style.fillColor ?? "#70b8cf";

  if (state === "hover") {
    alpha = Number(style.hoverAlpha ?? 0.52);
    color = style.hoverFillColor ?? style.selectedFillColor ?? "#45a9c9";
  } else if (state === "selected") {
    alpha = Number(style.selectedAlpha ?? 0.72);
    color = style.selectedFillColor ?? "#2f9fc3";
  }

  entity.polygon.material = Cesium.Color.fromCssColorString(color).withAlpha(alpha);
}

function addFastRegionBoundaries(viewer, geoJson, scenarioById, config) {
  const style = config.map?.regionStyle ?? {};
  const tolerance = Number(style.outlineSimplifyDegrees ?? 0.012);
  const height = Number(style.outlineHeightMeters ?? 600);
  const width = Number(style.outlineWidth ?? 1.6);
  const color = Cesium.Color.fromCssColorString(style.outlineColor ?? "#315e70").withAlpha(Number(style.outlineAlpha ?? 0.88));

  for (const feature of geoJson.features ?? []) {
    const regionId = feature?.properties?.regionId ?? feature?.id;
    if (!scenarioById.has(regionId)) continue;
    for (const ring of outerRings(feature.geometry)) {
      const simplified = simplifyRing(ring, tolerance);
      if (simplified.length < 2) continue;
      const degreesHeights = [];
      for (const point of simplified) {
        const lon = Number(point?.[0]);
        const lat = Number(point?.[1]);
        if (Number.isFinite(lon) && Number.isFinite(lat)) degreesHeights.push(lon, lat, height);
      }
      if (degreesHeights.length < 6) continue;
      viewer.entities.add({
        id: `region-outline-${regionId}-${viewer.entities.values.length}`,
        properties: { regionId },
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(degreesHeights),
          width,
          material: color,
          arcType: Cesium.ArcType.GEODESIC
        }
      });
    }
  }
}

function outerRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates?.length ? [geometry.coordinates[0]] : [];
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates ?? []).map((polygon) => polygon?.[0]).filter(Boolean);
  }
  return [];
}

function simplifyRing(points, tolerance) {
  if (!Array.isArray(points) || points.length <= 4 || tolerance <= 0) return points ?? [];
  const closed = samePoint(points[0], points.at(-1));
  const input = closed ? points.slice(0, -1) : [...points];
  if (input.length <= 3) return points;
  const simplified = douglasPeucker(input, tolerance);
  if (closed && simplified.length) simplified.push([...simplified[0]]);
  return simplified;
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let index = 0;
  const a = points[0];
  const b = points.at(-1);
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = pointSegmentDistanceDegrees(points[i], a, b);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance <= tolerance) return [a, b];
  const left = douglasPeucker(points.slice(0, index + 1), tolerance);
  const right = douglasPeucker(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

function pointSegmentDistanceDegrees(p, a, b) {
  const px = Number(p[0]), py = Number(p[1]);
  const ax = Number(a[0]), ay = Number(a[1]);
  const bx = Number(b[0]), by = Number(b[1]);
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function samePoint(a, b) {
  return Array.isArray(a) && Array.isArray(b) && Number(a[0]) === Number(b[0]) && Number(a[1]) === Number(b[1]);
}

function addRegionLabel(viewer, region) {
  viewer.entities.add({
    id: `label-${region.id}`,
    position: Cesium.Cartesian3.fromDegrees(region.center.lon, region.center.lat, Number(region.center.height ?? 0) + 900),
    properties: { regionId: region.id },
    label: {
      text: region.name,
      font: "700 15px system-ui, sans-serif",
      fillColor: Cesium.Color.fromCssColorString("#173642"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 4,
      showBackground: true,
      backgroundColor: Cesium.Color.WHITE.withAlpha(0.90),
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
}
