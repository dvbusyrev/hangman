import "./russiaMapContext.css";
import {
  addSvgLabel,
  approximatePointInRegion,
  calculateCenteredContentViewBox,
  getInnerViewportAspect,
  loadRussiaContextSvg,
  pathCenter
} from "./russiaMapContext.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const LABEL_OFFSETS = {
  karelia: { x: -28, y: 18 },
  murmansk: { x: -10, y: -28 },
  arkhangelsk: { x: -30, y: 28 },
  nenets: { x: 22, y: -10 },
  komi: { x: -22, y: 32 },
  "yamalo-nenets": { x: 12, y: 30 },
  krasnoyarsk: { x: -10, y: 36 },
  yakutia: { x: 20, y: 20 },
  chukotka: { x: -18, y: -22 }
};

// Same zoom settings that were previously used by the separate city map.
// They now operate on the original «Области» SVG itself.
const CITY_MAP_ZOOM = 1.75;
const CITY_MAP_BASE_PADDING = 0.34;
const REGION_TO_CITY_ZOOM_DURATION_MS = 860;
const CITY_POINT_ZOOM = 2.8;
const CITY_POINT_ZOOM_DURATION_MS = 520;

export async function setupRegionMap2D(container, scenarios, {
  selectedRegionId = null,
  selectedCityId = null,
  onRegionPick,
  onCityPick
} = {}) {
  container.classList.add("region-map-2d-host", "russia-context-map-host");
  container.innerHTML = "";

  const stage = document.createElement("div");
  stage.className = "region-map-2d-stage russia-context-map-stage";
  stage.style.overflow = "hidden";
  container.append(stage);

  try {
    const regions = scenarios?.regions ?? [];
    const regionById = new Map(regions.map((region) => [region.id, region]));

    // Load city positioning data in parallel. It does not delay the overview.
    const featureMapPromise = loadRegionFeatureMap();

    const {
      svg,
      regions: allRegionPaths,
      viewBox,
      getProjectRegionPath
    } = await loadRussiaContextSvg({
      className: "region-map-2d",
      ariaLabel: "Карта России с арктическими регионами проекта"
    });

    stage.append(svg);

    await nextFrame();
    const centeredRussiaViewBox = calculateCenteredContentViewBox(
      allRegionPaths,
      svg,
      { padding: 0.045, fallback: viewBox }
    );
    setViewBox(svg, centeredRussiaViewBox);

    let currentViewBox = { ...centeredRussiaViewBox };
    let currentRegionId = selectedRegionId ?? null;
    let currentCityId = selectedCityId ?? null;
    let cityMode = false;
    let transitionToken = 0;
    const cityNodes = new Set();

    const pathById = new Map();
    const labelById = new Map();

    regions.forEach((region) => {
      const path = getProjectRegionPath(region.id);
      if (!path) return;

      path.dataset.regionId = region.id;
      path.classList.add("is-project-region");
      path.setAttribute("tabindex", "0");
      path.setAttribute("role", "button");
      path.setAttribute("aria-label", region.name);
      pathById.set(region.id, path);

      const center = pathCenter(path);
      const offset = LABEL_OFFSETS[region.id] ?? { x: 0, y: 0 };
      const pick = () => {
        if (!cityMode) onRegionPick?.(region);
      };

      const label = addSvgLabel(svg, {
        x: center.x + offset.x,
        y: center.y + offset.y,
        text: region.name,
        className: "region-map-2d-context-label",
        maxChars: 19,
        onActivate: pick
      });

      label.dataset.regionId = region.id;
      labelById.set(region.id, label);

      path.addEventListener("click", pick);
      path.addEventListener("keydown", (event) => {
        if ((event.key === "Enter" || event.key === " ") && !cityMode) {
          event.preventDefault();
          pick();
        }
      });

      const setHover = (hovered) => {
        if (cityMode) return;
        path.classList.toggle("is-hovered", hovered);
        label.classList.toggle("is-hovered", hovered);
      };

      path.addEventListener("pointerenter", () => setHover(true));
      path.addEventListener("pointerleave", () => setHover(false));
      label.addEventListener("pointerenter", () => setHover(true));
      label.addEventListener("pointerleave", () => setHover(false));
    });

    const missing = regions.filter((region) => !pathById.has(region.id));
    if (missing.length) {
      const note = document.createElement("div");
      note.className = "russia-context-map-note";
      note.textContent = `На контекстной карте не найдены: ${missing.map((region) => region.name).join(", ")}.`;
      container.append(note);
    }

    // ARCTIC_SINGLE_MAP_SMOOTH_V29
    const applySelection = (regionId) => {
      currentRegionId = regionId ?? null;

      pathById.forEach((path, id) => {
        path.classList.toggle("is-selected", id === currentRegionId);
      });

      labelById.forEach((label, id) => {
        label.classList.remove("is-selected");

        // ARCTIC_SINGLE_MAP_SILK_V30
        // The label normally contains a white SVG <rect>. On the chosen
        // region hide that rect completely: text can remain briefly, but
        // there is no selection rectangle at all.
        const rect = label.querySelector("rect");
        if (rect) {
          rect.style.display = id === currentRegionId ? "none" : "";
        }
      });
    };

    const clearCityMarkers = () => {
      cityNodes.forEach((node) => node.remove());
      cityNodes.clear();
    };

    const renderCities = async (regionId, targetViewBox, token) => {
      if (token !== transitionToken) return;

      clearCityMarkers();

      const region = regionById.get(regionId);
      const selectedPath = pathById.get(regionId);
      if (!region || !selectedPath) return;

      const readyCities = (region.cities ?? []).filter((city) => city.ready);
      if (!readyCities.length) return;

      const featureById = await featureMapPromise;
      if (token !== transitionToken) return;

      const feature = featureById.get(regionId);
      const markerScale = clamp(
        targetViewBox.width / Math.max(1, centeredRussiaViewBox.width),
        0.015,
        0.80
      );

      readyCities.forEach((city) => {
        const coordinates = cityCoordinates(city);
        const point = approximatePointInRegion(selectedPath, feature, coordinates);

        const nodes = addCityMarker({
          svg,
          point,
          city,
          selected: city.id === currentCityId,
          markerScale,
          onActivate: async () => {
            if (!cityMode) return;

            const cityViewBox = calculateCityPointViewBox(
              point,
              currentViewBox,
              CITY_POINT_ZOOM
            );

            await animateSvgViewBox(
              svg,
              currentViewBox,
              cityViewBox,
              CITY_POINT_ZOOM_DURATION_MS
            );

            currentViewBox = cityViewBox;
            onCityPick?.(city);
          }
        });

        nodes.forEach((node) => cityNodes.add(node));
      });
    };

    applySelection(selectedRegionId);

    const controller = {
      kind: "regions-2d",

      async selectRegion(regionId) {
        applySelection(regionId);
      },

      async enterCities(regionId, { animate = true } = {}) {
        const path = pathById.get(regionId);
        if (!path) return;

        const token = ++transitionToken;
        cityMode = true;
        currentCityId = null;
        clearCityMarkers();
        applySelection(regionId);

        // This is NOT a new screen/map. We keep the same SVG node and only
        // animate its viewBox toward the selected geographic region.
        stage.classList.add("is-city-mode");

        const targetViewBox = calculateCenteredRegionViewBox(
          path,
          centeredRussiaViewBox,
          svg
        );

        if (animate) {
          await animateSvgViewportTransform(
            svg,
            currentViewBox,
            targetViewBox,
            REGION_TO_CITY_ZOOM_DURATION_MS
          );
        } else {
          setViewBox(svg, targetViewBox);
        }

        if (token !== transitionToken) return;
        currentViewBox = targetViewBox;
        await renderCities(regionId, targetViewBox, token);
      },

      async exitCities(regionId = currentRegionId) {
        const token = ++transitionToken;
        clearCityMarkers();
        cityMode = false;
        stage.classList.remove("is-city-mode");
        applySelection(regionId);

        await animateSvgViewportTransform(
          svg,
          currentViewBox,
          centeredRussiaViewBox,
          720
        );

        if (token !== transitionToken) return;
        currentViewBox = { ...centeredRussiaViewBox };
      },

      async selectCity(cityId) {
        currentCityId = cityId ?? null;
        stage.querySelectorAll("[data-city-id]").forEach((element) => {
          element.classList.toggle(
            "is-selected",
            element.dataset.cityId === currentCityId
          );
        });
      },

      async showOverview(regionId = null) {
        await controller.exitCities(regionId);
      },

      destroy() {
        transitionToken += 1;
        clearCityMarkers();
        container.classList.remove("region-map-2d-host", "russia-context-map-host");
        container.innerHTML = "";
      }
    };

    return controller;
  } catch (error) {
    stage.remove();
    renderLoadError(container, error);
    throw error;
  }
}

