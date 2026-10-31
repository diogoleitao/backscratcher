import type { Ticket } from "../project-reader/project-reader.ts";

// The normalised Status as shown to the dev, keeping the raw text of a value
// the app does not recognise.
export function statusText({ status, normalisedStatus }: Ticket): string {
  switch (normalisedStatus) {
    case "none":
      return "No status";
    case "other":
      return `Other: ${status}`;
    default:
      return normalisedStatus;
  }
}

// The raw Status to show next to statusText, unless statusText already
// includes it.
export function rawStatusBeside({ status, normalisedStatus }: Ticket): string | undefined {
  return normalisedStatus === "other" ? undefined : status;
}
