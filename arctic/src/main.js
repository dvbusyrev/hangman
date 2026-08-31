import "./styles.css";
import { createArcticViewer, setupRegionMap } from "./cesium/map.js";
import { enterCityScene } from "./cesium/city.js";
import { loadJson } from "./data.js";
import { experienceOptions, resetState, setState, state } from "./state.js";
import {
  renderRegionList,
  renderScenarioScreen,
  renderStartScreen,
  setStatus,
  showCityLoaded,
  showCityPicker
} from "./ui/screens.js";

const root = document.querySelector("#app");

let viewer = null;
let regionMap = null;
let scenarios = null;
let isTransitioning = false;

boot();

async function boot() {
  try {
    const [professions, scenarioConfig] = await Promise.all([
      loadJson("/data/professions.json"),
      loadJson("/data/scenarios.json")
    ]);

    scenarios = scenarioConfig;
    renderStartScreen(root, {
      professions,
      onStart: handleStart
    });
  } catch (error) {
    root.innerHTML = `<main class="error-screen">Не удалось загрузить данные прототипа.</main>`;
    console.error(error);
  }
}

async function handleStart(selection) {
  const experienceLabel = experienceOptions.find((option) => option.id === selection.experience)?.label ?? "";

  setState({
    profession: selection.profession,
    experience: selection.experience,
    selectedRegion: null,
    selectedCity: null
  });

  const refs = renderScenarioScreen(root, {
    profession: state.profession,
    experienceLabel,
    onBack: handleBackToStart
  });

  try {
    viewer = createArcticViewer(refs.cesiumContainer);
  } catch (error) {
    refs.cesiumContainer.innerHTML = `
      <div class="cesium-error">
        Cesium не смог запустить WebGL в этом браузере.
        Откройте прототип в обычном desktop-браузере с включенным WebGL.
      </div>
    `;
    setStatus(refs, "Cesium не запустился: браузер не смог создать WebGL-контекст.");
    console.error(error);
    return;
  }

  renderRegionList(refs, scenarios.regions, (region) => handleRegionPick(refs, region));
  setStatus(refs, "Загружаем mock-геометрию четырех арктических регионов.");

  try {
    regionMap = await setupRegionMap(viewer, scenarios, {
      onRegionPick: (region) => handleRegionPick(refs, region)
    });
    setStatus(refs, "Кликните по региону на глобусе или выберите его в списке.");
  } catch (error) {
    setStatus(refs, "Не удалось загрузить регионы. Проверьте GeoJSON в public/data.");
    console.error(error);
  }
}

async function handleRegionPick(refs, region) {
  if (isTransitioning || !regionMap) {
    return;
  }

  isTransitioning = true;
  setState({
    selectedRegion: region.id,
    selectedCity: null
  });
  refs.cityPanel.hidden = true;
  setStatus(refs, `${region.name}: выполняется flyTo к mock-геометрии региона.`);

  await regionMap.selectRegion(region.id);
  showCityPicker(refs, region, (city) => handleCityPick(refs, city));
  isTransitioning = false;
}

async function handleCityPick(refs, city) {
  if (isTransitioning) {
    return;
  }

  isTransitioning = true;
  setState({
    selectedCity: city.id
  });
  setStatus(refs, `${city.name}: загружаем mock GeoJSON зданий и переводим камеру в город.`);

  try {
    const buildings = await enterCityScene(viewer, city);
    showCityLoaded(refs, city, buildings);
  } catch (error) {
    setStatus(refs, "Не удалось загрузить 3D-здания города. Проверьте файл buildings GeoJSON.");
    console.error(error);
  } finally {
    isTransitioning = false;
  }
}

function handleBackToStart() {
  if (regionMap) {
    regionMap.destroy();
    regionMap = null;
  }

  if (viewer && !viewer.isDestroyed()) {
    viewer.destroy();
    viewer = null;
  }

  resetState();
  boot();
}
