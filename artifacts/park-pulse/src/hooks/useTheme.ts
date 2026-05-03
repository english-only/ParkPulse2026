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

function storedTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme) || "default";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

// Apply immediately on first import (no flash)
applyTheme(storedTheme());

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(storedTheme);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      setThemeState((e as CustomEvent<Theme>).detail);
    };
    window.addEventListener(THEME_EVENT, handler);
    return () => window.removeEventListener(THEME_EVENT, handler);
  }, []);

  return { theme, setTheme };
}
