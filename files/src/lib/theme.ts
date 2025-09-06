// src/lib/theme.ts
export type ThemeMode = "light" | "dark" | "system";

/**
 * Asettaa dokumentin teeman: light/dark tai järjestelmän mukaan.
 * Ei heitä virheitä – toimii myös SSR:ssa guardien ansiosta.
 */
export function applyTheme(mode: ThemeMode) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  try {
    localStorage.setItem("soili-theme", mode);
  } catch {
    // ignore storage errors
  }
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  const eff = mode === "system" ? (prefersDark ? "dark" : "light") : mode;
  const c = document.documentElement.classList;
  c.remove("light","dark");
  c.add(eff);
}
