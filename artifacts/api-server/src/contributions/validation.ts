/**
 * Server-side contribution validation.
 *
 * This deliberately duplicates the shape of the client's canonical schema
 * rather than importing it: the browser is not a trust boundary, and the
 * server must not depend on a bundle the contributor can edit. The two
 * contracts are kept aligned by the API tests and by the export step, which
 * re-validates everything before a record can be published.
 */

export const CATEGORY_IDS = [
  "park",
  "playground",
  "drinking-fountain",
  "toilet",
  "dog-off-leash",
  "tree",
  "shelter",
  "bbq",
  "picnic-table",
  "sports-court",
  "other",
] as const;

export const LICENCE_IDS = ["cc-by-4.0", "cc0", "odbl", "permission-granted"] as const;

export const MAX_RECORDS_PER_BATCH = 500;
export const MAX_ATTRIBUTES = 40;

export interface ValidatedProvenance {
  method: "manual" | "import";
  format: string;
  contributor: string | null;
  contact: string | null;
  sourceUrl: string | null;
  photoUrl: string | null;
  observedAt: string | null;
  licence: string;
  originalFields: Record<string, string> | null;
}

export interface ValidatedRecord {
  id: string;
  schemaVersion: number;
  category: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  address: string | null;
  suburb: string | null;
  council: string | null;
  attributes: Record<string, string | number | boolean>;
  provenance: ValidatedProvenance;
  createdAt: string;
}

export interface RecordIssue {
  recordIndex: number;
  field: string;
  message: string;
}

