import { experienceOptions } from "../state.js";

const chapterOrder = ["city", "estate", "work", "nature", "benefits"];
const journeyPages = [
  { id: "region", label: "Область" },
  { id: "city", label: "Город" },
  { id: "life", label: "В городе" }
];

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

export function renderRegionScreen(root, {
  scenarios,
  state,
  page = "region",
  onBack,
  onPage,
  onRegionChange,
  onCityChange
}) {
  root.innerHTML = shell(`
    <section class="story-screen region-story">
      <button class="story-back" id="back-button" type="button" aria-label="К началу">←</button>
      <h1 class="story-brand">Примерь жизнь в Арктике</h1>
      <div id="journey-controls" class="journey-controls">
        ${renderJourneyControls({ scenarios, state, page })}
      </div>
      <div class="region-frame">
        <div id="cesium-container" class="cesium-region"></div>
      </div>
    </section>
  `);

  root.querySelector("#back-button").addEventListener("click", onBack);
  const refs = {
    cesiumContainer: root.querySelector("#cesium-container"),
    journeyControls: root.querySelector("#journey-controls")
  };
  bindJourneyControls(refs.journeyControls, { onPage, onRegionChange, onCityChange });
  return refs;
}

export function updateJourneyControls(refs, {
  scenarios,
  state,
  page,
  onPage,
  onRegionChange,
  onCityChange
}) {
  if (!refs?.journeyControls) return;
  refs.journeyControls.innerHTML = renderJourneyControls({ scenarios, state, page });
  bindJourneyControls(refs.journeyControls, { onPage, onRegionChange, onCityChange });
}

export function renderCityStory(root, {
  scenarios,
  state,
  city,
  nature,
  benefits,
  stats,
  offer,
  onBack,
  onPage,
  onRegionChange,
  onCityChange,
  onChapter,
  onTimeline,
  onMode
}) {
  const chapterIndex = Math.max(0, chapterOrder.indexOf(state.chapter));
  root.innerHTML = shell(`
    <section class="story-screen city-story" data-chapter="${state.chapter}">
      <button class="story-back" id="back-button" type="button" aria-label="К выбору города">←</button>
      <h1 class="story-brand">Примерь жизнь в Арктике</h1>

      <div id="journey-controls" class="journey-controls">
        ${renderJourneyControls({ scenarios, state, page: "life" })}
      </div>

      <button class="chapter-arrow chapter-prev" id="chapter-prev" type="button" aria-label="Предыдущий экран" ${chapterIndex === 0 ? "disabled" : ""}>←</button>
      <button class="chapter-arrow chapter-next" id="chapter-next" type="button" aria-label="Следующий экран" ${chapterIndex === chapterOrder.length - 1 ? "disabled" : ""}>→</button>

      <div class="game-window">
        ${renderChapter(state, city, nature, benefits, stats, offer)}
      </div>
    </section>
  `);

  root.querySelector("#back-button").addEventListener("click", onBack);
  bindJourneyControls(root.querySelector("#journey-controls"), { onPage, onRegionChange, onCityChange });
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
    cityOverlay: root.querySelector("#city-overlay"),
    journeyControls: root.querySelector("#journey-controls")
  };
}

export function updateOfferCard(refs, offer) {
  if (!refs?.objectCard) return;
  if (!offer) {
    refs.objectCard.hidden = true;
    refs.objectCard.innerHTML = "";
    return;
  }
  refs.objectCard.innerHTML = renderOfferBody(offer);
  refs.objectCard.hidden = false;
}

export function positionOfferCard(refs, point) {
  if (!refs?.objectCard || refs.objectCard.hidden || !refs.cityOverlay || !point) return;
  const overlayRect = refs.cityOverlay.getBoundingClientRect();
  const card = refs.objectCard;
  const halfWidth = Math.min(170, Math.max(120, card.offsetWidth / 2));
  const x = Math.min(Math.max(point.x, halfWidth + 8), Math.max(halfWidth + 8, overlayRect.width - halfWidth - 8));
  const below = point.y < Math.max(145, card.offsetHeight + 28);
  const y = below
    ? Math.min(overlayRect.height - 18, point.y + 22)
    : Math.max(18, point.y - 18);
  card.style.left = `${x}px`;
  card.style.top = `${y}px`;
  card.classList.toggle("is-below", below);
}

