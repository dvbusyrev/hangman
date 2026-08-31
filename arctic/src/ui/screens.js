import { experienceOptions } from "../state.js";

const chapterOrder = ["city", "estate", "work", "nature", "benefits"];

export function renderStartScreen(root, { professions, onStart }) {
  root.innerHTML = shell(`
    <section class="story-screen start-story" aria-labelledby="app-title">
      <h1 class="story-brand" id="app-title">Примерь жизнь в Арктике</h1>
      <form class="start-card" id="start-form">
        <div class="start-fields">
          <label class="field-control">
            <span>Профессия</span>
            <input id="profession" name="profession" list="profession-list" autocomplete="off" value="${escapeHtml(professions[0] ?? "")}" required />
            <datalist id="profession-list">
              ${professions.map((profession) => `<option value="${escapeHtml(profession)}"></option>`).join("")}
            </datalist>
          </label>
          <label class="field-control">
            <span>Опыт работы</span>
            <select id="experience" name="experience">
              ${experienceOptions.map((option) => `<option value="${option.id}">${option.label}</option>`).join("")}
            </select>
          </label>
        </div>
        <button class="start-button" type="submit">Начать</button>
      </form>
    </section>
  `);

  root.querySelector("#start-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onStart({
      profession: form.get("profession").toString().trim(),
      experience: form.get("experience").toString()
    });
  });
}

export function renderRegionScreen(root, { onBack }) {
  root.innerHTML = shell(`
    <section class="story-screen region-story">
      <button class="story-back" id="back-button" type="button" aria-label="Назад">←</button>
      <h1 class="story-brand">Примерь жизнь в Арктике</h1>
      <div class="region-frame">
        <h2>Выбери область!</h2>
        <div id="cesium-container" class="cesium-region"></div>
        <div class="osm-attribution">© OpenStreetMap contributors</div>
        <div id="region-list" class="region-pills" aria-label="Регионы"></div>
        <div id="city-panel" class="city-picker" hidden></div>
        <p id="status-text" class="status-line" aria-live="polite">Выберите область на карте.</p>
      </div>
    </section>
  `);

  root.querySelector("#back-button").addEventListener("click", onBack);

  return {
    cesiumContainer: root.querySelector("#cesium-container"),
    regionList: root.querySelector("#region-list"),
    cityPanel: root.querySelector("#city-panel"),
    statusText: root.querySelector("#status-text")
  };
}

export function renderRegionList(refs, regions, onRegionPick) {
  refs.regionList.innerHTML = regions.map((region) => `
    <button class="region-pill" type="button" data-region-id="${region.id}">
      ${escapeHtml(region.name)}
    </button>
  `).join("");

  refs.regionList.querySelectorAll("[data-region-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const region = regions.find((item) => item.id === button.dataset.regionId);
      if (region) onRegionPick(region);
    });
  });
}

export function showCityPicker(refs, region, onCitySelect) {
  refs.statusText.textContent = `${region.name}: выберите город.`;
  refs.cityPanel.hidden = false;
  refs.cityPanel.innerHTML = `
    <strong>${escapeHtml(region.name)}</strong>
    <div class="city-buttons">
      ${region.cities.map((city) => `
        <button class="city-button" type="button" data-city-id="${city.id}" ${city.ready ? "" : "disabled"}>
          ${escapeHtml(city.name)}
          <small>${city.ready ? "Открыть 3D" : escapeHtml(city.note ?? "Сценарий готовится")}</small>
        </button>
      `).join("")}
    </div>
  `;

  refs.cityPanel.querySelectorAll("[data-city-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const city = region.cities.find((item) => item.id === button.dataset.cityId);
      if (city?.ready) onCitySelect(city);
    });
  });
}

export function renderCityStory(root, {
  state,
  city,
  nature,
  benefits,
  stats,
  offer,
  onBack,
  onChapter,
  onTimeline,
  onMode
}) {
  const chapterIndex = Math.max(0, chapterOrder.indexOf(state.chapter));
  root.innerHTML = shell(`
    <section class="story-screen city-story" data-chapter="${state.chapter}">
      <button class="story-back" id="back-button" type="button" aria-label="Назад к регионам">←</button>
      <h1 class="story-brand">Примерь жизнь в Арктике</h1>

      <button class="chapter-arrow chapter-prev" id="chapter-prev" type="button" aria-label="Предыдущий экран" ${chapterIndex === 0 ? "disabled" : ""}>←</button>
      <button class="chapter-arrow chapter-next" id="chapter-next" type="button" aria-label="Следующий экран" ${chapterIndex === chapterOrder.length - 1 ? "disabled" : ""}>→</button>

      <div class="game-window">
        ${renderChapter(state, city, nature, benefits, stats, offer)}
      </div>
    </section>
  `);

  root.querySelector("#back-button").addEventListener("click", onBack);
  root.querySelector("#chapter-prev")?.addEventListener("click", () => onChapter(chapterOrder[chapterIndex - 1]));
  root.querySelector("#chapter-next")?.addEventListener("click", () => onChapter(chapterOrder[chapterIndex + 1]));

  root.querySelectorAll("[data-years]").forEach((button) => {
    button.addEventListener("click", () => onTimeline(Number(button.dataset.years)));
  });

  root.querySelectorAll("[name='mode']").forEach((input) => {
    input.addEventListener("change", () => onMode(input.value));
  });

  return {
    cesiumContainer: root.querySelector("#cesium-container"),
    objectCard: root.querySelector("#object-card"),
    routeHint: root.querySelector("#route-hint"),
    routeTrack: root.querySelector("#route-progress-fill")
  };
}

