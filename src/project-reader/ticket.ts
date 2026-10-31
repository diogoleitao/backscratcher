import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ifExists } from "../fs.ts";
import type { PullRequest } from "./referenced-prs.ts";

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
  source: string;
  warnings: TicketWarning[];
  referencedPrs: PullRequest[];
};

export type ParsedTicket = Omit<Ticket, "referencedPrs">;

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

function parseTicket({ file, number, slug }: TicketName, source: string): ParsedTicket {
  const header = headerOf(source);
  const heading = HEADING.exec(header)?.[1].trim();
  const numbered = heading === undefined ? undefined : NUMBERED_TITLE.exec(heading);
  const status = STATUS_LINE.exec(header)?.[1].trim();
  const warnings: TicketWarning[] = [];
  if (status === "") warnings.push({ kind: "status-line-empty" });
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
    status: status || undefined,
    source,
    warnings,
  };
}

function unreadableTicket({ file, number, slug }: TicketName, message: string): ParsedTicket {
  return {
    file,
    number: Number(number),
    title: slug,
    source: "",
    warnings: [{ kind: "unreadable", message }],
  };
}

// Tickets are the NN-<slug>.md files in a Feature's issues/ folder.
export async function readTickets(featurePath: string): Promise<ParsedTicket[]> {
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
    if (source !== undefined) tickets.push(parseTicket(name, source));
  }
  return tickets.sort((a, b) => a.number - b.number || a.file.localeCompare(b.file));
}
