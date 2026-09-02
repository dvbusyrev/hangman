import "./styles.css";
import { createArcticViewer, setupRegionMap } from "./cesium/map.js";
import { setupRegionMap2D } from "./ui/regionMap2d.js";
import { setupCityMap2D } from "./ui/cityMap2d.js";
import { createRouteController, enterCityScene, preloadCityScene } from "./cesium/city.js";
import { loadCsvPrototypeData, loadJson } from "./data.js";
import { experienceOptions, setState, state } from "./state.js";
import {
  getAvailableOffers,
  getCityStats,
  getEffectiveExperience
} from "./simulation/offers.js";
import {
  positionOfferCard,
  renderCityStory,
  renderRegionScreen,
  updateJourneyControls,
  updateOfferCard
} from "./ui/screens.js";

const root = document.querySelector("#life-app");
const calculatorRoot = document.querySelector("#career-calculator");

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

let calculatorState = {
  profession: "",
  experience: "none",
  regionId: "",
  cityId: "",
  years: 1
};

setupLandingNavigation();
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
    scenarios = ensureRequiredRegions(scenarioData);
    natureData = nextNatureData;
    benefitsData = nextBenefitsData;
    prototypeConfig = nextConfig ?? {};

    initializeCalculator();
    renderCalculator();
    startLifeExperience();
  } catch (error) {
    root.innerHTML = `<div class="fatal-error"><strong>Не удалось загрузить интерактивный прототип.</strong><span>${escapeHtml(error.message)}</span></div>`;
    if (calculatorRoot) {
      calculatorRoot.innerHTML = `<div class="fatal-error"><strong>Не удалось загрузить калькулятор.</strong><span>${escapeHtml(error.message)}</span></div>`;
    }
    console.error(error);
  }
}

function ensureRequiredRegions(source) {
  // Canonical Arctic-zone set used by the 2D map: exactly 9 regions.
  // Existing scenario data wins, so ready cities/offers already configured
  // in scenarios.json are preserved.
  const requiredRegions = [
    {
      id: "karelia",
      name: "Республика Карелия",
      center: { lon: 32.5, lat: 63.5, height: 0 },
      camera: { lon: 32.5, lat: 63.5, height: 1150000, heading: 0, pitch: -70 },
      cities: []
    },
    {
      id: "murmansk",
      name: "Мурманская область",
      center: { lon: 34.7, lat: 68.0, height: 0 },
      camera: { lon: 34.7, lat: 68.0, height: 1050000, heading: 0, pitch: -70 },
      cities: []
    },
    {
      id: "arkhangelsk",
      name: "Архангельская область",
      center: { lon: 43.5, lat: 64.2, height: 0 },
      camera: { lon: 43.5, lat: 64.2, height: 1250000, heading: 0, pitch: -70 },
      cities: []
    },
    {
      id: "nenets",
      name: "Ненецкий автономный округ",
      center: { lon: 54.8, lat: 68.8, height: 0 },
      camera: { lon: 54.8, lat: 68.8, height: 1050000, heading: 0, pitch: -70 },
      cities: []
    },
    {
      id: "komi",
      name: "Республика Коми",
      center: { lon: 54.0, lat: 64.3, height: 0 },
      camera: { lon: 54.0, lat: 64.3, height: 1250000, heading: 0, pitch: -70 },
      cities: []
    },
    {
      id: "yamalo-nenets",
      name: "Ямало-Ненецкий автономный округ",
      center: { lon: 74, lat: 68.5, height: 0 },
      camera: { lon: 74, lat: 68.5, height: 1350000, heading: 0, pitch: -70 },
      cities: []
    },
    {
      id: "krasnoyarsk",
      name: "Красноярский край",
      center: { lon: 92.5, lat: 64.0, height: 0 },
      camera: { lon: 92.5, lat: 64.0, height: 1700000, heading: 0, pitch: -70 },
      cities: []
    },
    {
      id: "yakutia",
      name: "Республика Саха (Якутия)",
      center: { lon: 128.0, lat: 66.0, height: 0 },
      camera: { lon: 128.0, lat: 66.0, height: 1850000, heading: 0, pitch: -70 },
      cities: []
    },
    {
      id: "chukotka",
      name: "Чукотский автономный округ",
      center: { lon: 170.0, lat: 66.5, height: 0 },
      camera: { lon: 170.0, lat: 66.5, height: 1250000, heading: 0, pitch: -70 },
      cities: []
    }
  ];

  const sourceById = new Map((source?.regions ?? []).map((region) => [region.id, region]));

  return {
    ...(source ?? {}),
    regions: requiredRegions.map((fallback) => {
      const existing = sourceById.get(fallback.id);
      if (!existing) return fallback;

      return {
        ...fallback,
        ...existing,
        center: existing.center ?? fallback.center,
        camera: existing.camera ?? fallback.camera,
        cities: existing.cities ?? fallback.cities
      };
    })
  };
}

