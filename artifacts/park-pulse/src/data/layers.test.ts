import { describe, expect, it } from "vitest";
import { getLayer, resolveLayerStatus } from "./layers";

/**
 * `resolveLayerStatus` is what stops a checkout without generated artifacts
 * from advertising a layer it cannot serve (F-01/F-02 class of bug). It must
 * never turn a deliberately gated layer into a published one.
 */

describe("resolveLayerStatus", () => {
  it("keeps the declared status while the snapshot is still loading", () => {
    const transport = getLayer("transport");
    expect(transport).toBeDefined();
    expect(resolveLayerStatus(transport!, null)).toBe(transport!.status);
  });

  it("marks a published layer unavailable when its generated count is absent", () => {
    const transport = getLayer("transport");
    expect(transport?.status).toBe("published");
    expect(transport?.countKey).toBe("transport.stops");

    expect(resolveLayerStatus(transport!, {})).toBe("unavailable");
    expect(resolveLayerStatus(transport!, { "transport.stops": 26198 })).toBe("published");
  });

  it("never promotes a gated or unavailable layer, even if a count exists", () => {
    const osm = getLayer("osm");
    const canopy = getLayer("canopy");
    expect(osm?.status).toBe("gated");
    expect(canopy?.status).toBe("unavailable");
    expect(resolveLayerStatus(osm!, { "blacktown.total": 1605 })).toBe("gated");
    expect(resolveLayerStatus(canopy!, { "canopy.percent": 21 })).toBe("unavailable");
  });

  it("accepts a zero count as a generated value rather than as missing", () => {
    const councils = getLayer("councils");
    expect(resolveLayerStatus(councils!, { "councils.total": 0 })).toBe("published");
  });
});
