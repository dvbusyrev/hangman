import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const FILE = path.join(PROJECT_ROOT, "public/data/russia-regions-context.svg");
const REQUIRED = ["RU-KR", "RU-MUR", "RU-ARK", "RU-NEN", "RU-KO", "RU-YAN", "RU-KYA", "RU-SA", "RU-CHU"];

let text;
try {
  text = await readFile(FILE, "utf8");
} catch {
  console.error(`BAD: file not found: ${FILE}`);
  process.exit(1);
}

const trimmed = text.replace(/^\uFEFF/, "").trim();
if (!trimmed.startsWith("<svg") || !trimmed.endsWith("</svg>")) {
  console.error("BAD: russia-regions-context.svg is not an SVG document.");
  console.error(`First bytes: ${JSON.stringify(trimmed.slice(0, 80))}`);
  process.exit(1);
}

const count = (trimmed.match(/class="ru-map-russia-region"/g) ?? []).length;
const missing = REQUIRED.filter((id) => !trimmed.includes(`id="${id}"`));

if (count < 70 || missing.length) {
  console.error(`BAD: federal subjects=${count}; missing=${missing.join(", ") || "none"}`);
  process.exit(1);
}

console.log(`OK: Russia context SVG, federal subjects=${count}, size=${Buffer.byteLength(text)} bytes`);
