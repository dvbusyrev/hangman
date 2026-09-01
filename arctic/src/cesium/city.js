const Cesium = window.Cesium;

if (!Cesium) {
  throw new Error("Cesium browser script is not loaded. Check /cesium/Cesium.js and run npm install or npm run cesium:copy.");
}

import { addOnlineOsmLayer, disableFreeCamera, readEntityProperty } from "./map.js";

const colors = {
  neutral: Cesium.Color.fromCssColorString("#d9e1e4").withAlpha(1),
  work: Cesium.Color.fromCssColorString("#f1d75a").withAlpha(1),
  rent: Cesium.Color.fromCssColorString("#6bb6e7").withAlpha(1),
  sale: Cesium.Color.fromCssColorString("#79cb8c").withAlpha(1),
  selected: Cesium.Color.fromCssColorString("#ff8a00").withAlpha(1),
  road: Cesium.Color.fromCssColorString("#5c6970").withAlpha(0.76),
  route: Cesium.Color.fromCssColorString("#f6f7f7").withAlpha(0.95)
};

const cityDataCache = new Map();

/** Read local OSM city data in the background while the region camera is flying. */
export function preloadCityScene(city) {
  loadCitySceneData(city).catch((error) => {
    console.warn(`${city.name}: background OSM preload failed`, error);
  });
}

/**
 * Enter the city using only locally saved OSM data.
 * Each entry creates a new random road walk and randomly binds the currently visible offers
 * to real OSM buildings near that walk. If CSV building_id already contains a real OSM id,
 * that explicit binding is preserved.
 */
export async function enterCityScene(viewer, city, { offers = [], onBuildingPick, config = {} } = {}) {
  viewer.dataSources.removeAll();
  viewer.entities.removeAll();
  disableFreeCamera(viewer);

  const runtimeCity = resolveRuntimeCity(city, config);

  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#dce8ed");
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#d7e1e4");
  applyCityLighting(viewer, config.lighting ?? {});
  setCameraFrustum(viewer, runtimeCity.__navigation.fieldOfViewDegrees);

  const raw = await cityStage(city, "чтение локальных OSM GeoJSON", () => loadCitySceneData(city));
  const graph = cityStageSync(city, "построение графа улиц", () => buildRoadGraph(raw.roads));
  if (!graph.edges.length) throw new Error(`${city.name}: в локальном OSM-файле нет пригодной дорожной сети`);

  // Roads are no longer rendered as Cesium polylines. Instead, a lightweight local OSM-like
  // raster is generated from the cached roads/buildings and placed on the ground.
  await cityStage(city, "подложка карты", () => installCityBasemap(viewer, raw, config.basemap ?? {}));

  const randomWalk = cityStageSync(city, "маршрут по улицам", () => makeRandomRoadWalk(graph, runtimeCity, raw.buildings));
  const preparedBuildings = cityStageSync(city, "подготовка 3D-домов", () => prepareBuildingsForScene(raw.buildings, randomWalk.route, runtimeCity, config.buildings ?? {}));
  let assignment = assignOffersToRandomBuildings(offers, preparedBuildings.features, randomWalk.route);
  verifyRealOsmBuildings(preparedBuildings, city);

  // Avoid Cesium.GeoJsonDataSource for the large full-city export. Cesium keeps only a
  // small window of nearby 3D buildings active while the local OSM cache remains complete.
  const { source, entityById, summaries, updateVisibleBuildings } = cityStageSync(city, "создание 3D-геометрии домов", () => createBuildingDataSource(
    preparedBuildings,
    () => assignment,
    config.buildings ?? {},
    config.lighting ?? {}
  ));
  await cityStage(city, "добавление 3D-домов в Cesium", () => viewer.dataSources.add(source));

  if (!summaries.length) throw new Error(`${city.name}: OSM GeoJSON contains no polygon buildings`);

  // Do not draw the whole generated walk. It can grow for a long time and the local OSM roads
  // already provide the visible street network. Keeping the route invisible also improves FPS.

  const focusBuildings = [];
  const syncFocusBuildings = () => {
    focusBuildings.length = 0;
    for (const building of summaries) {
      building.hasOffer = assignment.offerByBuilding.has(building.id);
      if (building.hasOffer && Number.isFinite(building.lon) && Number.isFinite(building.lat)) {
        focusBuildings.push(building);
      }
    }
  };
  syncFocusBuildings();

  const anchorById = new Map(
    summaries
      .filter((building) => Number.isFinite(building.lon) && Number.isFinite(building.lat))
      .map((building) => [
        building.id,
        Cesium.Cartesian3.fromDegrees(
          building.lon,
          building.lat,
          Math.max(2.5, Number(building.height || 12) * Number(runtimeCity.__navigation.cardAnchorHeightFactor ?? 0.62))
        )
      ])
  );

  const pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  pickHandler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    const buildingId = picked?.id?.name || readEntityProperty(picked?.id, "buildingId");
    if (buildingId && assignment.offerByBuilding.has(buildingId)) {
      onBuildingPick?.(buildingId, assignment.offerByBuilding.get(buildingId));
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  let selectedBuildingId = null;
  let lastCameraPoint = null;
  let lastVisibleRefreshPoint = null;
  let lastVisibleRefreshSelectedId = null;

  const refreshVisibleBuildings = (camera = lastCameraPoint, { force = false } = {}) => {
    if (!camera) return;
    lastCameraPoint = camera;
    const visibleUpdateDistance = Math.max(
      0,
      Number(runtimeCity.__navigation.visibleBuildingUpdateDistanceMeters ?? config.buildings?.visibleUpdateDistanceMeters ?? 28)
    );
    const selectedChanged = selectedBuildingId !== lastVisibleRefreshSelectedId;
    const moved = lastVisibleRefreshPoint
      ? haversineMeters([lastVisibleRefreshPoint.lon, lastVisibleRefreshPoint.lat], [camera.lon, camera.lat])
      : Number.POSITIVE_INFINITY;
    if (!force && !selectedChanged && moved < visibleUpdateDistance) return;

    updateVisibleBuildings(camera, selectedBuildingId);
    lastVisibleRefreshPoint = { lon: camera.lon, lat: camera.lat };
    lastVisibleRefreshSelectedId = selectedBuildingId;
    viewer.scene.requestRender();
  };

  const setOffers = (nextOffers = []) => {
    assignment = assignOffersToRandomBuildings(nextOffers, preparedBuildings.features, randomWalk.route);
    syncFocusBuildings();
    selectedBuildingId = null;
    refreshVisibleBuildings(undefined, { force: true });
    return assignment.assignedOffers;
  };

  const spawnCamera = interpolateRouteIndex(randomWalk.route, randomWalk.spawnIndex);
  applyCameraPoint(viewer, spawnCamera);
  refreshVisibleBuildings(spawnCamera, { force: true });

  return {
    buildings: summaries,
    focusBuildings,
    route: randomWalk.route,
    spawnIndex: randomWalk.spawnIndex,
    extendForward(meters = 900) {
      return randomWalk.extendForward(meters);
    },
    extendBackward(meters = 900) {
      return randomWalk.extendBackward(meters);
    },
    entityById,
    get offerByBuilding() {
      return assignment.offerByBuilding;
    },
    get assignedOffers() {
      return assignment.assignedOffers;
    },
    settings: runtimeCity.__navigation,
    setOffers,
    getOffer(buildingId) {
      return assignment.offerByBuilding.get(buildingId) ?? null;
    },
    getScreenAnchor(buildingId) {
      const world = anchorById.get(buildingId);
      if (!world) return null;
      const point = viewer.scene.cartesianToCanvasCoordinates?.(world)
        ?? Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, world);
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      return { x: point.x, y: point.y };
    },
    highlight(buildingId) {
      if (selectedBuildingId === buildingId) return;
      selectedBuildingId = buildingId;
      refreshVisibleBuildings(undefined, { force: true });
    },
    updateVisibleBuildings(camera) {
      refreshVisibleBuildings(camera);
    },
    destroy() {
      if (!pickHandler.isDestroyed()) pickHandler.destroy();
    }
  };
}

async function cityStage(city, label, action) {
  try {
    return await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${city.name}: этап «${label}»: ${message}`, { cause: error });
  }
}

function cityStageSync(city, label, action) {
  try {
    return action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${city.name}: этап «${label}»: ${message}`, { cause: error });
  }
}

