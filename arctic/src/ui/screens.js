import { experienceOptions } from "../state.js";

export function renderStartScreen(root, { professions, onStart }) {
  root.innerHTML = `
    <main class="start-screen">
      <section class="start-panel" aria-labelledby="app-title">
        <p class="eyebrow">MVP прототип</p>
        <h1 id="app-title">Примерь жизнь в Арктике</h1>
        <form class="start-form" id="start-form">
          <label>
            <span>Профессия</span>
            <input
              id="profession"
              name="profession"
              list="profession-list"
              autocomplete="off"
              placeholder="Начните вводить"
              value="${professions[0] ?? ""}"
              required
            />
            <datalist id="profession-list">
              ${professions.map((profession) => `<option value="${profession}"></option>`).join("")}
            </datalist>
          </label>
          <label>
            <span>Опыт работы</span>
            <select id="experience" name="experience">
              ${experienceOptions
                .map((option) => `<option value="${option.id}">${option.label}</option>`)
                .join("")}
            </select>
          </label>
          <button class="primary-action" type="submit">Начать</button>
        </form>
      </section>
    </main>
  `;

  root.querySelector("#start-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    onStart({
      profession: form.get("profession").toString().trim(),
      experience: form.get("experience").toString()
    });
  });
}

export function renderScenarioScreen(root, { profession, experienceLabel, onBack }) {
  root.innerHTML = `
    <main class="scenario-screen">
      <header class="top-bar">
        <button class="icon-button" id="back-button" type="button" aria-label="Назад">←</button>
        <div>
          <p class="eyebrow">Примерь жизнь в Арктике</p>
          <h1 id="stage-title">Выбор региона</h1>
        </div>
        <dl class="profile-summary" aria-label="Параметры пользователя">
          <div>
            <dt>Профессия</dt>
            <dd>${profession}</dd>
          </div>
          <div>
            <dt>Опыт</dt>
            <dd>${experienceLabel}</dd>
          </div>
        </dl>
      </header>

      <section class="scene-layout">
        <div class="cesium-shell">
          <div id="cesium-container"></div>
        </div>
        <aside class="side-panel" aria-live="polite">
          <h2 id="panel-title">Выберите область</h2>
          <p id="status-text">Кликните по региону на глобусе или выберите его в списке.</p>
          <div id="region-list" class="region-list"></div>
          <div id="city-panel" class="city-panel" hidden></div>
        </aside>
      </section>
    </main>
  `;

  root.querySelector("#back-button").addEventListener("click", onBack);

  return {
    cesiumContainer: root.querySelector("#cesium-container"),
    stageTitle: root.querySelector("#stage-title"),
    panelTitle: root.querySelector("#panel-title"),
    statusText: root.querySelector("#status-text"),
    regionList: root.querySelector("#region-list"),
    cityPanel: root.querySelector("#city-panel")
  };
}

export function renderRegionList(refs, regions, onRegionPick) {
  refs.regionList.innerHTML = regions
    .map(
      (region) => `
        <button class="region-button" type="button" data-region-id="${region.id}">
          <span>${region.name}</span>
          <small>${region.cities.some((city) => city.ready) ? "сценарий доступен" : "сценарий готовится"}</small>
        </button>
      `
    )
    .join("");

  refs.regionList.querySelectorAll("[data-region-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const region = regions.find((item) => item.id === button.dataset.regionId);
      if (region) {
        onRegionPick(region);
      }
    });
  });
}

export function showCityPicker(refs, region, onCitySelect) {
  refs.stageTitle.textContent = "Выбор города";
  refs.panelTitle.textContent = region.name;
  refs.statusText.textContent = "Камера приблизилась к региону. Выберите город для входа в 3D-сцену.";
  refs.regionList.hidden = true;
  refs.cityPanel.hidden = false;
  refs.cityPanel.innerHTML = `
    <div class="city-list">
      ${region.cities
        .map(
          (city) => `
            <button
              class="city-button"
              type="button"
              data-city-id="${city.id}"
              ${city.ready ? "" : "disabled"}
            >
              <span>${city.name}</span>
              <small>${city.ready ? "открыть 3D-город" : city.note}</small>
            </button>
          `
        )
        .join("")}
    </div>
  `;

  refs.cityPanel.querySelectorAll("[data-city-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const city = region.cities.find((item) => item.id === button.dataset.cityId);
      if (city?.ready) {
        onCitySelect(city);
      }
    });
  });
}

export function showCityLoaded(refs, city, buildings) {
  refs.stageTitle.textContent = "3D-город";
  refs.panelTitle.textContent = city.name;
  refs.statusText.textContent = "Первый вертикальный сценарий собран: здания загружены из mock GeoJSON и экструдированы.";
  refs.cityPanel.hidden = false;
  refs.cityPanel.innerHTML = `
    <section class="loaded-city">
      <h3>Mock-здания</h3>
      <ul>
        ${buildings.map((building) => `<li><code>${building.id}</code><span>${building.height} м</span></li>`).join("")}
      </ul>
    </section>
  `;
}

export function setStatus(refs, text) {
  refs.statusText.textContent = text;
}
