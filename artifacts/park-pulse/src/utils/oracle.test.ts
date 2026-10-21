import { describe, expect, it } from "vitest";
import fixture from "../test/fixtures/job-index.fixture.json";
import { EMPTY_FILTER_STATE, type JobIndex, type JobListing } from "./jobIndex";
import { matchesQuery, parseQuery, searchJobs } from "./oracle";

const index = fixture as unknown as JobIndex;

function ids(results: JobListing[]): string[] {
  return results.map(r => r.id);
}

describe("parseQuery — boolean grammar (FR6.7)", () => {
  it("parses AND / OR / NOT with NOT > AND > OR precedence", () => {
    expect(parseQuery("java AND react")).toEqual({
      kind: "and",
      left: { kind: "term", value: "java" },
      right: { kind: "term", value: "react" },
    });
    // OR binds loosest: java OR (react AND ui)
    expect(parseQuery("java OR react AND ui")).toEqual({
      kind: "or",
      left: { kind: "term", value: "java" },
      right: {
        kind: "and",
        left: { kind: "term", value: "react" },
        right: { kind: "term", value: "ui" },
      },
    });
    expect(parseQuery("NOT java OR react")).toEqual({
      kind: "or",
      left: { kind: "not", operand: { kind: "term", value: "java" } },
      right: { kind: "term", value: "react" },
    });
  });

  it("honours parentheses", () => {
    expect(parseQuery("java AND (react OR ui)")).toEqual({
      kind: "and",
      left: { kind: "term", value: "java" },
      right: {
        kind: "or",
        left: { kind: "term", value: "react" },
        right: { kind: "term", value: "ui" },
      },
    });
  });

  it("keeps quoted phrases as one node and treats lowercase keywords as terms", () => {
    expect(parseQuery('"data engineer" AND gov')).toEqual({
      kind: "and",
      left: { kind: "phrase", value: "data engineer" },
      right: { kind: "term", value: "gov" },
    });
    // "and" in lowercase is a literal word, not an operator; adjacent terms
    // combine left-associatively.
    const ast = parseQuery("java and react");
    expect(ast).toEqual({
      kind: "and",
      left: {
        kind: "and",
        left: { kind: "term", value: "java" },
        right: { kind: "term", value: "and" },
      },
      right: { kind: "term", value: "react" },
    });
  });

  it("applies implicit AND between adjacent terms", () => {
    expect(parseQuery("nurse teacher")).toEqual({
      kind: "and",
      left: { kind: "term", value: "nurse" },
      right: { kind: "term", value: "teacher" },
    });
  });

  it("never throws: dangling operators, unbalanced parens and blanks degrade safely", () => {
    expect(parseQuery("java AND")).toEqual({ kind: "term", value: "java" });
    expect(parseQuery("AND java")).toEqual({ kind: "term", value: "java" });
    expect(parseQuery("((java OR")).toEqual({ kind: "term", value: "java" });
    expect(parseQuery(")")).toBeNull();
    expect(parseQuery("")).toBeNull();
    expect(parseQuery("   ")).toBeNull();
    expect(() => parseQuery('"unterminated phrase')).not.toThrow();
  });
});

describe("matchesQuery — evaluation semantics", () => {
  const node = parseQuery("java AND NOT react");
  const hay = "frontend java developer";
  const miss = "react developer";

  it("matches substrings case-insensitively and honours NOT", () => {
    expect(matchesQuery(node, hay)).toBe(true);
    expect(matchesQuery(node, miss)).toBe(false);
    expect(matchesQuery(parseQuery("JAVA"), "senior java engineer")).toBe(true);
    expect(matchesQuery(parseQuery('"data engineer"'), "senior data engineer iii")).toBe(true);
    expect(matchesQuery(parseQuery('"data engineer"'), "data platform engineer")).toBe(false);
  });

  it("treats a null AST as no constraint", () => {
    expect(matchesQuery(null, "anything at all")).toBe(true);
  });
});

describe("searchJobs — query + filters + council composition (FR6.3/6.7)", () => {
  it("returns the exact rows for each boolean query", () => {
    expect(ids(searchJobs(index, { query: "policy AND officer", filters: EMPTY_FILTER_STATE }))).toEqual(["j2"]);
    expect(ids(searchJobs(index, { query: "NOT glebe", filters: EMPTY_FILTER_STATE }))).toEqual([
      "j3",
      "j4",
      "j5",
      "j7",
      "j8",
      "j9",
      "j10",
    ]);
    expect(ids(searchJobs(index, { query: '"data engineer"', filters: EMPTY_FILTER_STATE }))).toEqual(["j9"]);
    expect(ids(searchJobs(index, { query: "physiotherapist OR teacher", filters: EMPTY_FILTER_STATE }))).toEqual([
      "j6",
      "j10",
    ]);
    // Every fixture row is in the City of Sydney, so the council term matches
    // all of them; AND NOT health drops the health company/sector/industry.
    expect(ids(searchJobs(index, { query: "sydney AND NOT health", filters: EMPTY_FILTER_STATE }))).toEqual([
      "j3",
      "j4",
      "j5",
      "j6",
      "j7",
      "j8",
      "j9",
    ]);
  });

  it("composes with council selection (FR6.3) and the filter grid", () => {
    const scoped = searchJobs(index, {
      query: "",
      filters: EMPTY_FILTER_STATE,
      councilNames: ["Blacktown City Council"],
    });
    expect(scoped).toEqual([]);
    const glebeGov = searchJobs(index, {
      query: "",
      filters: { ...EMPTY_FILTER_STATE, governmentOnly: true, suburbs: ["glebe"] },
      councilNames: ["City of Sydney"],
    });
    expect(ids(glebeGov)).toEqual(["j1", "j2"]);
  });

  it("is regression-safe against the empty production index (TBD-7)", () => {
    const empty: JobIndex = { version: 1, generated_at: null, listings: [] };
    expect(searchJobs(empty, { query: "anything", filters: EMPTY_FILTER_STATE })).toEqual([]);
  });

  it("keeps result rows shaped for the FR6.7 columns", () => {
    const [row] = searchJobs(index, { query: "physiotherapist", filters: EMPTY_FILTER_STATE });
    expect(Object.keys(row)).toEqual(
      expect.arrayContaining(["company", "title", "suburb", "council", "sector", "salary_band", "campus_km"]),
    );
    expect(row.campus_km).toBeTypeOf("number");
  });
});