function createBuildingDataSource(preparedBuildings, getAssignment, buildingConfig, lightingConfig) {
  const source = new Cesium.CustomDataSource("osm-buildings");
  const entityById = new Map();
  const summaries = [];
  const summaryById = new Map();
  const maxVisible = Math.max(10, Number(buildingConfig.maxVisibleBuildings ?? 180));
  const visibleRadiusMeters = Math.max(40, Number(buildingConfig.visibleRadiusMeters ?? 220));

  for (const feature of preparedBuildings.features ?? []) {
    if (feature.geometry?.type !== "Polygon") continue;
    const ring = feature.geometry.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 4) continue;

    const properties = feature.properties ?? {};
    const buildingId = String(properties.buildingId ?? feature.id ?? "");
    if (!buildingId) continue;

    const osmBuildingId = String(properties.osmBuildingId ?? buildingId);
    const height = Number(properties.height || 12);
    const buildingClass = String(properties.buildingClass || "unknown");
    const textureUrl = properties.textureUrl || null;
    const summary = {
      id: buildingId,
      osmBuildingId,
      osmId: properties.osmId ?? null,
      address: properties.address ?? null,
      height,
      lon: Number(properties.centerLon),
      lat: Number(properties.centerLat),
      hasOffer: Boolean(getAssignment().offerByBuilding.get(buildingId)),
      buildingClass,
      textureUrl,
      ring
    };

    if (!Number.isFinite(summary.lon) || !Number.isFinite(summary.lat)) continue;

    summaries.push(summary);
    summaryById.set(buildingId, summary);
  }

  const restyleBuildings = (selectedBuildingId = null) => {
    const assignment = getAssignment();
    entityById.forEach((entity, id) => {
      const summary = summaryById.get(id);
      const offer = assignment.offerByBuilding.get(id);
      if (!summary || !entity.polygon) return;

      entity.polygon.material = materialForBuilding(
        summary.textureUrl ?? null,
        summary.buildingClass ?? "unknown",
        offer,
        id === selectedBuildingId,
        buildingConfig
      );
      entity.polygon.outline = false;
      entity.polygon.outlineColor = Cesium.Color.TRANSPARENT;
    });
  };

  const updateVisibleBuildings = (camera, selectedBuildingId = null) => {
    if (!camera || !Number.isFinite(camera.lon) || !Number.isFinite(camera.lat)) return;

    const origin = [camera.lon, camera.lat];
    const candidates = summaries
      .map((summary) => ({
        summary,
        distance: haversineMeters(origin, [summary.lon, summary.lat])
      }))
      .filter((item) => item.distance <= visibleRadiusMeters || item.summary.id === selectedBuildingId)
      .sort((a, b) => {
        if (a.summary.id === selectedBuildingId) return -1;
        if (b.summary.id === selectedBuildingId) return 1;
        return a.distance - b.distance;
      })
      .slice(0, maxVisible);

    const desiredIds = new Set(candidates.map((item) => item.summary.id));

    entityById.forEach((entity, id) => {
      if (!desiredIds.has(id)) {
        source.entities.remove(entity);
        entityById.delete(id);
      }
    });

    for (const { summary } of candidates) {
      if (!entityById.has(summary.id)) {
        const entity = createBuildingEntity(source, summary, getAssignment(), buildingConfig, lightingConfig);
        if (entity) entityById.set(summary.id, entity);
      }
    }

    restyleBuildings(selectedBuildingId);
  };

  return { source, entityById, summaries, updateVisibleBuildings, restyleBuildings };
}

function createBuildingEntity(source, summary, assignment, buildingConfig, lightingConfig) {
  const degrees = [];
  const usableLength = sameCoordinate(summary.ring[0], summary.ring.at(-1)) ? summary.ring.length - 1 : summary.ring.length;

  for (let index = 0; index < usableLength; index += 1) {
    const lon = Number(summary.ring[index]?.[0]);
    const lat = Number(summary.ring[index]?.[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    degrees.push(lon, lat);
  }

  if (degrees.length < 6) return null;

  const positions = Cesium.Cartesian3.fromDegreesArray(degrees);
  if (!positions || positions.length < 3) return null;

  const offer = assignment.offerByBuilding.get(summary.id);

  return source.entities.add({
    id: summary.id,
    name: summary.id,
    properties: {
      buildingId: summary.id,
      osmBuildingId: summary.osmBuildingId,
      osmId: summary.osmId ?? null,
      address: summary.address ?? null,
      height: summary.height,
      buildingClass: summary.buildingClass,
      textureUrl: summary.textureUrl
    },
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(positions),
      height: 0,
      extrudedHeight: summary.height,
      shadows: lightingConfig?.shadows ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.DISABLED,
      material: materialForBuilding(summary.textureUrl, summary.buildingClass, offer, false, buildingConfig),
      outline: false,
      outlineColor: Cesium.Color.TRANSPARENT
    }
  });
}

async function loadCitySceneData(city) {
  if (cityDataCache.has(city.id)) return cityDataCache.get(city.id);

  const promise = (async () => {
    const [localBuildings, localRoads, localContext] = await Promise.all([
      loadLocalOsmGeoJson(city.buildingsUrl, "building"),
      loadLocalOsmGeoJson(city.roadsUrl, "road"),
      city.contextUrl ? loadOptionalGeoJson(city.contextUrl) : Promise.resolve(null)
    ]);

    if (!localBuildings) {
      throw new Error(`${city.name}: нет локального OSM-файла домов ${city.buildingsUrl}. Запустите npm run offline:sync заранее, пока есть интернет.`);
    }
    if (!localRoads) {
      throw new Error(`${city.name}: нет локального OSM-файла дорог ${city.roadsUrl}. Запустите npm run offline:sync заранее, пока есть интернет.`);
    }

    console.info(`${city.name}: OFFLINE OSM scene: ${localBuildings.features.length} buildings, ${localRoads.features.length} roads, ${localContext?.features?.length ?? 0} map objects.`);
    return { buildings: localBuildings, roads: localRoads, context: localContext };
  })();

  cityDataCache.set(city.id, promise);
  try {
    return await promise;
  } catch (error) {
    cityDataCache.delete(city.id);
    throw error;
  }
}

async function loadLocalOsmGeoJson(url, kind) {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    if (!isRealOsmGeoJson(data, kind)) return null;
    return data;
  } catch {
    return null;
  }
}

async function loadOptionalGeoJson(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.type === "FeatureCollection" && Array.isArray(data.features) ? data : null;
  } catch {
    return null;
  }
}

function isRealOsmGeoJson(data, kind) {
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features) || !data.features.length) return false;
  if (!String(data.properties?.source ?? "").includes("OpenStreetMap")) return false;
  if (kind === "building") {
    return data.features.some((feature) => feature.geometry?.type === "Polygon" && feature.properties?.source === "OpenStreetMap");
  }
  return data.features.some((feature) => feature.geometry?.type === "LineString" && feature.properties?.source === "OpenStreetMap");
}

/** Build a compact undirected graph from the real OSM road LineStrings. */
function buildRoadGraph(roads) {
  const nodes = new Map();
  const edges = [];
  const adjacency = new Map();

  const addNode = (coord) => {
    const key = coordinateKey(coord);
    if (!nodes.has(key)) nodes.set(key, [Number(coord[0]), Number(coord[1])]);
    if (!adjacency.has(key)) adjacency.set(key, []);
    return key;
  };

  for (const feature of roads.features ?? []) {
    if (feature.geometry?.type !== "LineString") continue;
    const coordinates = feature.geometry.coordinates;
    for (let index = 1; index < coordinates.length; index += 1) {
      const a = [Number(coordinates[index - 1][0]), Number(coordinates[index - 1][1])];
      const b = [Number(coordinates[index][0]), Number(coordinates[index][1])];
      const length = haversineMeters(a, b);
      if (!Number.isFinite(length) || length < 1.5) continue;
      const aKey = addNode(a);
      const bKey = addNode(b);
      const edge = {
        id: edges.length,
        aKey,
        bKey,
        a,
        b,
        length,
        highway: feature.properties?.highway ?? "residential",
        name: feature.properties?.name ?? null
      };
      edges.push(edge);
      adjacency.get(aKey).push(edge.id);
      adjacency.get(bKey).push(edge.id);
    }
  }

  const componentEdges = largestRoadComponent(nodes, edges, adjacency);
  return {
    nodes,
    adjacency,
    edges: componentEdges.map((index) => edges[index]),
    edgeById: new Map(componentEdges.map((index) => [index, edges[index]])),
    allowedEdgeIds: new Set(componentEdges)
  };
}

