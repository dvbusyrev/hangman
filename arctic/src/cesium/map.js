import * as Cesium from "cesium";

const arcticInitialCamera = {
  lon: 94,
  lat: 71,
  height: 8500000,
  heading: 0,
  pitch: -90
};

const defaultRegionColor = Cesium.Color.fromCssColorString("#4fc3f7").withAlpha(0.38);
const selectedRegionColor = Cesium.Color.fromCssColorString("#ffcc66").withAlpha(0.62);
const russiaBoundaryColor = Cesium.Color.fromCssColorString("#244b5f").withAlpha(0.2);
const outlineColor = Cesium.Color.fromCssColorString("#f6fbff");

export function createArcticViewer(container) {
  const viewer = new Cesium.Viewer(container, {
    animation: false,
    baseLayer: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    imageryProvider: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    shouldAnimate: false,
    timeline: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider()
  });

  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#061018");
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#122230");
  viewer.scene.globe.enableLighting = false;
  viewer.scene.screenSpaceCameraController.enableRotate = false;
  viewer.scene.screenSpaceCameraController.enableTranslate = false;
  viewer.scene.screenSpaceCameraController.enableZoom = false;
  viewer.scene.screenSpaceCameraController.enableTilt = false;
  viewer.scene.screenSpaceCameraController.enableLook = false;

  flyToCamera(viewer, arcticInitialCamera, 0);

  return viewer;
}

export async function setupRegionMap(viewer, scenarios, { onRegionPick }) {
  const scenarioById = new Map(scenarios.regions.map((region) => [region.id, region]));
  await addRussiaBoundary(viewer);

  const regionSource = await Cesium.GeoJsonDataSource.load("/data/regions.geojson", {
    clampToGround: false
  });

  await viewer.dataSources.add(regionSource);

  const regionEntities = new Map();

  regionSource.entities.values.forEach((entity) => {
    const regionId = readEntityProperty(entity, "regionId") || entity.id;
    const config = scenarioById.get(regionId);

    if (!entity.polygon || !config) {
      return;
    }

    regionEntities.set(regionId, entity);
    styleRegion(entity, false);
    addRegionLabel(viewer, config);
  });

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);

    if (!Cesium.defined(picked) || !picked.id) {
      return;
    }

    const regionId = readEntityProperty(picked.id, "regionId") || picked.id.id;
    const config = scenarioById.get(regionId);

    if (config) {
      onRegionPick(config);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  return {
    async selectRegion(regionId) {
      regionEntities.forEach((entity, entityRegionId) => {
        styleRegion(entity, entityRegionId === regionId);
      });

      const region = scenarioById.get(regionId);
      if (region) {
        await flyToCamera(viewer, region.camera, 1.2);
      }
    },
    destroy() {
      handler.destroy();
    }
  };
}

async function addRussiaBoundary(viewer) {
  const countrySource = await Cesium.GeoJsonDataSource.load("/data/russia-boundary.geojson", {
    clampToGround: false
  });

  await viewer.dataSources.add(countrySource);

  countrySource.entities.values.forEach((entity) => {
    if (!entity.polygon) {
      return;
    }

    entity.polygon.material = russiaBoundaryColor;
    entity.polygon.outline = true;
    entity.polygon.outlineColor = Cesium.Color.fromCssColorString("#5d7d8d").withAlpha(0.72);
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
  const property = entity.properties?.[propertyName];

  if (!property) {
    return null;
  }

  return property.getValue(Cesium.JulianDate.now());
}

function styleRegion(entity, selected) {
  entity.polygon.material = selected ? selectedRegionColor : defaultRegionColor;
  entity.polygon.outline = true;
  entity.polygon.outlineColor = outlineColor;
}

function addRegionLabel(viewer, region) {
  viewer.entities.add({
    id: `label-${region.id}`,
    position: Cesium.Cartesian3.fromDegrees(region.center.lon, region.center.lat, region.center.height),
    properties: {
      regionId: region.id
    },
    label: {
      text: region.name,
      font: "16px system-ui, sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      pixelOffset: new Cesium.Cartesian2(0, 0),
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("#0b1721").withAlpha(0.72),
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
}
