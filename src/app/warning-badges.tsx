import type { TicketWarning } from "../project-reader/project-reader.ts";

function describe(warning: TicketWarning): string {
  switch (warning.kind) {
    case "heading-number-mismatch":
      return `Heading says #${warning.heading} but the filename says #${warning.filename}`;
    case "heading-without-number":
      return `Heading "${warning.heading}" has no Ticket number`;
    case "status-line-empty":
      return "Status line is empty";
    case "unreadable":
      return `Could not read the file: ${warning.message}`;
  }
}

export function WarningBadges({ warnings }: { warnings: TicketWarning[] }) {
  return warnings.map((warning, index) => <mark key={index}>⚠ {describe(warning)}</mark>);
}