function largestRoadComponent(nodes, edges, adjacency) {
  const visited = new Set();
  let bestEdges = [];

  for (const nodeKey of nodes.keys()) {
    if (visited.has(nodeKey)) continue;
    const queue = [nodeKey];
    visited.add(nodeKey);
    const componentEdgeIds = new Set();

    while (queue.length) {
      const current = queue.shift();
      for (const edgeId of adjacency.get(current) ?? []) {
        componentEdgeIds.add(edgeId);
        const edge = edges[edgeId];
        const next = edge.aKey === current ? edge.bKey : edge.aKey;
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    if (componentEdgeIds.size > bestEdges.length) bestEdges = [...componentEdgeIds];
  }

  return bestEdges;
}

/**
 * Create a cursor over the real OSM road graph. The array stores only the already visited and
 * immediately available camera path; every next branch is chosen from the full graph at runtime.
 */
function makeRandomRoadWalk(graph, city, buildings = null) {
  const eligible = graph.edges.filter((edge) => edge.length >= 7);
  if (!eligible.length) throw new Error("No sufficiently long road edges for random spawn");

  const spawnFocus = resolveSpawnFocusPoint(city);
  const spawnFocusRadius = Math.max(250, Number(city.__navigation?.spawnFocusRadiusMeters ?? 1600));
  const buildingCenters = sampleBuildingCentersNearFocus(
    buildings,
    spawnFocus,
    spawnFocusRadius * 1.2,
    Number(city.__navigation?.spawnBuildingSampleLimit ?? 900)
  );
  const buildingRadius = Math.max(60, Number(city.__navigation?.spawnBuildingRadiusMeters ?? 170));
  const spawnPool = spawnFocus
    ? eligible.filter((edge) => pointToSegmentMeters(spawnFocus, edge.a, edge.b) <= spawnFocusRadius)
    : eligible;
  const spawnEdge = weightedRandom(spawnPool.length ? spawnPool : eligible, (edge) => {
    const base = edge.length * roadSpawnWeight(edge.highway);
    const focusWeight = spawnFocus
      ? 1 + 5 * Math.max(0, 1 - pointToSegmentMeters(spawnFocus, edge.a, edge.b) / spawnFocusRadius)
      : 1;
    const buildingWeight = 1 + nearbyBuildingRoadScore(edge, buildingCenters, buildingRadius);
    return base * focusWeight * buildingWeight;
  });
  const spawnT = 0.18 + Math.random() * 0.64;
  const spawn = lerpCoordinate(spawnEdge.a, spawnEdge.b, spawnT);
  const forwardToB = Math.random() >= 0.5;
  const forwardEndKey = forwardToB ? spawnEdge.bKey : spawnEdge.aKey;
  const backwardEndKey = forwardToB ? spawnEdge.aKey : spawnEdge.bKey;
  const forwardEnd = forwardToB ? spawnEdge.b : spawnEdge.a;
  const backwardEnd = forwardToB ? spawnEdge.a : spawnEdge.b;

  // Keep only the current segment to the next real OSM junction. A/D chooses the next branch
  // from the full road graph; without that choice the camera pauses at a branching node.
  const forwardState = createWalkState(forwardEndKey, spawnEdge.id, [spawn, forwardEnd]);
  const backwardState = createWalkState(backwardEndKey, spawnEdge.id, [spawn, backwardEnd]);
  const stepMeters = Number(city.walkStepMeters ?? 3.5);
  const segmentMaxEdges = Math.max(1, Number(city.__navigation?.routeSegmentMaxEdges ?? 24));
  extendWalkStateUntilDecision(graph, forwardState, city, segmentMaxEdges);
  extendWalkStateUntilDecision(graph, backwardState, city, segmentMaxEdges);
  const route = [];

  const backwardReversed = [...backwardState.coordinates].reverse();
  const combined = [...backwardReversed.slice(0, -1), ...forwardState.coordinates];
  const densified = densifyLine(removeConsecutiveDuplicates(combined), stepMeters);
  route.length = 0;
  for (const cameraPoint of cameraRouteFromCoordinates(densified, city)) {
    route.push(cameraPoint);
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  route.forEach((point, index) => {
    const distance = haversineMeters([point.lon, point.lat], spawn);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  const appendForwardEdge = () => {
    const segment = extendWalkStateSegment(graph, forwardState, city, segmentMaxEdges);
    if (segment.length < 2) return 0;
    const dense = densifyLine(removeConsecutiveDuplicates(segment), stepMeters);
    const cameras = cameraRouteFromCoordinates(dense, city);
    if (cameras.length < 2) return 0;
    const previousLast = route.at(-1);
    previousLast.heading = bearingDegrees([previousLast.lon, previousLast.lat], [cameras[1].lon, cameras[1].lat]);
    const added = cameras.length - 1;
    for (let index = 1; index < cameras.length; index += 1) {
      route.push(cameras[index]);
    }
    return added;
  };

  const prependBackwardEdge = () => {
    const segment = extendWalkStateSegment(graph, backwardState, city, segmentMaxEdges);
    if (segment.length < 2) return 0;
    const denseOutward = densifyLine(removeConsecutiveDuplicates(segment), stepMeters);
    const denseTowardSpawn = denseOutward.reverse();
    const cameras = cameraRouteFromCoordinates(denseTowardSpawn, city);
    if (cameras.length < 2) return 0;
    const prepended = cameras.slice(0, -1);
    for (let index = prepended.length - 1; index >= 0; index -= 1) {
      route.unshift(prepended[index]);
    }
    if (route.length >= 2) {
      route[0].heading = bearingDegrees([route[0].lon, route[0].lat], [route[1].lon, route[1].lat]);
    }
    return prepended.length;
  };

  return {
    route,
    spawnIndex: nearestIndex,
    spawnRoad: spawnEdge.name ?? spawnEdge.highway,
    settings: city.__navigation ?? {},
    chooseTurn(direction, movementDirection = 1) {
      const state = movementDirection < 0 ? backwardState : forwardState;
      state.pendingTurn = direction === "left" || direction === "right" ? direction : null;
    },
    hasPendingTurn(movementDirection = 1) {
      const state = movementDirection < 0 ? backwardState : forwardState;
      return Boolean(state.pendingTurn);
    },
    turnOptions(movementDirection = 1) {
      const state = movementDirection < 0 ? backwardState : forwardState;
      return getRoadTurnOptions(graph, state, city);
    },
    extendForward() {
      return appendForwardEdge();
    },
    extendBackward() {
      return prependBackwardEdge();
    }
  };
}

function createWalkState(currentKey, previousEdgeId, coordinates) {
  return {
    currentKey,
    previousEdgeId,
    pendingTurn: null,
    recentEdges: [previousEdgeId],
    coordinates: [...coordinates]
  };
}

function extendWalkStateUntilDecision(graph, state, city, maxEdges) {
  const startIndex = state.coordinates.length - 1;
  const limit = Math.max(1, Number(maxEdges) || 24);

  for (let guard = 0; guard < limit && !isRoadDecisionNode(graph, state); guard += 1) {
    if (!extendWalkStateOneEdge(graph, state, city)) break;
  }

  return state.coordinates.slice(startIndex);
}

function extendWalkStateSegment(graph, state, city, maxEdges) {
  const startIndex = state.coordinates.length - 1;
  const limit = Math.max(1, Number(maxEdges) || 24);

  for (let guard = 0; guard < limit; guard += 1) {
    if (!extendWalkStateOneEdge(graph, state, city)) break;
    if (!state.pendingTurn && isRoadDecisionNode(graph, state)) break;
  }

  return state.coordinates.slice(startIndex);
}

function isRoadDecisionNode(graph, state) {
  return getRoadVariants(graph, state).length !== 1;
}

function getRoadTurnOptions(graph, state, city) {
  const variants = getRoadVariants(graph, state);
  if (variants.length <= 1) return { left: false, right: false };
  const sideThreshold = Number(city.__navigation?.turnDirectionThresholdDegrees ?? 12);
  return {
    left: variants.some((item) => item.turn < -sideThreshold),
    right: variants.some((item) => item.turn > sideThreshold)
  };
}

function getRoadVariants(graph, state) {
  const previousEdge = graph.edgeById.get(state.previousEdgeId) ?? graph.edges.find((edge) => edge.id === state.previousEdgeId);
  let candidates = (graph.adjacency.get(state.currentKey) ?? [])
    .filter((edgeId) => graph.allowedEdgeIds.has(edgeId))
    .map((edgeId) => graph.edgeById.get(edgeId) ?? graph.edges.find((edge) => edge.id === edgeId))
    .filter(Boolean);

  if (!candidates.length) return [];

  const nonBacktracking = candidates.filter((edge) => edge.id !== previousEdge?.id);
  if (nonBacktracking.length) candidates = nonBacktracking;

  return candidates.map((edge) => {
    const junction = edge.aKey === state.currentKey ? edge.a : edge.b;
    const out = edge.aKey === state.currentKey ? edge.b : edge.a;
    const previousIn = previousEdge
      ? (previousEdge.aKey === state.currentKey ? previousEdge.b : previousEdge.a)
      : state.coordinates.at(-2) ?? junction;
    const incomingHeading = bearingDegrees(previousIn, junction);
    const outgoingHeading = bearingDegrees(junction, out);
    return {
      edge,
      nextCoord: out,
      nextKey: edge.aKey === state.currentKey ? edge.bKey : edge.aKey,
      turn: shortestAngleDelta(incomingHeading, outgoingHeading)
    };
  });
}

/**
 * Extend by exactly ONE OSM edge. This is what makes junctions interactive: the application
 * never decides a chain of future turns for the user. A/D is consumed at the next
 * junction, otherwise only a straight continuation is accepted. At a dead end we turn back
 * on the same road so the walk can remain endless.
 */
function extendWalkStateOneEdge(graph, state, city) {
  const variants = getRoadVariants(graph, state);
  if (!variants.length) return null;

  const preference = state.pendingTurn;
  const straightThreshold = Number(city.__navigation?.straightContinuationDegrees ?? 48);
  const sideThreshold = Number(city.__navigation?.turnDirectionThresholdDegrees ?? 12);
  let chosen = null;

  let consumePendingTurn = false;

  if (variants.length === 1) {
    // Ordinary OSM ways are split into many small graph edges. A pending turn command
    // must survive those intermediate nodes and be consumed only at a REAL branching junction.
    chosen = variants[0];
  } else if (preference === "left") {
    const left = variants.filter((item) => item.turn < -sideThreshold);
    if (left.length) {
      chosen = chooseClosestTurn(left, -90);
      consumePendingTurn = true;
    } else {
      const softLeft = variants.filter((item) => item.turn < 0);
      chosen = chooseClosestTurn(softLeft.length ? softLeft : variants, -90);
      consumePendingTurn = true;
    }
  } else if (preference === "right") {
    const right = variants.filter((item) => item.turn > sideThreshold);
    if (right.length) {
      chosen = chooseClosestTurn(right, 90);
      consumePendingTurn = true;
    } else {
      const softRight = variants.filter((item) => item.turn > 0);
      chosen = chooseClosestTurn(softRight.length ? softRight : variants, 90);
      consumePendingTurn = true;
    }
  } else {
    // No turn was selected: never choose a left/right branch automatically.
    const straight = variants.filter((item) => Math.abs(item.turn) <= straightThreshold);
    if (straight.length) chosen = chooseClosestTurn(straight, 0);
  }

  if (!chosen) return null;

  if (consumePendingTurn) state.pendingTurn = null;
  state.coordinates.push(chosen.nextCoord);
  state.previousEdgeId = chosen.edge.id;
  state.recentEdges.push(chosen.edge.id);
  state.currentKey = chosen.nextKey;
  return chosen.nextCoord;
}

function chooseClosestTurn(variants, targetDegrees) {
  if (!variants.length) return null;
  return [...variants].sort((a, b) => {
    const aScore = Math.abs(a.turn - targetDegrees);
    const bScore = Math.abs(b.turn - targetDegrees);
    if (aScore !== bScore) return aScore - bScore;
    return roadSpawnWeight(b.edge.highway) - roadSpawnWeight(a.edge.highway);
  })[0];
}

function roadSpawnWeight(highway) {
  const weight = {
    motorway: 0.3,
    trunk: 0.5,
    primary: 0.8,
    secondary: 1.0,
    tertiary: 1.15,
    unclassified: 1.0,
    residential: 1.4,
    living_street: 1.35,
    service: 0.72,
    pedestrian: 0.8,
    road: 0.75
  };
  return weight[highway] ?? 1;
}

function cameraRouteFromCoordinates(coordinates, city) {
  return coordinates.map((point, index) => {
    const prev = coordinates[Math.max(0, index - 1)];
    const next = coordinates[Math.min(coordinates.length - 1, index + 1)];
    const heading = index === coordinates.length - 1
      ? bearingDegrees(prev, point)
      : bearingDegrees(point, next);
    return {
      lon: point[0],
      lat: point[1],
      height: Number(city.routeHeight ?? 10),
      heading,
      pitch: Number(city.routePitch ?? -5)
    };
  });
}

function prepareBuildingsForScene(buildings, route, city, buildingConfig = {}) {
  const all = buildings.features
    .filter((feature) => feature.geometry?.type === "Polygon")
    .map((feature) => {
      const clone = structuredClone(feature);
      const center = polygonCentroid(clone.geometry.coordinates[0]);
      clone.properties ??= {};
      clone.properties.centerLon = center[0];
      clone.properties.centerLat = center[1];
      clone.properties.osmBuildingId ??= clone.properties.buildingId ?? clone.id;
      clone.properties.buildingId = clone.properties.osmBuildingId;
      clone.id = clone.properties.osmBuildingId;

      const buildingClass = classifyBuilding(clone.properties.building);
      clone.properties.buildingClass = buildingClass;
      clone.properties.height = configuredBuildingHeight(clone.properties, buildingClass, buildingConfig);
      clone.properties.textureUrl = chooseBuildingTexture(clone.properties.osmBuildingId, buildingClass, buildingConfig);
      const routeDistance = distancePointToRouteMeters(center, route);
      return { feature: clone, center, routeDistance };
    });

  const limit = Math.max(1, Number(city.maxBuildings ?? 1200));
  let candidates = all;
  if (all.length > limit) {
    // Keep a dense real 3D neighbourhood around the spawn, but also reserve part of the budget
    // for deterministic buildings spread across the whole exported city. The 2D base map still
    // contains EVERY downloaded OSM footprint.
    const nearCount = Math.round(limit * 0.68);
    const near = [...all].sort((a, b) => a.routeDistance - b.routeDistance).slice(0, nearCount);
    const used = new Set(near.map((item) => item.feature.id));
    const spread = all
      .filter((item) => !used.has(item.feature.id))
      .sort((a, b) => stableUnit(a.feature.id, "city-spread") - stableUnit(b.feature.id, "city-spread"))
      .slice(0, limit - near.length);
    candidates = [...near, ...spread];
  }

  return {
    type: "FeatureCollection",
    properties: { ...buildings.properties, renderedBuildings: candidates.length, totalBuildings: all.length },
    features: candidates.map((item) => item.feature)
  };
}

/** Randomly attach current CSV offers to real OSM buildings close to the generated walk. */
function assignOffersToRandomBuildings(offers, features, route) {
  const nearRouteMeters = 170;
  const buildingRows = features.map((feature) => ({
    id: feature.properties.buildingId,
    center: [Number(feature.properties.centerLon), Number(feature.properties.centerLat)],
    routeDistance: distancePointToRouteMeters(
      [Number(feature.properties.centerLon), Number(feature.properties.centerLat)],
      route
    )
  }));

  const byId = new Map(buildingRows.map((item) => [item.id, item]));
  const nearRoute = buildingRows
    .filter((item) => item.routeDistance <= nearRouteMeters)
    .sort((a, b) => {
      if (a.routeDistance !== b.routeDistance) return a.routeDistance - b.routeDistance;
      return stableUnit(a.id, "near-route") - stableUnit(b.id, "near-route");
    });
  const elsewhere = buildingRows
    .filter((item) => item.routeDistance > nearRouteMeters)
    .sort((a, b) => {
      if (a.routeDistance !== b.routeDistance) return a.routeDistance - b.routeDistance;
      return stableUnit(a.id, "elsewhere") - stableUnit(b.id, "elsewhere");
    });
  const available = [...nearRoute, ...elsewhere];
  const used = new Set();
  const offerByBuilding = new Map();
  const assignedOffers = [];

  for (const offer of offers) {
    let target = null;
    if (offer.buildingId && byId.has(offer.buildingId) && !used.has(offer.buildingId)) {
      target = byId.get(offer.buildingId);
    }
    if (!target) {
      const pool = available.filter((candidate) => !used.has(candidate.id));
      pool.sort((a, b) =>
        a.routeDistance - b.routeDistance ||
        stableUnit(`${offer.id}:${a.id}`, "offer-building") -
        stableUnit(`${offer.id}:${b.id}`, "offer-building")
      );
      target = pool[0] ?? null;
    }
    if (!target) break;

    used.add(target.id);
    const assigned = { ...offer, buildingId: target.id };
    assignedOffers.push(assigned);
    offerByBuilding.set(target.id, assigned);
  }

  return { assignedOffers, offerByBuilding };
}

export function createRouteController(viewer, walk, focusBuildings, { initialIndex = null, onProgress, config = {} } = {}) {
  const activeRoute = walk?.route;
  if (!Array.isArray(activeRoute) || activeRoute.length < 2) throw new Error("No OSM road walk available");

  let cursor = clamp(Number.isFinite(initialIndex) ? initialIndex : Number(walk.spawnIndex ?? 0), 0, activeRoute.length - 1);
  let frame = 0;
  let queuedSteps = 0;
  let distanceTravelled = 0;
  let lastMoveDirection = 1;
  let activeFocusBuildingId = null;
  const canvas = viewer.scene.canvas;
  canvas.tabIndex = 0;
  try { canvas.focus({ preventScroll: true }); } catch { /* focus is best-effort */ }

  const settings = { ...(walk.settings ?? {}), ...(config.navigation ?? {}) };

  const hasTurnChoice = (direction) => {
    const options = walk.turnOptions?.(direction) ?? {};
    return Boolean(options.left || options.right);
  };

  const ensureTargetExists = (target, direction) => {
    let nextTarget = target;
    let guard = 0;

    if (direction > 0) {
      while (nextTarget > activeRoute.length - 1 && guard < 8) {
        if (hasTurnChoice(1) && !walk.hasPendingTurn?.(1)) break;
        guard += 1;
        const added = Number(walk.extendForward?.() ?? 0);
        if (!added) break; // at a junction that needs A/D, remain there
      }
    } else if (direction < 0) {
      while (nextTarget < 0 && guard < 8) {
        if (hasTurnChoice(-1) && !walk.hasPendingTurn?.(-1)) break;
        guard += 1;
        const prepended = Number(walk.extendBackward?.() ?? 0);
        if (!prepended) break;
        cursor += prepended;
        nextTarget += prepended;
      }
    }

    return nextTarget;
  };

  const moveBy = (steps) => {
    if (!Number.isFinite(steps) || Math.abs(steps) < 0.0001) return;
    const direction = Math.sign(steps);
    lastMoveDirection = direction || lastMoveDirection;
    const previous = cursor;
    let target = cursor + steps;
    target = ensureTargetExists(target, direction);
    cursor = clamp(target, 0, activeRoute.length - 1);
    distanceTravelled += Math.abs(cursor - previous) * Number(settings.roadStepMeters ?? 3.5);
    applyCursor();
  };

  const currentTurnDirection = () => {
    const movementDirection = lastMoveDirection >= 0 ? 1 : -1;
    const hintDistance = Math.max(0, Number(settings.turnHintDistancePoints ?? 14));
    const canTurnForward = movementDirection > 0 && cursor >= activeRoute.length - 1 - hintDistance;
    const canTurnBackward = movementDirection < 0 && cursor <= hintDistance;
    if (!canTurnForward && !canTurnBackward) return 0;
    return movementDirection;
  };

  const currentTurnHint = () => {
    const movementDirection = currentTurnDirection();
    if (!movementDirection) return { left: false, right: false };
    return walk.turnOptions?.(movementDirection) ?? { left: false, right: false };
  };

  const selectTurn = (direction) => {
    const movementDirection = currentTurnDirection();
    if (!movementDirection) {
      applyCursor();
      return;
    }

    const options = currentTurnHint();
    if (!options?.[direction]) {
      applyCursor();
      return;
    }

    walk.chooseTurn?.(direction, movementDirection);

    if (movementDirection > 0) {
      walk.extendForward?.();
    } else if (movementDirection < 0) {
      const prepended = Number(walk.extendBackward?.() ?? 0);
      if (prepended) {
        // Keep the same visual camera point after adding older route points before index 0.
        cursor += prepended;
      }
    }

    applyCursor();
  };

  const onWheel = (event) => {
    event.preventDefault();
    const divisor = Math.max(60, Number(settings.wheelDivisor ?? 260));
    const maxSteps = Math.max(0.25, Number(settings.maxWheelStepsPerEvent ?? 1.15));
    queuedSteps += clamp(event.deltaY / divisor, -maxSteps, maxSteps);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      const steps = queuedSteps;
      queuedSteps = 0;
      frame = 0;
      moveBy(steps);
    });
  };

  const onKeyDown = (event) => {
    if (event.__arcticRouteHandled) return;
    const key = routeControlKey(event);
    if (!key) return;

    const target = event.target;
    if (isEditableKeyTarget(target)) return;

    event.__arcticRouteHandled = true;
    event.preventDefault();
    event.stopPropagation();

    const moveSteps = Math.max(0.1, Number(settings.keyboardMoveSteps ?? 0.85));
    if (key === "ArrowUp") {
      moveBy(moveSteps);
    } else if (key === "ArrowDown") {
      moveBy(-moveSteps);
    } else if (key === "TurnLeft") {
      selectTurn("left");
    } else if (key === "TurnRight") {
      selectTurn("right");
    }
  };

  const focusCanvas = () => {
    try { canvas.focus({ preventScroll: true }); } catch { /* focus is best-effort */ }
  };

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", focusCanvas);
  window.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keydown", onKeyDown, true);

  function applyCursor() {
    const camera = interpolateRouteIndex(activeRoute, cursor);
    applyCameraPoint(viewer, camera);
    walk.updateVisibleBuildings?.(camera);
    viewer.scene.requestRender();

    const focusBuildingId = stickyFocusBuilding(
      focusBuildings,
      [camera.lon, camera.lat],
      Number(camera.heading ?? 0),
      activeFocusBuildingId,
      Number(settings.cardTriggerDistanceMeters ?? 115),
      Number(settings.cardHideBehindDegrees ?? 98),
      settings
    );
    activeFocusBuildingId = focusBuildingId;
    onProgress?.({
      progress: (distanceTravelled % 1000) / 1000,
      routeIndex: cursor,
      buildingId: focusBuildingId,
      turnHint: currentTurnHint(),
      camera
    });
  }

  applyCursor();

  return {
    getIndex: () => cursor,
    refresh: applyCursor,
    turn: selectTurn,
    destroy() {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", focusCanvas);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      if (frame) cancelAnimationFrame(frame);
    }
  };
}

function isEditableKeyTarget(target) {
  if (target?.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return [
    "date",
    "datetime-local",
    "email",
    "month",
    "number",
    "password",
    "search",
    "tel",
    "text",
    "time",
    "url",
    "week"
  ].includes(target.type);
}

function routeControlKey(event) {
  const movementKeys = ["ArrowUp", "ArrowDown"];
  if (movementKeys.includes(event.code)) return event.code;
  if (movementKeys.includes(event.key)) return event.key;

  if (event.code === "KeyA") return "TurnLeft";
  if (event.code === "KeyD") return "TurnRight";

  const key = String(event.key ?? "").toLowerCase();
  if (key === "a" || key === "ф") return "TurnLeft";
  if (key === "d" || key === "в") return "TurnRight";
  return null;
}

function applyCameraPoint(viewer, camera) {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(camera.lon, camera.lat, camera.height),
    orientation: {
      heading: Cesium.Math.toRadians(camera.heading ?? 0),
      pitch: Cesium.Math.toRadians(camera.pitch ?? -5),
      roll: 0
    }
  });
}

function stickyFocusBuilding(buildings, point, cameraHeading, previousId, thresholdMeters, hideBehindDegrees = 98, settings = {}) {
  const releaseDistance = Math.max(thresholdMeters, Number(settings.cardReleaseDistanceMeters ?? thresholdMeters * 1.65));
  const releaseBehind = Math.max(hideBehindDegrees, Number(settings.cardReleaseBehindDegrees ?? 180));
  const switchAdvantage = Math.max(0, Number(settings.cardSwitchAdvantageMeters ?? 45));
  const previous = previousId ? buildings?.find((building) => building.id === previousId) : null;
  const previousMetric = previous ? focusMetric(previous, point, cameraHeading) : null;

  if (previousMetric && previousMetric.distance <= releaseDistance && previousMetric.relative <= releaseBehind) {
    const challengerId = nearestFocusBuilding(buildings, point, cameraHeading, thresholdMeters, hideBehindDegrees, previousId);
    if (!challengerId) return previousId;

    const challenger = buildings.find((building) => building.id === challengerId);
    const challengerMetric = challenger ? focusMetric(challenger, point, cameraHeading) : null;
    if (challengerMetric && challengerMetric.distance + switchAdvantage < previousMetric.distance) return challengerId;
    return previousId;
  }

  return nearestFocusBuilding(buildings, point, cameraHeading, thresholdMeters, hideBehindDegrees);
}

function nearestFocusBuilding(buildings, point, cameraHeading, thresholdMeters, hideBehindDegrees = 98, excludedId = null) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const building of buildings ?? []) {
    if (building.id === excludedId) continue;
    const { distance, relative } = focusMetric(building, point, cameraHeading);
    if (distance > thresholdMeters || distance >= bestDistance) continue;
    if (relative > hideBehindDegrees) continue;
    bestDistance = distance;
    best = building.id;
  }
  return best;
}

