import { useEffect, useState, useCallback } from "react";

export type Theme = "default" | "dark" | "sunset" | "neon" | "minimal" | "satellite";

export const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: "default",   label: "Modern Green", icon: "🌿" },
  { id: "dark",      label: "Night Mode",   icon: "🌙" },
  { id: "sunset",    label: "Sunset",       icon: "🌅" },
  { id: "neon",      label: "Neon",         icon: "💻" },
  { id: "minimal",   label: "Minimal",      icon: "⬜" },
  { id: "satellite", label: "Satellite",    icon: "🛰️" },
];

const STORAGE_KEY = "parkpulse_theme";
const THEME_EVENT = "parkpulse:themechange";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * The theme to start from: an explicit choice if one was made, otherwise the
 * operating system's colour-scheme preference, otherwise the default.
 */
export function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored && THEMES.some((t) => t.id === stored)) return stored;
  } catch {
    // Private browsing can make localStorage unreadable; fall through to the
    // system preference rather than failing.
  }
  if (typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches) return "dark";
  return "default";
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
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

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      console.warn("[theme] could not persist theme choice:", t);
    }
    applyTheme(t);
  }, []);

  // Follow the OS when the user has not made an explicit choice.
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      let hasExplicitChoice = false;
      try {
        hasExplicitChoice = localStorage.getItem(STORAGE_KEY) != null;
      } catch {
        hasExplicitChoice = false;
      }
      if (hasExplicitChoice) return;
      const next: Theme = e.matches ? "dark" : "default";
      setThemeState(next);
      applyTheme(next);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Stay in step with other components that change the theme.
  useEffect(() => {
    const handler = (e: Event) => {
      setThemeState((e as CustomEvent<Theme>).detail);
    };
    window.addEventListener(THEME_EVENT, handler);
    return () => window.removeEventListener(THEME_EVENT, handler);
  }, []);

  return { theme, setTheme };
}