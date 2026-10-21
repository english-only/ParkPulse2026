import { useMemo, useState } from "react";
import {
  CATEGORIES,
  LICENCES,
  cleanText,
  getCategory,
  validatePlaceRecord,
  type PlaceRecord,
  type ValidationIssue,
} from "../../data/contribution/schema";
import { submitContributions, ApiError, ApiUnavailableError, type BatchSummaryResponse } from "../../utils/contributionsApi";
import MapCanvas from "./MapCanvas";

/**
 * Guided single-record form.
 *
 * Fields are generated from the category registry, so a category added to the
 * schema appears here with no change to this component. Validation is the
 * canonical validator the importer and the server also use; the form only
 * decides where to show the message.
 */

interface ManualFormProps {
  onSubmitted: (batch: BatchSummaryResponse) => void;
}

type Values = Record<string, string>;

const EMPTY = {
  name: "",
  description: "",
  lat: "",
  lng: "",
  address: "",
  suburb: "",
  council: "",
  sourceUrl: "",
  photoUrl: "",
  observedAt: "",
  contributor: "",
  contact: "",
  note: "",
  licence: "cc-by-4.0",
} as const;

function errorFor(issues: ValidationIssue[], field: string): string | undefined {
  return issues.find((issue) => issue.field === field)?.message;
}

