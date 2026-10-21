import { useMemo, useState } from "react";
import {
  computeSelectionStats,
  type CouncilIndexEntry,
  type SelectionPark,
  type SelectionStats,
} from "../utils/councils";

/**
 * Per-selection statistics for FR1.8.
 *
 * With no selection the panel shows network totals; with a selection it shows
 * the summed area, coverage against the network total, and the parks /
 * playgrounds / park area that survived the point-in-polygon scoping of
 * FR1.6, and — FR4.5 — the transit stops inside the selection, computed from
 * the converted stops.geojson. While stop data has not been fetched yet the
 * transit row renders "—" with a tooltip rather than a fabricated zero.
 *
 * Tree canopy is deliberately not a number here. The source is licensed
 * no-derivatives and the two project documents disagree on the mean, so the
 * row states that it is not published and links to the atlas. The layer
 * registry has carried it as `unavailable` all along; this panel was the one
 * surface still rendering a percentage, and it no longer does.
 */
export interface CouncilStatsProps {
  selected: readonly CouncilIndexEntry[];
  parksInSelection: readonly SelectionPark[];
  /** Stops inside the selection (FR4.5); null until stops.geojson is loaded. */
  transitStops: number | null;
  /** True while stops.geojson is being fetched. */
  transitLoading: boolean;
  /** Total across every council in the index; 0 while loading. */
  totalAreaKm2: number;
  /** How many councils exist in the index (network-wide row). */
  councilTotal: number;
  /** Network-wide park counts, used when nothing is selected. */
  networkParks: number;
  networkPlaygrounds: number;
  networkParksAreaHa: number;
  /** Live layer badge counts (trees, toilets, …). */
  layerCounts: Record<string, number>;
  loading: boolean;
  failed: boolean;
}

function Skeleton() {
  return <span className="pp-stat-skeleton" aria-hidden="true" />;
}

export default function CouncilStats({
  selected,
  parksInSelection,
  transitStops,
  transitLoading,
  totalAreaKm2,
  councilTotal,
  networkParks,
  networkPlaygrounds,
  networkParksAreaHa,
  layerCounts,
  loading,
  failed,
}: CouncilStatsProps) {
  const [open, setOpen] = useState(true);

  const stats: SelectionStats = useMemo(
    () =>
      computeSelectionStats({
        selected,
        parksInSelection,
        totalAreaKm2,
      }),
    [selected, parksInSelection, totalAreaKm2],
  );

  const scoped = selected.length > 0;
  const value = (node: React.ReactNode, title?: string) =>
    loading ? (
      <Skeleton />
    ) : failed ? (
      <span title={title ?? "Council index unavailable"} className="pp-stat-pending">
        —
      </span>
    ) : (
      node
    );

  const rows: Array<{ key: string; label: string; node: React.ReactNode; title?: string }> = [
    {
      key: "councils",
      label: scoped ? "Councils selected" : "Councils",
      node: <>{scoped ? stats.councilCount : `${councilTotal} (all)`}</>,
    },
    {
      key: "area",
      label: "Area",
      node: <>{scoped ? stats.areaKm2.toLocaleString() : totalAreaKm2.toLocaleString()} km²</>,
    },
    {
      key: "coverage",
      label: "Coverage of network",
      node: (
        <>
          {scoped
            ? stats.coveragePct === null
              ? "—"
              : `${stats.coveragePct}%`
            : "100%"}
        </>
      ),
      title: stats.coveragePct === null ? "Network area unknown" : undefined,
    },
    {
      key: "parks",
      label: "Parks in selection",
      node: <>{(scoped ? stats.parks : networkParks).toLocaleString()}</>,
    },
    {
      key: "playgrounds",
      label: "Playgrounds",
      node: <>{(scoped ? stats.playgrounds : networkPlaygrounds).toLocaleString()}</>,
    },
    {
      key: "parksArea",
      label: "Parks area",
      node: <>{(scoped ? stats.parksAreaHa : networkParksAreaHa).toLocaleString()} ha</>,
    },
    {
      key: "canopy",
      label: "Tree canopy",
      node: <span className="pp-stat-pending">Not published</span>,
      title:
        "No canopy figure is shown while the licence and the source formula are unresolved. See the data atlas.",
    },
    {
      key: "transit",
      label: scoped ? "Transit stops in selection" : "Transit stops",
      node:
        transitStops !== null ? (
          <>{transitStops.toLocaleString()}</>
        ) : transitLoading ? (
          <Skeleton />
        ) : (
          <span
            title="Stop data loads when a council is selected or the transport layer is on"
            className="pp-stat-pending"
          >
            —
          </span>
        ),
      title: transitStops === null && !transitLoading ? "Stop data not loaded yet" : undefined,
    },
  ];

  const layers = Object.entries(layerCounts).filter(([, n]) => typeof n === "number" && n >= 0);

  return (
    <section className={`pp-council-stats${open ? " open" : ""}`} aria-label="Council statistics">
      <button
        type="button"
        className="pp-council-stats-toggle"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span>Stats{scoped ? ` · ${stats.councilCount} selected` : ""}</span>
        <svg
          className={`pp-council-chevron${open ? " rotated" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="pp-council-stats-body">
          <dl className="pp-council-stats-grid">
            {rows.map(row => (
              <div className="pp-council-stat" key={row.key}>
                <dt>{row.label}</dt>
                <dd title={row.title}>{value(row.node, row.title)}</dd>
              </div>
            ))}
          </dl>
          {layers.length > 0 && (
            <div className="pp-council-layercounts" aria-label="Live layer counts">
              {layers.map(([key, n]) => (
                <span className="pp-council-layercount" key={key}>
                  {key}
                  <strong>{n.toLocaleString()}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
