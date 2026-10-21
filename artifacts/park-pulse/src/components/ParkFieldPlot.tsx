import { useEffect, useMemo, useState } from "react";
import {
  countPlateTypes,
  describePlate,
  groupPlateParks,
  parseHeroPlate,
  scaleBarMetres,
  scaleBarPercent,
  type HeroPlate,
} from "../utils/heroPlate";

const BASE = import.meta.env.BASE_URL;

type PlateState =
  | { status: "loading" }
  | { status: "ready"; plate: HeroPlate }
  | { status: "error" };

/**
 * The hero plate — every park area in the City of Sydney layer, drawn as its
 * own outline from `public/data/hero-plate.json`.
 *
 * This is a plate, not a scatter: the shape on screen is the real boundary of
 * each park, projected once at build time, so nothing can sit somewhere its
 * polygon does not reach. The drawing is decorative to a screen reader
 * (`aria-hidden`); the key below is the control surface. Choosing a type
 * isolates it in its palette colour and states how many areas it covers.
 */
export default function ParkFieldPlot() {
  const [state, setState] = useState<PlateState>({ status: "loading" });
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${BASE}data/hero-plate.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`hero-plate responded ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((raw) => {
        const plate = parseHeroPlate(raw);
        if (!plate) throw new Error("hero-plate is not a usable drawing");
        setState({ status: "ready", plate });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  const plate = state.status === "ready" ? state.plate : null;

  const groups = useMemo(() => (plate ? groupPlateParks(plate) : []), [plate]);
  const counts = useMemo(() => (plate ? countPlateTypes(plate) : []), [plate]);
  const barMetres = useMemo(() => (plate ? scaleBarMetres(plate) : null), [plate]);

  const activeIndex = active !== null && plate && active < plate.types.length ? active : null;
  const activeCount = activeIndex !== null ? counts[activeIndex] : null;

  return (
    <figure className="fa-field" data-active={activeIndex !== null ? "" : undefined}>
      <div className="fa-field-head">
        <span>
          {plate ? (
            <>
              <strong>{plate.parks.length.toLocaleString("en-AU")}</strong> park areas in this map
            </>
          ) : (
            "Park areas in this build"
          )}
        </span>
        <span className="fa-numeric">City of Sydney</span>
      </div>

      <div className="fa-field-plot">
        {state.status === "loading" && (
          <div className="fa-field-placeholder" role="status" aria-live="polite">
            <span className="pp-visually-hidden">Loading the park plate</span>
          </div>
        )}

        {state.status === "error" && (
          <p className="fa-field-placeholder fa-field-placeholder--text">
            The park drawing did not load. Every record is still in Explore.
          </p>
        )}

        {plate && barMetres !== null && (
          /* Cartographic furniture, not content: the caption already states the
             drawing is to scale, and the figure is decorative to a screen
             reader. */
          <div className="fa-field-scale" aria-hidden="true">
            <span className="fa-numeric">
              {barMetres >= 1000 ? `${barMetres / 1000} km` : `${barMetres} m`}
            </span>
            <span
              className="fa-field-scale-rule"
              style={{ width: `${scaleBarPercent(plate, barMetres)}%` }}
            />
          </div>
        )}

        {plate && (
          <svg
            viewBox={`0 0 ${plate.viewBox[0]} ${plate.viewBox[1]}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            focusable="false"
          >
            {groups.map((group, index) => (
              <g
                key={group.type.label}
                className="fa-field-group"
                data-on={
                  activeIndex === null || activeIndex === index ? "true" : "false"
                }
                style={{ color: group.type.color }}
              >
                {group.parks.map((park, parkIndex) =>
                  park.paths.map((path, pathIndex) => (
                    <path key={`${parkIndex}-${pathIndex}`} d={path} />
                  )),
                )}
              </g>
            ))}
          </svg>
        )}
      </div>

      <figcaption className="fa-field-caption">
        <span aria-live="polite">
          {activeIndex !== null && activeCount !== null && plate
            ? `${activeCount.toLocaleString("en-AU")} of ${plate.parks.length.toLocaleString("en-AU")} park areas are ${plate.types[activeIndex].label}`
            : plate
              ? describePlate()
              : "Park boundaries from the served layer"}
        </span>
        <span>Parks.geojson</span>
      </figcaption>

      {plate && (
        <div className="fa-field-key" role="group" aria-label="Highlight park areas by type">
          <button
            type="button"
            aria-pressed={activeIndex === null}
            onClick={() => setActive(null)}
          >
            All types
            <span className="fa-numeric">{plate.parks.length.toLocaleString("en-AU")}</span>
          </button>
          {plate.types.map((type, index) => (
            <button
              key={type.label}
              type="button"
              aria-pressed={activeIndex === index}
              onClick={() => setActive(activeIndex === index ? null : index)}
            >
              <span className="fa-field-swatch" style={{ color: type.color }} aria-hidden="true" />
              {type.label}
              <span className="fa-numeric">{counts[index].toLocaleString("en-AU")}</span>
            </button>
          ))}
        </div>
      )}
    </figure>
  );
}
