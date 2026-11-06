import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";
import { THEME_COOKIE, themeClass, themeFromCookie } from "./theme.ts";
import { ThemeToggle } from "./theme-toggle.tsx";

export const metadata = {
  title: "Backscratcher",
};

// The chosen theme is a class on <html> from the first byte, so the page never
// shows in the other one first. Auto sets no class and follows the OS.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = themeFromCookie((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" className={themeClass(theme)}>
      <body className="min-h-screen bg-canvas font-sans text-fg antialiased">
        <header className="border-b border-border bg-canvas-subtle">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <h1 className="text-lg font-semibold">Backscratcher</h1>
            <ThemeToggle initial={theme} />
          </div>
        </header>
        <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
