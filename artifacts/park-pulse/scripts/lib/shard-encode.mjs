/**
 * Tree-shard payload codec shared by every tree-sharding script.
 *
 * The columnar, dictionary-encoded format lives here so `shard-trees.mjs`
 * (city baseline) and any council-specific sharder emit byte-identical
 * payloads for the same input. The browser-side twin is
 * `src/utils/treeShardFormat.ts`, which is kept in lock-step and round-trip
 * tested against this module by `src/utils/treeShardFormat.test.ts`.
 *
 * Payload shape (v1):
 *   { n, lng[], lat[], assetId[], dbh[], height[],
 *     common:{table,idx}, species:{…}, treeType:{…}, treeStatus:{…}, age:{…} }
 * `n` is the record count; the string columns are dictionary-encoded because
 * low-cardinality names dominate the raw geojson's per-feature key repetition.
 */

/** Coordinates are stored at 1e-6 (~0.1 m), enough for tree labelling. */
export const r6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Dictionary-encode a column so repeated strings cost one table entry. The
 * result is namespaced by `name` because several columns share one payload
 * and bare `table`/`idx` keys would overwrite each other.
 */
export function dict(name, values) {
  const table = [];
  const index = new Map();
  const idx = values.map((v) => {
    let i = index.get(v);
    if (i === undefined) {
      i = table.push(v) - 1;
      index.set(v, i);
    }
    return i;
  });
  return { [name]: { table, idx } };
}

/**
 * Encode a list of { lng, lat, p } records into the v1 payload.
 * `fieldMap` lets a caller with different source attribute names (e.g. the
 * normalised council schema) target the same columns without renaming data.
 */
export function encode(list, fieldMap) {
  const map = {
    assetId: (p) => p.asset_id ?? "",
    common: (p) => p.CommonName ?? "",
    species: (p) => p.SpeciesName ?? "",
    treeType: (p) => p.TreeType ?? "",
    treeStatus: (p) => p.Tree_Status ?? "",
    age: (p) => p.Tree_Age ?? "",
    dbh: (p) => (typeof p.DBH_in_cm === "number" ? p.DBH_in_cm : null),
    height: (p) => (typeof p.TreeHeight === "number" ? p.TreeHeight : null),
    ...fieldMap,
  };

  const n = list.length;
  const lng = new Array(n);
  const lat = new Array(n);
  const assetId = new Array(n);
  const common = new Array(n);
  const species = new Array(n);
  const treeType = new Array(n);
  const treeStatus = new Array(n);
  const age = new Array(n);
  const dbh = new Array(n);
  const height = new Array(n);

  for (let i = 0; i < n; i++) {
    const { lng: x, lat: y, p } = list[i];
    lng[i] = r6(x);
    lat[i] = r6(y);
    assetId[i] = String(map.assetId(p) ?? "");
    common[i] = String(map.common(p) ?? "");
    species[i] = String(map.species(p) ?? "");
    treeType[i] = String(map.treeType(p) ?? "");
    treeStatus[i] = String(map.treeStatus(p) ?? "");
    age[i] = String(map.age(p) ?? "");
    dbh[i] = map.dbh(p);
    height[i] = map.height(p);
  }

  return {
    n,
    lng,
    lat,
    assetId,
    dbh,
    height,
    species: dict("species", species).species,
    common: dict("common", common).common,
    treeType: dict("treeType", treeType).treeType,
    treeStatus: dict("treeStatus", treeStatus).treeStatus,
    age: dict("age", age).age,
  };
}

/**
 * Decode a v1 payload back to records. Mirrors `decode` in
 * `src/utils/treeShardFormat.ts`; both are exercised by the round-trip test.
 */
export function decode(payload) {
  const out = new Array(payload.n);
  for (let i = 0; i < payload.n; i++) {
    // Field names match `decodeShard` in src/utils/treeShardFormat.ts — the
    // two decoders must produce identical shapes or the round-trip test
    // cannot compare them.
    out[i] = {
      lng: payload.lng[i],
      lat: payload.lat[i],
      assetId: payload.assetId[i],
      dbhCm: payload.dbh[i] ?? null,
      height: payload.height[i] ?? null,
      commonName: payload.common.table[payload.common.idx[i]] ?? "",
      speciesName: payload.species.table[payload.species.idx[i]] ?? "",
      treeType: payload.treeType.table[payload.treeType.idx[i]] ?? "",
      treeStatus: payload.treeStatus.table[payload.treeStatus.idx[i]] ?? "",
      age: payload.age.table[payload.age.idx[i]] ?? "",
    };
  }
  return out;
}