function setupLandingNavigation() {
  document.querySelectorAll("[data-scroll]").forEach((control) => {
    control.addEventListener("click", () => {
      const target = document.querySelector(control.dataset.scroll);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      closeMenu();
    });
  });

  const menuButton = document.querySelector(".arctic-menu-button");
  const menu = document.querySelector(".arctic-menu");
  menuButton?.addEventListener("click", () => {
    const opening = menu?.hasAttribute("hidden");
    if (!menu) return;
    if (opening) menu.removeAttribute("hidden");
    else menu.setAttribute("hidden", "");
    menuButton.setAttribute("aria-expanded", String(Boolean(opening)));
  });

  function closeMenu() {
    if (!menu || !menuButton) return;
    menu.setAttribute("hidden", "");
    menuButton.setAttribute("aria-expanded", "false");
  }

  const upButton = document.querySelector(".arctic-up-button");
  const syncUpButton = () => {
    upButton?.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.7);
  };
  syncUpButton();
  window.addEventListener("scroll", syncUpButton, { passive: true });
}

function startLifeExperience() {
  setState({
    profession: professions[0] || "",
    experience: experienceOptions[0]?.id ?? "none",
    selectedRegion: null,
    selectedCity: null,
    selectedYears: 0,
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
    professions,
    page: effectivePage,
    onBack: () => showRegions("region"),
    onPage: (nextPage) => navigateMapPage(refs, nextPage),
    onRegionChange: (regionId) => handleRegionSelect(refs, regionId),
    onCityChange: (cityId) => handleCitySelect(cityId),
    onProfileChange: (patch) => handleMapProfileChange(refs, effectivePage, patch)
  });

  try {
    if (effectivePage === "region") {
      regionMap = await setupRegionMap2D(refs.cesiumContainer, scenarios, {
        selectedRegionId: state.selectedRegion,
        onRegionPick: (region) => handleRegionPick(refs, region)
      });
      return;
    }

    if (effectivePage === "city") {
      regionMap = await setupCityMap2D(refs.cesiumContainer, scenarios, {
        selectedRegionId: state.selectedRegion,
        selectedCityId: state.selectedCity,
        onCityPick: (city) => handleCityPick(city)
      });
      return;
    }

    viewer = createArcticViewer(refs.cesiumContainer, prototypeConfig);
    regionMap = await setupRegionMap(viewer, scenarios, {
      onRegionPick: (region) => handleRegionPick(refs, region),
      onCityPick: (city) => {
        if (city.ready) handleCityPick(city);
      },
      config: prototypeConfig
    });

    if (state.selectedRegion) {
      await regionMap.selectRegion(state.selectedRegion);
    } else {
      await regionMap.showOverview?.();
    }
  } catch (error) {
    refs.cesiumContainer.innerHTML = `<div class="cesium-error">Не удалось загрузить карту.<br><small>${escapeHtml(error.message)}</small></div>`;
    console.error(error);
  }
}

async function navigateMapPage(refs, page) {
  if (isTransitioning) return;

  if (["life", "nature", "benefits"].includes(page)) {
    if (state.selectedCity) {
      setState({
        chapter: page === "nature" ? "nature" : page === "benefits" ? "benefits" : "city",
        selectedObject: null
      });
      renderCurrentStory();
    }
    return;
  }

  if (page === "region") {
    // ARCTIC_RESET_CITY_ON_REGIONS_V1
    // Returning to the region-selection step invalidates the chosen city and
    // all city-specific state. The selected region itself is kept visible.
    setState({
      selectedCity: null,
      selectedObject: null,
      routeProgress: 0
    });
    showRegions("region");
    return;
  }

  if (page === "city" && state.selectedRegion) {
    showRegions("city");
    return;
  }

  if (!regionMap) {
    showRegions(page);
    return;
  }

  refreshMapJourneyControls(refs, page);
}

