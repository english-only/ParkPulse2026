#!/usr/bin/env node
/**
 * publish-contributions — promote an accepted export into the served dataset.
 *
 *   node scripts/publish-contributions.mjs parkpulse-contributions.geojson
 *
 * This is the only path from moderation to the map:
 *
 *   1. Read the GeoJSON the review page exported.
 *   2. Re-validate every feature against the canonical schema. The export came
 *      from the database, but a file on disk is still untrusted input.
 *   3. Refuse the publish if any record is invalid, if an id repeats, or if the
 *      file is empty. Partial publication is not silently permitted; fix the
 *      export or exclude the record in the review queue.
 *   4. Write public/data/contributions.geojson. The next build's stats and
 *      catalog pick it up, and Explore draws it from the registry.
 *
 * Publication is deliberately not automatic: a reviewer's "accept" is a
 * decision, this script is the deployment step.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlaceRecord, toFeature } from "../src/data/contribution/schema.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "public", "data", "contributions.geojson");

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/publish-contributions.mjs <accepted-export.geojson>");
    process.exit(2);
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
  } catch (error) {
    console.error(`[publish] could not read ${inputPath}:`, error.message);
    process.exit(2);
  }

  const features = parsed?.type === "FeatureCollection" ? parsed.features : null;
  if (!Array.isArray(features)) {
    console.error("[publish] the input is not a GeoJSON FeatureCollection.");
    process.exit(2);
  }
  if (features.length === 0) {
    console.error(
      "[publish] the export contains no features. Refusing to replace the served dataset with an empty file.",
    );
    process.exit(2);
  }

  const records = [];
  const problems = [];
  const seen = new Set();

  for (const [index, feature] of features.entries()) {
    if (!feature || feature.type !== "Feature") {
      problems.push(`feature ${index + 1}: not a Feature`);
      continue;
    }
    const coordinates = feature.geometry?.coordinates;
    const properties = feature.properties ?? {};
    const candidate = {
      ...properties,
      lat: Array.isArray(coordinates) ? coordinates[1] : undefined,
      lng: Array.isArray(coordinates) ? coordinates[0] : undefined,
    };
    const { record, issues } = validatePlaceRecord(candidate);
    if (!record) {
      problems.push(
        `feature ${index + 1} (${properties.name ?? "unnamed"}): ${issues.map((issue) => issue.message).join(" ")}`,
      );
      continue;
    }
    if (seen.has(record.id)) {
      problems.push(`feature ${index + 1}: duplicate id ${record.id}`);
      continue;
    }
    seen.add(record.id);
    records.push(record);
  }

  if (problems.length > 0) {
    console.error(`[publish] ${problems.length} record(s) failed validation; nothing was written.`);
    for (const problem of problems.slice(0, 20)) console.error(`  - ${problem}`);
    if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`);
    process.exit(1);
  }

  const output = {
    type: "FeatureCollection",
    name: "parkpulse-contributions",
    metadata: {
      generated: new Date().toISOString(),
      records: records.length,
      publishedBatches: parsed.metadata?.publishedBatches ?? null,
      note: "Accepted community contributions. Each feature carries its own provenance and licence.",
      publish: "node scripts/publish-contributions.mjs <exported.geojson>",
    },
    features: records.map(toFeature),
  };

  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`[publish] wrote ${records.length} record(s) to public/data/contributions.geojson`);
  console.log("[publish] next: pnpm run build (stats, catalog and the map pick the file up)");
}

main().catch((error) => {
  console.error("[publish] failed:", error?.message ?? error);
  process.exit(1);
});