export function updateOfferCard(refs, offer) {
  if (!refs?.objectCard) return;
  refs.objectCard.innerHTML = offer ? renderOfferBody(offer) : `<p class="empty-card">Прокрутите колесо по улице — рядом появятся предложения.</p>`;
  refs.objectCard.classList.toggle("is-empty", !offer);
}

export function updateRouteProgress(refs, progress) {
  if (refs?.routeTrack) refs.routeTrack.style.width = `${Math.round(progress * 100)}%`;
}

export function setStatus(refs, text) {
  if (refs?.statusText) refs.statusText.textContent = text;
}

function renderChapter(state, city, nature, benefits, stats, offer) {
  if (state.chapter === "nature") {
    return `
      <section class="info-chapter nature-chapter">
        <h2>Красота природы</h2>
        <div class="mountain-illustration" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="info-card">
          <ul>${nature.map((item) => `<li><strong>${escapeHtml(item.title)}</strong>${item.text ? `<span>${escapeHtml(item.text)}</span>` : ""}</li>`).join("")}</ul>
        </div>
      </section>
    `;
  }

  if (state.chapter === "benefits") {
    return `
      <section class="info-chapter benefits-chapter">
        <h2>Бонусы жизни в Арктике</h2>
        <div class="mountain-illustration" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="info-card">
          <ul>${benefits.map((item) => `<li><strong>${escapeHtml(item.title)}</strong>${item.text ? `<span>${escapeHtml(item.text)}</span>` : ""}</li>`).join("")}</ul>
        </div>
      </section>
    `;
  }

  const forcedCardKind = state.chapter === "estate" ? "estate" : state.chapter === "work" ? "work" : null;

  return `
    <section class="city-chapter">
      <div class="city-headline">
        <strong>${escapeHtml(city.name)}</strong>
        <span>${stats.effectiveExperience.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} года опыта · зарплата ${money(stats.salary)} · аренда ${stats.affordableRent} · покупка ${stats.affordableSale}</span>
      </div>
      <div id="cesium-container" class="cesium-city"></div>
      <div class="osm-attribution osm-attribution-city">© OpenStreetMap contributors</div>
      <div class="city-overlay ${forcedCardKind ? "is-forced" : ""}">
        <div id="object-card" class="object-card ${offer ? "" : "is-empty"}">
          ${offer ? renderOfferBody(offer) : `<p class="empty-card">Крутите колесо: камера движется вперёд и назад по улице, ближайшее предложение открывается автоматически.</p>`}
        </div>
      </div>
      <div id="route-hint" class="route-hint">Колесо мыши — движение по улице</div>
      <div class="route-progress" aria-hidden="true"><span id="route-progress-fill" style="width:${Math.round(state.routeProgress * 100)}%"></span></div>
      ${renderTimeline(state.selectedYears)}
      ${renderMode(state.selectedMode)}
    </section>
  `;
}

function renderTimeline(selectedYears) {
  return `
    <div class="timeline" aria-label="Переход во времени">
      ${[1, 3, 5].map((years) => `
        <button type="button" class="timeline-point ${selectedYears === years ? "is-active" : ""}" data-years="${years}">
          <span></span><strong>${years} ${years === 1 ? "год" : "года"}</strong>
        </button>
      `).join("")}
    </div>
  `;
}

function renderMode(selectedMode) {
  return `
    <div class="mode-switch" aria-label="Тип предложений">
      <label><input type="radio" name="mode" value="profession" ${selectedMode === "profession" ? "checked" : ""}><span>Профессия</span></label>
      <label><input type="radio" name="mode" value="estate" ${selectedMode === "estate" ? "checked" : ""}><span>Недвижимость</span></label>
    </div>
  `;
}

function renderOfferBody(offer) {
  if (offer.kind === "work") {
    return `
      <span class="card-kicker">Работа</span>
      <strong>${escapeHtml(offer.company)}</strong>
      <h3>${escapeHtml(offer.position)}</h3>
      <p>${money(offer.salary)}/мес</p>
    `;
  }

  return `
    <span class="card-kicker">${offer.kind === "rent" ? "Аренда" : "Покупка"}</span>
    <strong>${escapeHtml(offer.address)}</strong>
    <h3>${Number(offer.area)} м²</h3>
    <p>${money(offer.price)}${offer.kind === "rent" ? "/мес" : ""}</p>
  `;
}

function shell(content) {
  return `<main class="prototype"><div class="prototype-shell">${content}</div></main>`;
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
