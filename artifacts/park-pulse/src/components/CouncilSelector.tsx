import { useEffect, useMemo, useRef, useState } from "react";
import {
  councilColor,
  filterCouncils,
  resolveCouncilQuery,
  sortCouncils,
  type CouncilIndexEntry,
  type CouncilMode,
} from "../utils/councils";

/**
 * Council picker for FR1.1–1.3.
 *
 * Hand-built with `pp-*` classes (Explore ships no shadcn markup) but it
 * follows the Radix Select / WAI-ARIA listbox contract it was measured
 * against: the trigger is a combobox owning a listbox popup, Arrow keys and
 * Home/End move the active option, Enter/Space select it, Esc closes and
 * returns focus to the trigger, typing in the popup's search field filters by
 * display name / raw name / lga_id and the active option is announced via
 * aria-activedescendant.
 */
export interface CouncilSelectorProps {
  /** Raw index entries; the component sorts them (priority first). */
  entries: CouncilIndexEntry[];
  status: "loading" | "ready" | "error";
  selectedIds: string[];
  mode: CouncilMode;
  onModeChange: (mode: CouncilMode) => void;
  onChange: (ids: string[]) => void;
}

export default function CouncilSelector({
  entries,
  status,
  selectedIds,
  mode,
  onModeChange,
  onChange,
}: CouncilSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const sorted = useMemo(() => sortCouncils(entries), [entries]);
  const visible = useMemo(() => filterCouncils(sorted, query), [sorted, query]);
  const disabled = status !== "ready" || entries.length === 0;

  const selectedEntries = useMemo(
    () =>
      selectedIds
        .map(id => sorted.find(e => e.lga_id === id))
        .filter((e): e is CouncilIndexEntry => Boolean(e)),
    [selectedIds, sorted],
  );

  const triggerLabel = useMemo(() => {
    if (status === "loading") return "Loading councils…";
    if (status === "error") return "Council index unavailable";
    if (selectedEntries.length === 0) return "All councils (network-wide)";
    if (selectedEntries.length === 1) return selectedEntries[0].display_name;
    return `${selectedEntries.length} councils selected`;
  }, [selectedEntries, status]);

  // Close on outside pointer-down (the equivalent of Radix's
  // onPointerDownOutside), restoring focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Focus the popup search field when the popup opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the active option visible (aria-activedescendant follows the view).
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const close = (returnFocus = true) => {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  };

  const toggleOpen = () => {
    if (disabled) return;
    if (open) close();
    else {
      setActiveIndex(0);
      setOpen(true);
    }
  };

  const pick = (entry: CouncilIndexEntry) => {
    const id = entry.lga_id;
    if (mode === "multi") {
      onChange(
        selectedIds.includes(id)
          ? selectedIds.filter(x => x !== id)
          : [...selectedIds, id],
      );
      // Multi mode keeps the popup open so several councils can be picked
      // in one interaction; single mode closes on selection.
      setQuery("");
      setActiveIndex(0);
      return;
    }
    onChange(selectedIds[0] === id ? [] : [id]);
    close();
  };

  const commitQuery = () => {
    // Enter with no usable match still resolves the PRD aliases
    // (Sydney → City of Sydney, Hornsby → …, Ku-ring-gai → …).
    const hit =
      visible[activeIndex] ?? resolveCouncilQuery(query, sorted) ?? null;
    if (hit) pick(hit);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(i => Math.min(i + 1, Math.max(visible.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(visible.length - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commitQuery();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (query) setQuery("");
      else close();
    }
  };

  // Reset the active cursor when the filter changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  return (
    <div className="pp-council-selector" ref={wrapRef}>
      <div className="pp-council-head">
        <span className="pp-council-label" id="pp-council-label">
          Council
        </span>
        <div className="pp-council-modes" role="group" aria-label="Selection mode">
          <button
            type="button"
            className={`pp-council-mode${mode === "single" ? " active" : ""}`}
            aria-pressed={mode === "single"}
            disabled={disabled}
            onClick={() => {
              onModeChange("single");
              // Single mode can only ever hold one council.
              if (selectedIds.length > 1) onChange(selectedIds.slice(0, 1));
            }}
          >
            Single
          </button>
          <button
            type="button"
            className={`pp-council-mode${mode === "multi" ? " active" : ""}`}
            aria-pressed={mode === "multi"}
            disabled={disabled}
            onClick={() => onModeChange("multi")}
          >
            Multi
          </button>
        </div>
      </div>

      <button
        type="button"
        ref={triggerRef}
        className="pp-council-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="pp-council-listbox"
        aria-label="Select a council"
        disabled={disabled}
        onClick={toggleOpen}
        onKeyDown={event => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setActiveIndex(0);
            setOpen(true);
          }
        }}
      >
        <span className="pp-council-trigger-text">{triggerLabel}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="pp-council-pop" role="presentation">
          <input
            ref={inputRef}
            type="text"
            className="pp-council-search"
            placeholder="Filter councils…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded
            aria-controls="pp-council-listbox"
            aria-autocomplete="list"
            aria-label="Filter councils"
            aria-activedescendant={
              visible[activeIndex] ? `pp-council-opt-${activeIndex}` : undefined
            }
            autoComplete="off"
          />
          <ul
            id="pp-council-listbox"
            ref={listRef}
            className="pp-council-list"
            role="listbox"
            aria-labelledby="pp-council-label"
          >
            {visible.length === 0 && (
              <li className="pp-council-empty" role="presentation">
                No councils match “{query}”.
              </li>
            )}
            {visible.map((entry, index) => {
              const isSelected = selectedIds.includes(entry.lga_id);
              return (
                <li
                  key={entry.lga_id}
                  id={`pp-council-opt-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  className={`pp-council-option${index === activeIndex ? " active" : ""}${
                    isSelected ? " selected" : ""
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={event => {
                    // mousedown, not click: closes before focus moves.
                    event.preventDefault();
                    pick(entry);
                  }}
                >
                  <span
                    className="pp-council-dot"
                    style={{ background: councilColor(entry.lga_id) }}
                    data-lga={entry.lga_id}
                    aria-hidden="true"
                  />
                  <span className="pp-council-name">{entry.display_name}</span>
                  {entry.priority && (
                    <span className="pp-council-badge" title="Priority council">
                      Priority
                    </span>
                  )}
                  {isSelected && (
                    <svg
                      className="pp-council-check"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="pp-council-pop-foot">
            {selectedIds.length > 0 ? (
              <button type="button" className="pp-council-clear" onClick={() => { onChange([]); close(); }}>
                Clear selection
              </button>
            ) : (
              <span>Click a council to scope results</span>
            )}
          </div>
        </div>
      )}

      {status === "error" && (
        <p className="pp-council-error" role="status">
          Council index failed to load — controls disabled.
        </p>
      )}
    </div>
  );
}
