import "./styles.css";
import { createArcticViewer, setupRegionMap } from "./cesium/map.js";
import { createRouteController, enterCityScene, preloadCityScene } from "./cesium/city.js";
import { loadCsvPrototypeData, loadJson } from "./data.js";
import { resetState, setState, state } from "./state.js";
import {
  getAvailableOffers,
  getCityStats
} from "./simulation/offers.js";
import {
  positionOfferCard,
  renderCityStory,
  renderRegionScreen,
  renderStartScreen,
  updateJourneyControls,
  updateOfferCard
} from "./ui/screens.js";

const root = document.querySelector("#app");

let scenarios = null;
let allOffers = [];
let natureData = {};
let benefitsData = {};
let professions = [];
let prototypeConfig = {};
let viewer = null;
let regionMap = null;
let cityScene = null;
let routeController = null;
let isTransitioning = false;

boot();

async function boot() {
  try {
    const [csvData, scenarioData, nextNatureData, nextBenefitsData, nextConfig] = await Promise.all([
      loadCsvPrototypeData(),
      loadJson("/data/scenarios.json"),
      loadJson("/data/nature.json"),
      loadJson("/data/benefits.json"),
      loadJson("/data/config.json")
    ]);
    professions = csvData.professions;
    allOffers = csvData.offers;
    scenarios = scenarioData;
    natureData = nextNatureData;
    benefitsData = nextBenefitsData;
    prototypeConfig = nextConfig ?? {};
    showStart();
  } catch (error) {
    root.innerHTML = `<main class="fatal-error"><strong>Не удалось загрузить данные прототипа.</strong><span>${error.message}</span></main>`;
    console.error(error);
  }
}

function showStart() {
  destroyCesium();
  renderStartScreen(root, { professions, onStart: handleStart });
}

function handleStart(selection) {
  setState({
    profession: selection.profession,
    experience: selection.experience,
    selectedRegion: null,
    selectedCity: null,
    selectedYears: 1,
    selectedMode: "profession",
    selectedObject: null,
    routeProgress: 0,
    chapter: "city"
  });
  showRegions("region");
}

async function showRegions(page = "region") {
  destroyCesium();
  const effectivePage = page === "city" && !state.selectedRegion ? "region" : page;
  const refs = renderRegionScreen(root, {
    scenarios,
    state,
    page: effectivePage,
    onBack: () => { resetState(); showStart(); },
    onPage: (nextPage) => navigateMapPage(refs, nextPage),
    onRegionChange: (regionId) => handleRegionSelect(refs, regionId),
    onCityChange: (cityId) => handleCitySelect(cityId)
  });

  try {
    viewer = createArcticViewer(refs.cesiumContainer, prototypeConfig);
    regionMap = await setupRegionMap(viewer, scenarios, {
      onRegionPick: (region) => handleRegionPick(refs, region),
      onCityPick: (city) => {
        if (city.ready) handleCityPick(city);
      },
      config: prototypeConfig
    });

    if (effectivePage === "city" && state.selectedRegion) {
      await regionMap.selectRegion(state.selectedRegion);
    } else {
      await regionMap.showOverview?.(state.selectedRegion);
    }
  } catch (error) {
    refs.cesiumContainer.innerHTML = `<div class="cesium-error">Не удалось загрузить карту.<br><small>${error.message}</small></div>`;
    console.error(error);
  }
}

async function navigateMapPage(refs, page) {
  if (isTransitioning) return;
  if (page === "life") {
    if (state.selectedCity) renderCurrentStory();
    return;
  }
  if (!regionMap) {
    showRegions(page);
    return;
  }

  isTransitioning = true;
  try {
    if (page === "region") {
      await regionMap.showOverview?.(state.selectedRegion);
    } else if (page === "city" && state.selectedRegion) {
      await regionMap.selectRegion(state.selectedRegion);
    }
    refreshMapJourneyControls(refs, page);
  } finally {
    isTransitioning = false;
  }
}

async function handleRegionSelect(refs, regionId) {
  if (!regionId) {
    setState({ selectedRegion: null, selectedCity: null, selectedObject: null });
    await regionMap?.showOverview?.();
    refreshMapJourneyControls(refs, "region");
    return;
  }
  const region = scenarios.regions.find((item) => item.id === regionId);
  if (region) await handleRegionPick(refs, region);
}

async function handleRegionPick(refs, region) {
  if (isTransitioning || !regionMap) return;
  isTransitioning = true;
  try {
    setState({ selectedRegion: region.id, selectedCity: null, selectedObject: null });
    region.cities.filter((city) => city.ready).forEach((city) => preloadCityScene(city));
    await regionMap.selectRegion(region.id);
    refreshMapJourneyControls(refs, "city");
  } finally {
    isTransitioning = false;
  }
}

function refreshMapJourneyControls(refs, page) {
  updateJourneyControls(refs, {
    scenarios,
    state,
    page,
    onPage: (nextPage) => navigateMapPage(refs, nextPage),
    onRegionChange: (regionId) => handleRegionSelect(refs, regionId),
    onCityChange: (cityId) => handleCitySelect(cityId)
  });
}