function focusMetric(building, point, cameraHeading) {
  const target = [building.lon, building.lat];
  const distance = haversineMeters(point, target);
  const targetBearing = bearingDegrees(point, target);
  const relative = Math.abs(shortestAngleDelta(cameraHeading, targetBearing));
  return { distance, relative };
}

function interpolateRouteIndex(route, cursor) {
  const index = clamp(Math.floor(cursor), 0, route.length - 2);
  const local = clamp(cursor - index, 0, 1);
  const a = route[index];
  const b = route[index + 1];
  const lerp = (key, fallback = 0) => Number(a[key] ?? fallback) + (Number(b[key] ?? a[key] ?? fallback) - Number(a[key] ?? fallback)) * local;
  return {
    lon: lerp("lon"),
    lat: lerp("lat"),
    height: lerp("height", 10),
    heading: interpolateAngle(Number(a.heading ?? 0), Number(b.heading ?? a.heading ?? 0), local),
    pitch: lerp("pitch", -5)
  };
}

function interpolateAngle(a, b, t) {
  return a + shortestAngleDelta(a, b) * t;
}

function shortestAngleDelta(a, b) {
  return ((b - a + 540) % 360) - 180;
}

function sameCoordinate(a, b) {
  return Array.isArray(a) && Array.isArray(b)
    && Number(a[0]) === Number(b[0])
    && Number(a[1]) === Number(b[1]);
}

