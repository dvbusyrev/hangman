const SVG_NS = "http://www.w3.org/2000/svg";

export const PROJECT_REGION_SVG_IDS = Object.freeze({
  karelia: "RU-KR",
  murmansk: "RU-MUR",
  arkhangelsk: "RU-ARK",
  nenets: "RU-NEN",
  komi: "RU-KO",
  "yamalo-nenets": "RU-YAN",
  krasnoyarsk: "RU-KYA",
  yakutia: "RU-SA",
  chukotka: "RU-CHU"
});

export async function loadRussiaContextSvg({
  className = "",
  ariaLabel = "Карта регионов России"
} = {}) {
  const url = `/data/russia-regions-context.svg?v=${Date.now()}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      "Не найдена 2D-карта России. Выполните: node scripts/fetch-russia-context.mjs"
    );
  }

  const text = (await response.text()).replace(/^\uFEFF/, "").trim();

  // Vite can return index.html with HTTP 200 for a missing static asset.
  // Detect that explicitly instead of trying to parse HTML as SVG.
  if (!text.startsWith("<svg") && !text.startsWith("<?xml")) {
    throw new Error(
      "Файл russia-regions-context.svg отсутствует. " +
      "Vite вернул страницу приложения вместо карты. " +
      "Выполните: node scripts/fetch-russia-context.mjs"
    );
  }

  const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
  const parseError = parsed.querySelector("parsererror");
  if (parseError || parsed.documentElement?.localName !== "svg") {
    throw new Error(
      "russia-regions-context.svg существует, но не является корректным SVG. " +
      "Пересоздайте его: node scripts/fetch-russia-context.mjs"
    );
  }

  const sourceSvg = parsed.documentElement;
  sourceSvg.querySelectorAll("script, style").forEach((node) => node.remove());

  const svg = document.importNode(sourceSvg, true);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.removeAttribute("style");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", ariaLabel);
  svg.classList.add("russia-context-map__svg");
  if (className) svg.classList.add(className);

  const regions = Array.from(svg.querySelectorAll(".ru-map-russia-region"));
  regions.forEach((regionPath) => {
    regionPath.removeAttribute("style");
    regionPath.removeAttribute("fill");
    regionPath.removeAttribute("stroke");
    regionPath.classList.add("russia-context-map__region");
    regionPath.setAttribute("vector-effect", "non-scaling-stroke");
  });

  if (regions.length < 70) {
    throw new Error(
      `В карте России найдено только ${regions.length} субъектов. ` +
      "Пересоздайте файл: node scripts/fetch-russia-context.mjs"
    );
  }

  const missingProjectIds = Object.values(PROJECT_REGION_SVG_IDS)
    .filter((id) => !svg.querySelector(`[id="${id}"]`));
  if (missingProjectIds.length) {
    throw new Error(
      `В карте отсутствуют нужные регионы: ${missingProjectIds.join(", ")}. ` +
      "Пересоздайте файл: node scripts/fetch-russia-context.mjs"
    );
  }

  // SVG paints elements in DOM order: elements that come later are drawn on top.
  // The source map has some ordinary federal subjects after Arctic subjects,
  // so their fills can visually cover parts of the Arctic regions.
  // Move all project Arctic paths to the end of their own parent group.
  // This preserves geometry/transforms and guarantees:
  // ordinary Russia context -> Arctic project regions -> labels/markers.
  Object.values(PROJECT_REGION_SVG_IDS).forEach((svgId) => {
    const projectPath = svg.querySelector(`[id="${svgId}"]`);
    projectPath?.parentNode?.append(projectPath);
  });

  const viewBox = readViewBox(svg);

  return {
    svg,
    regions,
    viewBox,
    getProjectRegionPath(regionId) {
      const svgId = PROJECT_REGION_SVG_IDS[String(regionId ?? "")];
      return svgId ? svg.querySelector(`[id="${svgId}"]`) : null;
    }
  };
}

export function addSvgLabel(svg, {
  x,
  y,
  text,
  className,
  maxChars = 22,
  onActivate
}) {
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("russia-context-map__label");
  if (className) group.classList.add(className);
  group.setAttribute("transform", `translate(${Number(x).toFixed(2)} ${Number(y).toFixed(2)})`);

  if (onActivate) {
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", text);
    group.addEventListener("click", onActivate);
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    });
  }

  const lines = wrapWords(text, maxChars);
  const longest = Math.max(...lines.map((line) => line.length), 8);
  const width = Math.min(190, Math.max(84, longest * 7.0 + 22));
  const lineHeight = 15;
  const height = lines.length * lineHeight + 12;

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", String(-width / 2));
  rect.setAttribute("y", String(-height / 2));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("rx", "7");
  group.append(rect);

  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("dominant-baseline", "middle");
  const firstY = -((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    const tspan = document.createElementNS(SVG_NS, "tspan");
    tspan.setAttribute("x", "0");
    tspan.setAttribute("y", String(firstY + index * lineHeight));
    tspan.textContent = line;
    label.append(tspan);
  });
  group.append(label);
  svg.append(group);
  return group;
}

export function pathCenter(path) {
  const box = path.getBBox();
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    box
  };
}

export function approximatePointInRegion(path, feature, coordinates) {
  const box = path.getBBox();
  const lon = Number(coordinates?.[0]);
  const lat = Number(coordinates?.[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !feature?.geometry) {
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  const points = [];
  collectCoordinates(feature.geometry?.coordinates, points);
  if (!points.length) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  const aligned = points.map(([pointLon, pointLat]) => [alignLongitude(pointLon, lon), pointLat]);
  const minLon = aligned.reduce((v, point) => Math.min(v, point[0]), Infinity);
  const maxLon = aligned.reduce((v, point) => Math.max(v, point[0]), -Infinity);
  const minLat = aligned.reduce((v, point) => Math.min(v, point[1]), Infinity);
  const maxLat = aligned.reduce((v, point) => Math.max(v, point[1]), -Infinity);

  const fx = clamp((alignLongitude(lon, lon) - minLon) / Math.max(1e-9, maxLon - minLon), 0.08, 0.92);
  const fy = clamp((maxLat - lat) / Math.max(1e-9, maxLat - minLat), 0.08, 0.92);

  return {
    x: box.x + fx * box.width,
    y: box.y + fy * box.height
  };
}

function readViewBox(svg) {
  const raw = String(svg.getAttribute("viewBox") ?? "").trim().split(/\s+/).map(Number);
  if (raw.length === 4 && raw.every(Number.isFinite)) {
    return { x: raw[0], y: raw[1], width: raw[2], height: raw[3] };
  }
  return { x: 0, y: 0, width: 1002, height: 568 };
}

function wrapWords(value, maxChars) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function collectCoordinates(value, output) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    output.push([Number(value[0]), Number(value[1])]);
    return;
  }
  value.forEach((child) => collectCoordinates(child, output));
}

function alignLongitude(value, reference) {
  let lon = Number(value);
  while (lon - reference > 180) lon -= 360;
  while (reference - lon > 180) lon += 360;
  return lon;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
