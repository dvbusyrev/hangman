import "./styles.css";
import { createArcticViewer, setupRegionMap } from "./cesium/map.js";
import { setupRegionMap2D } from "./ui/regionMap2d.js";
import { createRouteController, enterCityScene, preloadCityScene } from "./cesium/city.js";
import { expandMockCatalog, loadCsvPrototypeData, loadJson } from "./data.js";
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
  updateRegionMode,
  updateJourneyControls,
  updateOfferCard
} from "./ui/screens.js";
import { setupChatbot } from "./ui/chatbot.js";

const root = document.querySelector("#life-app");
const calculatorRoot = document.querySelector("#career-calculator");

let scenarios = null;
let allOffers = [];
let natureData = {};
let benefitsData = {};
let reviewsData = { topics: [], cities: {} };
let professions = [];
let prototypeConfig = {};
let viewer = null;
let regionMap = null;
let cityScene = null;
let routeController = null;
let isTransitioning = false;
let calculatorUpdateTimer = 0;

let calculatorState = {
  profession: "",
  experience: "none",
  regionId: "",
  cityId: "",
  years: 1,
  savingsRate: 10
};

setupLandingNavigation();
setupChatbot();
boot();

async function boot() {
  try {
    const [csvData, scenarioData, nextNatureData, nextBenefitsData, nextReviewsData, nextConfig, nextMockCatalog] = await Promise.all([
      loadCsvPrototypeData(),
      loadJson("/data/scenarios.json"),
      loadJson("/data/nature.json"),
      loadJson("/data/benefits.json"),
      loadJson("/data/reviews.json"),
      loadJson("/data/config.json"),
      loadJson("/data/mock-catalog.json")
    ]);

    professions = csvData.professions;
    scenarios = ensureRequiredRegions(scenarioData);
    allOffers = expandMockCatalog(csvData.offers, scenarios, nextMockCatalog);
    natureData = nextNatureData;
    benefitsData = nextBenefitsData;
    reviewsData = nextReviewsData ?? reviewsData;
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
    });
  });

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
    onProfileChange: (patch) => handleMapProfileChange(refs, effectivePage, patch),
    onMode: (mode) => handleMapModeChange(mode)
  });

  try {
    if (effectivePage === "region" || effectivePage === "city") {
      // ARCTIC_SINGLE_2D_MAP_V28
      // Both steps use the exact same region-map controller and SVG.
      regionMap = await setupRegionMap2D(refs.cesiumContainer, scenarios, {
        selectedRegionId: state.selectedRegion,
        selectedCityId: state.selectedCity,
        selectedMode: state.selectedMode,
        cityOfferCounts: getCityOfferCounts(),
        onRegionPick: (region) => handleRegionPick(refs, region),
        onCityPick: (city) => handleCityPick(city)
      });

      if (effectivePage === "city" && state.selectedRegion) {
        await regionMap.enterCities?.(state.selectedRegion, { animate: true });
      }
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
}async function navigateMapPage(refs, page) {
  if (isTransitioning) return;

  if (["life", "nature", "benefits", "reviews"].includes(page)) {
    if (state.selectedCity) {
      setState({
        chapter: page === "nature"
          ? "nature"
          : page === "benefits"
            ? "benefits"
            : page === "reviews"
              ? "reviews"
              : "city",
        selectedObject: null
      });
      renderCurrentStory();
    }
    return;
  }

  if (page === "region") {
    setState({
      selectedCity: null,
      selectedObject: null,
      routeProgress: 0
    });

    // If the current controller is our unified 2D map, do NOT rebuild it.
    // Simply zoom the very same SVG back to the Russia overview.
    if (regionMap?.kind === "regions-2d") {
      await regionMap.exitCities?.(state.selectedRegion);
      refreshMapJourneyControls(refs, "region");
      return;
    }

    showRegions("region");
    return;
  }

  if (page === "city" && state.selectedRegion) {
    // Same SVG, same DOM node, only viewBox changes.
    if (regionMap?.kind === "regions-2d") {
      await regionMap.enterCities?.(state.selectedRegion, { animate: true });
      refreshMapJourneyControls(refs, "city");
      return;
    }

    showRegions("city");
    return;
  }

  if (!regionMap) {
    showRegions(page);
    return;
  }

  refreshMapJourneyControls(refs, page);
}async function handleRegionSelect(refs, regionId) {
  if (!regionId) {
    setState({ selectedRegion: null, selectedCity: null, selectedObject: null });

    if (regionMap?.kind === "regions-2d") {
      await regionMap.exitCities?.(null);
      refreshMapJourneyControls(refs, "region");
      return;
    }

    await regionMap?.showOverview?.();
    refreshMapJourneyControls(refs, "region");
    return;
  }

  const region = scenarios.regions.find((item) => item.id === regionId);
  if (region) await handleRegionPick(refs, region);
}async function handleRegionPick(refs, region) {
  if (isTransitioning || !regionMap) return;
  isTransitioning = true;

  try {
    setState({ selectedRegion: region.id, selectedCity: null, selectedObject: null });
    region.cities.filter((city) => city.ready).forEach((city) => preloadCityScene(city));

    if (regionMap.kind === "regions-2d") {
      // ARCTIC_SINGLE_MAP_SMOOTH_V29
      // First let the SAME SVG complete its smooth geographic approach.
      // Only then replace the filter controls above it, so layout work never
      // interrupts the map animation.
      await regionMap.enterCities?.(region.id, { animate: true });
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
  updateRegionMode(root, state.selectedMode, page);
}

function handleMapProfileChange(refs, page, patch) {
  setState({ ...patch, selectedObject: null });
  refreshMapJourneyControls(refs, page);
}

function handleMapModeChange(mode) {
  if (!mode) return;
  setState({ selectedMode: mode });
  root?.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  regionMap?.setOfferMode?.(mode);
}

function getCityOfferCounts() {
  const counts = {};

  scenarios?.regions.forEach((region) => {
    region.cities.filter((city) => city.ready).forEach((city) => {
      const cityOffers = allOffers.filter((offer) => offer.cityId === city.id);
      counts[city.id] = {
        profession: cityOffers.filter((offer) => offer.kind === "work").length,
        estate: cityOffers.filter((offer) => offer.kind === "rent" || offer.kind === "sale").length
      };
    });
  });

  return counts;
}

function handleCitySelect(cityId, options = {}) {
  if (!cityId) return;
  const city = findCityById(cityId);
  if (city?.ready) handleCityPick(city, options);
}

function handleCityPick(city, { preserveChapter = false } = {}) {
  const region = scenarios.regions.find((item) => item.cities.some((candidate) => candidate.id === city.id));
  const currentChapter = ["nature", "benefits", "reviews"].includes(state.chapter)
    ? state.chapter
    : "city";
  setState({
    selectedRegion: region?.id ?? state.selectedRegion,
    selectedCity: city.id,
    selectedYears: 0,
    selectedMode: "profession",
    selectedObject: null,
    routeProgress: 0,
    chapter: preserveChapter ? currentChapter : "city"
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
  const naturePhotos = natureData.cityPhotos?.[city.id] ?? [];
  const benefits = benefitsData[state.selectedRegion] ?? [];
  const reviews = reviewsData.cities?.[city.id] ?? { reviews: [], likes: [], adjustments: [] };
  const reviewTopics = reviewsData.topics ?? [];

  const refs = renderCityStory(root, {
    scenarios,
    state,
    professions,
    city,
    nature,
    naturePhotos,
    benefits,
    reviews,
    reviewTopics,
    stats,
    offer,
    onBack: () => showRegions("city"),
    onPage: (page) => navigateMapPage(refs, page),
    onRegionChange: (regionId) => {
      if (!regionId) return;
      setState({ selectedRegion: regionId, selectedCity: null, selectedObject: null });
      showRegions("city");
    },
    onCityChange: (cityId) => handleCitySelect(cityId, { preserveChapter: true }),
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
    },
    onRouteMove: (steps) => {
      routeController?.moveBy?.(steps);
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
    years: 1,
    savingsRate: 10
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
        <div class="arctic-calculator__filters">
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

          <label>
            <span>Профессия</span>
            <select name="profession">
              ${professions.map((profession) => `<option value="${escapeHtml(profession)}" ${calculatorState.profession === profession ? "selected" : ""}>${escapeHtml(profession)}</option>`).join("")}
            </select>
          </label>

          <label>
            <span>Стаж работы</span>
            <select name="experience">
              ${experienceOptions.map((option) => `<option value="${option.id}" ${calculatorState.experience === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
            </select>
          </label>
        </div>

        <div class="arctic-calculator__controls">
          <fieldset class="arctic-calculator__years">
            <legend>Период работы</legend>
            <div class="arctic-calculator__range">
              <div class="arctic-calculator__range-row">
                <input
                  type="range"
                  name="years"
                  min="0"
                  max="60"
                  step="1"
                  value="${Math.round(Number(calculatorState.years) * 12)}"
                  aria-label="Период работы в месяцах"
                />
                <output class="arctic-calculator__range-value" data-years-value>${calculatorPeriodLabel(Math.round(Number(calculatorState.years) * 12))}</output>
              </div>
            </div>
          </fieldset>

          <label class="arctic-calculator__savings">
            <span class="arctic-calculator__range-label">
              <strong>Процент отложенных</strong>
            </span>
            <div class="arctic-calculator__range-row">
              <input
                type="range"
                name="savingsRate"
                min="0"
                max="100"
                step="1"
                value="${calculatorState.savingsRate}"
                aria-label="Процент отложенных денег"
              />
              <output class="arctic-calculator__range-value" data-savings-value>${calculatorState.savingsRate}%</output>
            </div>
          </label>
        </div>
      </form>

      <section class="arctic-calculator__result" aria-labelledby="calculator-result-title">
        <div class="arctic-calculator__result-summary">
          <span class="arctic-calculator__kicker" id="calculator-result-title">Результат</span>
          <strong class="arctic-calculator__city" data-calculator-city>${escapeHtml(summary.cityName)}</strong>
          <h3 data-calculator-total-income>${money(summary.totalIncome)}</h3>
          <p data-calculator-income-copy>Доход за период. Можно отложить ${money(summary.savedAmount)}.</p>
        </div>
        <div class="arctic-calculator__result-details">
          <h4>Что эквивалентно</h4>
          <dl data-calculator-equivalents>
            ${summary.equivalents.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`).join("")}
          </dl>
        </div>
        <button type="button" class="arctic-calculator__cta" id="open-calculated-city">Открыть город</button>
      </section>
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
      calculatorState.years = Number(target.value) / 12;
      scheduleCalculatorResultUpdate();
      return;
    } else if (target.name === "savingsRate") {
      calculatorState.savingsRate = Number(target.value);
      scheduleCalculatorResultUpdate();
      return;
    } else {
      calculatorState[target.name] = target.value;
    }
    renderCalculator();
  });

  form?.querySelector("input[name='savingsRate']")?.addEventListener("input", (event) => {
    const output = form.querySelector("[data-savings-value]");
    calculatorState.savingsRate = Number(event.currentTarget.value);
    if (output) output.textContent = `${calculatorState.savingsRate}%`;
  });

  form?.querySelector("input[name='years']")?.addEventListener("input", (event) => {
    const output = form.querySelector("[data-years-value]");
    calculatorState.years = Number(event.currentTarget.value) / 12;
    if (output) output.textContent = calculatorPeriodLabel(event.currentTarget.value);
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

function scheduleCalculatorResultUpdate() {
  window.clearTimeout(calculatorUpdateTimer);
  calculatorUpdateTimer = window.setTimeout(() => {
    calculatorUpdateTimer = 0;
    updateCalculatorResult();
  }, 80);
}

function updateCalculatorResult() {
  if (!calculatorRoot) return;
  const summary = getCalculatorSummary();
  const city = calculatorRoot.querySelector("[data-calculator-city]");
  const totalIncome = calculatorRoot.querySelector("[data-calculator-total-income]");
  const incomeCopy = calculatorRoot.querySelector("[data-calculator-income-copy]");
  const equivalents = calculatorRoot.querySelector("[data-calculator-equivalents]");

  if (city) city.textContent = summary.cityName;
  if (totalIncome) totalIncome.textContent = money(summary.totalIncome);
  if (incomeCopy) incomeCopy.textContent = `Доход за период. Можно отложить ${money(summary.savedAmount)}.`;
  if (equivalents) {
    equivalents.innerHTML = summary.equivalents
      .map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`)
      .join("");
  }
}

function getCalculatorSummary() {
  const calcView = {
    profession: calculatorState.profession,
    experience: calculatorState.experience,
    selectedCity: calculatorState.cityId,
    selectedYears: calculatorState.years
  };
  const stats = getCityStats(allOffers, calcView);
  const totalIncome = stats.salary * 12 * calculatorState.years;
  const savingsRate = Number(calculatorState.savingsRate ?? 0);
  const savedAmount = Math.round(totalIncome * savingsRate / 100);
  const apartmentProgress = Math.min(100, Math.round(savedAmount / 2500000 * 100));
  const carProgress = Math.min(100, Math.round(savedAmount / 1500000 * 100));
  const rentMonths = Math.floor(savedAmount / Math.max(stats.monthlyHousingBudget, 1));

  return {
    cityName: findCityById(calculatorState.cityId)?.name ?? "Арктика",
    salary: stats.salary,
    totalIncome,
    savedAmount,
    experience: getEffectiveExperience(calculatorState.experience, calculatorState.years),
    rentCount: stats.affordableRent,
    saleCount: stats.affordableSale,
    equivalents: [
      { label: "Квартира", value: `${apartmentProgress}% первого взноса` },
      { label: "Автомобиль", value: `${carProgress}% стоимости` },
      { label: "Аренда", value: `${rentMonths} мес.` },
      { label: "Накопленный резерв", value: money(savedAmount) }
    ]
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
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)} ₽`;
}

function calculatorPeriodLabel(value) {
  const totalMonths = Math.max(0, Math.round(Number(value)));
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const parts = [];

  if (years > 0) parts.push(`${years} ${russianCountLabel(years, "год", "года", "лет")}`);
  if (months > 0) parts.push(`${months} ${russianCountLabel(months, "месяц", "месяца", "месяцев")}`);

  return parts.join(" ") || "0 месяцев";
}

function russianCountLabel(value, one, few, many) {
  const remainder10 = value % 10;
  const remainder100 = value % 100;
  if (remainder10 === 1 && remainder100 !== 11) return one;
  if (remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 12 || remainder100 > 14)) return few;
  return many;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
