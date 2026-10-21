import { useCallback, useEffect, useState } from "react";

/**
 * UI themes. The product ships exactly two (PRD §8.1):
 *
 *   warm  — Warm Field: warm near-white canvas, deep forest green.
 *   night — Night Field: near-black canvas, emerald action colour.
 *
 * Map basemaps are deliberately *not* themes: choosing satellite imagery is a
 * map style, handled by Explore's own `basemap` state. The theme toggle only
 * changes the interface palette.
 */
export type Theme = "warm" | "night";

/** Icon names, not glyphs: the switch draws line icons so both options render
 *  at the same weight on every platform. */
export type ThemeIcon = "sun" | "moon";

export const THEMES: { id: Theme; label: string; description: string; icon: ThemeIcon }[] = [
  {
    id: "warm",
    label: "Warm Field",
    description: "Warm paper surfaces with deep forest green",
    icon: "sun",
  },
  {
    id: "night",
    label: "Night Field",
    description: "Near-black surfaces with bright emerald",
    icon: "moon",
  },
];

const STORAGE_KEY = "parkpulse_theme";
const THEME_EVENT = "parkpulse:themechange";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Theme ids that earlier builds wrote to storage, plus the ad-hoc values the
 * old contrast tests set on <html>. A stored choice must never strand the app
 * on a theme that no longer exists.
 */
const LEGACY_THEMES: Record<string, Theme> = {
  default: "warm",
  light: "warm",
  minimal: "warm",
  sunset: "warm",
  warm: "warm",
  dark: "night",
  neon: "night",
  satellite: "night",
  night: "night",
};

export function isTheme(value: unknown): value is Theme {
  return value === "warm" || value === "night";
}

/** Migrates a stored or externally supplied theme id, or returns null. */
export function migrateTheme(value: unknown): Theme | null {
  return typeof value === "string" ? (LEGACY_THEMES[value] ?? null) : null;
}

function systemTheme(): Theme {
  if (typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches) return "night";
  return "warm";
}

/**
 * The theme to start from: an explicit choice if one was made, otherwise the
 * operating system's colour-scheme preference, otherwise Warm Field.
 */
export function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const migrated = migrateTheme(stored);
    if (migrated) return migrated;
  } catch {
    // Private browsing can make localStorage unreadable; fall through to the
    // system preference rather than failing.
  }
  return systemTheme();
}

/** Browser chrome colour per theme — the page's own canvas, so the tab bar
 *  and the installed-app status bar continue the page instead of cutting it
 *  off with an unrelated brand colour. */
const THEME_COLOUR: Record<Theme, string> = {
  warm: "#F6F7F1",
  night: "#000000",
};

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  // Lets the browser style native form controls and scrollbars to match.
  root.style.colorScheme = theme;
  // Keep the mobile browser / installed-app chrome in step with the theme.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOUR[theme];
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
}

/**
 * Applies the resolved theme to the document as early as possible. Called from
 * the entry point rather than at module scope, so importing this module has no
 * side effects and the theme attribute is set exactly once.
 */
export function applyInitialTheme(): void {
  applyTheme(initialTheme());
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      console.warn("[theme] could not persist theme choice:", next);
    }
    applyTheme(next);
  }, []);

  /** Flips between the two themes; used by the header toggle and the T key. */
  const toggleTheme = useCallback(() => {
    setTheme(theme === "warm" ? "night" : "warm");
  }, [theme, setTheme]);

  // Follow the OS while the visitor has not made an explicit choice.
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      let hasExplicitChoice = false;
      try {
        hasExplicitChoice = localStorage.getItem(STORAGE_KEY) != null;
      } catch {
        hasExplicitChoice = false;
      }
      if (hasExplicitChoice) return;
      const next: Theme = event.matches ? "night" : "warm";
      setThemeState(next);
      applyTheme(next);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Stay in step with other components that change the theme.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = migrateTheme((event as CustomEvent<Theme>).detail);
      if (detail) setThemeState(detail);
    };
    window.addEventListener(THEME_EVENT, handler);
    return () => window.removeEventListener(THEME_EVENT, handler);
  }, []);

  return { theme, setTheme, toggleTheme };
}
