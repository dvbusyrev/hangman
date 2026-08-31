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
const requiredAssets = ["Assets", "ThirdParty", "Workers", "Widgets"];

await rm(cesiumTarget, { recursive: true, force: true });
await mkdir(cesiumTarget, { recursive: true });

await Promise.all(
  requiredAssets.map((assetDir) =>
    cp(path.join(cesiumSource, assetDir), path.join(cesiumTarget, assetDir), {
      recursive: true
    })
  )
);
