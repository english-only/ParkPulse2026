import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import CouncilJobsPanel, { type ScopeRow } from "@/components/dashboard/CouncilJobsPanel";
import FilterGrid from "@/components/dashboard/FilterGrid";
import OraclePanel from "@/components/dashboard/OraclePanel";
import { countFor, formatCount, LAYERS, resolveLayerStatus } from "@/data/layers";
import { formatSnapshotDate, useDataSnapshot } from "@/data/snapshot";
import { fetchWithCache } from "@/utils/dataCache";
import {
  parseCouncilsParam,
  type CouncilGeometry,
  type CouncilIndexEntry,
} from "@/utils/councils";
import {
  EMPTY_FILTER_STATE,
  EMPTY_JOB_INDEX,
  type JobIndex,
  type ListingFilterState,
} from "@/utils/jobIndex";

const BASE = import.meta.env.BASE_URL;

/** Layer id → the explorer's `?filter=` key, where one exists. */
const EXPLORE_FILTER_FOR: Record<string, string> = {
  toilets: "toilets",
  fountains: "fountains",
  dogs: "dogs",
  transport: "transport",
  npws: "npws",
  trees: "trees",
};

/** "an off-leash area" / "a park area" — record nouns are data, not prose. */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}

/**
 * PRD Phase 6 — "Advanced Filtering, Oracle Search & Dashboard".
 *
 * Non-Explore surface: everything below is built from the vendored
 * `src/components/ui` library (PRD §3.1 keeps Explore on pp-* markup), while
 * the council scope keeps sharing `?councils=…&mode=…` with Explore (FR6.3),
 * so a selection made on the map composes with the filter grid and the search
 * here, and vice versa.
 *
 * Every data-dependent number is TBD-gated: with the job index empty (TBD-7)
 * the dashboard renders "—" + "pending data" and the oracle returns an honest
 * empty state — no mock data, no fabricated zeros (§3.7-1).
 */