function renderJourneyControls({ scenarios, state, page }) {
  const regions = scenarios?.regions ?? [];
  const selectedRegion = regions.find((region) => region.id === state.selectedRegion) ?? null;
  const cities = selectedRegion?.cities?.filter((city) => city.ready) ?? [];
  const enabledPages = {
    region: true,
    city: Boolean(selectedRegion),
    life: Boolean(state.selectedCity)
  };
  const currentIndex = Math.max(0, journeyPages.findIndex((item) => item.id === page));
  const previousPage = [...journeyPages].slice(0, currentIndex).reverse().find((item) => enabledPages[item.id]);
  const nextPage = journeyPages.slice(currentIndex + 1).find((item) => enabledPages[item.id]);

  return `
    <div class="journey-step-row" aria-label="Этапы выбора">
      <button type="button" class="journey-page-arrow" data-page="${previousPage?.id ?? ""}" ${previousPage ? "" : "disabled"} aria-label="Предыдущий этап">←</button>
      <div class="journey-steps" role="radiogroup" aria-label="Страница">
        ${journeyPages.map((item) => `
          <button type="button"
            class="journey-step ${page === item.id ? "is-active" : ""}"
            data-page="${item.id}"
            role="radio"
            aria-checked="${page === item.id ? "true" : "false"}"
            ${enabledPages[item.id] ? "" : "disabled"}>
            <span></span><strong>${item.label}</strong>
          </button>
        `).join("")}
      </div>
      <button type="button" class="journey-page-arrow" data-page="${nextPage?.id ?? ""}" ${nextPage ? "" : "disabled"} aria-label="Следующий этап">→</button>
    </div>

    <div class="journey-select-row">
      <label class="journey-select">
        <span>Регион</span>
        <select data-journey-region>
          <option value="">Выберите регион</option>
          ${regions.map((region) => `<option value="${escapeHtml(region.id)}" ${state.selectedRegion === region.id ? "selected" : ""}>${escapeHtml(region.name)}</option>`).join("")}
        </select>
      </label>
      <label class="journey-select">
        <span>Город</span>
        <select data-journey-city ${selectedRegion ? "" : "disabled"}>
          <option value="">Выберите город</option>
          ${cities.map((nextCity) => `<option value="${escapeHtml(nextCity.id)}" ${state.selectedCity === nextCity.id ? "selected" : ""}>${escapeHtml(nextCity.name)}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function bindJourneyControls(container, { onPage, onRegionChange, onCityChange }) {
  if (!container) return;
  container.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;
      if (page) onPage?.(page);
    });
  });
  container.querySelector("[data-journey-region]")?.addEventListener("change", (event) => {
    onRegionChange?.(event.currentTarget.value || null);
  });
  container.querySelector("[data-journey-city]")?.addEventListener("change", (event) => {
    onCityChange?.(event.currentTarget.value || null);
  });
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
      <div id="city-overlay" class="city-overlay ${forcedCardKind ? "is-forced" : ""}">
        <div id="object-card" class="object-card" ${offer ? "" : "hidden"}>
          ${offer ? renderOfferBody(offer) : ""}
        </div>
      </div>
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
      <p>${salaryText(offer)}/мес</p>
    `;
  }

  return `
    <span class="card-kicker">${offer.kind === "rent" ? "Аренда" : "Покупка"}</span>
    <strong>${escapeHtml(offer.address)}</strong>
    <h3>${Number(offer.area)} м²</h3>
    <p>${money(offer.price)}${offer.kind === "rent" ? "/мес" : ""}</p>
  `;
}

function salaryText(offer) {
  const from = Number(offer?.salaryFrom ?? 0);
  const to = Number(offer?.salaryTo ?? 0);
  if (from && to && from !== to) return `${money(from)}–${money(to)}`;
  return money(offer?.salary ?? from ?? to);
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
