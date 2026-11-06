// The colour scheme the dev chose. Auto follows the OS.
export type Theme = "light" | "dark" | "auto";

// The cookie that keeps the choice, so the server renders the page in it.
export const THEME_COOKIE = "backscratcher-theme";

// A cookie that names no theme, such as one edited by hand, reads as auto, so
// only a known theme ever reaches the page.
export function themeFromCookie(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "auto";
}

// The class on <html> that applies a theme. Auto has none, so the page
// follows the OS.
export function themeClass(theme: Theme): string | undefined {
  return theme === "auto" ? undefined : theme;
}
