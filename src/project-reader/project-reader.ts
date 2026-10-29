import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ifExists } from "../fs.ts";
import { readTickets, type Ticket } from "./ticket.ts";

export type PullRequestRef = { repo: string; number: number };

export type PullRequest = PullRequestRef & {
  title: string;
  state: "open" | "draft" | "merged" | "closed";
  url: string;
};

export type PrLookup = (refs: PullRequestRef[]) => Promise<PullRequest[]>;

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

function resolveTrackerPath(projectPath: string, trackerFolder = DEFAULT_TRACKER_FOLDER): string {
  return path.resolve(projectPath, trackerFolder);
}

// Each kind of Project-level page with its source, in pageSources order.
function pageSourceEntries(projectPath: string, trackerPath: string) {
  const trackerFolder = path.relative(projectPath, trackerPath).split(path.sep).join("/") || ".";
  return Object.entries(pageSources(trackerFolder)) as [ProjectLevelPageKind, PageSource][];
}

export type WatchedFolder = { path: string; recursive: boolean };

// The folders whose contents readProject reads: everything under the Tracker
// folder, and the entries directly inside each Project-level page folder.
export function watchedFolders(
  projectPath: string,
  options: { trackerFolder?: string },
): WatchedFolder[] {
  const trackerPath = resolveTrackerPath(projectPath, options.trackerFolder);
  const folders: WatchedFolder[] = [{ path: trackerPath, recursive: true }];
  for (const [, { folder }] of pageSourceEntries(projectPath, trackerPath)) {
    const folderPath = path.resolve(projectPath, folder);
    if (!folders.some((watched) => watched.path === folderPath)) {
      folders.push({ path: folderPath, recursive: false });
    }
  }
  return folders;
}

async function readPages(projectPath: string, trackerPath: string): Promise<ProjectLevelPage[]> {
  const pages: ProjectLevelPage[] = [];
  const sources = pageSourceEntries(projectPath, trackerPath);
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
  const trackerPath = resolveTrackerPath(projectPath, options.trackerFolder);
  const pages = await readPages(projectPath, trackerPath);
  const entries = await ifExists(readdir(trackerPath));
  if (entries === undefined) {
    return { trackerFolder: { path: trackerPath, exists: false }, features: [], skipped: [], pages };
  }
  const features: Feature[] = [];
  const skipped: string[] = [];
  for (const slug of entries.sort((a, b) => a.localeCompare(b))) {
    const directory = path.join(trackerPath, slug);
    if (!(await ifExists(stat(directory)))?.isDirectory()) continue;
    const spec = await readFileIfPresent(path.join(directory, "spec.md"));
    if (spec !== undefined) {
      features.push({ slug, spec: { source: spec }, tickets: await readTickets(directory) });
    } else {
      skipped.push(slug);
    }
  }
  return { trackerFolder: { path: trackerPath, exists: true }, features, skipped, pages };
}
