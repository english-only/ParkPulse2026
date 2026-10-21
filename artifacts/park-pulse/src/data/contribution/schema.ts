/**
 * Canonical Park Pulse place schema.
 *
 * One record describes one real-world place or amenity contributed by the
 * public. The schema is deliberately data-driven: a category is a record in
 * `CATEGORIES`, not a branch in a component, so adding a category (or a field
 * on an existing category) is one edit here and every surface — the manual
 * form, the import mapper, the review table, the exporter and the API's
 * validation — follows.
 *
 * Coordinates are WGS84 decimal degrees. Longitude is always first when a
 * record is turned into GeoJSON; inside a canonical record the pair is named.
 */

export const SCHEMA_VERSION = 1;

export type CategoryId =
  | "park"
  | "playground"
  | "drinking-fountain"
  | "toilet"
  | "dog-off-leash"
  | "tree"
  | "shelter"
  | "bbq"
  | "picnic-table"
  | "sports-court"
  | "other";

export type FieldType = "text" | "number" | "boolean" | "enum" | "url" | "date";

export interface FieldDefinition {
  /** Canonical key. Also the source of the attribute's label. */
  key: string;
  label: string;
  type: FieldType;
  /** Allowed values for `enum`. */
  options?: readonly { value: string; label: string }[];
  required?: boolean;
  /** Maximum string length for text and url fields. */
  maxLength?: number;
  min?: number;
  max?: number;
  /** Short hint shown under the field in the manual form. */
  help?: string;
  /** Alternative column names accepted by the importer's auto-mapper. */
  aliases?: readonly string[];
}

export interface CategoryDefinition {
  id: CategoryId;
  label: string;
  plural: string;
  /** What one record is; used in counts and tables. Never "a park". */
  recordNoun: string;
  description: string;
  /** Category-specific fields, in the order the form renders them. */
  fields: readonly FieldDefinition[];
  /** Explore layer this category feeds, when one exists. */
  exploreLayerId?: string;
}

const ACCESS: FieldDefinition = {
  key: "access",
  label: "Access",
  type: "enum",
  options: [
    { value: "public", label: "Public" },
    { value: "restricted", label: "Restricted" },
    { value: "private", label: "Private" },
    { value: "unknown", label: "Not known" },
  ],
  aliases: ["access", "public_access", "status"],
};

const WHEELCHAIR: FieldDefinition = {
  key: "wheelchairAccessible",
  label: "Wheelchair accessible",
  type: "boolean",
  help: "Only tick this when the source states it; leave blank when unknown.",
  aliases: ["wheelchair", "wheelchair_accessible", "accessible", "accessibility"],
};

const SOURCE_NOTE: FieldDefinition = {
  key: "sourceNote",
  label: "Source note",
  type: "text",
  maxLength: 300,
  help: "Where this record came from, e.g. a council sign or a survey date.",
  aliases: ["source_note", "source", "note", "comments", "description"],
};

/**
 * Ordered so the most common contributions come first in the form's picker.
 * `park` and `playground` intentionally overlap: a playground is usually
 * inside a park, and the record type is what the contributor can verify.
 */
