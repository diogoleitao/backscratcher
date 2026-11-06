"use client";

import { useState } from "react";
import { THEME_COOKIE, type Theme, themeClass } from "./theme.ts";

const CHOICES: [Theme, string][] = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["auto", "Auto"],
];

const ONE_YEAR_S = 60 * 60 * 24 * 365;

// Switches the page at once and keeps the choice in a cookie, so the next
// page the server renders is already in it.
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState(initial);
  const choose = (next: Theme) => {
    setTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_S}; samesite=lax`;
    // The layout gives <html> no other class, so this matches what the server
    // renders for the new cookie.
    document.documentElement.className = themeClass(next) ?? "";
  };
  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex rounded-md border border-border bg-canvas p-0.5 text-sm"
    >
      {CHOICES.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => choose(value)}
          className="cursor-pointer rounded px-3 py-0.5 text-fg-muted hover:text-fg aria-pressed:bg-button-hover aria-pressed:font-medium aria-pressed:text-fg"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
