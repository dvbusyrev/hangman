import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://raw.githubusercontent.com/ibeloyar/ru-map/dev/src/map/map.ts";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const OUTPUT = path.join(PROJECT_ROOT, "public/data/russia-regions-context.svg");
const REQUIRED_REGION_IDS = ["RU-KR", "RU-MUR", "RU-ARK", "RU-NEN", "RU-KO", "RU-YAN", "RU-KYA", "RU-SA", "RU-CHU"];

console.log("Preparing Russia 2D context map...");
console.log(`Project: ${PROJECT_ROOT}`);
console.log(`Source:  ${SOURCE_URL}`);

const response = await fetch(SOURCE_URL, {
  headers: { "User-Agent": "arctic-life-mvp/1.0" }
});

if (!response.ok) {
  throw new Error(`Russia map download failed: HTTP ${response.status} ${response.statusText}`);
}

const source = await response.text();
const marker = "export const mapSVG = `";
const start = source.indexOf(marker);
if (start < 0) {
  throw new Error("mapSVG template was not found in the downloaded source.");
}

const contentStart = start + marker.length;
const contentEnd = source.indexOf("\n`;", contentStart);
if (contentEnd < 0) {
  throw new Error("Could not find the end of mapSVG template.");
}

let svg = source.slice(contentStart, contentEnd).trim();
svg = svg.replace(/^<\?xml[^>]*>\s*/i, "");

validateSvg(svg);

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${svg}\n`, "utf8");

// Read back from disk so an incomplete/incorrect path cannot silently pass.
const written = await readFile(OUTPUT, "utf8");
validateSvg(written);

console.log(`Saved:   ${OUTPUT}`);
console.log(`Size:    ${Buffer.byteLength(written, "utf8")} bytes`);
console.log("Russia context map: OK");

function validateSvg(svgText) {
  const text = String(svgText ?? "").trim();

  if (!/^<svg\b/i.test(text) || !/<\/svg>\s*$/i.test(text)) {
    throw new Error("Extracted Russia map is not a complete SVG document.");
  }

  const regionCount = (text.match(/class="ru-map-russia-region"/g) ?? []).length;
  if (regionCount < 70) {
    throw new Error(`Russia map contains too few federal subjects: ${regionCount}.`);
  }

  const missing = REQUIRED_REGION_IDS.filter((id) => !text.includes(`id="${id}"`));
  if (missing.length) {
    throw new Error(`Russia map is missing project regions: ${missing.join(", ")}`);
  }
}
