import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ifExists } from "../fs.ts";
import { type NormalisedStatus, normaliseStatus, type TriageLabels } from "./status.ts";

export type TicketWarning =
  | { kind: "heading-number-mismatch"; heading: string; filename: string }
  | { kind: "heading-without-number"; heading: string }
  | { kind: "status-line-empty" }
  | { kind: "unreadable"; message: string };

export type Ticket = {
  file: string;
  number: number;
  title: string;
  status?: string;
  normalisedStatus: NormalisedStatus;
  source: string;
  warnings: TicketWarning[];
};

const TICKET_FILE = /^(\d+)-(.+)\.md$/;
const HEADING = /^# (.+)$/m;
const NUMBERED_TITLE = /^(\d+):\s*(.*)$/;
const STATUS_LINE = /^(?:\*\*status:\*\*|\*\*status\*\*:|status:)[ \t]*(.*)$/im;

type TicketName = { file: string; number: string; slug: string };

// The header is everything above the first ## section, so a heading or Status
// quoted in the body or in ## Comments is not read as the Ticket's own.
function headerOf(source: string): string {
  const section = /^## /m.exec(source);
  return section ? source.slice(0, section.index) : source;
}

function parseTicket(
  { file, number, slug }: TicketName,
  source: string,
  labels: TriageLabels,
): Ticket {
  const header = headerOf(source);
  const heading = HEADING.exec(header)?.[1].trim();
  const numbered = heading === undefined ? undefined : NUMBERED_TITLE.exec(heading);
  const statusLine = STATUS_LINE.exec(header)?.[1].trim();
  const status = statusLine || undefined;
  const warnings: TicketWarning[] = [];
  if (statusLine === "") warnings.push({ kind: "status-line-empty" });
  if (heading !== undefined && !numbered) {
    warnings.push({ kind: "heading-without-number", heading });
  }
  if (numbered && Number(numbered[1]) !== Number(number)) {
    warnings.push({ kind: "heading-number-mismatch", heading: numbered[1], filename: number });
  }
  return {
    file,
    number: Number(number),
    title: numbered?.[2].trim() || slug,
    status,
    normalisedStatus: normaliseStatus(status, labels),
    source,
    warnings,
  };
}

function unreadableTicket({ file, number, slug }: TicketName, message: string): Ticket {
  return {
    file,
    number: Number(number),
    title: slug,
    normalisedStatus: "none",
    source: "",
    warnings: [{ kind: "unreadable", message }],
  };
}

// Tickets are the NN-<slug>.md files in a Feature's issues/ folder.
export async function readTickets(featurePath: string, labels: TriageLabels): Promise<Ticket[]> {
  const issuesPath = path.join(featurePath, "issues");
  const tickets: Ticket[] = [];
  for (const file of (await ifExists(readdir(issuesPath))) ?? []) {
    const match = TICKET_FILE.exec(file);
    if (!match) continue;
    const ticketPath = path.join(issuesPath, file);
    if (!(await ifExists(stat(ticketPath)))?.isFile()) continue;
    const name = { file, number: match[1], slug: match[2] };
    let source: string | undefined;
    try {
      source = await ifExists(readFile(ticketPath, "utf8"));
    } catch (error) {
      tickets.push(unreadableTicket(name, (error as Error).message));
      continue;
    }
    if (source !== undefined) tickets.push(parseTicket(name, source, labels));
  }
  return tickets.sort((a, b) => a.number - b.number || a.file.localeCompare(b.file));
}
