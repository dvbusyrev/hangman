import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let cesiumPackagePath;

try {
  cesiumPackagePath = require.resolve("cesium/package.json");
} catch {
  console.error("Cesium is not installed. Run npm install first.");
  process.exit(1);
}

const cesiumSource = path.join(path.dirname(cesiumPackagePath), "Build", "Cesium");
const cesiumTarget = path.join(rootDir, "public", "cesium");

// Copy the complete browser build, including Cesium.js, widgets.css,
// Workers, Assets and ThirdParty. This lets index.html load Cesium explicitly
// as a normal script while Vite serves everything from /public.
await rm(cesiumTarget, { recursive: true, force: true });
await mkdir(path.dirname(cesiumTarget), { recursive: true });
await cp(cesiumSource, cesiumTarget, { recursive: true });

console.log(`Cesium browser build copied to ${cesiumTarget}`);