async function handleRegionSelect(refs, regionId) {
  if (!regionId) {
    setState({ selectedRegion: null, selectedCity: null, selectedObject: null });
    if (regionMap?.kind === "cities-2d") {
      showRegions("region");
      return;
    }
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

    if (regionMap.kind === "regions-2d") {
      await regionMap.selectRegion?.(region.id);
      isTransitioning = false;
      showRegions("city");
      return;
    }

    if (regionMap.kind === "cities-2d") {
      await regionMap.selectRegion?.(region.id);
      refreshMapJourneyControls(refs, "city");
      return;
    }

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
    professions,
    page,
    onPage: (nextPage) => navigateMapPage(refs, nextPage),
    onRegionChange: (regionId) => handleRegionSelect(refs, regionId),
    onCityChange: (cityId) => handleCitySelect(cityId),
    onProfileChange: (patch) => handleMapProfileChange(refs, page, patch)
  });
}

function handleMapProfileChange(refs, page, patch) {
  setState({ ...patch, selectedObject: null });
  refreshMapJourneyControls(refs, page);
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
    selectedYears: 0,
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
    professions,
    city,
    nature,
    benefits,
    stats,
    offer,
    onBack: () => showRegions("city"),
    onPage: (page) => navigateMapPage(refs, page),
    onRegionChange: (regionId) => {
      if (!regionId) return;
      setState({ selectedRegion: regionId, selectedCity: null, selectedObject: null });
      showRegions("city");
    },
    onCityChange: (cityId) => handleCitySelect(cityId),
    onProfileChange: (patch) => {
      setState({ ...patch, selectedObject: null });
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
    let activeRouteBuildingId = null;
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
          const nextOffer = cityScene?.getOffer(buildingId);
          if (buildingId !== activeRouteBuildingId || state.selectedObject !== nextOffer?.id) {
            activeRouteBuildingId = buildingId;
            handleBuildingFocus(refs, buildingId, nextOffer);
          }
          positionOfferCard(refs, cityScene?.getScreenAnchor(buildingId));
        } else if (activeRouteBuildingId || state.selectedObject) {
          activeRouteBuildingId = null;
          setState({ selectedObject: null });
          cityScene?.highlight(null);
          updateOfferCard(refs, null);
        }
      }
    });
  } catch (error) {
    refs.cesiumContainer.innerHTML = `<div class="cesium-error">Не удалось загрузить локальную 3D-сцену города.<br><small>${escapeHtml(error.message)}</small></div>`;
    console.error(error);
  }
}

function initializeCalculator() {
  const region = scenarios.regions.find((item) => item.cities.some((city) => city.ready)) ?? null;
  const city = region?.cities.find((item) => item.ready) ?? null;
  calculatorState = {
    profession: professions[0] ?? "",
    experience: experienceOptions[0]?.id ?? "none",
    regionId: region?.id ?? "",
    cityId: city?.id ?? "",
    years: 1
  };
}