export const CATEGORIES: readonly CategoryDefinition[] = [
  {
    id: "park",
    label: "Park or reserve",
    plural: "Parks and reserves",
    recordNoun: "park area",
    description: "A public green space, reserve, square or pocket park.",
    exploreLayerId: "parks",
    fields: [
      ACCESS,
      WHEELCHAIR,
      {
        key: "parkType",
        label: "Park type",
        type: "enum",
        options: [
          { value: "Park", label: "Park" },
          { value: "Pocket", label: "Pocket park" },
          { value: "Neighbourhood", label: "Neighbourhood park" },
          { value: "Sportsfield", label: "Sportsfield" },
          { value: "Iconic", label: "Iconic park" },
        ],
        aliases: ["park_type", "type", "classification"],
      },
      {
        key: "areaSqm",
        label: "Area (m²)",
        type: "number",
        min: 1,
        max: 50_000_000,
        aliases: ["area", "area_sqm", "size"],
      },
      {
        key: "hasPlayground",
        label: "Has a playground",
        type: "boolean",
        aliases: ["playground", "has_playground"],
      },
      {
        key: "hasToilets",
        label: "Has public toilets",
        type: "boolean",
        aliases: ["toilets", "has_toilets"],
      },
      {
        key: "offLeashAllowed",
        label: "Dogs may be off leash",
        type: "boolean",
        aliases: ["off_leash", "dogs_off_leash", "dog"],
      },
      {
        key: "openingHours",
        label: "Opening hours",
        type: "text",
        maxLength: 120,
        aliases: ["hours", "opening_hours", "openingHours"],
      },
      SOURCE_NOTE,
    ],
  },
  {
    id: "playground",
    label: "Playground",
    plural: "Playgrounds",
    recordNoun: "playground",
    description: "A play area with equipment, inside a park or on its own.",
    exploreLayerId: "parks",
    fields: [
      ACCESS,
      WHEELCHAIR,
      {
        key: "suitableAges",
        label: "Suitable ages",
        type: "text",
        maxLength: 60,
        help: "e.g. 2–5 years, all ages.",
        aliases: ["ages", "age_range", "suitable_ages"],
      },
      {
        key: "surface",
        label: "Surface",
        type: "text",
        maxLength: 60,
        aliases: ["surface", "ground"],
      },
      {
        key: "fenced",
        label: "Fenced",
        type: "boolean",
        aliases: ["fenced", "is_fenced"],
      },
      {
        key: "hasShade",
        label: "Has shade",
        type: "boolean",
        aliases: ["shade", "has_shade"],
      },
      {
        key: "openingHours",
        label: "Opening hours",
        type: "text",
        maxLength: 120,
        aliases: ["hours", "opening_hours"],
      },
      SOURCE_NOTE,
    ],
  },
  {
    id: "drinking-fountain",
    label: "Drinking fountain",
    plural: "Drinking fountains",
    recordNoun: "fountain",
    description: "A public water fountain or bottle-refill point.",
    exploreLayerId: "fountains",
    fields: [
      ACCESS,
      WHEELCHAIR,
      {
        key: "bottleRefill",
        label: "Bottle refill",
        type: "boolean",
        aliases: ["bottle_refill", "refill"],
      },
      {
        key: "dogBowl",
        label: "Dog bowl",
        type: "boolean",
        aliases: ["dog_bowl", "dog"],
      },
      {
        key: "working",
        label: "Working when checked",
        type: "boolean",
        help: "Leave blank if you did not check.",
        aliases: ["working", "operational", "status"],
      },
      SOURCE_NOTE,
    ],
  },
  {
    id: "toilet",
    label: "Public toilet",
    plural: "Public toilets",
    recordNoun: "toilet",
    description: "A public toilet or accessible toilet facility.",
    exploreLayerId: "toilets",
    fields: [
      ACCESS,
      WHEELCHAIR,
      {
        key: "babyChange",
        label: "Baby change",
        type: "boolean",
        aliases: ["baby_change", "baby", "changing"],
      },
      {
        key: "unisex",
        label: "Unisex",
        type: "boolean",
        aliases: ["unisex"],
      },
      {
        key: "openingHours",
        label: "Opening hours",
        type: "text",
        maxLength: 120,
        aliases: ["hours", "opening_hours"],
      },
      SOURCE_NOTE,
    ],
  },
  {
    id: "dog-off-leash",
    label: "Off-leash dog area",
    plural: "Off-leash dog areas",
    recordNoun: "off-leash area",
    description: "A designated area where dogs may be exercised off leash.",
    exploreLayerId: "dogs",
    fields: [
      {
        key: "openingHours",
        label: "Off-leash hours",
        type: "text",
        maxLength: 120,
        aliases: ["hours", "opening_hours", "off_leash_hours"],
      },
      {
        key: "fenced",
        label: "Fenced",
        type: "boolean",
        aliases: ["fenced", "is_fenced"],
      },
      {
        key: "prohibitedAreas",
        label: "Prohibited areas",
        type: "text",
        maxLength: 240,
        aliases: ["prohibited", "prohibited_areas", "restrictions"],
      },
      SOURCE_NOTE,
    ],
  },
  {
    id: "tree",
    label: "Tree",
    plural: "Trees",
    recordNoun: "tree",
    description: "An individual tree with a location and, where known, its species.",
    fields: [
      {
        key: "species",
        label: "Species",
        type: "text",
        maxLength: 120,
        aliases: ["species", "scientific_name", "botanical_name"],
      },
      {
        key: "commonName",
        label: "Common name",
        type: "text",
        maxLength: 120,
        aliases: ["common_name", "tree_name"],
      },
      {
        key: "heightM",
        label: "Height (m)",
        type: "number",
        min: 0,
        max: 120,
        aliases: ["height", "height_m"],
      },
      {
        key: "trunkDiameterCm",
        label: "Trunk diameter (cm)",
        type: "number",
        min: 0,
        max: 600,
        aliases: ["dbh", "diameter", "trunk_diameter"],
      },
      {
        key: "status",
        label: "Status",
        type: "enum",
        options: [
          { value: "alive", label: "Alive" },
          { value: "dead", label: "Dead" },
          { value: "unknown", label: "Not known" },
        ],
        aliases: ["status", "condition"],
      },
      SOURCE_NOTE,
    ],
  },
  {
    id: "shelter",
    label: "Shelter or shade structure",
    plural: "Shelters",
    recordNoun: "shelter",
    description: "A covered shelter, gazebo or shade structure in a public space.",
    fields: [
      ACCESS,
      WHEELCHAIR,
      {
        key: "hasSeating",
        label: "Has seating",
        type: "boolean",
        aliases: ["seating", "seats"],
      },
      SOURCE_NOTE,
    ],
  },
  {
    id: "bbq",
    label: "Barbecue",
    plural: "Barbecues",
    recordNoun: "barbecue",
    description: "A public barbecue facility.",
    fields: [
      ACCESS,
      {
        key: "free",
        label: "Free to use",
        type: "boolean",
        aliases: ["free", "cost", "is_free"],
      },
      {
        key: "fuel",
        label: "Fuel",
        type: "enum",
        options: [
          { value: "electric", label: "Electric" },
          { value: "gas", label: "Gas" },
          { value: "wood", label: "Wood" },
          { value: "unknown", label: "Not known" },
        ],
        aliases: ["fuel", "type"],
      },
      SOURCE_NOTE,
    ],
  },
  {
    id: "picnic-table",
    label: "Picnic table",
    plural: "Picnic tables",
    recordNoun: "picnic table",
    description: "A table for eating outdoors, usually in a park.",
    fields: [
      ACCESS,
      WHEELCHAIR,
      {
        key: "covered",
        label: "Covered",
        type: "boolean",
        aliases: ["covered", "undercover"],
      },
      SOURCE_NOTE,
    ],
  },
  {
    id: "sports-court",
    label: "Sports court or field",
    plural: "Sports courts",
    recordNoun: "court",
    description: "A basketball court, tennis court, oval or other playing surface.",
    fields: [
      ACCESS,
      {
        key: "sport",
        label: "Sport",
        type: "text",
        maxLength: 60,
        aliases: ["sport", "activity"],
      },
      {
        key: "surface",
        label: "Surface",
        type: "text",
        maxLength: 60,
        aliases: ["surface"],
      },
      {
        key: "lit",
        label: "Floodlit",
        type: "boolean",
        aliases: ["lit", "lighting", "floodlit"],
      },
      SOURCE_NOTE,
    ],
  },
  {
    id: "other",
    label: "Other public place",
    plural: "Other places",
    recordNoun: "place",
    description: "A useful public place that does not fit the categories above.",
    fields: [
      ACCESS,
      {
        key: "whatIsIt",
        label: "What is it?",
        type: "text",
        maxLength: 120,
        help: "A short description of the kind of place, e.g. “public artwork”.",
        aliases: ["type", "kind", "category"],
      },
      SOURCE_NOTE,
    ],
  },
] as const;

