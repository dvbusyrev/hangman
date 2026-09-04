import { experienceOptions } from "../state.js";

const journeyPages = [
  { id: "region", label: "Регионы" },
  { id: "city", label: "Города" },
  { id: "life", label: "3D-карта" },
  { id: "nature", label: "Природа" },
  { id: "benefits", label: "Бонусы" },
  { id: "reviews", label: "Отзывы" }
];

export function renderStartScreen(root, { professions, onStart }) {
  root.innerHTML = shell(`
    <section class="story-screen start-story">
      <form class="start-form" id="start-form">
        <button class="start-button" type="submit">Начать</button>
      </form>
    </section>
  `);

  root.querySelector("#start-form").addEventListener("submit", (event) => {
    event.preventDefault();
    onStart({
      profession: professions[0] ?? "",
      experience: experienceOptions[0]?.id ?? "none"
    });
  });
}

export function renderRegionScreen(root, {
  scenarios,
  state,
  professions,
  page = "region",
  onBack,
  onPage,
  onRegionChange,
  onCityChange,
  onProfileChange,
  onMode
}) {
  root.innerHTML = shell(`
    <section class="story-screen region-story">
      <div id="journey-controls" class="journey-controls">
        ${renderJourneyControls({ scenarios, state, professions, page })}
      </div>
      <div class="region-frame">
        <div id="cesium-container" class="cesium-region"></div>
      </div>
      ${renderMode(state.selectedMode, page !== "city")}
    </section>
  `);

  const refs = {
    cesiumContainer: root.querySelector("#cesium-container"),
    journeyControls: root.querySelector("#journey-controls")
  };
  bindJourneyControls(refs.journeyControls, { onPage, onRegionChange, onCityChange, onProfileChange });
  root.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => onMode?.(button.dataset.mode));
  });
  return refs;
}

export function updateJourneyControls(refs, {
  scenarios,
  state,
  professions,
  page,
  onPage,
  onRegionChange,
  onCityChange,
  onProfileChange
}) {
  if (!refs?.journeyControls) return;
  refs.journeyControls.innerHTML = renderJourneyControls({ scenarios, state, professions, page });
  bindJourneyControls(refs.journeyControls, { onPage, onRegionChange, onCityChange, onProfileChange });
}

export function updateRegionMode(root, selectedMode, page) {
  const modeSwitch = root?.querySelector(".region-story > .mode-switch");
  if (!modeSwitch) return;

  modeSwitch.hidden = page !== "city";
  modeSwitch.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === selectedMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

}

export function renderCityStory(root, {
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
  onBack,
  onPage,
  onRegionChange,
  onCityChange,
  onProfileChange,
  onTimeline,
  onMode,
  onRouteMove
}) {
  const page = state.chapter === "nature"
    ? "nature"
    : state.chapter === "benefits"
      ? "benefits"
      : state.chapter === "reviews"
        ? "reviews"
        : "life";

  root.innerHTML = shell(`
    <section class="story-screen city-story" data-chapter="${state.chapter}">
      <div id="journey-controls" class="journey-controls">
        ${renderJourneyControls({ scenarios, state, professions, page })}
      </div>

      <div class="game-window">
        ${renderChapter(state, city, nature, naturePhotos, benefits, reviews, reviewTopics, stats, offer)}
      </div>
      ${page === "life" ? `
        <div class="city-controls-panel">
          ${renderTimeline(state.selectedYears)}
          ${renderMode(state.selectedMode)}
        </div>
      ` : ""}
    </section>
  `);

  bindJourneyControls(root.querySelector("#journey-controls"), { onPage, onRegionChange, onCityChange, onProfileChange });

  root.querySelectorAll("[data-years]").forEach((button) => {
    button.addEventListener("click", () => onTimeline(Number(button.dataset.years)));
  });

  root.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => onMode(button.dataset.mode));
  });

  root.querySelectorAll("[data-route-move]").forEach((button) => {
    button.addEventListener("click", () => onRouteMove?.(Number(button.dataset.routeMove)));
  });

  const reviewsRoot = root.querySelector(".reviews-chapter");
  if (reviewsRoot) bindReviewFilters(reviewsRoot, reviews, reviewTopics);

  const natureRoot = root.querySelector(".nature-chapter");
  if (natureRoot) bindNatureCarousel(natureRoot, naturePhotos);

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

