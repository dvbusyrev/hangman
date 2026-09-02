import "./russiaMapContext.css";
import {
  addSvgLabel,
  approximatePointInRegion,
  loadRussiaContextSvg
} from "./russiaMapContext.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Единственный параметр приближения страницы «Города».
// Это настоящий множитель масштаба:
// 1.0 = базовый вид, 1.35 = на 35% ближе, 2.0 = в 2 раза ближе.
// Для проверки можно поставить даже 10 или 20 — изменение будет очень заметным.
const CITY_MAP_ZOOM = 1.75;

// ARCTIC_CITY_POINT_LAUNCH_V1
// Short 2D zoom into the clicked city before switching to the 3D scene.
const CITY_POINT_ZOOM = 2.8;
const CITY_POINT_ZOOM_DURATION_MS = 520;

// Служебные значения — обычно их менять не нужно.
const CITY_MAP_BASE_PADDING = 0.34;
const CITY_MAP_ZOOM_DURATION_MS = 420;

export async function setupCityMap2D(container, scenarios, {
  selectedRegionId,
  selectedCityId = null,
  onCityPick
} = {}) {
  const regionsResponse = await fetch("/data/regions.geojson", { cache: "no-store" });
  if (!regionsResponse.ok) {
    throw new Error(`Не удалось загрузить /data/regions.geojson: ${regionsResponse.status}`);
  }

  const geoJson = await regionsResponse.json();
  const regions = scenarios?.regions ?? [];
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const featureById = new Map((geoJson.features ?? []).map((feature) => [featureId(feature), feature]));

  container.classList.add(
    "city-map-2d-host",
    "russia-context-map-host",
    "city-map-2d-zoom-host",
    "city-map-2d-centered-host"
  );
  container.innerHTML = "";

  let currentRegionId = selectedRegionId ?? null;
  let currentCityId = selectedCityId ?? null;
  let renderToken = 0;

  const render = async (regionId = currentRegionId) => {
    const token = ++renderToken;
    currentRegionId = regionId ?? null;
    container.innerHTML = "";

    const region = regionById.get(currentRegionId);
    if (!region) {
      renderEmpty(container, "Не выбрана область.");
      return;
    }

    try {
      const stage = document.createElement("div");
      stage.className = "city-map-2d-stage russia-context-map-stage city-map-2d-zoom-stage city-map-2d-centered-stage";
      container.append(stage);

      const regionCaption = document.createElement("div");
      regionCaption.className = "city-map-2d-region-caption";
      regionCaption.textContent = region.name;
      stage.append(regionCaption);

      const { svg, getProjectRegionPath, viewBox } = await loadRussiaContextSvg({
        className: "city-map-2d",
        ariaLabel: `Карта России. Города региона: ${region.name}`
      });

      if (token !== renderToken) return;
      stage.append(svg);

      regions.forEach((projectRegion) => {
        const path = getProjectRegionPath(projectRegion.id);
        if (!path) return;
        path.classList.add("is-project-region", "is-city-context-region");
        path.classList.toggle("is-selected", projectRegion.id === currentRegionId);
      });

      const selectedPath = getProjectRegionPath(currentRegionId);
      if (!selectedPath) {
        throw new Error(`На карте России не найден контур: ${region.name}.`);
      }

      // Make sure getBBox() is calculated after SVG is attached.
      await nextFrame();
      if (token !== renderToken) return;

      const targetViewBox = calculateCenteredRegionViewBox(selectedPath, viewBox, stage);
      await animateSvgViewBox(svg, viewBox, targetViewBox, CITY_MAP_ZOOM_DURATION_MS);
      if (token !== renderToken) return;

      const feature = featureById.get(currentRegionId);
      const readyCities = (region.cities ?? []).filter((city) => city.ready);

      // Counter-scale markers so their visual size stays normal after map zoom.
      const markerScale = clamp(
        targetViewBox.width / Math.max(1, viewBox.width),
        0.015,
        0.80
      );

      let cityLaunchInProgress = false;
      const launchCity = async (city, point) => {
        if (cityLaunchInProgress) return;
        cityLaunchInProgress = true;

        stage.classList.add("is-city-launching");
        stage.querySelectorAll("[data-city-id]").forEach((element) => {
          element.classList.toggle("is-launch-target", element.dataset.cityId === city.id);
        });

        const cityViewBox = calculateCityPointViewBox(point, targetViewBox, CITY_POINT_ZOOM);
        await animateSvgViewBox(svg, targetViewBox, cityViewBox, CITY_POINT_ZOOM_DURATION_MS);

        if (token !== renderToken) return;
        onCityPick?.(city);
      };

      readyCities.forEach((city) => {
        const coordinates = cityCoordinates(city);
        const point = approximatePointInRegion(selectedPath, feature, coordinates);

        addCityMarker({
          svg,
          point,
          city,
          selected: city.id === currentCityId,
          markerScale,
          onActivate: () => launchCity(city, point)
        });
      });

      if (!readyCities.length) {
        const note = document.createElement("div");
        note.className = "russia-context-map-note city-map-2d-no-cities";
        note.innerHTML = `Для области <strong>${escapeHtml(region.name)}</strong> города пока не добавлены.`;
        container.append(note);
      }
    } catch (error) {
      if (token !== renderToken) return;
      container.innerHTML = "";
      renderEmpty(container, `Не удалось открыть карту городов. ${error?.message ?? error}`);
      throw error;
    }
  };

  await render(currentRegionId);

  return {
    kind: "cities-2d",

    async selectRegion(regionId) {
      currentCityId = null;
      await render(regionId);
    },

    async selectCity(cityId) {
      currentCityId = cityId ?? null;

      container.querySelectorAll("[data-city-id]").forEach((element) => {
        element.classList.toggle("is-selected", element.dataset.cityId === currentCityId);
      });
    },

    async showOverview(regionId = currentRegionId) {
      await render(regionId);
    },

    destroy() {
      renderToken += 1;
      container.classList.remove(
        "city-map-2d-host",
        "russia-context-map-host",
        "city-map-2d-zoom-host",
        "city-map-2d-centered-host"
      );
      container.innerHTML = "";
    }
  };
}