export const CATEGORY_IDS = CATEGORIES.map((category) => category.id);

export function getCategory(id: string): CategoryDefinition | undefined {
  return CATEGORIES.find((category) => category.id === id);
}

/** Fields every record carries, in addition to its category's own fields. */
export const COMMON_FIELDS = [
  {
    key: "name",
    label: "Name",
    type: "text",
    required: true,
    maxLength: 120,
    aliases: ["name", "title", "place", "park", "park_name", "site_name", "site", "label", "facility"],
  },
  {
    key: "description",
    label: "Description",
    type: "text",
    required: false,
    maxLength: 600,
    aliases: ["description", "about", "details", "summary"],
  },
  {
    key: "lat",
    label: "Latitude",
    type: "number",
    required: true,
    min: -90,
    max: 90,
    aliases: ["lat", "latitude", "y", "northing"],
  },
  {
    key: "lng",
    label: "Longitude",
    type: "number",
    required: true,
    min: -180,
    max: 180,
    aliases: ["lng", "lon", "long", "longitude", "x", "easting"],
  },
  {
    key: "address",
    label: "Address",
    type: "text",
    maxLength: 200,
    aliases: ["address", "street_address", "location", "street"],
  },
  {
    key: "suburb",
    label: "Suburb",
    type: "text",
    maxLength: 80,
    aliases: ["suburb", "locality", "town", "neighbourhood", "neighborhood"],
  },
  {
    key: "council",
    label: "Council",
    type: "text",
    maxLength: 120,
    aliases: ["council", "lga", "local_government_area", "municipality"],
  },
  {
    key: "sourceUrl",
    label: "Source link",
    type: "url",
    maxLength: 500,
    aliases: ["source_url", "url", "website", "link", "reference"],
  },
  {
    key: "photoUrl",
    label: "Photo link",
    type: "url",
    maxLength: 500,
    aliases: ["photo", "image", "photo_url", "image_url", "picture"],
  },
  {
    key: "observedAt",
    label: "Date checked",
    type: "date",
    aliases: ["date", "observed_at", "checked", "survey_date", "updated"],
  },
] as const satisfies readonly FieldDefinition[];

