import type { Ticket } from "../project-reader/project-reader.ts";
import { statusText } from "./status-text.ts";
import { statusTone } from "./tones.ts";
import { Pill } from "./ui.tsx";

export function StatusPill({ ticket }: { ticket: Ticket }) {
  return <Pill className={statusTone(ticket.normalisedStatus).pill}>{statusText(ticket)}</Pill>;
}
