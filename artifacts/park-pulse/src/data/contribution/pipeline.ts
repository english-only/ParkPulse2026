/**
 * Import pipeline: table + mapping → validated, deduplicated drafts.
 *
 * The pipeline is deliberately pure: it takes parsed rows, a field mapping and
 * a duplicate index, and returns drafts. It performs no network calls and no
 * DOM work, which is what makes it testable and reusable by the manual form,
 * the bulk importer and the publish script.
 */

import {
  COMMON_FIELDS,
  findDuplicate,
  getCategory,
  validatePlaceRecord,
  type CategoryId,
  type DuplicateMatch,
  type FieldDefinition,
  type PlaceRecord,
  type ValidationIssue,
} from "./schema";
import type { SourceTable } from "./import";

/** A place already in the served dataset, used for duplicate warnings. */
export interface ExistingPlace {
  name: string;
  category: string;
  lat: number;
  lng: number;
}

export interface DraftDefaults {
  suburb?: string;
  council?: string;
  sourceUrl?: string;
  observedAt?: string;
  contributor?: string;
  contact?: string;
  licence?: string;
  format?: string;
  method?: "manual" | "import";
}

export interface DraftRecord {
  /** 1-based row in the source table. */
  row: number;
  name: string;
  record: PlaceRecord | null;
  issues: ValidationIssue[];
  duplicate: DuplicateMatch | null;
  /** The contributor chose to leave this row out of the batch. */
  excluded: boolean;
}

export interface BuildDraftsInput {
  table: SourceTable;
  category: CategoryId;
  /** Canonical field key → source header. */
  mapping: Record<string, string>;
  defaults?: DraftDefaults;
  existing?: readonly ExistingPlace[];
  /** Rows examined, capped so the browser stays responsive. */
  limit?: number;
}

function readMapped(
  row: SourceTable["rows"][number],
  mapping: Record<string, string>,
  key: string,
): string | undefined {
  const header = mapping[key];
  if (!header) return undefined;
  const value = row.values[header];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Builds one draft per source row. Rows that fail validation are kept, with
 * their issues, so the contributor can correct them rather than lose them.
 */
export function buildDrafts({
  table,
  category,
  mapping,
  defaults = {},
  existing = [],
  limit = 500,
}: BuildDraftsInput): DraftRecord[] {
  const definition = getCategory(category);
  if (!definition) throw new Error(`Unknown category: ${category}`);

  const drafts: DraftRecord[] = [];
  const acceptedSoFar: ExistingPlace[] = [];
  const rows = table.rows.slice(0, limit);

  for (const row of rows) {
    const latText = readMapped(row, mapping, "lat") ?? (row.lat !== undefined ? String(row.lat) : undefined);
    const lngText = readMapped(row, mapping, "lng") ?? (row.lng !== undefined ? String(row.lng) : undefined);
    const name = readMapped(row, mapping, "name") ?? "";

    const attributes: Record<string, string> = {};
    for (const field of definition.fields) {
      const value = readMapped(row, mapping, field.key);
      if (value !== undefined) attributes[field.key] = value;
    }

    const candidate: Record<string, unknown> = {
      category,
      name,
      description: readMapped(row, mapping, "description"),
      lat: latText,
      lng: lngText,
      address: readMapped(row, mapping, "address"),
      suburb: readMapped(row, mapping, "suburb") ?? defaults.suburb,
      council: readMapped(row, mapping, "council") ?? defaults.council,
      attributes,
      provenance: {
        method: defaults.method ?? "import",
        format: defaults.format ?? "import",
        contributor: defaults.contributor,
        contact: defaults.contact,
        sourceUrl: readMapped(row, mapping, "sourceUrl") ?? defaults.sourceUrl,
        photoUrl: readMapped(row, mapping, "photoUrl"),
        observedAt: readMapped(row, mapping, "observedAt") ?? defaults.observedAt,
        licence: defaults.licence,
        originalFields: row.values,
      },
    };

    const validation = validatePlaceRecord(candidate);
    const duplicate = validation.record
      ? findDuplicate(validation.record, [...existing, ...acceptedSoFar])
      : null;
    if (validation.record && !duplicate) {
      acceptedSoFar.push({
        name: validation.record.name,
        category: validation.record.category,
        lat: validation.record.lat,
        lng: validation.record.lng,
      });
    }

    drafts.push({
      row: row.sourceRow,
      name: name || validation.record?.name || `Row ${row.sourceRow}`,
      record: validation.record,
      issues: validation.issues,
      duplicate,
      // Duplicates are warnings, not errors: two amenities can share a point,
      // and the contributor is the one who can tell whether it is the same
      // place. The default is to include, except for exact duplicates.
      excluded: Boolean(duplicate && duplicate.kind === "same"),
    });
  }

  return drafts;
}

export function draftIssues(drafts: readonly DraftRecord[]): number {
  return drafts.filter((draft) => draft.issues.length > 0).length;
}

export function validDrafts(drafts: readonly DraftRecord[]): DraftRecord[] {
  return drafts.filter((draft) => draft.issues.length === 0 && !draft.excluded && draft.record);
}

export function duplicateDrafts(drafts: readonly DraftRecord[]): DraftRecord[] {
  return drafts.filter((draft) => draft.duplicate !== null);
}

export interface BatchSummary {
  total: number;
  ready: number;
  invalid: number;
  duplicates: number;
  excluded: number;
  categories: Record<string, number>;
}

export function summariseDrafts(drafts: readonly DraftRecord[]): BatchSummary {
  const categories: Record<string, number> = {};
  for (const draft of drafts) {
    const key = draft.record?.category ?? "invalid";
    categories[key] = (categories[key] ?? 0) + 1;
  }
  return {
    total: drafts.length,
    ready: validDrafts(drafts).length,
    invalid: draftIssues(drafts),
    duplicates: duplicateDrafts(drafts).length,
    excluded: drafts.filter((draft) => draft.excluded).length,
    categories,
  };
}

/** All mapping targets for a category, in form order. */
export function mappingTargets(category: CategoryId): { key: string; label: string; required: boolean }[] {
  const definition = getCategory(category);
  const common: readonly FieldDefinition[] = COMMON_FIELDS;
  return [...common, ...(definition?.fields ?? [])].map((field) => ({
    key: field.key,
    label: field.label,
    required: Boolean(field.required),
  }));
}

/** Aliases for a canonical key, used by the auto-mapper. */
export function aliasesFor(category: CategoryId, key: string): readonly string[] {
  const definition = getCategory(category);
  const common: readonly FieldDefinition[] = COMMON_FIELDS;
  const field = [...common, ...(definition?.fields ?? [])].find((entry) => entry.key === key);
  return field?.aliases ?? [];
}

/**
 * Rows the API will accept. Provenance formatting is normalised by the
 * validator, so the payload is the validated record rather than the draft.
 */
export function batchPayload(drafts: readonly DraftRecord[]): PlaceRecord[] {
  return validDrafts(drafts).map((draft) => draft.record!);
}
