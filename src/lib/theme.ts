"use client";

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "tikzard-theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return "system";
  }
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

export function applyTheme(theme: Theme): void {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
