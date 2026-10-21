#!/usr/bin/env node
/**
 * build-contribution-index — a compact duplicate-check index.
 *
 * The importer compares submitted records with places already served, so a
 * contributor is warned before adding a second copy of a park. Loading every
 * served layer would be several megabytes, so this script reduces them to
 * name + category + point:
 *
 *   park              City of Sydney park polygons (representative point)
 *   dog-off-leash     off-leash areas
 *   drinking-fountain drinking fountains
 *   toilet            public toilets
 *
 * Trees are excluded on purpose: 49,000 rows would add ~2 MB to a check that
 * is about places people contribute, and a tree is unlikely to be duplicated
 * by name. The index is advisory — the reviewer makes the decision.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { representativePoint } from "../src/data/contribution/import.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public", "data");

async function readJson(relative) {
  const file = path.join(DATA, relative);
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, "utf8"));
}

function fromFeatures(collection, category, nameOf) {
  const places = [];
  for (const feature of collection?.features ?? []) {
    const point = representativePoint(feature.geometry);
    if (!point) continue;
    const name = nameOf(feature.properties ?? {});
    if (!name) continue;
    places.push({ name, category, lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)) });
  }
  return places;
}

async function main() {
  const [parks, dogs, fountains, toilets] = await Promise.all([
    readJson("Parks.geojson"),
    readJson("Dog_off-leash_parks.geojson"),
    readJson("drinking-fountains.geojson"),
    readJson("toilets-sydney.json"),
  ]);

  const places = [
    ...fromFeatures(parks, "park", (p) => p.Name),
    ...fromFeatures(dogs, "dog-off-leash", (p) => p.ParkName),
    ...fromFeatures(fountains, "drinking-fountain", (p) => p.site_name),
    ...(Array.isArray(toilets) ? toilets : [])
      .filter((row) => typeof row?.n === "string" && Number.isFinite(row.lat) && Number.isFinite(row.lng))
      .map((row) => ({
        name: row.n,
        category: "toilet",
        lat: Number(row.lat.toFixed(6)),
        lng: Number(row.lng.toFixed(6)),
      })),
  ];

  const output = {
    generatedAt: new Date().toISOString().slice(0, 10),
    note: "Advisory duplicate index. Names and points only; no contributor data.",
    count: places.length,
    places,
  };
  await writeFile(path.join(DATA, "contribution-index.json"), `${JSON.stringify(output)}\n`);
  console.log(`[build-contribution-index] ${places.length.toLocaleString()} places`);
}

main().catch((error) => {
  console.error("[build-contribution-index] failed:", error.message ?? error);
  process.exit(1);
});
