#!/usr/bin/env node
/**
 * scripts/fetch-council-opendatasoft.mjs
 *
 * Probe for Opendatasoft-hosted council open-data portals (Liverpool,
 * and any other council that adopts the platform). Catalogues are queried
 * for parks / trees / canopy keywords; the outcome — including a verified
 * "nothing published" — is written to a JSON report and mirrored into
 * `Data/council-manifest.json` by hand (the manifest is the single status
 * surface).
 *
 * Pure logic lives in `pickRelevantDatasets` so the fixture tests can cover
 * the matching rules with no network.
 *
 * Usage:
 *   node scripts/fetch-council-opendatasoft.mjs \
 *     --portal https://data.liverpool.nsw.gov.au \
 *     --lga-id liverpool-city-council \
 *     --out Data/council-downloads/liverpool/catalog-report.json
 *
 * Exit code 0 on a successful probe (even when the catalogue has no
 * relevant datasets — that is a finding, not a failure), 1 on transport or
 * schema errors.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(artifactDir, "..", "..");

export const KEYWORDS = ["park", "open space", "tree", "canopy", "urban forest", "reserve"];

/**
 * Keep catalogue hits whose TITLE names a parks/trees/canopy concept.
 *
 * Matching on titles rather than descriptions is deliberate: council
 * descriptions mention "parks" in passing ("smart parks", "car park",
 * "parklands" in an IoT register) and substring-matching the whole blurb
 * produced three false positives on Liverpool's catalogue. Descriptions are
 * still consulted for the tree/canopy terms, which are rare enough to be
 * meaningful.
 */
const TITLE_RE = /\b(parks?|open[ -]?spac\w*|trees?|canopy|urban forest|reserves?)\b/i;
const STRONG_DESC_RE = /\b(street trees?|tree inventory|tree canop\w*|urban forest)\b/i;

export function pickRelevantDatasets(results) {
  const keep = [];
  for (const r of results ?? []) {
    const title = r.metas?.default?.title ?? "";
    const description = r.metas?.default?.description ?? "";
    const strongDesc = STRONG_DESC_RE.test(description);
    if (!TITLE_RE.test(title) && !strongDesc) continue;

    const haystack = `${title} ${description}`.toLowerCase();
    // Parking/waste datasets match "park" as a substring; exclude the noise.
    const parkingOnly = /\b(car parks?|parking|carpark)s?\b/.test(title.toLowerCase()) &&
      !/\b(tree|canopy|open[ -]?spac|reserve)/.test(haystack);
    if (parkingOnly) continue;

    const matched = KEYWORDS.filter(k => haystack.includes(k));
    keep.push({
      dataset_id: r.dataset_id,
      title,
      matched_keywords: matched,
      license_id: r.metas?.default?.license_id ?? null,
    });
  }
  return keep;
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
  };
  return { portal: flag("portal"), lgaId: flag("lga-id"), out: flag("out") };
}

async function main() {
  const opts = parseArgs(process.argv);
  for (const key of ["portal", "lgaId", "out"]) {
    if (!opts[key]) {
      console.error(`❌ missing required --${key.replace(/[A-Z]/g, m => "-" + m.toLowerCase())}`);
      process.exitCode = 1;
      return;
    }
  }
  const base = opts.portal.replace(/\/$/, "");

  const res = await fetch(`${base}/api/explore/v2.1/catalog/datasets?limit=100`);
  if (!res.ok) {
    console.error(`❌ catalogue query failed: HTTP ${res.status}`);
    process.exitCode = 1;
    return;
  }
  const json = await res.json();
  if (!Array.isArray(json.results)) {
    console.error("❌ catalogue response has no results array");
    process.exitCode = 1;
    return;
  }

  const relevant = pickRelevantDatasets(json.results);
  const report = {
    portal: base,
    lga_id: opts.lgaId,
    probed_at: new Date().toISOString(),
    catalogue_size: json.total_count ?? json.results.length,
    relevant,
    finding:
      relevant.length === 0
        ? "no parks/trees/canopy datasets published on this portal"
        : `${relevant.length} candidate dataset(s) — manual review required before download`,
  };

  const dest = path.isAbsolute(opts.out) ? opts.out : path.join(repoRoot, opts.out);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, JSON.stringify(report, null, 2));
  console.log(
    `✅ ${opts.lgaId}: ${report.catalogue_size} datasets probed, ${relevant.length} relevant → ${path.relative(repoRoot, dest)}`,
  );
  console.log(`   finding: ${report.finding}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
