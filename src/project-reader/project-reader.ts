import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ifExists } from "../fs.ts";
import { TRIAGE_LABELS_FILE, triageLabels } from "./status.ts";
import { readTickets, type Ticket } from "./ticket.ts";

export type PullRequestRef = { repo: string; number: number };

export type PullRequest = PullRequestRef & {
  title: string;
  state: "open" | "draft" | "merged" | "closed";
  url: string;
};

export type PrLookup = (refs: PullRequestRef[]) => Promise<PullRequest[]>;

export type { NormalisedStatus } from "./status.ts";
export type { Ticket, TicketWarning } from "./ticket.ts";

export type Feature = { slug: string; spec: { source: string }; tickets: Ticket[] };

export type ProjectLevelPageKind = "glossary" | "adr" | "tracker" | "out-of-scope";

// A markdown file shown on its own page, identified by its path relative to
// the Project, with `/` as the separator.
export type ProjectLevelPage = {
  kind: ProjectLevelPageKind;
  path: string;
  source: string;
};

export type ProjectModel = {
  trackerFolder: { path: string; exists: boolean };
  features: Feature[];
  skipped: string[];
  pages: ProjectLevelPage[];
};

// The Tracker folder a Project without an override uses, relative to its folder.
export const DEFAULT_TRACKER_FOLDER = ".scratch";

type PageSource = { folder: string; accepts: (name: string) => boolean };

const isMarkdown = (name: string) => name.endsWith(".md");

// Where each kind of Project-level page is read from, as a folder relative to
// the Project. When two sources name the same file, the earlier one wins.
function pageSources(trackerFolder: string): Record<ProjectLevelPageKind, PageSource> {
  return {
    glossary: { folder: ".", accepts: (name) => name === "GLOSSARY.md" },
    adr: { folder: "docs/adr", accepts: isMarkdown },
    tracker: { folder: trackerFolder, accepts: isMarkdown },
    "out-of-scope": { folder: ".out-of-scope", accepts: isMarkdown },
  };
}

async function readFileIfPresent(filePath: string): Promise<string | undefined> {
  if (!(await ifExists(stat(filePath)))?.isFile()) return undefined;
  return readFile(filePath, "utf8");
}

async function readPages(projectPath: string, trackerPath: string): Promise<ProjectLevelPage[]> {
  const trackerFolder = path.relative(projectPath, trackerPath).split(path.sep).join("/") || ".";
  const pages: ProjectLevelPage[] = [];
  const sources = Object.entries(pageSources(trackerFolder)) as [ProjectLevelPageKind, PageSource][];
  for (const [kind, { folder, accepts }] of sources) {
    const names = (await ifExists(readdir(path.join(projectPath, folder)))) ?? [];
    for (const name of names.filter(accepts).sort((a, b) => a.localeCompare(b))) {
      const pagePath = path.posix.join(folder, name);
      if (pages.some((page) => page.path === pagePath)) continue;
      const source = await readFileIfPresent(path.join(projectPath, folder, name));
      if (source !== undefined) pages.push({ kind, path: pagePath, source });
    }
  }
  return pages;
}

export async function readProject(
  projectPath: string,
  options: { trackerFolder?: string; prLookup: PrLookup },
): Promise<ProjectModel> {
  const trackerPath = path.resolve(projectPath, options.trackerFolder ?? DEFAULT_TRACKER_FOLDER);
  const pages = await readPages(projectPath, trackerPath);
  const entries = await ifExists(readdir(trackerPath));
  if (entries === undefined) {
    return { trackerFolder: { path: trackerPath, exists: false }, features: [], skipped: [], pages };
  }
  const labels = triageLabels(await readFileIfPresent(path.join(projectPath, TRIAGE_LABELS_FILE)));
  const features: Feature[] = [];
  const skipped: string[] = [];
  for (const slug of entries.sort((a, b) => a.localeCompare(b))) {
    const directory = path.join(trackerPath, slug);
    if (!(await ifExists(stat(directory)))?.isDirectory()) continue;
    const spec = await readFileIfPresent(path.join(directory, "spec.md"));
    if (spec !== undefined) {
      features.push({ slug, spec: { source: spec }, tickets: await readTickets(directory, labels) });
    } else {
      skipped.push(slug);
    }
  }
  return { trackerFolder: { path: trackerPath, exists: true }, features, skipped, pages };
}
