const Cesium = window.Cesium;

if (!Cesium) {
  throw new Error("Cesium browser script is not loaded. Check /cesium/Cesium.js and run npm install or npm run cesium:copy.");
}

const arcticInitialCamera = {
  lon: 93,
  lat: 66,
  height: 10500000,
  heading: 0,
  pitch: -90
};

// OSM relation ids of the four demo regions.
const osmRegionRelations = {
  murmansk: 2099216,
  nenets: 274048,
  chukotka: 151231,
  yakutia: 151234
};

const defaultRegionColor = Cesium.Color.fromCssColorString("#6fb6ca").withAlpha(0.24);
const selectedRegionColor = Cesium.Color.fromCssColorString("#38a3c5").withAlpha(0.52);
const hoveredRegionColor = Cesium.Color.fromCssColorString("#55b7d2").withAlpha(0.4);
const outlineColor = Cesium.Color.fromCssColorString("#164d60").withAlpha(0.95);

export function createArcticViewer(container) {
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

  // A real map is deliberately added after Viewer creation. If the tile server is
  // unavailable the Cesium globe still works and our local fallback GeoJSON remains visible.
  try {
    const osm = new Cesium.OpenStreetMapImageryProvider({
      url: "https://tile.openstreetmap.org/",
      maximumLevel: 19
    });
    viewer.imageryLayers.addImageryProvider(osm);
  } catch (error) {
    console.warn("OSM base map is unavailable; using the plain Cesium globe.", error);
  }

  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#dfeaf0");
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#dce7ea");
  viewer.scene.globe.enableLighting = false;
  viewer.scene.skyBox.show = false;
  viewer.scene.sun.show = false;
  viewer.scene.moon.show = false;
  disableFreeCamera(viewer);
  flyToCamera(viewer, arcticInitialCamera, 0);

  return viewer;
}

export async function setupRegionMap(viewer, scenarios, { onRegionPick, onCityPick } = {}) {
  const scenarioById = new Map(scenarios.regions.map((region) => [region.id, region]));
  const cityById = new Map();
  scenarios.regions.forEach((region) => region.cities.forEach((city) => cityById.set(city.id, city)));

  // Local rectangles are only a fallback. Real OSM boundaries are requested first.
  const fallbackSource = await Cesium.GeoJsonDataSource.load("/data/regions.geojson", { clampToGround: false });
  await viewer.dataSources.add(fallbackSource);
  const fallbackByRegion = new Map();
  fallbackSource.entities.values.forEach((entity) => {
    const regionId = readEntityProperty(entity, "regionId") || entity.id;
    if (!entity.polygon || !scenarioById.has(regionId)) return;
    entity.show = false;
    if (!fallbackByRegion.has(regionId)) fallbackByRegion.set(regionId, []);
    fallbackByRegion.get(regionId).push(entity);
  });

  const regionEntities = new Map();

  for (const region of scenarios.regions) {
    let entities = [];
    try {
      entities = await loadOsmRegionBoundary(viewer, region);
    } catch (error) {
      console.warn(`OSM boundary failed for ${region.name}; using local fallback.`, error);
      entities = fallbackByRegion.get(region.id) ?? [];
      entities.forEach((entity) => { entity.show = true; });
    }

    if (entities.length) {
      regionEntities.set(region.id, entities);
      entities.forEach((entity) => styleRegion(entity, "default"));
    }
    addRegionLabel(viewer, region);
  }

  const cityEntities = await addCityLayer(viewer);
  setCitiesVisible(cityEntities, null);

  let selectedRegionId = null;
  let hoveredRegionId = null;
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.endPosition);
    const pickedEntity = Cesium.defined(picked) ? picked.id : null;
    const regionId = pickedEntity
      ? readEntityProperty(pickedEntity, "regionId") || pickedEntity.id
      : null;

    if (regionId === hoveredRegionId) return;
    hoveredRegionId = scenarioById.has(regionId) ? regionId : null;

    regionEntities.forEach((entities, id) => {
      entities.forEach((entity) => styleRegion(
        entity,
        id === selectedRegionId ? "selected" : id === hoveredRegionId ? "hover" : "default"
      ));
    });
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    if (!Cesium.defined(picked) || !picked.id) return;

    const cityId = readEntityProperty(picked.id, "cityId");
    if (cityId && cityById.has(cityId)) {
      onCityPick?.(cityById.get(cityId));
      return;
    }

    const regionId = readEntityProperty(picked.id, "regionId") || picked.id.id;
    const config = scenarioById.get(regionId);
    if (config) onRegionPick?.(config);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  return {
    async selectRegion(regionId) {
      selectedRegionId = regionId;
      hoveredRegionId = null;
      regionEntities.forEach((entities, id) => {
        entities.forEach((entity) => styleRegion(entity, id === regionId ? "selected" : "default"));
      });

      const region = scenarioById.get(regionId);
      if (region) {
        await flyToCamera(viewer, region.camera, 1.1);
        setCitiesVisible(cityEntities, regionId);
      }
    },
    destroy() {
      if (!handler.isDestroyed()) handler.destroy();
    }
  };
}

