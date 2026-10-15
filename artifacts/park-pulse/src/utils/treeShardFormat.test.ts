import { describe, expect, it } from "vitest";
import { decode as nodeDecode, encode as nodeEncode } from "../../scripts/lib/shard-encode.mjs";
import { decodeShard } from "./treeShardFormat";
import { resolveShardRequests, type CouncilTreeRegistry, type ShardManifest } from "./treeData";

/**
 * Phase 3 tree-sharding tests (FR3.1–3.7).
 *
 * The node encoder (`scripts/lib/shard-encode.mjs`) and the browser decoder
 * (`src/utils/treeShardFormat.ts`) are two halves of one format; the
 * round-trip test below fails if either side drifts. The resolver tests
 * prove multi/single/no-selection shard choice with fixtures — no network.
 */

const records = [
  {
    lng: 150.9,
    lat: -33.81,
    p: {
      asset_id: "T1",
      CommonName: "Sydney Red Gum",
      SpeciesName: "Angophora costata",
      TreeType: "Open space",
      Tree_Status: "Healthy",
      Tree_Age: "Mature",
      DBH_in_cm: 42.5,
      TreeHeight: 12,
    },
  },
  {
    lng: 150.91,
    lat: -33.82,
    p: {
      asset_id: "T2",
      CommonName: "Sydney Red Gum",
      SpeciesName: "Angophora costata",
      TreeType: "Open space",
      Tree_Status: "Healthy",
      DBH_in_cm: 10,
    },
  },
  {
    lng: 150.92,
    lat: -33.83,
    p: { asset_id: "T3" }, // sparse record: every optional attribute missing
  },
];

describe("tree shard codec", () => {
  it("round-trips through the node encoder and browser decoder", () => {
    const payload = nodeEncode(records);
    const viaNode = nodeDecode(payload);
    const viaBrowser = decodeShard(payload);

    expect(viaBrowser).toEqual(viaNode);
    expect(viaBrowser).toHaveLength(3);
    expect(viaBrowser[0]).toEqual({
      lng: 150.9,
      lat: -33.81,
      assetId: "T1",
      commonName: "Sydney Red Gum",
      speciesName: "Angophora costata",
      treeType: "Open space",
      treeStatus: "Healthy",
      age: "Mature",
      dbhCm: 42.5,
      height: 12,
    });
    // Missing attributes stay null / empty — never fabricated.
    expect(viaBrowser[2].dbhCm).toBeNull();
    expect(viaBrowser[2].height).toBeNull();
    expect(viaBrowser[2].commonName).toBe("");
    expect(viaBrowser[2].treeStatus).toBe("");
  });

  it("dictionary-encodes repeated strings", () => {
    const payload = nodeEncode(records);
    // The sparse third record contributes an empty-string entry, which is a
    // distinct dictionary value, not a missing one.
    expect(payload.species.table).toEqual(["Angophora costata", ""]);
    expect(payload.species.idx).toEqual([0, 0, 1]);
    expect(payload.n).toBe(3);
  });

  it("is byte-deterministic: same input, identical serialisation", () => {
    const a = JSON.stringify(nodeEncode(records));
    const b = JSON.stringify(nodeEncode(records.map(r => ({ ...r, p: { ...r.p } }))));
    expect(a).toBe(b);
  });

  it("maps the normalised council schema through a field map", () => {
    const councilRecords = [
      {
        lng: 151.1,
        lat: -33.8,
        p: {
          id: 17,
          tree: {
            asset_id: "P-17",
            common_name: "Blanket Leaf",
            species: "Doryphora sassafras",
            tree_type: "Open space",
            status: "Healthy",
            age: null,
            dbh_cm: 8.5,
            height_m: null,
          },
        },
      },
    ];
    const payload = nodeEncode(councilRecords, {
      assetId: (p: any) => p.tree?.asset_id ?? p.id ?? "",
      common: (p: any) => p.tree?.common_name ?? "",
      species: (p: any) => p.tree?.species ?? "",
      treeType: (p: any) => p.tree?.tree_type ?? "",
      treeStatus: (p: any) => p.tree?.status ?? "",
      age: (p: any) => p.tree?.age ?? "",
      dbh: (p: any) => p.tree?.dbh_cm ?? null,
      height: (p: any) => p.tree?.height_m ?? null,
    });
    const [decoded] = decodeShard(payload);
    expect(decoded.commonName).toBe("Blanket Leaf");
    expect(decoded.speciesName).toBe("Doryphora sassafras");
    expect(decoded.dbhCm).toBe(8.5);
    expect(decoded.height).toBeNull();
    expect(decoded.age).toBe("");
  });
});

