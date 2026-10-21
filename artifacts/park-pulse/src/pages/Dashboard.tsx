import { useEffect, useMemo, useState } from "react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import CouncilJobsPanel, { type ScopeRow } from "@/components/dashboard/CouncilJobsPanel";
import FilterGrid from "@/components/dashboard/FilterGrid";
import OraclePanel from "@/components/dashboard/OraclePanel";
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
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Council insights</h1>
          <p className="text-sm text-muted-foreground">
            Filter grid, per-council employment statistics and boolean search over listings. The council
            scope is shared with the map: it reads and writes the same <code>?councils=</code> deep link.
          </p>
          <p className="text-xs text-muted-foreground">
            Job-listing data is gated on TBD-7 — every dependent figure renders “—” with a pending tooltip
            until the dataset lands. Campus coordinates are gated on TBD-8.
          </p>
          {jobFailed && (
            <p className="text-xs text-destructive" role="status">
              Job index unavailable — falling back to the empty index.
            </p>
          )}
        </header>

        <section aria-labelledby="pp-filters-heading" className="space-y-4">
          <h2 id="pp-filters-heading" className="text-lg font-semibold text-foreground">
            Filters
          </h2>
          <FilterGrid
            filters={filters}
            onChange={setFilters}
            suburbs={suburbs}
            suburbsLoading={suburbsLoading}
            councils={selectedEntries.map(e => ({ lga_id: e.lga_id, display_name: e.display_name }))}
            onRemoveCouncil={removeCouncil}
            suburbNote={suburbNote}
          />
        </section>

        <section aria-labelledby="pp-stats-heading" className="space-y-4">
          <h2 id="pp-stats-heading" className="text-lg font-semibold text-foreground">
            Council dashboard
          </h2>
          <CouncilJobsPanel
            rows={scopeRows}
            jobIndex={jobIndex}
            geometry={geometry}
            loading={!indexFailed && entries === null}
            failed={indexFailed}
          />
        </section>

        <section aria-labelledby="pp-search-heading" className="space-y-4">
          <h2 id="pp-search-heading" className="text-lg font-semibold text-foreground">
            Oracle search
          </h2>
          <OraclePanel index={jobIndex} filters={filters} councilNames={councilNames} />
        </section>
      </main>
      <Footer />
    </>
  );
}