function renderJourneyControls({ scenarios, state, professions = [], page }) {
  const regions = scenarios?.regions ?? [];
  const selectedRegion = regions.find((region) => region.id === state.selectedRegion) ?? null;
  const cities = selectedRegion?.cities?.filter((city) => city.ready) ?? [];
  const enabledPages = {
    region: true,
    // When the user returns to «Области», the next step is intentionally
    // locked until a region is chosen again from the map/list.
    city: page !== "region" && Boolean(selectedRegion),
    life: Boolean(state.selectedCity),
    nature: Boolean(state.selectedCity),
    benefits: Boolean(state.selectedCity),
    reviews: Boolean(state.selectedCity)
  };
  return `
    <div class="journey-step-row" aria-label="Этапы выбора">
      <div class="journey-steps" role="radiogroup" aria-label="Страница">
        ${journeyPages.map((item) => `
          <label class="journey-step ${page === item.id ? "is-active" : ""}">
            <input
              type="radio"
              name="journey-page"
              value="${item.id}"
              data-page-radio
              ${page === item.id ? "checked" : ""}
              ${enabledPages[item.id] ? "" : "disabled"}
            />
            <span></span>
            <strong>${item.label}</strong>
          </label>
        `).join("")}
      </div>
    </div>

    ${page === "life" ? `
      <div class="journey-select-row journey-profile-row">
        <label class="journey-select">
          <span>Профессия</span>
          <select data-profile-profession>
            ${professions.map((profession) => `<option value="${escapeHtml(profession)}" ${state.profession === profession ? "selected" : ""}>${escapeHtml(profession)}</option>`).join("")}
          </select>
        </label>
        <label class="journey-select">
          <span>Опыт работы</span>
          <select data-profile-experience>
            ${experienceOptions.map((option) => `<option value="${escapeHtml(option.id)}" ${state.experience === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
      </div>
    ` : page === "region" ? `
      <div class="journey-select-row is-region-only">
        <label class="journey-select">
          <span>Регион</span>
          <select data-journey-region>
            <option value="">Выберите регион</option>
            ${regions.map((region) => `<option value="${escapeHtml(region.id)}" ${state.selectedRegion === region.id ? "selected" : ""}>${escapeHtml(region.name)}</option>`).join("")}
          </select>
        </label>
      </div>
    ` : `
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
    `}
  `;
}

function bindJourneyControls(container, { onPage, onRegionChange, onCityChange, onProfileChange }) {
  if (!container) return;
  container.querySelectorAll("[data-page-radio]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) onPage?.(input.value);
    });
  });
  container.querySelector("[data-journey-region]")?.addEventListener("change", (event) => {
    onRegionChange?.(event.currentTarget.value || null);
  });
  container.querySelector("[data-journey-city]")?.addEventListener("change", (event) => {
    onCityChange?.(event.currentTarget.value || null);
  });
  container.querySelector("[data-profile-profession]")?.addEventListener("change", (event) => {
    onProfileChange?.({ profession: event.currentTarget.value.trim() });
  });
  container.querySelector("[data-profile-experience]")?.addEventListener("change", (event) => {
    onProfileChange?.({ experience: event.currentTarget.value });
  });
}

function renderChapter(state, city, nature, naturePhotos, benefits, reviews, reviewTopics, stats, offer) {
  if (state.chapter === "nature") {
    return renderNatureChapter(city, nature, naturePhotos);
  }

  if (state.chapter === "benefits") {
    return `
      <section class="info-chapter benefits-chapter">
        <div class="benefits-intro">
          <span class="benefits-eyebrow">${escapeHtml(city.name)}</span>
          <h2>Бонусы жизни<br />в Арктике</h2>
          <p>Поддержка, которая помогает начать жизнь и работу на Севере.</p>
        </div>
        <div class="benefits-grid" aria-label="Доступные меры поддержки">
          ${(benefits ?? []).map((item, index) => `
            <article class="benefit-card">
              <span class="benefit-card__number">${String(index + 1).padStart(2, "0")}</span>
              <h3>${escapeHtml(item.title)}</h3>
              ${item.text ? `<p>${escapeHtml(item.text)}</p>` : ""}
            </article>
          `).join("")}
        </div>
        <p class="benefits-note">Условия зависят от региона, профессии и работодателя.</p>
      </section>
    `;
  }

  if (state.chapter === "reviews") {
    return renderReviewsChapter(city, reviews, reviewTopics);
  }

  const forcedCardKind = state.chapter === "estate" ? "estate" : state.chapter === "work" ? "work" : null;

  return `
    <section class="city-chapter">
      <div class="city-headline">
        <strong>${escapeHtml(city.name)}</strong>
      </div>
      <div class="city-3d-viewport">
        <div id="cesium-container" class="cesium-city"></div>
        <div id="city-overlay" class="city-overlay ${forcedCardKind ? "is-forced" : ""}">
          <div id="object-card" class="object-card" ${offer ? "" : "hidden"}>
            ${offer ? renderOfferBody(offer) : ""}
          </div>
        </div>
        <div class="city-route-controls" aria-label="Движение по маршруту">
          <button type="button" data-route-move="-1" aria-label="Двигаться назад">↓</button>
          <button type="button" data-route-move="1" aria-label="Двигаться вперёд">↑</button>
        </div>
      </div>
    </section>
  `;
}

function renderNatureChapter(city, highlights = [], photos = []) {
  const slides = photos.length ? photos : highlights.map((item) => ({
    title: item.title,
    text: item.text,
    src: "",
    alt: item.title
  }));

  return `
    <section class="info-chapter nature-chapter">
      <div class="nature-copy">
        <span class="nature-eyebrow">${escapeHtml(city.name)}</span>
        <h2>Красота природы</h2>
        <p>Северный ландшафт, который становится частью повседневной жизни.</p>
      </div>

      <div class="nature-carousel ${slides.length > 1 ? "" : "is-single"}" data-nature-carousel aria-label="Фотографии природы ${escapeHtml(city.name)}">
        <div class="nature-carousel__viewport">
          ${slides.map((slide, index) => `
            <figure class="nature-slide ${index === 0 ? "is-active" : ""}" data-nature-slide="${index}">
              ${slide.src
                ? `<img src="${escapeHtml(slide.src)}" alt="${escapeHtml(slide.alt ?? slide.title)}" ${index === 0 ? "" : "loading=\"lazy\""} />`
                : `<div class="nature-slide__placeholder" aria-hidden="true"></div>`}
              <figcaption>
                <strong>${escapeHtml(slide.title)}</strong>
                ${slide.text ? `<span>${escapeHtml(slide.text)}</span>` : ""}
                ${slide.credit && slide.source
                  ? `<a href="${escapeHtml(slide.source)}" target="_blank" rel="noreferrer">Фото: ${escapeHtml(slide.credit)}</a>`
                  : ""}
              </figcaption>
            </figure>
          `).join("")}
        </div>
        <button type="button" class="nature-carousel__button nature-carousel__button--prev" data-nature-prev aria-label="Предыдущая фотография">←</button>
        <button type="button" class="nature-carousel__button nature-carousel__button--next" data-nature-next aria-label="Следующая фотография">→</button>
        <div class="nature-carousel__dots" role="tablist" aria-label="Выбор фотографии">
          ${slides.map((slide, index) => `
            <button type="button" class="nature-carousel__dot ${index === 0 ? "is-active" : ""}" data-nature-dot="${index}" aria-label="Фотография ${index + 1}" aria-selected="${index === 0}"></button>
          `).join("")}
        </div>
      </div>

      <ul class="nature-highlights" aria-label="Что посмотреть рядом">
        ${highlights.map((item) => `<li>${escapeHtml(item.title)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function bindNatureCarousel(root) {
  const slides = [...root.querySelectorAll("[data-nature-slide]")];
  const dots = [...root.querySelectorAll("[data-nature-dot]")];
  if (slides.length < 2) return;

  let activeIndex = 0;
  const showSlide = (nextIndex) => {
    activeIndex = (nextIndex + slides.length) % slides.length;
    slides.forEach((slide, index) => slide.classList.toggle("is-active", index === activeIndex));
    dots.forEach((dot, index) => {
      const isActive = index === activeIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-selected", String(isActive));
    });
  };

  root.querySelector("[data-nature-prev]")?.addEventListener("click", () => showSlide(activeIndex - 1));
  root.querySelector("[data-nature-next]")?.addEventListener("click", () => showSlide(activeIndex + 1));
  dots.forEach((dot) => dot.addEventListener("click", () => showSlide(Number(dot.dataset.natureDot))));
}

function renderReviewsChapter(city, reviewSet = {}, topics = []) {
  return `
    <section class="reviews-chapter">
      <div class="reviews-intro">
        <span class="reviews-eyebrow">ГОРОД ГЛАЗАМИ ЖИТЕЛЕЙ</span>
        <h2>Каково жить в ${escapeHtml(city.name)}</h2>
        <p>Без туристических буклетов — о работе, погоде, быте и том, к чему действительно приходится привыкать.</p>
      </div>

      <div class="review-filters" role="tablist" aria-label="Темы отзывов">
        ${topics.map((topic, index) => `
          <button
            type="button"
            class="review-filter ${index === 0 ? "is-active" : ""}"
            data-review-topic="${escapeHtml(topic.id)}"
            aria-pressed="${index === 0}"
          >${escapeHtml(topic.label)}</button>
        `).join("")}
      </div>

      <div class="reviews-list" data-reviews-list>
        ${renderReviewCards(reviewSet.reviews ?? [], topics)}
      </div>

      <div class="reviews-themes">
        <section class="reviews-theme-group reviews-theme-group--positive">
          <span class="reviews-theme-label">НРАВИТСЯ</span>
          <h3>О чём жители говорят чаще всего</h3>
          <ul>${(reviewSet.likes ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>
        <section class="reviews-theme-group">
          <span class="reviews-theme-label">НУЖНО ПРИВЫКНУТЬ</span>
          <h3>О чём важно знать заранее</h3>
          <ul>${(reviewSet.adjustments ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>
      </div>
    </section>
  `;
}

function renderReviewCards(reviews = [], topics = []) {
  if (!reviews.length) {
    return `<p class="reviews-empty">По этой теме пока нет отзывов.</p>`;
  }

  const topicLabels = new Map(topics.map((topic) => [topic.id, topic.label]));
  const featured = reviews.find((review) => review.featured) ?? reviews[0];
  const compact = reviews.filter((review) => review.id !== featured.id);

  return [featured, ...compact].map((review, index) => `
    <article class="review-card ${index === 0 ? "review-card--featured" : ""}">
      <span class="review-card__quote" aria-hidden="true">“</span>
      <div class="review-card__author">
        <strong>${escapeHtml(review.name)}${review.age ? `, ${Number(review.age)}` : ""}</strong>
        <span>${escapeHtml(review.experience)}</span>
      </div>
      <p>${escapeHtml(review.text)}</p>
      <div class="review-card__topics">
        ${(review.topics ?? []).map((topic) => `<span>${escapeHtml(topicLabels.get(topic) ?? topic)}</span>`).join("")}
      </div>
    </article>
  `).join("");
}

function bindReviewFilters(root, reviewSet = {}, topics = []) {
  const list = root.querySelector("[data-reviews-list]");
  const buttons = [...root.querySelectorAll("[data-review-topic]")];
  if (!list || !buttons.length) return;

  let activeTopic = buttons[0].dataset.reviewTopic;
  let transitionTimer = 0;

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextTopic = button.dataset.reviewTopic;
      if (!nextTopic || nextTopic === activeTopic) return;
      activeTopic = nextTopic;

      buttons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });

      window.clearTimeout(transitionTimer);
      list.classList.add("is-changing");
      transitionTimer = window.setTimeout(() => {
        const filtered = activeTopic === "all"
          ? reviewSet.reviews ?? []
          : (reviewSet.reviews ?? []).filter((review) => (review.topics ?? []).includes(activeTopic));
        list.innerHTML = renderReviewCards(filtered, topics);
        list.classList.remove("is-changing");
      }, 110);
    });
  });
}

function renderTimeline(selectedYears) {
  const points = [
    { years: 0, label: "Сейчас" },
    { years: 1, label: "1 год" },
    { years: 3, label: "3 года" },
    { years: 5, label: "5 лет" }
  ];
  return `
    <div class="timeline" aria-label="Переход во времени">
      ${points.map((point) => `
        <button type="button" class="timeline-point ${selectedYears === point.years ? "is-active" : ""}" data-years="${point.years}">
          <span></span><strong>${point.label}</strong>
        </button>
      `).join("")}
    </div>
  `;
}

function renderMode(selectedMode, hidden = false) {
  return `
    <div class="mode-switch" role="group" aria-label="Тип предложений"${hidden ? " hidden" : ""}>
      <button type="button" class="mode-switch__button ${selectedMode === "profession" ? "is-active" : ""}" data-mode="profession" aria-pressed="${selectedMode === "profession"}">Вакансии</button>
      <button type="button" class="mode-switch__button ${selectedMode === "estate" ? "is-active" : ""}" data-mode="estate" aria-pressed="${selectedMode === "estate"}">Недвижимость</button>
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
    <h3>${Number(offer.area)} м²${offer.rooms ? ` · ${Number(offer.rooms)} комн.` : ""}</h3>
    <p>${money(offer.price)}${offer.kind === "rent" ? "/мес" : ""}</p>
    ${offer.kind === "sale" ? `<small>≈ ${money(Math.round(Number(offer.price) / 240))}/мес по простой модели</small>` : ""}
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