// ── Council shard resolution (FR3.3–3.4, FR3.7) ─────────────────────────────

const registry: CouncilTreeRegistry = {
  version: 1,
  councils: [
    { lga_id: "city-of-parramatta-council", display_name: "City of Parramatta Council", total: 66345, shards: 15 },
    { lga_id: "liverpool-city-council", display_name: "Liverpool City Council", total: 0, shards: 0 },
  ],
};

function manifest(cells: string[]): ShardManifest {
  return {
    version: 1,
    total: 100,
    grid: { size: 2, minLng: 150, maxLng: 152, minLat: -34, maxLat: -33 },
    cells: cells.map(c => ({ c, n: 10, b: 1000 })),
  };
}

const viewport = { south: -33.5, west: 150.5, north: -33.4, east: 151.5 };

describe("resolveShardRequests", () => {
  it("returns nothing without a registry or without a selection", () => {
    const manifests = new Map([["city-of-parramatta-council", manifest(["0_0", "0_1", "1_0", "1_1"])]]);
    expect(
      resolveShardRequests({ registry: null, manifests, bounds: viewport, councilIds: ["city-of-parramatta-council"] }),
    ).toEqual([]);
    expect(
      resolveShardRequests({ registry, manifests, bounds: viewport, councilIds: [] }),
    ).toEqual([]);
  });

  it("unions shard sets across a multi-council selection", () => {
    const manifests = new Map<string, ShardManifest>([
      ["city-of-parramatta-council", manifest(["0_0", "0_1", "1_0", "1_1"])],
      ["liverpool-city-council", manifest(["0_0", "1_1"])],
    ]);
    const requests = resolveShardRequests({
      registry,
      manifests,
      bounds: viewport,
      councilIds: ["city-of-parramatta-council", "liverpool-city-council"],
    });
    const pairs = requests.map(r => `${r.lgaId}:${r.cell}`).sort();
    expect(pairs).toEqual([
      "city-of-parramatta-council:0_0",
      "city-of-parramatta-council:0_1",
      "city-of-parramatta-council:1_0",
      "city-of-parramatta-council:1_1",
      "liverpool-city-council:0_0",
      "liverpool-city-council:1_1",
    ]);
    // Requests carry the display name for the FR3.5 hover label.
    expect(requests[0].displayName).toBe("City of Parramatta Council");
  });

  it("fetches a single council's shards in single mode", () => {
    const manifests = new Map<string, ShardManifest>([
      ["city-of-parramatta-council", manifest(["0_0", "1_1"])],
      ["liverpool-city-council", manifest(["0_0"])],
    ]);
    const requests = resolveShardRequests({
      registry,
      manifests,
      bounds: viewport,
      councilIds: ["city-of-parramatta-council"],
    });
    expect(requests.every(r => r.lgaId === "city-of-parramatta-council")).toBe(true);
    expect(requests).toHaveLength(2);
  });

  it("skips councils with no sharded tree data instead of failing", () => {
    const manifests = new Map<string, ShardManifest>([
      ["city-of-parramatta-council", manifest(["0_0"])],
      // Liverpool is in the registry but has no manifest loaded (no data).
    ]);
    const requests = resolveShardRequests({
      registry,
      manifests,
      bounds: viewport,
      councilIds: ["city-of-parramatta-council", "liverpool-city-council", "blacktown-city-council"],
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].lgaId).toBe("city-of-parramatta-council");
  });

  it("ignores manifest cells outside the viewport", () => {
    // Viewport pinned to the grid's south-west corner on a 4×4 grid; with
    // the resolver's one-cell pad it can only reach rows 2–3 / cols 0–1,
    // so cells 0_0 and 3_3 must not be requested.
    const corner = { south: -33.99, west: 150.01, north: -33.98, east: 150.02 };
    const wide: ShardManifest = {
      version: 1,
      total: 100,
      grid: { size: 4, minLng: 150, maxLng: 152, minLat: -34, maxLat: -33 },
      cells: [
        { c: "0_0", n: 10, b: 1000 },
        { c: "3_3", n: 10, b: 1000 },
      ],
    };
    const manifests = new Map<string, ShardManifest>([
      ["city-of-parramatta-council", wide],
    ]);
    const requests = resolveShardRequests({
      registry,
      manifests,
      bounds: corner,
      councilIds: ["city-of-parramatta-council"],
    });
    expect(requests).toEqual([]);
  });
});
