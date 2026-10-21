import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { JobIndex, JobListing, ListingFilterState } from "@/utils/jobIndex";
import { searchJobs } from "@/utils/oracle";

/** FR6.8 — acceptance flag; no account system, local-only. */
export const TOS_STORAGE_KEY = "pp_oracle_tos_accepted";

const TOS_TEXT =
  "ParkPulse Oracle is a preview of council-scoped job search. Listings are sourced " +
  "through a data partnership that has not concluded yet (TBD-7), so the index may be " +
  "empty and any figure shown as “pending data” has not been measured. Queries you " +
  "type stay in your browser — nothing is sent to a server. By continuing you accept " +
  "these terms for this session and later sessions on this device.";

export interface OraclePanelProps {
  index: JobIndex;
  filters: ListingFilterState;
  /** Selected councils (FR6.3 — search composes with the council scope). */
  councilNames: string[];
}

function readAccepted(): boolean {
  try {
    return window.localStorage.getItem(TOS_STORAGE_KEY) === "accepted";
  } catch {
    return false; // private mode / disabled storage → always re-ask
  }
}

export default function OraclePanel({ index, filters, councilNames }: OraclePanelProps) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [showTos, setShowTos] = useState(false);
  const [accepted, setAccepted] = useState(readAccepted);

  const run = (value: string) => setSubmitted(value);

  const results: JobListing[] | null = useMemo(
    () => (submitted === null ? null : searchJobs(index, { query: submitted, filters, councilNames })),
    [submitted, index, filters, councilNames],
  );

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={event => {
          event.preventDefault();
          if (!accepted) {
            setShowTos(true); // FR6.8 — the overlay gates first search use
            return;
          }
          run(query);
        }}
      >
        <div className="flex-1">
          <Label htmlFor="pp-oracle-query">Oracle search</Label>
          <Input
            id="pp-oracle-query"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder='e.g. "data engineer" AND government NOT casual'
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Boolean AND / OR / NOT, parentheses and “quoted phrases” are supported.
          </p>
        </div>
        <Button type="submit" className="sm:mb-0.5">
          Search
        </Button>
      </form>

      {results === null ? (
        <p className="text-sm text-muted-foreground">
          Run a query to search council-scoped listings (FR6.7).
        </p>
      ) : results.length === 0 ? (
        <Empty className="rounded-lg border border-border bg-card">
          <EmptyHeader>
            <EmptyTitle>No listings match</EmptyTitle>
            <EmptyDescription>
              The job index holds {index.listings.length} listings until the data partnership (TBD-7) lands —
              filters{councilNames.length > 0 ? " and the council scope" : ""} were applied to every one of them.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table aria-label="Oracle search results">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Company</TableHead>
                <TableHead scope="col">Title</TableHead>
                <TableHead scope="col">Suburb</TableHead>
                <TableHead scope="col">Council</TableHead>
                <TableHead scope="col">Sector</TableHead>
                <TableHead scope="col">Salary band</TableHead>
                <TableHead scope="col">Campus km</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map(listing => (
                <TableRow key={listing.id}>
                  <TableCell className="font-medium">{listing.company}</TableCell>
                  <TableCell>{listing.title}</TableCell>
                  <TableCell>{listing.suburb}</TableCell>
                  <TableCell>{listing.council}</TableCell>
                  <TableCell>{listing.sector}</TableCell>
                  <TableCell>{listing.salary_band}</TableCell>
                  <TableCell>
                    {listing.campus_km === null ? (
                      <span title="pending data — campus coordinates (TBD-8)">—</span>
                    ) : (
                      `${listing.campus_km} km`
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* FR6.8 — Terms of Service overlay gates the first search use. */}
      <Dialog open={showTos} onOpenChange={setShowTos}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Terms of Service — Oracle search preview</DialogTitle>
            <DialogDescription>One-time acknowledgement; stored only in this browser.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-foreground">{TOS_TEXT}</p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setShowTos(false)}>
              Decline
            </Button>
            <Button
              type="button"
              onClick={() => {
                try {
                  window.localStorage.setItem(TOS_STORAGE_KEY, "accepted");
                } catch {
                  // storage disabled → the flag simply won't persist
                }
                setAccepted(true);
                setShowTos(false);
                run(query);
              }}
            >
              Accept and search
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