function addCityMarker({
  svg,
  point,
  city,
  selected,
  markerScale,
  onActivate
}) {
  const label = addSvgLabel(svg, {
    x: point.x,
    y: point.y - 22 * markerScale,
    text: city.name,
    className: "city-map-2d-context-marker",
    maxChars: 18,
    onActivate
  });

  label.dataset.cityId = city.id;
  label.classList.toggle("is-selected", selected);

  // addSvgLabel creates translate(x y). Add an inverse-ish scale so the
  // text/card does not become huge when the map is zoomed into a region.
  label.setAttribute(
    "transform",
    `translate(${point.x.toFixed(2)} ${(point.y - 22 * markerScale).toFixed(2)}) scale(${markerScale.toFixed(4)})`
  );

  const dot = document.createElementNS(SVG_NS, "circle");
  dot.classList.add("city-map-2d-context-dot");
  dot.dataset.cityId = city.id;
  dot.classList.toggle("is-selected", selected);
  dot.setAttribute("cx", point.x.toFixed(2));
  dot.setAttribute("cy", point.y.toFixed(2));
  dot.setAttribute("r", (5.5 * markerScale).toFixed(2));
  dot.setAttribute("aria-hidden", "true");

  // Transparent hit target: much easier to hover/click than a tiny visual dot.
  const hit = document.createElementNS(SVG_NS, "circle");
  hit.classList.add("city-map-2d-context-hit");
  hit.dataset.cityId = city.id;
  hit.classList.toggle("is-selected", selected);
  hit.setAttribute("cx", point.x.toFixed(2));
  hit.setAttribute("cy", point.y.toFixed(2));
  hit.setAttribute("r", (15 * markerScale).toFixed(2));
  hit.setAttribute("tabindex", "0");
  hit.setAttribute("role", "button");
  hit.setAttribute("aria-label", `Открыть город ${city.name}`);

  const setHover = (hovered) => {
    hit.classList.toggle("is-hovered", hovered);
    dot.classList.toggle("is-hovered", hovered);
    label.classList.toggle("is-hovered", hovered);
  };

  hit.addEventListener("pointerenter", () => setHover(true));
  hit.addEventListener("pointerleave", () => setHover(false));
  hit.addEventListener("focus", () => setHover(true));
  hit.addEventListener("blur", () => setHover(false));
  hit.addEventListener("click", onActivate);
  hit.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  });

  // Label remains clickable too.
  label.addEventListener("pointerenter", () => setHover(true));
  label.addEventListener("pointerleave", () => setHover(false));

  svg.insertBefore(hit, label);
  svg.insertBefore(dot, label);
}

