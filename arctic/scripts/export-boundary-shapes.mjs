import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(rootDir, "public", "data");
const shapeDir = path.join(rootDir, "data", "osm-boundaries");

const exports = [
  {
    source: path.join(dataDir, "russia-boundary.geojson"),
    layerName: "russia_boundary",
    archiveName: "russia-boundary-shapefile.zip"
  },
  {
    source: path.join(dataDir, "regions.geojson"),
    layerName: "arctic_regions",
    archiveName: "arctic-regions-shapefile.zip"
  }
];

await ensureCommand("ogr2ogr");
await ensureCommand("zip");
await mkdir(shapeDir, { recursive: true });

for (const item of exports) {
  await exportShape(item);
}

async function exportShape({ source, layerName, archiveName }) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "arctic-shp-"));
  const shapeOutputDir = path.join(tempDir, layerName);

  try {
    await execFileAsync("ogr2ogr", [
      "-f",
      "ESRI Shapefile",
      "-lco",
      "ENCODING=UTF-8",
      shapeOutputDir,
      source,
      "-nln",
      layerName
    ]);

    await writeFile(path.join(shapeOutputDir, `${layerName}.cpg`), "UTF-8\n", "utf8");

    await execFileAsync("zip", ["-q", "-j", path.join(shapeDir, archiveName), ...[
      `${layerName}.cpg`,
      `${layerName}.dbf`,
      `${layerName}.prj`,
      `${layerName}.shp`,
      `${layerName}.shx`
    ].map((fileName) => path.join(shapeOutputDir, fileName))]);

    console.log(`Saved ${path.join(shapeDir, archiveName)}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function ensureCommand(command) {
  try {
    await execFileAsync("which", [command]);
  } catch {
    throw new Error(`${command} is required to export shapefiles`);
  }
}
