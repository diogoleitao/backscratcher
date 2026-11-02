import { Fragment } from "react";
import type { TicketWarning } from "../project-reader/project-reader.ts";

function describe(warning: TicketWarning): string {
  switch (warning.kind) {
    case "heading-number-mismatch":
      return `Heading says #${warning.heading} but the filename says #${warning.filename}`;
    case "heading-without-number":
      return `Heading "${warning.heading}" has no Ticket number`;
    case "status-line-empty":
      return "Status line is empty";
    case "blocked-by-unparseable":
      return warning.line === ""
        ? "Blocked by line is empty"
        : `Blocked by line "${warning.line}" is not all Ticket numbers or titles; the graph may be missing an edge`;
    case "unreadable":
      return `Could not read the file: ${warning.message}`;
  }
}

export function WarningBadges({ warnings }: { warnings: TicketWarning[] }) {
  return warnings.map((warning, index) => (
    <Fragment key={index}>
      {index > 0 && " "}
      <mark>⚠ {describe(warning)}</mark>
    </Fragment>
  ));
}