function calculateCityPointViewBox(point, sourceViewBox, zoomFactor) {
  const zoom = clamp(Number(zoomFactor) || 1, 1, 8);
  const width = sourceViewBox.width / zoom;
  const height = sourceViewBox.height / zoom;

  return {
    x: point.x - width / 2,
    y: point.y - height / 2,
    width,
    height
  };
}

function calculateCenteredRegionViewBox(path, fullViewBox, stage) {
  const box = path.getBBox();

  // Сначала строим базовый кадр, в который область помещается целиком
  // с небольшим полем вокруг.
  let width = box.width * (1 + CITY_MAP_BASE_PADDING * 2);
  let height = box.height * (1 + CITY_MAP_BASE_PADDING * 2);

  const stageRect = stage.getBoundingClientRect();
  const targetAspect =
    stageRect.width > 0 && stageRect.height > 0
      ? stageRect.width / stageRect.height
      : fullViewBox.width / fullViewBox.height;

  if (width / height < targetAspect) {
    width = height * targetAspect;
  } else {
    height = width / targetAspect;
  }

  // А теперь применяем настоящий множитель масштаба.
  // Уменьшение viewBox в N раз визуально приближает карту в N раз.
  const zoom = clamp(Number(CITY_MAP_ZOOM) || 1, 0.25, 50);
  width /= zoom;
  height /= zoom;

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  };
}

async function animateSvgViewBox(svg, from, to, durationMs) {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  if (reduceMotion || durationMs <= 0) {
    setViewBox(svg, to);
    return;
  }

  setViewBox(svg, from);
  await nextFrame();

  const startTime = performance.now();

  await new Promise((resolve) => {
    const tick = (now) => {
      const progress = clamp((now - startTime) / durationMs, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      setViewBox(svg, {
        x: lerp(from.x, to.x, eased),
        y: lerp(from.y, to.y, eased),
        width: lerp(from.width, to.width, eased),
        height: lerp(from.height, to.height, eased)
      });

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setViewBox(svg, to);
        resolve();
      }
    };

    requestAnimationFrame(tick);
  });
}

function setViewBox(svg, box) {
  svg.setAttribute(
    "viewBox",
    `${box.x.toFixed(3)} ${box.y.toFixed(3)} ${box.width.toFixed(3)} ${box.height.toFixed(3)}`
  );
}

function cityCoordinates(city) {
  const lon = Number(city?.center?.lon ?? city?.camera?.lon);
  const lat = Number(city?.center?.lat ?? city?.camera?.lat);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

function renderEmpty(container, message) {
  const note = document.createElement("div");
  note.className = "city-map-2d-empty russia-context-map-error";
  note.textContent = message;
  container.append(note);
}

function featureId(feature) {
  return String(feature?.properties?.regionId ?? feature?.id ?? "");
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
