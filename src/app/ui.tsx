import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Shared presentational pieces, so each look is written once.

// A rounded label, coloured by a tone's pill classes.
export function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={`inline-block max-w-full rounded-full border px-2 py-0.5 align-middle text-xs leading-4 font-medium ${className}`}
    >
      {children}
    </span>
  );
}

// A button's text colour by variant. Danger marks one that removes something.
const BUTTON_TEXT = {
  default: "text-fg",
  danger: "text-danger",
};

// A GitHub-style button; it takes every prop a <button> does.
export function Button({
  variant = "default",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON_TEXT }) {
  return (
    <button
      className={`cursor-pointer rounded-md border border-border bg-button px-3 py-1 text-sm font-medium hover:bg-button-hover disabled:cursor-default disabled:opacity-60 ${BUTTON_TEXT[variant]}`}
      {...props}
    />
  );
}

// A bordered box, with an optional title bar. The title brings its own
// heading element, so each page keeps its heading levels.
export function Card({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-canvas">
      {title !== undefined && (
        <div className="border-b border-border bg-canvas-subtle px-4 py-2 text-sm font-semibold">
          {title}
        </div>
      )}
      {children}
    </section>
  );
}

// A page's title, under a link back to the page it was opened from.
export function PageHeader({
  back,
  title,
  children,
}: {
  back: { href: string; label: ReactNode };
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="space-y-1">
      <p className="text-sm">
        {/* The arrow is hidden from screen readers, so the link reads as its label alone. */}
        <Link href={back.href}>
          <span aria-hidden="true">← </span>
          {back.label}
        </Link>
      </p>
      <h3 className="text-xl font-semibold">{title}</h3>
      {children}
    </header>
  );
}

// A page-level error shown in place of the content that could not be shown.
export function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-danger/40 bg-danger-subtle px-4 py-3 text-sm text-danger"
    >
      {children}
    </p>
  );
}
