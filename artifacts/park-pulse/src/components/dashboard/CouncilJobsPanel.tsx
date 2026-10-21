import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CAMPUS_NAMES,
  computeCouncilDashboard,
  computeSectorShares,
  DASHBOARD_FIELDS,
  type CouncilDashboard,
  type DashboardField,
  type JobIndex,
  type JobListing,
} from "@/utils/jobIndex";
import { pointInCouncil, type CouncilGeometry } from "@/utils/councils";

/**
 * FR6.4/6.5/6.6 — the council dashboard.
 *
 * Every FR6.4 cell is `{ value: number | null }`; a null renders "—" with a
 * "pending data" tooltip, never a 0 (§3.7-1). While TBD-7 holds the index
 * empty, all five columns are null for every row, which is exactly what the
 * Playwright assertion in `dashboard.spec.ts` pins: no digit may appear in a
 * gated column.
 *
 * FR6.5's chart is hidden entirely while `job_openings` is null (no scope →
 * no sector shares), and FR6.6's affinity list shows the campuses named in
 * the PRD with null-gated values, because campus coordinates are TBD-8.
 */
export interface ScopeRow {
  key: string;
  label: string;
  lgaId: string | null;
}

export interface CouncilJobsPanelProps {
  rows: ScopeRow[];
  jobIndex: JobIndex;
  /** lga_id → simplified boundary, loaded only when listings exist. */
  geometry: ReadonlyMap<string, CouncilGeometry>;
  loading: boolean;
  failed: boolean;
}

const FIELD_LABELS: Record<(typeof DASHBOARD_FIELDS)[number], string> = {
  job_openings: "Job openings",
  government_pct: "Government %",
  vacancy_growth_12mo: "Vacancy growth 12 mo",
  industry_diversity_score: "Industry diversity",
  university_overlap_pct: "University overlap %",
};

const PERCENT_FIELDS = new Set<string>(["government_pct", "vacancy_growth_12mo", "university_overlap_pct"]);

function FieldCell({ name, field }: { name: (typeof DASHBOARD_FIELDS)[number]; field: DashboardField }) {
  if (field.value === null) {
    return (
      <span title="pending data" className="text-muted-foreground">
        —
      </span>
    );
  }
  return (
    <span>
      {field.value}
      {PERCENT_FIELDS.has(name) ? "%" : ""}
    </span>
  );
}

export default function CouncilJobsPanel({ rows, jobIndex, geometry, loading, failed }: CouncilJobsPanelProps) {
  const dashboards: Array<{ row: ScopeRow; dashboard: CouncilDashboard }> = rows.map(row => {
    const inCouncil =
      row.lgaId === null
        ? () => true
        : (listing: JobListing) => {
            const geom = geometry.get(row.lgaId!);
            return geom ? pointInCouncil(geom, listing.lng, listing.lat) : false;
          };
    return { row, dashboard: computeCouncilDashboard({ index: jobIndex, inCouncil, campuses: [] }) };
  });

  // Aggregate over the same scope for FR6.5; [] hides the chart (FR6.5 rule).
  const aggregateScope = jobIndex.listings.filter(listing => {
    if (rows.length === 1 && rows[0].lgaId === null) return true;
    return rows.some(row => {
      const geom = row.lgaId ? geometry.get(row.lgaId) : null;
      return geom ? pointInCouncil(geom, listing.lng, listing.lat) : false;
    });
  });
  const shares = computeSectorShares(aggregateScope);

  if (failed) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive" role="alert">
        Council index unavailable — the dashboard cannot resolve a scope. Reload to retry.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table aria-label="Council employment statistics (PRD FR6.4)">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Council</TableHead>
              {DASHBOARD_FIELDS.map(name => (
                <TableHead key={name} scope="col">
                  {FIELD_LABELS[name]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && jobIndex.listings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={DASHBOARD_FIELDS.length + 1} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : (
              dashboards.map(({ row, dashboard }) => (
                <TableRow key={row.key}>
                  <th scope="row" className="font-medium text-foreground">
                    {row.label}
                  </th>
                  {DASHBOARD_FIELDS.map(name => (
                    <TableCell key={name}>
                      <FieldCell name={name} field={dashboard[name]} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* FR6.5 — hidden entirely while job_openings is null. */}
      {shares.length > 0 && (
        <section aria-label="Sector distribution">
          <h3 className="text-sm font-semibold text-foreground">Employment sectors</h3>
          <ul className="mt-2 space-y-2">
            {shares.map(({ sector, percent }) => (
              <li key={sector} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-foreground">{sector}</span>
                <span
                  className="h-3 rounded bg-primary"
                  style={{ width: `${Math.max(percent, 1)}%` }}
                  aria-hidden="true"
                />
                <span className="text-sm text-muted-foreground">{percent}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* FR6.6 — campus names come from the PRD itself; values are TBD-7/8. */}
      <section aria-label="University affinity">
        <h3 className="text-sm font-semibold text-foreground">University affinity</h3>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Campus</TableHead>
                <TableHead scope="col">Overlap %</TableHead>
                <TableHead scope="col">International student share</TableHead>
                <TableHead scope="col">Example relocation cities</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CAMPUS_NAMES.map(name => (
                <TableRow key={name}>
                  <th scope="row" className="font-medium text-foreground">
                    {name}
                  </th>
                  <TableCell>
                    <span title="pending data — campus coordinates (TBD-8)">—</span>
                  </TableCell>
                  <TableCell>
                    <span title="pending data — job listings (TBD-7)">—</span>
                  </TableCell>
                  <TableCell>
                    <span title="pending data — job listings (TBD-7)">—</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