function handleCitySelect(cityId) {
  if (!cityId) return;
  const city = findCityById(cityId);
  if (city?.ready) handleCityPick(city);
}

function handleCityPick(city) {
  const region = scenarios.regions.find((item) => item.cities.some((candidate) => candidate.id === city.id));
  setState({
    selectedRegion: region?.id ?? state.selectedRegion,
    selectedCity: city.id,
    selectedYears: 1,
    selectedMode: "profession",
    selectedObject: null,
    routeProgress: 0,
    chapter: "city"
  });
  renderCurrentStory();
}

async function renderCurrentStory() {
  destroyCesium();
  const city = findSelectedCity();
  if (!city) {
    showRegions(state.selectedRegion ? "city" : "region");
    return;
  }

  const chapterMode = state.chapter === "estate" ? "estate" : state.chapter === "work" ? "profession" : state.selectedMode;
  if (chapterMode !== state.selectedMode) setState({ selectedMode: chapterMode });

  const offers = getAvailableOffers(allOffers, state);
  let offer = state.selectedObject ? offers.find((item) => item.id === state.selectedObject) : null;
  if (!offer && state.selectedObject) setState({ selectedObject: null });

  const stats = getCityStats(allOffers, state);
  const nature = natureData[state.selectedRegion] ?? [];
  const benefits = benefitsData[state.selectedRegion] ?? [];

  const refs = renderCityStory(root, {
    scenarios,
    state,
    city,
    nature,
    benefits,
    stats,
    offer,
    onBack: () => showRegions("city"),
    onPage: (page) => {
      if (page === "region") showRegions("region");
      else if (page === "city") showRegions("city");
    },
    onRegionChange: (regionId) => {
      if (!regionId) return;
      setState({ selectedRegion: regionId, selectedCity: null, selectedObject: null });
      showRegions("city");
    },
    onCityChange: (cityId) => handleCitySelect(cityId),
    onChapter: (chapter) => {
      if (!chapter) return;
      const patch = { chapter };
      if (chapter === "estate") patch.selectedMode = "estate";
      if (chapter === "work") patch.selectedMode = "profession";
      patch.selectedObject = null;
      setState(patch);
      renderCurrentStory();
    },
    onTimeline: (years) => {
      setState({ selectedYears: years, selectedObject: null });
      renderCurrentStory();
    },
    onMode: (mode) => {
      setState({ selectedMode: mode, selectedObject: null, chapter: "city" });
      const available = getAvailableOffers(allOffers, state);
      const visible = available.filter((item) =>
        mode === "profession" ? item.kind === "work" : item.kind === "rent" || item.kind === "sale"
      );
      cityScene?.setOffers?.(visible);
      cityScene?.highlight?.(null);
      updateOfferCard(refs, null);
      routeController?.refresh?.();
    }
  });

  if (!refs.cesiumContainer) return;

  try {
    viewer = createArcticViewer(refs.cesiumContainer, prototypeConfig);
    const availableOffers = getAvailableOffers(allOffers, state);
    const visibleOffers = availableOffers.filter((item) =>
      state.selectedMode === "profession" ? item.kind === "work" : item.kind === "rent" || item.kind === "sale"
    );
    cityScene = await enterCityScene(viewer, city, {
      offers: visibleOffers,
      onBuildingPick: (buildingId, pickedOffer) => handleBuildingFocus(refs, buildingId, pickedOffer),
      config: prototypeConfig
    });

    routeController = createRouteController(viewer, cityScene, cityScene.focusBuildings, {
      initialIndex: cityScene.spawnIndex,
      config: prototypeConfig,
      onProgress: ({ progress, buildingId }) => {
        setState({ routeProgress: progress });
        if (buildingId) {
          handleBuildingFocus(refs, buildingId, cityScene?.getOffer(buildingId));
          positionOfferCard(refs, cityScene?.getScreenAnchor(buildingId));
        } else {
          setState({ selectedObject: null });
          cityScene?.highlight(null);
          updateOfferCard(refs, null);
        }
      }
    });
  } catch (error) {
    refs.cesiumContainer.innerHTML = `<div class="cesium-error">Не удалось загрузить локальную 3D-сцену города.<br><small>${error.message}</small></div>`;
    console.error(error);
  }
}

function handleBuildingFocus(refs, buildingId, offer) {
  if (!offer) return;
  setState({ selectedObject: offer.id });
  cityScene?.highlight(buildingId);
  updateOfferCard(refs, offer);
  positionOfferCard(refs, cityScene?.getScreenAnchor(buildingId));
}

function findSelectedCity() {
  return findCityById(state.selectedCity);
}

function findCityById(cityId) {
  if (!cityId) return null;
  for (const region of scenarios.regions) {
    const city = region.cities.find((item) => item.id === cityId);
    if (city) return city;
  }
  return null;
}

function destroyCesium() {
  routeController?.destroy?.();
  routeController = null;
  cityScene?.destroy?.();
  cityScene = null;
  regionMap?.destroy?.();
  regionMap = null;

  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  viewer = null;
  isTransitioning = false;
}