function coordinateKey(coord) {
  // 6 decimals preserves OSM shared-node identity while absorbing harmless JSON float noise.
  return `${Number(coord[0]).toFixed(6)},${Number(coord[1]).toFixed(6)}`;
}

function lerpCoordinate(a, b, t) {
  return [Number(a[0]) + (Number(b[0]) - Number(a[0])) * t, Number(a[1]) + (Number(b[1]) - Number(a[1])) * t];
}

function resolveSpawnFocusPoint(city) {
  const lon = Number(city.__navigation?.spawnLon ?? city.camera?.lon ?? city.center?.lon);
  const lat = Number(city.__navigation?.spawnLat ?? city.camera?.lat ?? city.center?.lat);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

function sampleBuildingCentersNearFocus(buildings, focus, radiusMeters, limit) {
  const max = Math.max(80, Number.isFinite(limit) ? limit : 900);
  const rows = [];
  for (const feature of buildings?.features ?? []) {
    if (feature.geometry?.type !== "Polygon") continue;
    const ring = feature.geometry.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 4) continue;
    const center = polygonCentroid(ring);
    if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) continue;
    const focusDistance = focus ? haversineMeters(focus, center) : 0;
    if (focus && focusDistance > radiusMeters) continue;
    rows.push({ center, focusDistance, id: feature.properties?.buildingId ?? feature.id ?? rows.length });
  }

  rows.sort((a, b) => {
    if (a.focusDistance !== b.focusDistance) return a.focusDistance - b.focusDistance;
    return stableUnit(a.id, "spawn-building") - stableUnit(b.id, "spawn-building");
  });
  return rows.slice(0, max).map((item) => item.center);
}

