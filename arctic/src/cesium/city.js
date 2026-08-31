import * as Cesium from "cesium";
import { flyToCamera, readEntityProperty } from "./map.js";

const buildingColor = Cesium.Color.fromCssColorString("#9ad7ff").withAlpha(0.72);
const selectedBuildingColor = Cesium.Color.fromCssColorString("#ffcc66").withAlpha(0.9);

export async function enterCityScene(viewer, city) {
  viewer.dataSources.removeAll();
  viewer.entities.removeAll();

  const buildings = await Cesium.GeoJsonDataSource.load(city.buildingsUrl, {
    clampToGround: false
  });

  await viewer.dataSources.add(buildings);

  const buildingSummaries = buildings.entities.values
    .filter((entity) => entity.polygon)
    .map((entity) => {
      const buildingId = readEntityProperty(entity, "buildingId") || entity.id;
      const height = Number(readEntityProperty(entity, "height") || 30);

      entity.name = buildingId;
      entity.polygon.height = 0;
      entity.polygon.extrudedHeight = height;
      entity.polygon.material = buildingColor;
      entity.polygon.outline = true;
      entity.polygon.outlineColor = Cesium.Color.WHITE;

      return {
        id: buildingId,
        height
      };
    });

  attachBuildingPick(viewer, buildings.entities.values);
  await flyToCamera(viewer, city.camera, 1.4);

  return buildingSummaries;
}

function attachBuildingPick(viewer, entities) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);

    entities.forEach((entity) => {
      if (entity.polygon) {
        entity.polygon.material = buildingColor;
      }
    });

    if (Cesium.defined(picked) && picked.id?.polygon) {
      picked.id.polygon.material = selectedBuildingColor;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}