export type CommonFieldKey = (typeof COMMON_FIELDS)[number]["key"];

export const LICENCES = [
  { value: "cc-by-4.0", label: "CC BY 4.0 — attribution to the contributor" },
  { value: "cc0", label: "CC0 — public domain dedication" },
  { value: "odbl", label: "ODbL — OpenStreetMap-compatible, attribution + share-alike" },
  { value: "permission-granted", label: "I have permission to share this data" },
] as const;

export type LicenceId = (typeof LICENCES)[number]["value"];

export interface ContributionProvenance {
  /** How the record entered the batch. */
  method: "manual" | "import";
  /** Detected source format, e.g. `csv`, `geojson`, `manual`. */
  format: string;
  contributor: string | null;
  contact: string | null;
  sourceUrl: string | null;
  photoUrl: string | null;
  observedAt: string | null;
  licence: LicenceId;
  /** Original field names, kept for audit and reprocessing. */
  originalFields: Record<string, string> | null;
}

export interface PlaceRecord {
  /** Stable, client-generated, opaque id. */
  id: string;
  schemaVersion: number;
  category: CategoryId;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  address: string | null;
  suburb: string | null;
  council: string | null;
  attributes: Record<string, string | number | boolean>;
  provenance: ContributionProvenance;
  createdAt: string;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export const AUSTRALIA_BOUNDS = { minLat: -44.5, maxLat: -9.5, minLng: 111.5, maxLng: 154.5 };
export const GREATER_SYDNEY_BOUNDS = { minLat: -34.75, maxLat: -32.95, minLng: 150.0, maxLng: 151.65 };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** C0/C1 control characters except tab and newline. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function cleanText(value: string): string {
  return value.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

export function normaliseName(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function isInAustralia(lat: number, lng: number): boolean {
  return (
    lat >= AUSTRALIA_BOUNDS.minLat &&
    lat <= AUSTRALIA_BOUNDS.maxLat &&
    lng >= AUSTRALIA_BOUNDS.minLng &&
    lng <= AUSTRALIA_BOUNDS.maxLng
  );
}

export function isInGreaterSydney(lat: number, lng: number): boolean {
  return (
    lat >= GREATER_SYDNEY_BOUNDS.minLat &&
    lat <= GREATER_SYDNEY_BOUNDS.maxLat &&
    lng >= GREATER_SYDNEY_BOUNDS.minLng &&
    lng <= GREATER_SYDNEY_BOUNDS.maxLng
  );
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Human-readable label for a category id, falling back to the raw id. */
export function categoryLabel(id: string): string {
  return getCategory(id)?.label ?? id;
}

/** Every field a record can carry for a category, common first. */
export function fieldsForCategory(category: string): readonly FieldDefinition[] {
  const definition = getCategory(category);
  return definition ? [...COMMON_FIELDS, ...definition.fields] : [...COMMON_FIELDS];
}

/**
 * Coerces one attribute against its definition. Returns either the typed value
 * or a validation issue — never a silently defaulted value.
 */
function coerceField(
  field: FieldDefinition,
  raw: unknown,
): { value: string | number | boolean | null; issue?: ValidationIssue } {
  const missing =
    raw === undefined ||
    raw === null ||
    (typeof raw === "string" && raw.trim() === "");

  if (missing) {
    if (field.required) {
      return { value: null, issue: { field: field.key, code: "required", message: `${field.label} is required.` } };
    }
    return { value: null };
  }

  if (field.type === "boolean") {
    if (typeof raw === "boolean") return { value: raw };
    if (typeof raw === "number") return { value: raw !== 0 };
    const text = cleanText(String(raw)).toLowerCase();
    if (["true", "yes", "y", "1", "on", "available"].includes(text)) return { value: true };
    if (["false", "no", "n", "0", "off", "unavailable", "none"].includes(text)) return { value: false };
    return {
      value: null,
      issue: { field: field.key, code: "boolean", message: `${field.label} must be yes or no.` },
    };
  }

  if (field.type === "number") {
    const value = readFiniteNumber(raw);
    if (value === null) {
      return { value: null, issue: { field: field.key, code: "number", message: `${field.label} must be a number.` } };
    }
    if (field.min !== undefined && value < field.min) {
      return { value: null, issue: { field: field.key, code: "min", message: `${field.label} must be at least ${field.min}.` } };
    }
    if (field.max !== undefined && value > field.max) {
      return { value: null, issue: { field: field.key, code: "max", message: `${field.label} must be at most ${field.max}.` } };
    }
    return { value };
  }

  if (field.type === "url") {
    const value = cleanText(String(raw));
    if (!isHttpUrl(value)) {
      return {
        value: null,
        issue: { field: field.key, code: "url", message: `${field.label} must start with http:// or https://.` },
      };
    }
    if (value.length > (field.maxLength ?? 500)) {
      return { value: null, issue: { field: field.key, code: "maxLength", message: `${field.label} is too long.` } };
    }
    return { value };
  }

  if (field.type === "enum") {
    const value = cleanText(String(raw)).toLowerCase();
    const match = field.options?.find(
      (option) => option.value.toLowerCase() === value || option.label.toLowerCase() === value,
    );
    if (!match) {
      return {
        value: null,
        issue: {
          field: field.key,
          code: "enum",
          message: `${field.label} must be one of: ${field.options?.map((option) => option.label).join(", ")}.`,
        },
      };
    }
    return { value: match.value };
  }

  if (field.type === "date") {
    const value = cleanText(String(raw));
    if (!isIsoDate(value)) {
      return {
        value: null,
        issue: { field: field.key, code: "date", message: `${field.label} must be a date in YYYY-MM-DD form.` },
      };
    }
    const parsed = new Date(`${value}T00:00:00Z`).getTime();
    if (parsed > Date.now() + 86_400_000) {
      return { value: null, issue: { field: field.key, code: "future", message: `${field.label} cannot be in the future.` } };
    }
    return { value };
  }

  const value = cleanText(String(raw));
  const max = field.maxLength ?? 200;
  if (value.length > max) {
    return {
      value: null,
      issue: { field: field.key, code: "maxLength", message: `${field.label} must be ${max} characters or fewer.` },
    };
  }
  return { value };
}

/**
 * Validates an untrusted candidate. Used by the manual form, the importer and
 * the API — the API runs its own copy of this contract, because a browser is
 * not a trust boundary.
 */
export function validatePlaceRecord(input: unknown): {
  ok: boolean;
  issues: ValidationIssue[];
  record: PlaceRecord | null;
} {
  const issues: ValidationIssue[] = [];
  if (!input || typeof input !== "object") {
    return { ok: false, issues: [{ field: "", code: "object", message: "A record must be an object." }], record: null };
  }
  const candidate = input as Record<string, unknown>;
  const category = typeof candidate.category === "string" ? candidate.category : "";
  const definition = getCategory(category);
  if (!definition) {
    issues.push({ field: "category", code: "category", message: "Choose a category." });
  }

  const common: Record<string, string | number | boolean | null> = {};
  for (const field of COMMON_FIELDS) {
    const { value, issue } = coerceField(field, candidate[field.key]);
    if (issue) issues.push(issue);
    common[field.key] = value;
  }

  const attributes: Record<string, string | number | boolean> = {};
  const rawAttributes =
    candidate.attributes && typeof candidate.attributes === "object"
      ? (candidate.attributes as Record<string, unknown>)
      : {};
  for (const field of definition?.fields ?? []) {
    const { value, issue } = coerceField(field, rawAttributes[field.key]);
    if (issue) issues.push(issue);
    if (value !== null) attributes[field.key] = value;
  }

  const lat = typeof common.lat === "number" ? common.lat : null;
  const lng = typeof common.lng === "number" ? common.lng : null;
  if (lat !== null && lng !== null) {
    if (!isInAustralia(lat, lng)) {
      issues.push({
        field: "lat",
        code: "country",
        message: "That coordinate is outside Australia. Check the latitude and longitude order.",
      });
    }
  }

  if (issues.length > 0 || !definition || lat === null || lng === null) {
    return { ok: false, issues, record: null };
  }

  return {
    ok: true,
    issues: [],
    record: {
      id: typeof candidate.id === "string" && /^[a-z0-9-]{8,64}$/i.test(candidate.id)
        ? candidate.id
        : createRecordId(),
      schemaVersion: SCHEMA_VERSION,
      category: definition.id,
      name: String(common.name),
      description: typeof common.description === "string" ? common.description : null,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      address: typeof common.address === "string" ? common.address : null,
      suburb: typeof common.suburb === "string" ? common.suburb : null,
      council: typeof common.council === "string" ? common.council : null,
      attributes,
      provenance: normaliseProvenance(candidate.provenance),
      createdAt: typeof candidate.createdAt === "string" && !Number.isNaN(Date.parse(candidate.createdAt))
        ? new Date(candidate.createdAt).toISOString()
        : new Date().toISOString(),
    },
  };
}

function normaliseProvenance(raw: unknown): ContributionProvenance {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const licence = LICENCES.find((entry) => entry.value === source.licence)?.value ?? "cc-by-4.0";
  const text = (value: unknown, max: number): string | null => {
    if (typeof value !== "string") return null;
    const cleaned = cleanText(value);
    return cleaned ? cleaned.slice(0, max) : null;
  };
  const email = text(source.contact, 200);
  const observedAt = text(source.observedAt, 10);
  return {
    method: source.method === "import" ? "import" : "manual",
    format: text(source.format, 40) ?? "manual",
    contributor: text(source.contributor, 120),
    contact: email && EMAIL.test(email) ? email : null,
    sourceUrl:
      typeof source.sourceUrl === "string" && isHttpUrl(source.sourceUrl)
        ? source.sourceUrl.slice(0, 500)
        : null,
    photoUrl:
      typeof source.photoUrl === "string" && isHttpUrl(source.photoUrl)
        ? source.photoUrl.slice(0, 500)
        : null,
    observedAt: observedAt && isIsoDate(observedAt) ? observedAt : null,
    licence,
    originalFields:
      source.originalFields && typeof source.originalFields === "object"
        ? Object.fromEntries(
            Object.entries(source.originalFields as Record<string, unknown>)
              .filter((entry): entry is [string, string] => typeof entry[1] === "string")
              .slice(0, 60)
              .map(([key, value]) => [cleanText(key).slice(0, 80), cleanText(value).slice(0, 400)]),
          )
        : null,
  };
}

/** Opaque id for a client-created record. */
export function createRecordId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `pp-${random}`;
}

export type DuplicateKind = "same" | "near";

export interface DuplicateMatch {
  /** The existing record this submission resembles. */
  existingName: string;
  existingCategory: CategoryId | string;
  distanceM: number | null;
  kind: DuplicateKind;
}

/**
 * Duplicate rules, deterministic and documented:
 *  - `same`: normalised name equal AND within 40 m (or identical coordinates).
 *  - `near`: within 25 m regardless of name, which catches the same bench or
 *    fountain recorded under a different label.
 * A different category at the same coordinate is reported, not blocked: two
 * amenities can legitimately share a point.
 */
export function findDuplicate(
  record: { name: string; category: string; lat: number; lng: number },
  candidates: readonly {
    name: string;
    category: string;
    lat: number;
    lng: number;
  }[],
): DuplicateMatch | null {
  const recordName = normaliseName(record.name);
  let best: DuplicateMatch | null = null;
  for (const candidate of candidates) {
    const distance = metresBetween(record.lat, record.lng, candidate.lat, candidate.lng);
    if (distance > 60) continue;
    const sameName =
      recordName.length > 1 && recordName === normaliseName(candidate.name);
    const kind: DuplicateKind | null = sameName && distance <= 40 ? "same" : distance <= 25 ? "near" : null;
    if (!kind) continue;
    if (candidate.category !== record.category) continue;
    if (!best || distance < (best.distanceM ?? Infinity)) {
      best = {
        existingName: candidate.name,
        existingCategory: candidate.category,
        distanceM: Math.round(distance),
        kind,
      };
    }
  }
  return best;
}

/** Equirectangular distance in metres — accurate enough at park scale. */
export function metresBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earth = 6_371_000;
  const toRad = Math.PI / 180;
  const x = (lng2 - lng1) * toRad * Math.cos(((lat1 + lat2) / 2) * toRad);
  const y = (lat2 - lat1) * toRad;
  return Math.sqrt(x * x + y * y) * earth;
}

/** Canonical record → GeoJSON feature, with provenance preserved as properties. */
export function toFeature(record: PlaceRecord): {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
} {
  return {
    type: "Feature",
    id: record.id,
    geometry: { type: "Point", coordinates: [record.lng, record.lat] },
    properties: {
      id: record.id,
      schemaVersion: record.schemaVersion,
      category: record.category,
      categoryLabel: categoryLabel(record.category),
      name: record.name,
      description: record.description,
      address: record.address,
      suburb: record.suburb,
      council: record.council,
      attributes: record.attributes,
      provenance: record.provenance,
      createdAt: record.createdAt,
    },
  };
}