function calculateCenteredRegionViewBox(path, fullViewBox, svg) {
  const box = path.getBBox();
  const targetAspect = getInnerViewportAspect(svg, fullViewBox);

  let width = box.width * (1 + CITY_MAP_BASE_PADDING * 2);
  let height = box.height * (1 + CITY_MAP_BASE_PADDING * 2);

  if (width / height < targetAspect) {
    width = height * targetAspect;
  } else {
    height = width / targetAspect;
  }

  const zoom = clamp(Number(CITY_MAP_ZOOM) || 1, 0.25, 50);
  width /= zoom;
  height /= zoom;

  // Never crop the region. The same rule from V26 remains in force.
  const safePadding = 0.12;
  const minWidth = box.width * (1 + safePadding * 2);
  const minHeight = box.height * (1 + safePadding * 2);
  const safeScale = Math.max(
    minWidth / Math.max(width, 1e-9),
    minHeight / Math.max(height, 1e-9),
    1
  );

  width *= safeScale;
  height *= safeScale;

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
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

  label.addEventListener("pointerenter", () => setHover(true));
  label.addEventListener("pointerleave", () => setHover(false));

  svg.insertBefore(hit, label);
  svg.insertBefore(dot, label);

  return [hit, dot, label];
}

async function loadRegionFeatureMap() {
  try {
    const response = await fetch("/data/regions.geojson", { cache: "no-store" });
    if (!response.ok) return new Map();

    const geoJson = await response.json();
    return new Map(
      (geoJson.features ?? []).map((feature) => [featureId(feature), feature])
    );
  } catch {
    return new Map();
  }
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


async function animateSvgViewportTransform(svg, from, to, durationMs) {
  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  if (reduceMotion || durationMs <= 0) {
    setViewBox(svg, to);
    return;
  }

  // ARCTIC_SINGLE_MAP_SILK_V30
  // Both viewBoxes have the same viewport aspect ratio. Therefore the move
  // can be represented as one GPU-friendly 2D matrix:
  //   old map -> translate + scale -> exact visual target.
  //
  // No per-frame viewBox writes = no SVG relayout jitter.
  setViewBox(svg, from);
  await nextFrame();

  const rect = svg.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) {
    setViewBox(svg, to);
    return;
  }

  const scaleX = from.width / Math.max(to.width, 1e-9);
  const scaleY = from.height / Math.max(to.height, 1e-9);

  // The V26/V28 framing keeps aspect ratios equal; average tiny floating
  // differences so the map never appears to stretch.
  const scale = (scaleX + scaleY) / 2;

  const translateX =
    ((from.x - to.x) / Math.max(to.width, 1e-9)) * rect.width;
  const translateY =
    ((from.y - to.y) / Math.max(to.height, 1e-9)) * rect.height;

  svg.style.transformOrigin = "0 0";
  svg.style.willChange = "transform";

  const animation = svg.animate(
    [
      { transform: "matrix(1, 0, 0, 1, 0, 0)" },
      {
        transform:
          `matrix(${scale}, 0, 0, ${scale}, ${translateX}, ${translateY})`
      }
    ],
    {
      duration: durationMs,
      easing: "cubic-bezier(0.45, 0, 0.20, 1)",
      fill: "forwards"
    }
  );

  try {
    await animation.finished;
  } catch {
    // Animation can be cancelled by navigation. The caller token handles it.
  }

  // Commit the exact geographic target while the GPU layer still displays
  // the mathematically equivalent last frame, then remove the transform
  // before the browser paints another frame. No visual snap.
  setViewBox(svg, to);
  animation.cancel();
  svg.style.transform = "";
  svg.style.transformOrigin = "";
  svg.style.willChange = "";
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
      const eased = smootherstep(progress);

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

function featureId(feature) {
  return String(feature?.properties?.regionId ?? feature?.id ?? "");
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function smootherstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderLoadError(container, error) {
  const note = document.createElement("div");
  note.className = "city-map-2d-empty russia-context-map-error";
  note.innerHTML = `<strong>Карта России ещё не подготовлена.</strong><br>${escapeHtml(error?.message ?? error)}`;
  container.append(note);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
