#!/usr/bin/env node
/**
 * build-catalog — the machine-readable dataset catalog.
 *
 * The registry in `src/data/layers.ts` is the one place a dataset is
 * described. This script reads it (Node strips the TypeScript), cross-checks
 * each entry against the generated snapshot and the served file, and writes
 * `public/data/catalog.json` for anything outside the app: the publish script,
 * the atlas export, and a future ingestion job.
 *
 * It also fails the build when a layer claims to be published but its artifact
 * or count is absent. That is the integrity gate the PRD asked for: a fresh
 * checkout cannot advertise a dataset it does not serve.
 */
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LAYERS, countFor, resolveLayerStatus } from "../src/data/layers.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public", "data");

async function readJson(relative) {
  const file = path.join(DATA, relative);
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  const [stats, meta] = await Promise.all([readJson("stats.json"), readJson("meta.json")]);
  if (!stats) {
    throw new Error("stats.json is missing. Run build-stats.mjs before build-catalog.mjs.");
  }

  const counts = flattenCounts(stats);
  const datasets = [];
  const failures = [];

  for (const layer of LAYERS) {
    const status = resolveLayerStatus(layer, counts);
    const artifact = layer.artifact ?? null;
    const artifactPath = artifact ? path.join(ROOT, "public", artifact) : null;
    const artifactExists = artifactPath ? existsSync(artifactPath) : false;
    const count = layer.countKey ? (counts[layer.countKey] ?? null) : null;

    if (status === "published") {
      if (!artifact) failures.push(`${layer.id}: published but declares no artifact`);
      else if (!artifactExists) failures.push(`${layer.id}: published but ${artifact} is missing`);
      if (layer.countKey && count === null) failures.push(`${layer.id}: published but ${layer.countKey} is missing from stats.json`);
    }

    datasets.push({
      id: layer.id,
      label: layer.label,
      recordNoun: layer.recordNoun,
      description: layer.description,
      status,
      declaredStatus: layer.status,
      statusNote: layer.statusNote ?? null,
      defaultVisible: layer.defaultVisible,
      geometry: layer.geometry ?? "dataset",
      explore: layer.explore ?? "none",
      coverage: layer.coverage,
      source: layer.source,
      licence: layer.licence,
      limitations: layer.limitations,
      artifact,
      artifactBytes: artifactExists && artifactPath ? statSync(artifactPath).size : null,
      countKey: layer.countKey ?? null,
      count,
    });
  }

  if (failures.length > 0) {
    console.error("[build-catalog] integrity check failed:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  const catalog = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    dataLastUpdated: stats.dataLastUpdated ?? meta?.lastUpdated ?? null,
    recordSemantics:
      "Counts are rows in each served artifact. They are not unique real-world places and do not imply complete coverage.",
    datasets,
  };

  await writeFile(path.join(DATA, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(
    `[build-catalog] ${datasets.length} datasets · ` +
      `${datasets.filter((entry) => entry.status === "published").length} published`,
  );
}

/** Same dot-path flattening the UI uses, so the catalog cannot disagree. */
function flattenCounts(stats) {
  const counts = {};
  for (const [group, value] of Object.entries(stats)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, inner] of Object.entries(value)) {
        if (typeof inner === "number" && Number.isFinite(inner)) counts[`${group}.${key}`] = inner;
      }
    }
  }
  return counts;
}

main().catch((error) => {
  console.error("[build-catalog] failed:", error.message ?? error);
  process.exit(1);
});
