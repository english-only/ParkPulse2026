/**
 * Browser-side twin of `scripts/lib/shard-encode.mjs`.
 *
 * The sharding scripts own the wire format; this module decodes it in the
 * app so there is exactly one definition of each column name per side, and
 * `treeShardFormat.test.ts` round-trips the two against each other to keep
 * them honest. If a column is added to the encoder it must be added here in
 * the same commit.
 */

export interface DictColumn {
  table: string[];
  idx: number[];
}

export interface TreeShardPayload {
  n: number;
  lng: number[];
  lat: number[];
  assetId: string[];
  dbh: (number | null)[];
  height: (number | null)[];
  common: DictColumn;
  species: DictColumn;
  treeType: DictColumn;
  treeStatus: DictColumn;
  age: DictColumn;
}

export interface ShardRecord {
  lat: number;
  lng: number;
  assetId: string;
  commonName: string;
  speciesName: string;
  treeType: string;
  treeStatus: string;
  age: string;
  dbhCm: number | null;
  height: number | null;
}

/** Decode a v1 shard payload into per-tree records. */
export function decodeShard(payload: TreeShardPayload): ShardRecord[] {
  const out: ShardRecord[] = new Array(payload.n);
  for (let i = 0; i < payload.n; i++) {
    out[i] = {
      lat: payload.lat[i],
      lng: payload.lng[i],
      assetId: payload.assetId[i],
      commonName: payload.common.table[payload.common.idx[i]] ?? "",
      speciesName: payload.species.table[payload.species.idx[i]] ?? "",
      treeType: payload.treeType.table[payload.treeType.idx[i]] ?? "",
      treeStatus: payload.treeStatus.table[payload.treeStatus.idx[i]] ?? "",
      age: payload.age.table[payload.age.idx[i]] ?? "",
      dbhCm: payload.dbh[i] ?? null,
      height: payload.height[i] ?? null,
    };
  }
  return out;
}

export interface ShardManifest {
  version: number;
  total: number;
  grid: {
    size: number;
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  };
  cells: { c: string; n: number; b: number }[];
}