async function loadOsmRegionBoundary(viewer, region) {
  const relationId = osmRegionRelations[region.id];
  if (!relationId) throw new Error(`No OSM relation configured for ${region.id}`);

  const url = new URL("https://nominatim.openstreetmap.org/lookup");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("osm_ids", `R${relationId}`);
  url.searchParams.set("polygon_geojson", "1");
  // Enough detail for a country-wide overview without pulling the full OSM relation geometry.
  url.searchParams.set("polygon_threshold", region.id === "murmansk" ? "0.01" : "0.025");
  url.searchParams.set("accept-language", "ru");

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const [place] = await response.json();
  if (!place?.geojson) throw new Error("Nominatim returned no polygon");

  const feature = {
    type: "Feature",
    id: region.id,
    properties: {
      regionId: region.id,
      name: region.name,
      source: "OpenStreetMap / Nominatim",
      osmRelationId: relationId
    },
    geometry: place.geojson
  };

  const source = await Cesium.GeoJsonDataSource.load(feature, { clampToGround: false });
  await viewer.dataSources.add(source);
  const entities = source.entities.values.filter((entity) => entity.polygon);
  entities.forEach((entity) => {
    if (!entity.properties) entity.properties = new Cesium.PropertyBag();
    entity.properties.addProperty("regionId", region.id);
  });
  return entities;
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
      pixelSize: ready ? 15 : 11,
      color: ready
        ? Cesium.Color.fromCssColorString("#ffcc33")
        : Cesium.Color.fromCssColorString("#ffffff"),
      outlineColor: Cesium.Color.fromCssColorString("#173f50"),
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    });
    entity.label = new Cesium.LabelGraphics({
      text: name,
      font: "600 14px system-ui, sans-serif",
      fillColor: Cesium.Color.fromCssColorString("#102f3b"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -24),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    });
    cityEntities.push({ entity, cityId, regionId });
  });
  return cityEntities;
}

function setCitiesVisible(cityEntities, regionId) {
  cityEntities.forEach(({ entity, regionId: entityRegionId }) => {
    entity.show = Boolean(regionId && entityRegionId === regionId);
  });
}

export function flyToCamera(viewer, camera, duration = 1) {
  return new Promise((resolve) => {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(camera.lon, camera.lat, camera.height),
      orientation: {
        heading: Cesium.Math.toRadians(camera.heading ?? 0),
        pitch: Cesium.Math.toRadians(camera.pitch ?? -65),
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

function styleRegion(entity, state) {
  if (!entity.polygon) return;
  entity.polygon.material = state === "selected"
    ? selectedRegionColor
    : state === "hover"
      ? hoveredRegionColor
      : defaultRegionColor;
  entity.polygon.outline = true;
  entity.polygon.outlineColor = outlineColor;
}

function addRegionLabel(viewer, region) {
  viewer.entities.add({
    id: `label-${region.id}`,
    position: Cesium.Cartesian3.fromDegrees(region.center.lon, region.center.lat, region.center.height ?? 0),
    properties: { regionId: region.id },
    label: {
      text: region.name,
      font: "600 14px system-ui, sans-serif",
      fillColor: Cesium.Color.fromCssColorString("#173642"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 4,
      showBackground: true,
      backgroundColor: Cesium.Color.WHITE.withAlpha(0.84),
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
}