export default function ManualForm({ onSubmitted }: ManualFormProps) {
  const [categoryId, setCategoryId] = useState("park");
  const [values, setValues] = useState<Values>({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);

  const category = getCategory(categoryId) ?? CATEGORIES[0];
  const lat = Number(values.lat);
  const lng = Number(values.lng);
  const hasCoordinate = values.lat.trim() !== "" && values.lng.trim() !== "" && Number.isFinite(lat) && Number.isFinite(lng);

  const pickerPoints = useMemo(
    () => (hasCoordinate ? [{ lat, lng, label: values.name || "New place" }] : []),
    [hasCoordinate, lat, lng, values.name],
  );

  function set(key: string, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setFormError("This browser does not provide a location. Enter the coordinates instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setValues((previous) => ({
          ...previous,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
        }));
        setFormError(null);
      },
      () => setFormError("Your location was not available. Enter the coordinates instead."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function buildRecord(): { record: PlaceRecord | null; issues: ValidationIssue[] } {
    const attributes: Record<string, string> = {};
    for (const field of category.fields) attributes[field.key] = values[field.key] ?? "";
    const result = validatePlaceRecord({
      category: categoryId,
      name: values.name,
      description: values.description,
      lat: values.lat,
      lng: values.lng,
      address: values.address,
      suburb: values.suburb,
      council: values.council,
      attributes,
      provenance: {
        method: "manual",
        format: "manual",
        contributor: values.contributor,
        contact: values.contact,
        sourceUrl: values.sourceUrl,
        photoUrl: values.photoUrl,
        observedAt: values.observedAt,
        licence: values.licence,
      },
    });
    return { record: result.record, issues: result.issues };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const { record, issues: found } = buildRecord();
    setIssues(found);
    if (!record) {
      document.getElementById("ct-form-errors")?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const response = await submitContributions([record], {
        contributor: cleanText(values.contributor),
        contact: cleanText(values.contact),
        note: cleanText(values.note),
        sourceFormat: "manual",
      });
      onSubmitted(response.batch);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setIssues(error.issues.map((issue) => ({ field: issue.field, code: "server", message: issue.message })));
      } else if (error instanceof ApiUnavailableError) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong while submitting. Your record was not sent.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="ct-form" onSubmit={handleSubmit} noValidate>
      <div className="ct-form-section">
        <h2 className="fa-h3">What are you adding?</h2>
        <div className="ct-field">
          <label htmlFor="ct-category">Category</label>
          <select
            id="ct-category"
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setIssues([]);
            }}
          >
            {CATEGORIES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
          <p className="ct-help">{category.description}</p>
        </div>

        <div className="ct-field">
          <label htmlFor="ct-name">
            Name <span className="ct-required">required</span>
          </label>
          <input
            id="ct-name"
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            maxLength={120}
            aria-invalid={Boolean(errorFor(issues, "name"))}
            aria-describedby={errorFor(issues, "name") ? "ct-name-error" : "ct-name-help"}
            autoComplete="off"
          />
          {errorFor(issues, "name") ? (
            <p className="ct-error" id="ct-name-error">{errorFor(issues, "name")}</p>
          ) : (
            <p className="ct-help" id="ct-name-help">The name on the sign, or the name people use for the place.</p>
          )}
        </div>

        <div className="ct-field">
          <label htmlFor="ct-description">Description</label>
          <textarea
            id="ct-description"
            rows={3}
            maxLength={600}
            value={values.description}
            onChange={(event) => set("description", event.target.value)}
            placeholder="What is here, and what should a visitor know?"
          />
          <p className="ct-help">Optional. Plain text only.</p>
        </div>
      </div>

      <div className="ct-form-section">
        <div className="ct-section-head">
          <h2 className="fa-h3">Where is it?</h2>
          <button type="button" className="fa-btn fa-btn--secondary fa-btn--small" onClick={useMyLocation}>
            Use my location
          </button>
        </div>

        <div className="ct-coord-row">
          <div className="ct-field">
            <label htmlFor="ct-lat">Latitude <span className="ct-required">required</span></label>
            <input
              id="ct-lat"
              inputMode="decimal"
              value={values.lat}
              onChange={(event) => set("lat", event.target.value)}
              placeholder="-33.8688"
              aria-invalid={Boolean(errorFor(issues, "lat"))}
            />
          </div>
          <div className="ct-field">
            <label htmlFor="ct-lng">Longitude <span className="ct-required">required</span></label>
            <input
              id="ct-lng"
              inputMode="decimal"
              value={values.lng}
              onChange={(event) => set("lng", event.target.value)}
              placeholder="151.2093"
              aria-invalid={Boolean(errorFor(issues, "lng"))}
            />
          </div>
        </div>
        {errorFor(issues, "lat") && <p className="ct-error">{errorFor(issues, "lat")}</p>}
        {errorFor(issues, "lng") && <p className="ct-error">{errorFor(issues, "lng")}</p>}
        <p className="ct-help">
          Decimal degrees, WGS84. Longitude is the east–west number (151° for Sydney); latitude is
          north–south (−33°). The map below sets both.
        </p>

        {showMap ? (
          <MapCanvas
            points={pickerPoints}
            onPick={(nextLat, nextLng) => {
              set("lat", nextLat.toFixed(6));
              set("lng", nextLng.toFixed(6));
            }}
            selectedIndex={hasCoordinate ? 0 : undefined}
            ariaLabel="Map for choosing the place's coordinate"
          />
        ) : (
          <button type="button" className="fa-btn fa-btn--secondary" onClick={() => setShowMap(true)}>
            Show the map
          </button>
        )}

        <div className="ct-grid-2">
          <div className="ct-field">
            <label htmlFor="ct-address">Street address</label>
            <input id="ct-address" value={values.address} onChange={(event) => set("address", event.target.value)} maxLength={200} />
          </div>
          <div className="ct-field">
            <label htmlFor="ct-suburb">Suburb</label>
            <input id="ct-suburb" value={values.suburb} onChange={(event) => set("suburb", event.target.value)} maxLength={80} />
          </div>
          <div className="ct-field">
            <label htmlFor="ct-council">Council</label>
            <input id="ct-council" value={values.council} onChange={(event) => set("council", event.target.value)} maxLength={120} />
          </div>
          <div className="ct-field">
            <label htmlFor="ct-observed">Date checked</label>
            <input
              id="ct-observed"
              type="date"
              value={values.observedAt}
              onChange={(event) => set("observedAt", event.target.value)}
            />
          </div>
        </div>
      </div>

      <fieldset className="ct-form-section ct-fieldset">
        <legend className="fa-h3">{category.label} details</legend>
        <p className="ct-help">Leave anything you do not know blank. Park Pulse will show it as not provided.</p>
        <div className="ct-grid-2">
          {category.fields.map((field) => {
            const error = errorFor(issues, field.key);
            const id = `ct-attr-${field.key}`;
            return (
              <div className="ct-field" key={field.key}>
                <label htmlFor={id}>{field.label}</label>
                {field.type === "boolean" ? (
                  <select id={id} value={values[field.key] ?? ""} onChange={(event) => set(field.key, event.target.value)}>
                    <option value="">Not recorded</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : field.type === "enum" ? (
                  <select id={id} value={values[field.key] ?? ""} onChange={(event) => set(field.key, event.target.value)}>
                    <option value="">Not recorded</option>
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    type={field.type === "number" ? "number" : "text"}
                    inputMode={field.type === "number" ? "decimal" : undefined}
                    value={values[field.key] ?? ""}
                    onChange={(event) => set(field.key, event.target.value)}
                    maxLength={field.maxLength}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-error` : field.help ? `${id}-help` : undefined}
                  />
                )}
                {error ? (
                  <p className="ct-error" id={`${id}-error`}>{error}</p>
                ) : field.help ? (
                  <p className="ct-help" id={`${id}-help`}>{field.help}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="ct-form-section">
        <h2 className="fa-h3">Evidence and credit</h2>
        <div className="ct-grid-2">
          <div className="ct-field">
            <label htmlFor="ct-source">Source link</label>
            <input
              id="ct-source"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={values.sourceUrl}
              onChange={(event) => set("sourceUrl", event.target.value)}
              maxLength={500}
            />
            <p className="ct-help">A council page, sign photo or dataset the record comes from.</p>
          </div>
          <div className="ct-field">
            <label htmlFor="ct-photo">Photo link</label>
            <input
              id="ct-photo"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={values.photoUrl}
              onChange={(event) => set("photoUrl", event.target.value)}
              maxLength={500}
            />
            <p className="ct-help">A public link to a photo. Files are not uploaded.</p>
          </div>
          <div className="ct-field">
            <label htmlFor="ct-contributor">Your name</label>
            <input id="ct-contributor" value={values.contributor} onChange={(event) => set("contributor", event.target.value)} maxLength={120} autoComplete="name" />
            <p className="ct-help">Shown as the credit if the record is published.</p>
          </div>
          <div className="ct-field">
            <label htmlFor="ct-contact">Contact email</label>
            <input
              id="ct-contact"
              type="email"
              value={values.contact}
              onChange={(event) => set("contact", event.target.value)}
              maxLength={200}
              autoComplete="email"
            />
            <p className="ct-help">Never published. Only used to ask about this submission.</p>
          </div>
          <div className="ct-field">
            <label htmlFor="ct-licence">Licence</label>
            <select id="ct-licence" value={values.licence} onChange={(event) => set("licence", event.target.value)}>
              {LICENCES.map((licence) => (
                <option key={licence.value} value={licence.value}>{licence.label}</option>
              ))}
            </select>
          </div>
          <div className="ct-field">
            <label htmlFor="ct-note">Note for reviewers</label>
            <input id="ct-note" value={values.note} onChange={(event) => set("note", event.target.value)} maxLength={1000} />
          </div>
        </div>
      </div>

      {formError && (
        <div className="ct-alert ct-alert--error" role="alert">
          {formError}
        </div>
      )}

      {issues.length > 0 && (
        <div className="ct-alert ct-alert--error" id="ct-form-errors" tabIndex={-1} role="alert">
          <strong>{issues.length} field{issues.length === 1 ? " needs" : "s need"} attention.</strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.field}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="ct-submit-row">
        <button type="submit" className="fa-btn fa-btn--primary" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit for review"}
        </button>
        <p className="ct-help">
          Nothing is published automatically. A reviewer checks the record against its source first.
        </p>
      </div>
    </form>
  );
}