function nearbyBuildingRoadScore(edge, buildingCenters, radiusMeters) {
  if (!buildingCenters?.length) return 0;
  let score = 0;
  for (const center of buildingCenters) {
    const distance = pointToSegmentMeters(center, edge.a, edge.b);
    if (distance <= radiusMeters) {
      score += 1 + (radiusMeters - distance) / radiusMeters;
      if (score >= 10) return 10;
    }
  }
  return score;
}

function weightedRandom(items, weightFn) {
  if (!items.length) return null;
  const weights = items.map((item) => Math.max(0.001, Number(weightFn(item)) || 0.001));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let value = Math.random() * total;
  for (let index = 0; index < items.length; index += 1) {
    value -= weights[index];
    if (value <= 0) return items[index];
  }
  return items.at(-1);
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}

function removeConsecutiveDuplicates(coordinates) {
  const result = [];
  for (const point of coordinates) {
    if (!result.length || haversineMeters(result.at(-1), point) > 0.35) result.push(point);
  }
  return result;
}

function roadWidth(highway) {
  if (["motorway", "trunk", "primary"].includes(highway)) return 6;
  if (["secondary", "tertiary"].includes(highway)) return 5;
  if (["service", "pedestrian"].includes(highway)) return 2.6;
  return 3.5;
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

function distancePointToRouteMeters(point, route) {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < route.length - 1; index += 1) {
    best = Math.min(best, pointToSegmentMeters(
      point,
      [route[index].lon, route[index].lat],
      [route[index + 1].lon, route[index + 1].lat]
    ));
  }
  return best;
}

function pointToSegmentMeters(point, a, b) {
  const lat0 = Number(point[1]) * Math.PI / 180;
  const scaleX = 111320 * Math.cos(lat0);
  const scaleY = 110540;
  const px = (Number(point[0]) - Number(a[0])) * scaleX;
  const py = (Number(point[1]) - Number(a[1])) * scaleY;
  const bx = (Number(b[0]) - Number(a[0])) * scaleX;
  const by = (Number(b[1]) - Number(a[1])) * scaleY;
  const len2 = bx * bx + by * by;
  const t = len2 ? clamp((px * bx + py * by) / len2, 0, 1) : 0;
  return Math.hypot(px - bx * t, py - by * t);
}

function lineLengthMeters(coordinates) {
  let sum = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    sum += haversineMeters(coordinates[index - 1], coordinates[index]);
  }
  return sum;
}

function routeLengthFromCameraPoints(route) {
  let sum = 0;
  for (let index = 1; index < route.length; index += 1) {
    sum += haversineMeters([route[index - 1].lon, route[index - 1].lat], [route[index].lon, route[index].lat]);
  }
  return sum;
}

function densifyLine(coordinates, stepMeters) {
  if (!coordinates.length) return [];
  const result = [coordinates[0]];
  for (let index = 1; index < coordinates.length; index += 1) {
    const a = coordinates[index - 1];
    const b = coordinates[index];
    const distance = haversineMeters(a, b);
    const steps = Math.max(1, Math.ceil(distance / stepMeters));
    for (let part = 1; part <= steps; part += 1) {
      const t = part / steps;
      result.push(lerpCoordinate(a, b, t));
    }
  }
  return result;
}