function renderCalculator() {
  if (!calculatorRoot) return;
  const readyRegions = scenarios.regions
    .map((region) => ({ ...region, cities: region.cities.filter((city) => city.ready) }))
    .filter((region) => region.cities.length);

  let selectedRegion = readyRegions.find((region) => region.id === calculatorState.regionId) ?? readyRegions[0] ?? null;
  const cities = selectedRegion?.cities ?? [];
  let selectedCity = cities.find((city) => city.id === calculatorState.cityId) ?? cities[0] ?? null;

  calculatorState.regionId = selectedRegion?.id ?? "";
  calculatorState.cityId = selectedCity?.id ?? "";

  const summary = getCalculatorSummary();

  calculatorRoot.innerHTML = `
    <div class="arctic-calculator">
      <form class="arctic-calculator__form" id="arctic-calculator-form">
        <label>
          <span>Профессия</span>
          <input name="profession" list="arctic-professions" value="${escapeHtml(calculatorState.profession)}" autocomplete="off" />
          <datalist id="arctic-professions">
            ${professions.map((profession) => `<option value="${escapeHtml(profession)}"></option>`).join("")}
          </datalist>
        </label>

        <label>
          <span>Опыт</span>
          <select name="experience">
            ${experienceOptions.map((option) => `<option value="${option.id}" ${calculatorState.experience === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>

        <label>
          <span>Регион</span>
          <select name="regionId">
            ${readyRegions.map((region) => `<option value="${region.id}" ${calculatorState.regionId === region.id ? "selected" : ""}>${escapeHtml(region.name)}</option>`).join("")}
          </select>
        </label>

        <label>
          <span>Город</span>
          <select name="cityId">
            ${cities.map((city) => `<option value="${city.id}" ${calculatorState.cityId === city.id ? "selected" : ""}>${escapeHtml(city.name)}</option>`).join("")}
          </select>
        </label>

        <fieldset class="arctic-calculator__years">
          <legend>Период</legend>
          ${[1, 3, 5].map((years) => `
            <label>
              <input type="radio" name="years" value="${years}" ${calculatorState.years === years ? "checked" : ""} />
              <span>${years} ${years === 1 ? "год" : years === 3 ? "года" : "лет"}</span>
            </label>
          `).join("")}
        </fieldset>
      </form>

      <div class="arctic-calculator__result">
        <span class="arctic-calculator__kicker">${escapeHtml(summary.cityName)}</span>
        <h3>${money(summary.totalIncome)}</h3>
        <p>Ориентировочный доход за ${calculatorState.years} ${calculatorState.years === 1 ? "год" : calculatorState.years === 3 ? "года" : "лет"}.</p>
        <dl>
          <div><dt>Средняя зарплата</dt><dd>${money(summary.salary)}/мес</dd></div>
          <div><dt>Опыт к концу периода</dt><dd>${summary.experience.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} года</dd></div>
          <div><dt>Доступная аренда</dt><dd>${summary.rentCount}</dd></div>
          <div><dt>Доступная покупка</dt><dd>${summary.saleCount}</dd></div>
        </dl>
        <button type="button" class="arctic-calculator__cta" id="open-calculated-city">Открыть город</button>
      </div>
    </div>
  `;

  const form = calculatorRoot.querySelector("#arctic-calculator-form");
  form?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

    if (target.name === "regionId") {
      calculatorState.regionId = target.value;
      const region = scenarios.regions.find((item) => item.id === target.value);
      calculatorState.cityId = region?.cities.find((city) => city.ready)?.id ?? "";
    } else if (target.name === "years") {
      calculatorState.years = Number(target.value);
    } else {
      calculatorState[target.name] = target.value;
    }
    renderCalculator();
  });

  form?.querySelector("input[name='profession']")?.addEventListener("change", (event) => {
    calculatorState.profession = event.currentTarget.value.trim();
    renderCalculator();
  });

  calculatorRoot.querySelector("#open-calculated-city")?.addEventListener("click", () => {
    const city = findCityById(calculatorState.cityId);
    if (!city) return;
    const region = scenarios.regions.find((item) => item.id === calculatorState.regionId);
    setState({
      profession: calculatorState.profession || professions[0] || "",
      experience: calculatorState.experience,
      selectedRegion: region?.id ?? null,
      selectedCity: city.id,
      selectedYears: calculatorState.years,
      selectedMode: "profession",
      selectedObject: null,
      routeProgress: 0,
      chapter: "city"
    });
    renderCurrentStory();
    document.querySelector("#life-experience")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function getCalculatorSummary() {
  const calcView = {
    profession: calculatorState.profession,
    experience: calculatorState.experience,
    selectedCity: calculatorState.cityId,
    selectedYears: calculatorState.years
  };
  const stats = getCityStats(allOffers, calcView);
  return {
    cityName: findCityById(calculatorState.cityId)?.name ?? "Арктика",
    salary: stats.salary,
    totalIncome: stats.salary * 12 * calculatorState.years,
    experience: getEffectiveExperience(calculatorState.experience, calculatorState.years),
    rentCount: stats.affordableRent,
    saleCount: stats.affordableSale
  };
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
  if (!cityId || !scenarios) return null;
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

function money(value) {
  if (!value) return "—";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)} ₽`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