const AUSTRALIA = { minLat: -44.5, maxLat: -9.5, minLng: 111.5, maxLng: 154.5 };
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RECORD_ID = /^pp-[a-z0-9-]{8,64}$/i;
const ATTRIBUTE_KEY = /^[a-z][a-z0-9]{0,39}$/i;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL, "").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function httpUrl(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > max) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function finite(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Validates one untrusted record. Returns either a normalised record or the
 * list of reasons it cannot be stored.
 */
export function validateRecord(raw: unknown, index: number): {
  record: ValidatedRecord | null;
  issues: RecordIssue[];
} {
  const issues: RecordIssue[] = [];
  const push = (field: string, message: string) => issues.push({ recordIndex: index, field, message });

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    push("record", "Record must be an object.");
    return { record: null, issues };
  }
  const input = raw as Record<string, unknown>;

  if (input.schemaVersion !== 1) push("schemaVersion", "Unsupported schema version.");
  if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) push("id", "Record id is not in the expected form.");
  if (typeof input.category !== "string" || !(CATEGORY_IDS as readonly string[]).includes(input.category)) {
    push("category", "Unknown category.");
  }

  const name = text(input.name, 120);
  if (!name || name.length < 2) push("name", "Name is required and must be at least 2 characters.");

  const lat = finite(input.lat);
  const lng = finite(input.lng);
  if (lat === null || lat < AUSTRALIA.minLat || lat > AUSTRALIA.maxLat) {
    push("lat", "Latitude must be a number within Australia.");
  }
  if (lng === null || lng < AUSTRALIA.minLng || lng > AUSTRALIA.maxLng) {
    push("lng", "Longitude must be a number within Australia.");
  }

  if (input.description !== null && input.description !== undefined && typeof input.description !== "string") {
    push("description", "Description must be text.");
  }
  if (text(input.description, 601) && String(input.description).length > 600) {
    push("description", "Description is too long.");
  }
  for (const [field, max] of [
    ["address", 200],
    ["suburb", 80],
    ["council", 120],
  ] as const) {
    const value = input[field];
    if (value !== null && value !== undefined && typeof value !== "string") push(field, `${field} must be text.`);
    if (typeof value === "string" && value.length > max) push(field, `${field} is too long.`);
  }

  const attributes: Record<string, string | number | boolean> = {};
  const rawAttributes = input.attributes;
  if (rawAttributes !== null && rawAttributes !== undefined) {
    if (typeof rawAttributes !== "object" || Array.isArray(rawAttributes)) {
      push("attributes", "Attributes must be an object.");
    } else {
      const entries = Object.entries(rawAttributes as Record<string, unknown>);
      if (entries.length > MAX_ATTRIBUTES) push("attributes", `At most ${MAX_ATTRIBUTES} attributes are allowed.`);
      for (const [key, value] of entries.slice(0, MAX_ATTRIBUTES)) {
        if (!ATTRIBUTE_KEY.test(key)) {
          push(`attributes.${key}`, "Attribute names must be letters and digits.");
          continue;
        }
        if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
          attributes[key] = value;
        } else if (typeof value === "string" && value.length <= 300) {
          attributes[key] = value.replace(CONTROL, "").trim();
        } else {
          push(`attributes.${key}`, "Attribute values must be short text, a number or true/false.");
        }
      }
    }
  } else if (input.attributes !== undefined) {
    push("attributes", "Attributes must be an object.");
  }

  const provenanceInput =
    input.provenance && typeof input.provenance === "object" && !Array.isArray(input.provenance)
      ? (input.provenance as Record<string, unknown>)
      : null;
  if (!provenanceInput) push("provenance", "Provenance is required.");
  const licence = LICENCES_FOR_VALIDATION(provenanceInput?.licence);
  if (!licence) push("provenance.licence", "Choose a licence for the contribution.");
  const contributor = text(provenanceInput?.contributor, 120);
  const contactRaw = text(provenanceInput?.contact, 200);
  if (contactRaw && !EMAIL.test(contactRaw)) push("provenance.contact", "Contact must be an email address.");

  const originalFields: Record<string, string> | null = (() => {
    const value = provenanceInput?.originalFields;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const entries = Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .slice(0, 60);
    return Object.fromEntries(
      entries.map(([key, value]) => [key.replace(CONTROL, "").slice(0, 80), value.replace(CONTROL, "").slice(0, 400)]),
    );
  })();

  if (issues.length > 0) return { record: null, issues };

  return {
    record: {
      id: String(input.id),
      schemaVersion: 1,
      category: String(input.category),
      name: name!,
      description: text(input.description, 600),
      lat: Number(lat!.toFixed(6)),
      lng: Number(lng!.toFixed(6)),
      address: text(input.address, 200),
      suburb: text(input.suburb, 80),
      council: text(input.council, 120),
      attributes,
      provenance: {
        method: provenanceInput?.method === "import" ? "import" : "manual",
        format: text(provenanceInput?.format, 40) ?? "manual",
        contributor,
        contact: contactRaw,
        sourceUrl: httpUrl(provenanceInput?.sourceUrl),
        photoUrl: httpUrl(provenanceInput?.photoUrl),
        observedAt: isoDate(provenanceInput?.observedAt),
        licence: licence!,
        originalFields,
      },
      createdAt:
        typeof input.createdAt === "string" && !Number.isNaN(Date.parse(input.createdAt))
          ? new Date(input.createdAt).toISOString()
          : new Date().toISOString(),
    },
    issues: [],
  };
}

function LICENCES_FOR_VALIDATION(value: unknown): string | null {
  return typeof value === "string" && (LICENCE_IDS as readonly string[]).includes(value) ? value : null;
}

export interface BatchMeta {
  contributor: string | null;
  contact: string | null;
  note: string | null;
  sourceFormat: string;
}

export function validateBatchMeta(raw: unknown): { meta: BatchMeta; issues: string[] } {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const issues: string[] = [];
  const contributor = text(input.contributor, 120);
  const contactRaw = text(input.contact, 200);
  if (contactRaw && !EMAIL.test(contactRaw)) issues.push("Contact must be an email address.");
  const note = text(input.note, 1000);
  const format = text(input.sourceFormat, 40) ?? "manual";
  if (issues.length > 0) return { meta: { contributor: null, contact: null, note: null, sourceFormat: format }, issues };
  return { meta: { contributor, contact: contactRaw, note, sourceFormat: format }, issues };
}

/** Re-validates a stored payload before it can be exported or published. */
export function parseStoredRecord(payload: string): ValidatedRecord | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    const { record } = validateRecord(parsed, 0);
    return record;
  } catch {
    return null;
  }
}
