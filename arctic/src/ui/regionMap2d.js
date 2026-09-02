import "./russiaMapContext.css";
import {
  addSvgLabel,
  calculateCenteredContentViewBox,
  loadRussiaContextSvg,
  pathCenter
} from "./russiaMapContext.js";

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

export async function setupRegionMap2D(container, scenarios, { selectedRegionId = null, onRegionPick } = {}) {
  container.classList.add("region-map-2d-host", "russia-context-map-host");
  container.innerHTML = "";

  const stage = document.createElement("div");
  stage.className = "region-map-2d-stage russia-context-map-stage";
  container.append(stage);

  try {
    const regions = scenarios?.regions ?? [];
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

    // ARCTIC_REGION_TRUE_CENTER_REPAIR_V26
    await nextFrame();
    const centeredRussiaViewBox = calculateCenteredContentViewBox(
      allRegionPaths,
      svg,
      { padding: 0.045, fallback: viewBox }
    );
    setViewBox(svg, centeredRussiaViewBox);

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
      const pick = () => onRegionPick?.(region);
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
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          pick();
        }
      });

      const setHover = (hovered) => {
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

    const applySelection = (regionId) => {
      pathById.forEach((path, id) => path.classList.toggle("is-selected", id === regionId));
      labelById.forEach((label, id) => label.classList.toggle("is-selected", id === regionId));
    };
    applySelection(selectedRegionId);

    return {
      kind: "regions-2d",
      async selectRegion(regionId) {
        applySelection(regionId);
      },
      async showOverview(regionId = null) {
        applySelection(regionId);
      },
      destroy() {
        container.classList.remove("region-map-2d-host", "russia-context-map-host");
        container.innerHTML = "";
      }
    };
  } catch (error) {
    stage.remove();
    renderLoadError(container, error);
    throw error;
  }
}


function setViewBox(svg, box) {
  svg.setAttribute(
    "viewBox",
    `${box.x.toFixed(3)} ${box.y.toFixed(3)} ${box.width.toFixed(3)} ${box.height.toFixed(3)}`
  );
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
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
