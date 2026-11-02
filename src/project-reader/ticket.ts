import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ifExists } from "../fs.ts";
import { type NormalisedStatus, normaliseStatus, type TriageLabels } from "./status.ts";

export type TicketWarning =
  | { kind: "heading-number-mismatch"; heading: string; filename: string }
  | { kind: "heading-without-number"; heading: string }
  | { kind: "status-line-empty" }
  | { kind: "blocked-by-unparseable"; line: string }
  | { kind: "unreadable"; message: string };

// Blockers are named by Ticket file, like Ticket links, so two files sharing a
// number stay distinct.
export type Ticket = {
  file: string;
  number: number;
  title: string;
  status?: string;
  normalisedStatus: NormalisedStatus;
  blockers: string[];
  brokenBlockers: string[];
  source: string;
  warnings: TicketWarning[];
};

const TICKET_FILE = /^(\d+)-(.+)\.md$/;
const HEADING = /^# (.+)$/m;
const NUMBERED_TITLE = /^(\d+):\s*(.*)$/;
const STATUS_LINE = /^(?:\*\*status:\*\*|\*\*status\*\*:|status:)[ \t]*(.*)$/im;
const BLOCKED_BY_LINE = /^(?:\*\*blocked by:\*\*|\*\*blocked by\*\*:|blocked by:)[ \t]*(.*)$/im;
// Prose after "None" or "nothing" may still name Tickets, so it is not read.
const NO_BLOCKERS = /^(?:(?:none|nothing|n\/a)\b|\(none\)|-$)/i;
// A number alone, or followed by its title as in `01: Title`, `01 - Title` or
// `#01 (Title)`. The number alone decides which Tickets it names.
const NUMBER_ENTRY = /^#?(\d+)(?:\s*[:(].*|\s+-\s+.*)?$/;
// A number then text, as in `#01 Title`, names a Ticket only when the text is
// that Ticket's title, so `01 and 02` is not read as 01.
const NUMBER_THEN_TITLE = /^#?(\d+)\s+(.+)$/;
// Sentence breaks and links mark an entry as prose rather than a number or title.
const PROSE = /;|[.!?]\s|https?:\/\/|\]\(/;

// A Ticket as read from its own file, before its Blockers are resolved
// against the other Tickets in the Feature.
type ParsedTicket = Omit<Ticket, "blockers" | "brokenBlockers"> & { blockedBy?: string };

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
): ParsedTicket {
  const header = headerOf(source);
  const heading = HEADING.exec(header)?.[1].trim();
  const numbered = heading === undefined ? undefined : NUMBERED_TITLE.exec(heading);
  const statusLine = STATUS_LINE.exec(header)?.[1].trim();
  const status = statusLine || undefined;
  const blockedBy = BLOCKED_BY_LINE.exec(header)?.[1].trim();
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
    blockedBy,
    source,
    warnings,
  };
}

const sameTitle = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// An entry names every other Ticket with its number, file name or title, so a
// number shared by two files links to both. An entry that is prose, or that
// starts with a number but names no Ticket, is left out and the whole line is
// flagged, since the graph may be missing an edge. A Ticket never blocks itself.
function resolveBlockers({ blockedBy, ...ticket }: ParsedTicket, tickets: ParsedTicket[]): Ticket {
  const others = tickets.filter((other) => other.file !== ticket.file);
  const blockers: string[] = [];
  const brokenBlockers: string[] = [];
  let unparseable = blockedBy === "";
  const line = (blockedBy ?? "").replaceAll("`", "").replaceAll("**", "");
  for (const raw of NO_BLOCKERS.test(line) ? [] : line.split(",")) {
    const entry = raw.trim().replace(/\.$/, "");
    if (entry === "") continue;
    if (PROSE.test(entry)) {
      unparseable = true;
      continue;
    }
    const numbered = NUMBER_ENTRY.exec(entry);
    const titled = NUMBER_THEN_TITLE.exec(entry);
    const named = numbered
      ? others.filter((other) => other.number === Number(numbered[1]))
      : others.filter(
          (other) =>
            other.file === entry ||
            sameTitle(other.title, entry) ||
            (titled !== null && other.number === Number(titled[1]) && sameTitle(other.title, titled[2])),
        );
    for (const blocker of named) {
      if (!blockers.includes(blocker.file)) blockers.push(blocker.file);
    }
    if (named.length > 0) continue;
    if (!numbered && /^#?\d/.test(entry)) unparseable = true;
    else brokenBlockers.push(entry);
  }
  const warnings: TicketWarning[] = unparseable
    ? [...ticket.warnings, { kind: "blocked-by-unparseable", line: blockedBy ?? "" }]
    : ticket.warnings;
  return { ...ticket, blockers, brokenBlockers, warnings };
}

function unreadableTicket({ file, number, slug }: TicketName, message: string): ParsedTicket {
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
  const tickets: ParsedTicket[] = [];
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
  tickets.sort((a, b) => a.number - b.number || a.file.localeCompare(b.file));
  return tickets.map((ticket) => resolveBlockers(ticket, tickets));
}