function bearingDegrees(a, b) {
  const lon1 = Number(a[0]) * Math.PI / 180;
  const lat1 = Number(a[1]) * Math.PI / 180;
  const lon2 = Number(b[0]) * Math.PI / 180;
  const lat2 = Number(b[1]) * Math.PI / 180;
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function haversineMeters(a, b) {
  const radius = 6371000;
  const lat1 = Number(a[1]) * Math.PI / 180;
  const lat2 = Number(b[1]) * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLon = (Number(b[0]) - Number(a[0])) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function resolveRuntimeCity(city, config) {
  const override = config.cityOverrides?.[city.id] ?? {};
  const navigation = {
    ...(config.navigation ?? {}),
    ...(override.navigation ?? {}),
    ...Object.fromEntries(Object.entries(override).filter(([key]) => key !== "navigation"))
  };

  return {
    ...city,
    routeHeight: Number(navigation.cameraHeightMeters ?? city.routeHeight ?? 2.2),
    routePitch: Number(navigation.cameraPitchDegrees ?? city.routePitch ?? -1.5),
    walkStepMeters: Number(navigation.roadStepMeters ?? city.walkStepMeters ?? 3.5),
    __navigation: navigation
  };
}

function setCameraFrustum(viewer, fovDegrees) {
  const fov = Number(fovDegrees);
  if (!Number.isFinite(fov) || !viewer.camera?.frustum || !("fov" in viewer.camera.frustum)) return;
  viewer.camera.frustum.fov = Cesium.Math.toRadians(clamp(fov, 35, 110));
}


function verifyRealOsmBuildings(collection, city) {
  const features = collection?.features ?? [];
  const osmIds = new Set();
  const footprintSignatures = new Set();
  for (const feature of features) {
    const id = String(feature?.properties?.osmBuildingId ?? feature?.id ?? "");
    if (id.startsWith("osm-way-")) osmIds.add(id);
    const ring = feature?.geometry?.coordinates?.[0];
    if (Array.isArray(ring)) {
      footprintSignatures.add(ring.map((point) => `${Number(point[0]).toFixed(6)},${Number(point[1]).toFixed(6)}`).join("|"));
    }
  }
  if (osmIds.size !== features.length || footprintSignatures.size !== features.length) {
    throw new Error(`${city.name}: buildings cache is not a unique real OSM footprint collection`);
  }
  console.info(`${city.name}: verified ${features.length} unique OpenStreetMap building footprints (${osmIds.size} osm-way ids).`);
}

function classifyBuilding(value) {
  const type = String(value ?? "yes").toLowerCase();
  if (["apartments", "residential", "dormitory", "hotel"].includes(type)) return "residential";
  if (["house", "detached", "semidetached_house", "terrace", "bungalow", "cabin", "hut"].includes(type)) return "house";
  if (["industrial", "warehouse", "hangar", "factory"].includes(type)) return "industrial";
  if ([
    "commercial", "retail", "office", "school", "kindergarten", "college", "university",
    "hospital", "clinic", "civic", "public", "service", "garage", "garages", "church",
    "sports_centre", "train_station", "transportation"
  ].includes(type)) return "nonResidential";
  return "unknown";
}

function configuredBuildingHeight(properties, buildingClass, config) {
  const floorHeight = Number(config.floorHeightMeters ?? 3.05);
  const levels = Number(properties.levels);
  if (Number.isFinite(levels) && levels > 0) {
    return clamp(levels * floorHeight, 3, Number(config.maxHeightMeters ?? 48));
  }

  if (config.useCachedHeightWithoutLevels === true) {
    const cached = Number(properties.height);
    if (Number.isFinite(cached) && cached > 0) return clamp(cached, 3, Number(config.maxHeightMeters ?? 48));
  }

  const seed = stableUnit(properties.osmBuildingId ?? properties.osmId ?? properties.buildingId, buildingClass);
  if (buildingClass === "residential" || buildingClass === "house") {
    const band = config[buildingClass] ?? {};
    const fallback = Array.isArray(band.fallbackFloors) && band.fallbackFloors.length
      ? band.fallbackFloors
      : [Number(band.minFloors ?? 2), Number(band.maxFloors ?? 6)];
    const index = Math.min(fallback.length - 1, Math.floor(seed * fallback.length));
    const floors = Number(fallback[index] ?? band.minFloors ?? 2);
    return clamp(floors * floorHeight, 3, Number(config.maxHeightMeters ?? 48));
  }

  const band = config[buildingClass] ?? config.unknown ?? {};
  const min = Number(band.minHeightMeters ?? 7);
  const max = Number(band.maxHeightMeters ?? 18);
  return clamp(min + (max - min) * seed, 3, Number(config.maxHeightMeters ?? 48));
}

function chooseBuildingTexture(id, buildingClass, config) {
  const list = config.textures?.[buildingClass] ?? config.textures?.unknown ?? [];
  if (!Array.isArray(list) || !list.length) return null;
  const index = Math.min(list.length - 1, Math.floor(stableUnit(id, `texture-${buildingClass}`) * list.length));
  return list[index];
}

function stableUnit(value, salt = "") {
  const text = `${salt}:${String(value ?? "")}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function materialForBuilding(textureUrl, buildingClass, offer, selected, config) {
  // A building with a card is always highlighted by one opaque solid color.
  // No transparency and no texture swapping on approach, so the visual state cannot flicker.
  if (selected) return colors.selected;
  if (offer) return colors[offer.kind] ?? colors.neutral;

  if (textureUrl && config.useImageTextures === true) {
    const repeat = config.textureRepeat ?? {};
    return new Cesium.ImageMaterialProperty({
      image: textureUrl,
      repeat: new Cesium.Cartesian2(Number(repeat.x ?? 3), Number(repeat.y ?? 5)),
      color: Cesium.Color.WHITE,
      transparent: false
    });
  }

  return facadeGridMaterial(buildingClass, config);
}

function facadeGridMaterial(buildingClass, config = {}) {
  const grid = config.facadeGrid ?? {};
  const palette = grid.colors ?? {};
  const fill = palette[buildingClass] ?? palette.unknown ?? "#d9e1e4";
  const lineCount = grid.lineCount ?? {};
  const lineThickness = grid.lineThickness ?? {};
  return new Cesium.GridMaterialProperty({
    color: Cesium.Color.fromCssColorString(fill).withAlpha(1),
    cellAlpha: Number(grid.cellAlpha ?? 1),
    lineCount: new Cesium.Cartesian2(Number(lineCount.x ?? 3), Number(lineCount.y ?? 9)),
    lineThickness: new Cesium.Cartesian2(Number(lineThickness.x ?? 1), Number(lineThickness.y ?? 1))
  });
}

function applyCityLighting(viewer, config = {}) {
  const enabled = config.enabled !== false;
  viewer.scene.globe.enableLighting = enabled;
  viewer.scene.sun.show = enabled;
  viewer.scene.moon.show = false;
  viewer.scene.skyBox.show = false;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = enabled;
  if (viewer.scene.fog) {
    viewer.scene.fog.enabled = enabled && config.fog !== false;
    if (Number.isFinite(Number(config.fogDensity))) viewer.scene.fog.density = Number(config.fogDensity);
  }
  viewer.scene.highDynamicRange = enabled;

  // Stable Arctic summer daytime: the sun is above the horizon and does not move while the
  // user scrolls. This gives the city a readable daylight direction without continuous renders.
  if (enabled) {
    const iso = String(config.isoTime ?? "2026-06-21T12:00:00Z");
    try { viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(iso); } catch { /* keep Cesium clock */ }
    if (Cesium.SunLight) viewer.scene.light = new Cesium.SunLight();
  }
  viewer.shadows = Boolean(config.shadows ?? false);
}

async function installCityBasemap(viewer, raw, config = {}) {
  viewer.imageryLayers.removeAll();

  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  let onlineLayer = null;
  if (online && config.preferOnlineOsm !== false) {
    onlineLayer = addOnlineOsmLayer(viewer, { alpha: Number(config.onlineOsmAlpha ?? 1) });
    if (onlineLayer) onlineLayer.show = true;
  }

  // A full-city local raster is expensive to build. When normal OSM tiles are available we do
  // not render thousands of cached footprints into a 3K canvas on the main UI thread. The local
  // fallback is generated only offline (or when explicitly forced).
  const needLocalFallback = config.cityOfflineRaster !== false
    && (!onlineLayer || config.alwaysBuildOfflineRaster === true);

  if (!needLocalFallback) return;

  const rendered = await renderLocalBasemap(raw, config);
  if (!rendered) return;

  const options = {
    rectangle: rendered.rectangle,
    credit: new Cesium.Credit("OpenStreetMap")
  };
  try {
    const provider = typeof Cesium.SingleTileImageryProvider.fromUrl === "function"
      ? await Cesium.SingleTileImageryProvider.fromUrl(rendered.url, options)
      : new Cesium.SingleTileImageryProvider({ url: rendered.url, ...options });
    const layer = viewer.imageryLayers.addImageryProvider(provider);
    layer.alpha = 1;
  } catch (error) {
    console.warn("Local city basemap could not be installed.", error);
  } finally {
    rendered.revoke?.();
  }
}

async function renderLocalBasemap(raw, config) {
  if (typeof document === "undefined") return null;

  // Do not flatten a whole city into one JS array and then call Math.min(...array).
  // A full Murmansk export can contain hundreds of thousands of coordinates and spreading
  // that many arguments exceeds the JavaScript engine call-stack/argument limit.
  const bounds = computeGeoJsonBounds(raw.roads, raw.buildings, raw.context);
  if (!bounds) return null;

  let { west, east, south, north } = bounds;
  const padding = Number(config.paddingRatio ?? 0.035);
  const dx = Math.max(0.001, east - west), dy = Math.max(0.001, north - south);
  west -= dx * padding; east += dx * padding; south -= dy * padding; north += dy * padding;

  const size = clamp(Math.round(Number(config.resolution ?? 3072)), 1024, 4096);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  const palette = {
    background: config.background ?? "#e8ece7",
    water: config.water ?? "#b8d8e8",
    waterLine: config.waterLine ?? "#91bed3",
    park: config.park ?? "#c9dfb4",
    forest: config.forest ?? "#b9d2a8",
    grass: config.grass ?? "#d7e6c4",
    residential: config.residentialLand ?? "#e8e3dc",
    industrial: config.industrialLand ?? "#d8d3cc",
    commercial: config.commercialLand ?? "#e6d8d3",
    cemetery: config.cemetery ?? "#cad8c1",
    parking: config.parking ?? "#d9d9d5",
    building: config.buildingFootprint ?? "#c1b9b0",
    buildingStroke: config.buildingStroke ?? "#aaa29a",
    roadCasing: config.roadCasing ?? "#c2beb6",
    roadFill: config.roadFill ?? "#faf8f3",
    majorRoad: config.majorRoad ?? "#f6d59a",
    rail: config.rail ?? "#8f8c88"
  };

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, size, size);

  const project = ([lon, lat]) => [
    ((Number(lon) - west) / (east - west)) * size,
    size - ((Number(lat) - south) / (north - south)) * size
  ];

  // OSM landuse/natural/leisure areas form the map body.
  const contextFeatures = raw.context?.features ?? [];
  for (const feature of contextFeatures) {
    if (feature.geometry?.type !== "Polygon") continue;
    const style = contextAreaStyle(feature.properties ?? {}, palette);
    if (!style) continue;
    drawPolygon(ctx, feature.geometry.coordinates, project, style.fill, style.stroke, Math.max(1, size / 2200));
  }

  // Waterways, coastlines and railways are drawn before streets/buildings.
  for (const feature of contextFeatures) {
    if (feature.geometry?.type !== "LineString") continue;
    const props = feature.properties ?? {};
    if (props.kind === "waterway" || props.natural === "coastline") {
      drawLine(ctx, feature.geometry.coordinates, project, palette.waterLine, Math.max(1.5, size / 1500));
    } else if (props.kind === "railway") {
      drawLine(ctx, feature.geometry.coordinates, project, palette.rail, Math.max(1.1, size / 2100), [5, 5]);
    }
  }

  // Roads: casing + fill, with main streets slightly warmer just like a normal map.
  const roadFeatures = (raw.roads?.features ?? []).filter((feature) => feature.geometry?.type === "LineString");
  for (const pass of ["casing", "fill"]) {
    for (const feature of roadFeatures) {
      const highway = feature.properties?.highway;
      const width = scaledRoadWidth(highway, size);
      const isMajor = ["motorway", "trunk", "primary", "secondary"].includes(highway);
      const color = pass === "casing"
        ? palette.roadCasing
        : isMajor ? palette.majorRoad : palette.roadFill;
      drawLine(ctx, feature.geometry.coordinates, project, color, pass === "casing" ? width + Math.max(1.5, size / 1600) : width);
    }
  }

  // All downloaded real OSM footprints remain visible in 2D even if only a configurable number
  // are extruded into 3D for performance.
  for (const feature of raw.buildings?.features ?? []) {
    if (feature.geometry?.type !== "Polygon") continue;
    drawPolygon(ctx, feature.geometry.coordinates, project, palette.building, palette.buildingStroke, Math.max(0.7, size / 3600));
  }

  const blob = await canvasToBlob(canvas);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);

  return {
    url,
    revoke() {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    },
    rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north)
  };
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}

function computeGeoJsonBounds(...collections) {
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let count = 0;

  const accept = (point) => {
    if (!Array.isArray(point) || point.length < 2) return;
    const lon = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    count += 1;
  };

  for (const collection of collections) {
    for (const feature of collection?.features ?? []) {
      visitGeometryCoordinates(feature?.geometry, accept);
    }
  }

  return count ? { west, east, south, north, count } : null;
}

function visitGeometryCoordinates(geometry, accept) {
  if (!geometry) return;
  const coordinates = geometry.coordinates;
  switch (geometry.type) {
    case "Point":
      accept(coordinates);
      break;
    case "MultiPoint":
    case "LineString":
      for (const point of coordinates ?? []) accept(point);
      break;
    case "MultiLineString":
    case "Polygon":
      for (const line of coordinates ?? []) {
        for (const point of line ?? []) accept(point);
      }
      break;
    case "MultiPolygon":
      for (const polygon of coordinates ?? []) {
        for (const ring of polygon ?? []) {
          for (const point of ring ?? []) accept(point);
        }
      }
      break;
    case "GeometryCollection":
      for (const child of geometry.geometries ?? []) visitGeometryCoordinates(child, accept);
      break;
    default:
      break;
  }
}

function contextAreaStyle(props, palette) {
  const landuse = String(props.landuse ?? "");
  const natural = String(props.natural ?? "");
  const leisure = String(props.leisure ?? "");
  const amenity = String(props.amenity ?? "");
  if (natural === "water" || props.water) return { fill: palette.water, stroke: palette.waterLine };
  if (["wood", "forest"].includes(natural) || landuse === "forest") return { fill: palette.forest, stroke: null };
  if (["park", "garden", "playground", "pitch"].includes(leisure)) return { fill: palette.park, stroke: null };
  if (["grass", "meadow", "recreation_ground", "village_green"].includes(landuse)) return { fill: palette.grass, stroke: null };
  if (landuse === "residential") return { fill: palette.residential, stroke: null };
  if (["industrial", "brownfield", "construction"].includes(landuse)) return { fill: palette.industrial, stroke: null };
  if (["commercial", "retail"].includes(landuse)) return { fill: palette.commercial, stroke: null };
  if (landuse === "cemetery") return { fill: palette.cemetery, stroke: null };
  if (amenity === "parking") return { fill: palette.parking, stroke: null };
  return null;
}

function drawPolygon(ctx, coordinates, project, fill, stroke = null, lineWidth = 1) {
  if (!Array.isArray(coordinates) || !coordinates.length) return;
  ctx.beginPath();
  for (const ring of coordinates) {
    if (!Array.isArray(ring) || ring.length < 3) continue;
    ring.forEach((point, index) => {
      const [x, y] = project(point);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
  ctx.fillStyle = fill;
  ctx.fill("evenodd");
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawLine(ctx, coordinates, project, color, width, dash = null) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return;
  ctx.beginPath();
  coordinates.forEach((point, index) => {
    const [x, y] = project(point);
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash ?? []);
  ctx.stroke();
  ctx.setLineDash([]);
}

function scaledRoadWidth(highway, size) {
  const base = roadWidth(highway);
  return Math.max(1.5, base * (size / 1024));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
