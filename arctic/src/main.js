import "./styles.css";
import { createArcticViewer, setupRegionMap } from "./cesium/map.js";
import { createRouteController, enterCityScene } from "./cesium/city.js";
import { loadJson } from "./data.js";
import { experienceOptions, resetState, setState, state } from "./state.js";
import {
  getAvailableOffers,
  getCityStats,
  getFallbackOffer,
  getOfferForBuilding
} from "./simulation/offers.js";
import {
  renderCityStory,
  renderRegionList,
  renderRegionScreen,
  renderStartScreen,
  setStatus,
  showCityPicker,
  updateOfferCard,
  updateRouteProgress
} from "./ui/screens.js";

const root = document.querySelector("#app");

let scenarios = null;
let allOffers = [];
let natureData = {};
let benefitsData = {};
let professions = [];
let viewer = null;
let regionMap = null;
let cityScene = null;
let routeController = null;
let isTransitioning = false;

boot();

async function boot() {
  try {
    [professions, scenarios, allOffers, natureData, benefitsData] = await Promise.all([
      loadJson("/data/professions.json"),
      loadJson("/data/scenarios.json"),
      loadJson("/data/offers.json"),
      loadJson("/data/nature.json"),
      loadJson("/data/benefits.json")
    ]);
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
  showRegions();
}

async function showRegions() {
  destroyCesium();
  const refs = renderRegionScreen(root, { onBack: () => { resetState(); showStart(); } });

  try {
    viewer = createArcticViewer(refs.cesiumContainer);
    renderRegionList(refs, scenarios.regions, (region) => handleRegionPick(refs, region));
    regionMap = await setupRegionMap(viewer, scenarios, {
      onRegionPick: (region) => handleRegionPick(refs, region),
      onCityPick: (city) => {
        if (city.ready) {
          handleCityPick(city);
        } else {
          setStatus(refs, `${city.name}: ${city.note ?? "сценарий готовится"}.`);
        }
      }
    });
    setStatus(refs, "Выберите область на карте.");
  } catch (error) {
    setStatus(refs, "Не удалось загрузить карту. Проверьте public/data/*.geojson.");
    console.error(error);
  }
}

async function handleRegionPick(refs, region) {
  if (isTransitioning || !regionMap) return;
  isTransitioning = true;
  setState({ selectedRegion: region.id, selectedCity: null });
  refs.cityPanel.hidden = true;
  setStatus(refs, `${region.name}: приближаемся…`);

  await regionMap.selectRegion(region.id);
  showCityPicker(refs, region, (city) => handleCityPick(city));
  isTransitioning = false;
}

function handleCityPick(city) {
  setState({
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
    showRegions();
    return;
  }

  const chapterMode = state.chapter === "estate" ? "estate" : state.chapter === "work" ? "profession" : state.selectedMode;
  if (chapterMode !== state.selectedMode) setState({ selectedMode: chapterMode });

  const offers = getAvailableOffers(allOffers, state);
  const preferredKind = state.chapter === "estate" ? "rent" : state.chapter === "work" ? "work" : null;
  let offer = state.selectedObject ? offers.find((item) => item.id === state.selectedObject) : null;
  if (!offer) offer = getFallbackOffer(offers, state.selectedMode, preferredKind);
  if (offer?.id !== state.selectedObject) setState({ selectedObject: offer?.id ?? null });

  const stats = getCityStats(allOffers, state);
  const nature = natureData[state.selectedRegion] ?? [];
  const benefits = benefitsData[state.selectedRegion] ?? [];

  const refs = renderCityStory(root, {
    state,
    city,
    nature,
    benefits,
    stats,
    offer,
    onBack: showRegions,
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
      renderCurrentStory();
    }
  });

  if (!refs.cesiumContainer) return;

  try {
    viewer = createArcticViewer(refs.cesiumContainer);
    const availableOffers = getAvailableOffers(allOffers, state);
    const visibleOffers = availableOffers.filter((item) =>
      state.selectedMode === "profession" ? item.kind === "work" : item.kind === "rent" || item.kind === "sale"
    );
    const offerByBuilding = new Map(visibleOffers.map((item) => [item.buildingId, item]));

    cityScene = await enterCityScene(viewer, city, {
      offerByBuilding,
      onBuildingPick: (buildingId) => handleBuildingFocus(refs, availableOffers, offerByBuilding, buildingId)
    });

    routeController = createRouteController(viewer, city, {
      initialProgress: state.routeProgress,
      onProgress: ({ progress, buildingId }) => {
        setState({ routeProgress: progress });
        updateRouteProgress(refs, progress);
        if (buildingId) handleBuildingFocus(refs, availableOffers, offerByBuilding, buildingId);
      }
    });
  } catch (error) {
    refs.cesiumContainer.innerHTML = `<div class="cesium-error">Не удалось загрузить 3D-сцену города.</div>`;
    console.error(error);
  }
}

function handleBuildingFocus(refs, availableOffers, offerByBuilding, buildingId) {
  const offer = getOfferForBuilding(availableOffers, buildingId, state.selectedMode);
  if (!offer) return;
  setState({ selectedObject: offer.id });
  cityScene?.highlight(buildingId, offerByBuilding);
  updateOfferCard(refs, offer);
}

function findSelectedCity() {
  for (const region of scenarios.regions) {
    const city = region.cities.find((item) => item.id === state.selectedCity);
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
