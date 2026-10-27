import type { ReactNode } from "react";

export const metadata = {
  title: "Backscratcher",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Backscratcher</h1>
          {children}
        </main>
      </body>
    </html>
  );
}