export default function Dashboard() {
  const snapshot = useDataSnapshot();
  const counts = snapshot.status === "ready" ? snapshot.snapshot.counts : null;
  const observed = snapshot.status === "ready" ? formatSnapshotDate(snapshot.snapshot.dataLastUpdated) : null;
  const publishedLayers = LAYERS.filter(layer => resolveLayerStatus(layer, counts) === "published");

  const [entries, setEntries] = useState<CouncilIndexEntry[] | null>(null);
  const [indexFailed, setIndexFailed] = useState(false);
  const [jobIndex, setJobIndex] = useState<JobIndex>(EMPTY_JOB_INDEX);
  const [jobFailed, setJobFailed] = useState(false);
  const [suburbs, setSuburbs] = useState<string[]>([]);
  const [suburbsLoading, setSuburbsLoading] = useState(true);
  const [geometry, setGeometry] = useState<ReadonlyMap<string, CouncilGeometry>>(new Map());
  const [filters, setFilters] = useState<ListingFilterState>(EMPTY_FILTER_STATE);

  // Council scope shared with Explore through the URL (FR1.9 / FR6.3).
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const raw = new URLSearchParams(window.location.search).get("councils");
    return raw
      ? raw
          .split(",")
          .map(id => id.trim())
          .filter(Boolean)
      : [];
  });
  const [scopeReady, setScopeReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWithCache<{ councils: CouncilIndexEntry[] }>(
      `${BASE}data/boundaries/councils-index.json`,
      "pp_council_index",
    )
      .then(({ data }) => {
        if (!cancelled) {
          setEntries(data.councils);
          // Re-validate the URL ids against the loaded index; unknown ids are
          // dropped silently, mirroring FR1.9.
          const params = new URLSearchParams(window.location.search);
          const { ids } = parseCouncilsParam(
            params.get("councils"),
            params.get("mode"),
            new Set(data.councils.map(c => c.lga_id)),
          );
          setSelectedIds(ids);
          setScopeReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setIndexFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchWithCache<JobIndex>(`${BASE}data/oracle/index.json`, "pp_job_index")
      .then(({ data }) => {
        if (!cancelled) setJobIndex(data?.listings ? data : EMPTY_JOB_INDEX);
      })
      .catch(() => {
        // Missing index is the expected TBD-7 state — degrade to empty.
        if (!cancelled) setJobFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchWithCache<Record<string, { suburb?: string }>>(`${BASE}data/parks-suburbs.json`, "pp_parks_suburbs")
      .then(({ data }) => {
        if (cancelled) return;
        const unique = [...new Set(Object.values(data).map(v => v.suburb).filter((s): s is string => Boolean(s)))];
        unique.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
        setSuburbs(unique);
        setSuburbsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setSuburbsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEntries = useMemo(
    () => (entries ?? []).filter(entry => selectedIds.includes(entry.lga_id)),
    [entries, selectedIds],
  );

  // Boundaries are only fetched when there are listings to pip against — the
  // production (empty) index therefore adds no council geometry payload.
  useEffect(() => {
    if (jobIndex.listings.length === 0 || selectedEntries.length === 0) {
      setGeometry(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const next = new Map<string, CouncilGeometry>();
      for (const entry of selectedEntries) {
        try {
          const { data } = await fetchWithCache<CouncilGeometry>(
            `${BASE}data/${entry.geometry_file}`,
            `pp_council_${entry.lga_id}`,
          );
          next.set(entry.lga_id, data);
        } catch {
          // Boundary unavailable → listings simply count as out of scope.
        }
      }
      if (!cancelled) setGeometry(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobIndex, selectedEntries]);

  const scopeRows: ScopeRow[] =
    selectedEntries.length > 0
      ? selectedEntries.map(entry => ({
          key: entry.lga_id,
          label: entry.display_name,
          lgaId: entry.lga_id,
        }))
      : [{ key: "network", label: "All councils (network)", lgaId: null }];

  const councilNames = selectedEntries.map(entry => entry.display_name);

  // URL write-back — the same replaceState pattern Explore uses (FR1.9), so
  // a chip removed here also updates the shared deep link.
  useEffect(() => {
    if (!scopeReady) return;
    const params = new URLSearchParams(window.location.search);
    if (selectedIds.length === 0) {
      params.delete("councils");
      params.delete("mode");
    } else {
      params.set("councils", selectedIds.join(","));
      params.delete("mode");
    }
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [selectedIds, scopeReady]);

  const removeCouncil = (lgaId: string) => {
    setSelectedIds(prev => prev.filter(id => id !== lgaId));
  };

  const suburbNote =
    suburbs.length === 0
      ? "Suburb vocabulary loads from local data."
      : suburbs.length >= 50
        ? `${suburbs.length} suburbs, alphabetically sorted, from local data (no network).`
        : `${suburbs.length} suburbs from local data — a full gazetteer needs a source (TBD-13).`;

  return (
    <div className="fa-shell">
      <Navbar />
      <main id="main-content" className="fa-main">
        <div className="fa-wrap">
          <header className="fa-page-head">
            <h1 className="fa-display">Council insights</h1>
            <p className="fa-lede">
              What this build measures, where each layer covers and how current it is. The council
              scope is shared with the map: it reads and writes the same <code className="fa-code">?councils=</code>{" "}
              deep link.
            </p>
            <p className="fa-meta">
              Counts are dataset records with their own coverage and freshness. They are not unique
              places and not a measure of whether a facility is open today.
            </p>
          </header>

          {/* INS-001/002: answer "what is in this dataset, where, and how current?"
              before any gated prototype is shown. */}
          <section aria-labelledby="pp-coverage-heading" className="fa-section fa-section--tight">
            <div className="fa-snapshot-head">
              <div className="fa-section-head" style={{ marginBottom: 0 }}>
                <h2 className="fa-h2" id="pp-coverage-heading">
                  What this build measures
                </h2>
                <p className="fa-sub">
                  One row per published layer. “—” means a count or date was not generated, not
                  that the layer is empty.
                </p>
              </div>
              <p className="fa-meta fa-numeric">
                {observed ? `Source observation date: ${observed}` : "Source dates differ by layer"}
              </p>
            </div>

            {snapshot.status === "error" && (
              <div role="alert" className="fa-state">
                <strong>The stats snapshot did not load, so no count is shown.</strong>
                Reload to try again — the page will not guess a number.
              </div>
            )}

            <div className="fa-stats">
              {publishedLayers.map((layer) => {
                const count = counts ? countFor(layer, counts) : null;
                return (
                  <div key={layer.id} className="fa-stat">
                    <span className="fa-stat-value">{counts ? formatCount(count) : "…"}</span>
                    <span className="fa-stat-label">{layer.label}</span>
                    <span className="fa-stat-source">
                      {layer.source.publisher} · {layer.coverage}{" "}
                      <Link
                        href={
                          EXPLORE_FILTER_FOR[layer.id]
                            ? `/explore?filter=${EXPLORE_FILTER_FOR[layer.id]}`
                            : "/explore"
                        }
                        className="fa-link"
                      >
                        Open in Explore
                      </Link>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="fa-table-wrap" style={{ marginTop: "1.5rem" }}>
              <table className="fa-table" aria-label="Layer coverage and record counts">
                <caption>
                  Published layers in this build. One row is one record of the kind named.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Layer</th>
                    <th scope="col">Records</th>
                    <th scope="col">Publisher</th>
                    <th scope="col">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {publishedLayers.map((layer) => (
                    <tr key={layer.id}>
                      <th scope="row">
                        {layer.label}
                        <span className="fa-meta">
                          One row is {article(layer.recordNoun)} {layer.recordNoun}.
                        </span>
                      </th>
                      <td className="fa-numeric">{counts ? formatCount(countFor(layer, counts)) : "…"}</td>
                      <td>{layer.source.publisher}</td>
                      <td>{layer.coverage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {snapshot.status === "ready" && snapshot.snapshot.parkTypes.length > 0 && (
            <section aria-labelledby="pp-types-heading" className="fa-section fa-section--tight">
              <div className="fa-section-head">
                <h2 className="fa-h2" id="pp-types-heading">
                  City of Sydney park records by type
                </h2>
                <p className="fa-sub">
                  These categories refine the same{" "}
                  {formatCount(counts?.["parks.total"] ?? null)} park polygons; they are not
                  separate counts to add.
                </p>
              </div>
              <ul className="fa-bars">
                {(() => {
                  const total = snapshot.snapshot.parkTypes.reduce((sum, type) => sum + type.count, 0);
                  return snapshot.snapshot.parkTypes.map((type) => (
                    <li key={type.label} className="fa-bar-row">
                      <span className="fa-bar-label">{type.label}</span>
                      <span className="fa-bar-track" aria-hidden="true">
                        <span
                          className="fa-bar-fill"
                          style={{ width: `${total > 0 ? (type.count / total) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="fa-bar-value fa-numeric">{type.count.toLocaleString()}</span>
                    </li>
                  ));
                })()}
              </ul>
            </section>
          )}

          <section aria-labelledby="pp-prototype-heading" className="fa-section fa-section--tight">
            <div className="fa-callout">
              <h2 id="pp-prototype-heading" className="fa-h2">
                Employment prototype — no licensed dataset
              </h2>
              <p>
                The filter grid, council statistics and Oracle search below are an interface
                prototype retained for review. No job-listing dataset exists (TBD-7), so every
                dependent figure renders “—”, the sector chart is hidden and search returns an
                honest empty result. Campus coordinates are gated on TBD-8.
              </p>
              {jobFailed && (
                <p role="status" className="fa-meta">
                  Job index unavailable — falling back to the empty index.
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="pp-filters-heading" className="fa-section fa-section--tight">
            <div className="fa-section-head">
              <h2 className="fa-h2" id="pp-filters-heading">
                Filters
              </h2>
              <p className="fa-sub">
                Each control narrows the same listing set. Active constraints appear as chips you
                can remove.
              </p>
            </div>
            <FilterGrid
              filters={filters}
              onChange={setFilters}
              suburbs={suburbs}
              suburbsLoading={suburbsLoading}
              councils={selectedEntries.map((e) => ({ lga_id: e.lga_id, display_name: e.display_name }))}
              onRemoveCouncil={removeCouncil}
              suburbNote={suburbNote}
            />
          </section>

          <section aria-labelledby="pp-stats-heading" className="fa-section fa-section--tight">
            <div className="fa-section-head">
              <h2 className="fa-h2" id="pp-stats-heading">
                Council employment statistics
              </h2>
              <p className="fa-sub">
                Gated on a licensed listing dataset. Every value is “—” until one exists.
              </p>
            </div>
            <CouncilJobsPanel
              rows={scopeRows}
              jobIndex={jobIndex}
              geometry={geometry}
              loading={!indexFailed && entries === null}
              failed={indexFailed}
            />
          </section>

          <section aria-labelledby="pp-search-heading" className="fa-section fa-section--tight">
            <div className="fa-section-head">
              <h2 className="fa-h2" id="pp-search-heading">
                Oracle search
              </h2>
              <p className="fa-sub">
                Boolean search over council-scoped listings. No listings are served in this build,
                so every query returns an empty, labelled result.
              </p>
            </div>
            <OraclePanel index={jobIndex} filters={filters} councilNames={councilNames} />
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
