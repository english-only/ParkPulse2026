import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ListingFilterState } from "@/utils/jobIndex";

/**
 * FR6.1 — the filter grid, exactly 3 columns × 2 rows with the six control
 * labels the PRD locks. Cell ↔ control pairing (the PRD lists them as two
 * separate sequences; this is the pairing that keeps each control in its
 * sensible cell and is documented here as the interpretation of record):
 *
 *   City & Neighborhoods → Suburbs (list)            Metro Areas         → Suburbs (sorted dropdown)
 *   Industry              → Cat level equal to one   Employment Sector   → Government only/All
 *   Disability Access.    → Disabled access eligible Area-based Stats     → Level equal to one
 *
 * Every control is keyboard-operable (native inputs plus Radix-backed
 * vendored components), and every change flows through `onChange` so FR6.3's
 * chips row can show and remove each active constraint.
 */
export interface FilterGridProps {
  filters: ListingFilterState;
  onChange: (next: ListingFilterState) => void;
  /** Alphabetically sorted suburb vocabulary derived from local data (FR6.2). */
  suburbs: string[];
  suburbsLoading: boolean;
  /** Selected councils (display names) shown as removable chips (FR6.3). */
  councils: Array<{ lga_id: string; display_name: string }>;
  onRemoveCouncil: (lgaId: string) => void;
  /** Explains where the suburb vocabulary came from (TBD-13 when short). */
  suburbNote: string;
}

interface CellProps {
  title: string;
  controlLabel: string;
  children: React.ReactNode;
}

function Cell({ title, controlLabel, children }: CellProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label={`${title} filter`}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{controlLabel}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const govtValue = (f: ListingFilterState) => (f.governmentOnly ? "government" : "all");
const equalOne = (v: number | null) => (v === 1 ? "one" : "any");

export default function FilterGrid({
  filters,
  onChange,
  suburbs,
  suburbsLoading,
  councils,
  onRemoveCouncil,
  suburbNote,
}: FilterGridProps) {
  const patch = (next: Partial<ListingFilterState>) => onChange({ ...filters, ...next });

  const activeChips: Array<{ key: string; label: string; remove: () => void }> = [
    ...councils.map(c => ({
      key: `council:${c.lga_id}`,
      label: c.display_name,
      remove: () => onRemoveCouncil(c.lga_id),
    })),
    ...filters.suburbs.map(suburb => ({
      key: `suburb:${suburb}`,
      label: `Suburb: ${suburb}`,
      remove: () => patch({ suburbs: filters.suburbs.filter(s => s !== suburb) }),
    })),
    ...(filters.governmentOnly
      ? [{ key: "government", label: "Government only", remove: () => patch({ governmentOnly: false }) }]
      : []),
    ...(filters.catLevel === 1
      ? [{ key: "catLevel", label: "Cat level equal to one", remove: () => patch({ catLevel: null }) }]
      : []),
    ...(filters.level === 1
      ? [{ key: "level", label: "Level equal to one", remove: () => patch({ level: null }) }]
      : []),
    ...(filters.disabilityOnly
      ? [{ key: "disability", label: "Disabled access eligible", remove: () => patch({ disabilityOnly: false }) }]
      : []),
  ];

  return (
    <div className="space-y-4">
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {activeChips.map(chip => (
            <Badge key={chip.key} variant="secondary" className="gap-1 pr-1">
              {chip.label}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-5 hover:bg-accent"
                aria-label={`Remove filter ${chip.label}`}
                onClick={chip.remove}
              >
                <span aria-hidden="true">×</span>
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {/* FR6.1: exactly 3 × 2, in the PRD's listed order (row-major). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Cell title="City & Neighborhoods" controlLabel="Suburbs (list)">
          <p className="mb-2 text-xs text-muted-foreground">{suburbNote}</p>
          {suburbsLoading ? (
            <p className="text-sm text-muted-foreground" role="status">
              Loading suburbs…
            </p>
          ) : suburbs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suburb data loaded.</p>
          ) : (
            <div
              className="max-h-44 space-y-1 overflow-y-auto pr-1"
              role="group"
              aria-label="Suburbs, multi-select"
            >
              {suburbs.map(suburb => {
                const id = `pp-suburb-${suburb.replace(/\s+/g, "-").toLowerCase()}`;
                const checked = filters.suburbs.includes(suburb);
                return (
                  <div key={suburb} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={on =>
                        patch({
                          suburbs: on
                            ? [...filters.suburbs, suburb]
                            : filters.suburbs.filter(s => s !== suburb),
                        })
                      }
                    />
                    <Label htmlFor={id} className="text-sm font-normal">
                      {suburb}
                    </Label>
                  </div>
                );
              })}
            </div>
          )}
        </Cell>

        <Cell title="Industry" controlLabel="Cat level equal to one">
          <Select
            value={equalOne(filters.catLevel)}
            onValueChange={v => patch({ catLevel: v === "one" ? 1 : null })}
          >
            <SelectTrigger aria-label="Cat level equal to one">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any category level</SelectItem>
              <SelectItem value="one">Cat level equal to one</SelectItem>
            </SelectContent>
          </Select>
        </Cell>

        <Cell title="Disability Accessibility" controlLabel="Disabled access eligible">
          <div className="flex items-center gap-2">
            <Checkbox
              id="pp-disability-access"
              checked={filters.disabilityOnly}
              onCheckedChange={on => patch({ disabilityOnly: on === true })}
            />
            <Label htmlFor="pp-disability-access" className="text-sm font-normal">
              Disabled access eligible
            </Label>
          </div>
        </Cell>

        <Cell title="Metro Areas" controlLabel="Suburbs (sorted dropdown)">
          <Select
            onValueChange={v => {
              if (v && !filters.suburbs.includes(v)) patch({ suburbs: [...filters.suburbs, v] });
            }}
          >
            <SelectTrigger aria-label="Add a suburb from the sorted list">
              <SelectValue placeholder={suburbsLoading ? "Loading…" : "Add suburb…"} />
            </SelectTrigger>
            <SelectContent>
              {suburbs.map(suburb => (
                <SelectItem key={suburb} value={suburb}>
                  {suburb}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Cell>

        <Cell title="Employment Sector" controlLabel="Government only/All">
          <Select value={govtValue(filters)} onValueChange={v => patch({ governmentOnly: v === "government" })}>
            <SelectTrigger aria-label="Government only or all sectors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sectors</SelectItem>
              <SelectItem value="government">Government only</SelectItem>
            </SelectContent>
          </Select>
        </Cell>

        <Cell title="Area-based Stats" controlLabel="Level equal to one">
          <Select value={equalOne(filters.level)} onValueChange={v => patch({ level: v === "one" ? 1 : null })}>
            <SelectTrigger aria-label="Level equal to one">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any level</SelectItem>
              <SelectItem value="one">Level equal to one</SelectItem>
            </SelectContent>
          </Select>
        </Cell>
      </div>
    </div>
  );
}
