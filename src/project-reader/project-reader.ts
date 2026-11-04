import type { Stats } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ifExists } from "../fs.ts";
import { TRIAGE_LABELS_FILE, type TriageLabels, triageLabels } from "./status.ts";
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

export type FeatureWarning =
  | { kind: "spec-unreadable"; message: string }
  | { kind: "issues-unreadable"; message: string };

// The Spec's source is undefined when spec.md exists but cannot be read.
export type Feature = {
  slug: string;
  spec: { source: string | undefined };
  tickets: Ticket[];
  warnings: FeatureWarning[];
};

// A directory in the Tracker folder that is not listed as a Feature, and why.
export type SkippedDirectory =
  | { slug: string; reason: "no-spec" }
  | { slug: string; reason: "unreadable"; message: string };

export type ProjectLevelPageKind = "glossary" | "adr" | "tracker" | "out-of-scope";

// A markdown file shown on its own page, identified by its path relative to
// the Project, with `/` as the separator.
export type ProjectLevelPage = {
  kind: ProjectLevelPageKind;
  path: string;
  source: string;
};

export type ProjectModel = {
  // unreadable holds why a Tracker folder that exists could not be listed.
  trackerFolder:
    | { path: string; exists: false }
    | { path: string; exists: true; unreadable?: string };
  features: Feature[];
  skipped: SkippedDirectory[];
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
// folder, and the entries directly inside each Project-level page folder and
// the folder holding triage-labels.md.
export function watchedFolders(
  projectPath: string,
  options: { trackerFolder?: string },
): WatchedFolder[] {
  const trackerPath = resolveTrackerPath(projectPath, options.trackerFolder);
  const folders: WatchedFolder[] = [{ path: trackerPath, recursive: true }];
  const pageFolders = pageSourceEntries(projectPath, trackerPath).map(([, { folder }]) => folder);
  for (const folder of [...pageFolders, path.dirname(TRIAGE_LABELS_FILE)]) {
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
    let names: string[];
    try {
      names = (await ifExists(readdir(path.join(projectPath, folder)))) ?? [];
    } catch (error) {
      // readProject reports a Tracker folder it cannot read on the Project.
      if (kind !== "tracker") throw error;
      names = [];
    }
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
  let entries: string[] | undefined;
  try {
    entries = await ifExists(readdir(trackerPath));
  } catch (error) {
    const trackerFolder = { path: trackerPath, exists: true, unreadable: (error as Error).message };
    return { trackerFolder, features: [], skipped: [], pages };
  }
  if (entries === undefined) {
    return { trackerFolder: { path: trackerPath, exists: false }, features: [], skipped: [], pages };
  }
  const labels = triageLabels(await readFileIfPresent(path.join(projectPath, TRIAGE_LABELS_FILE)));
  const features: Feature[] = [];
  const skipped: SkippedDirectory[] = [];
  for (const slug of entries.sort((a, b) => a.localeCompare(b))) {
    const directory = path.join(trackerPath, slug);
    // An entry that cannot be inspected, or a directory that cannot be read,
    // may or may not hold a Spec, so it is skipped rather than listed as a Feature.
    let spec: Stats | undefined;
    try {
      if (!(await ifExists(stat(directory)))?.isDirectory()) continue;
      spec = await ifExists(stat(path.join(directory, "spec.md")));
    } catch (error) {
      skipped.push({ slug, reason: "unreadable", message: (error as Error).message });
      continue;
    }
    if (spec?.isFile()) features.push(await readFeature(slug, directory, labels));
    else skipped.push({ slug, reason: "no-spec" });
  }
  return { trackerFolder: { path: trackerPath, exists: true }, features, skipped, pages };
}

// A Spec or issues/ folder that cannot be read is named on the Feature, so the
// rest of the Feature and of the Project is still read.
async function readFeature(slug: string, directory: string, labels: TriageLabels): Promise<Feature> {
  const warnings: FeatureWarning[] = [];
  let source: string | undefined;
  try {
    source = await readFile(path.join(directory, "spec.md"), "utf8");
  } catch (error) {
    warnings.push({ kind: "spec-unreadable", message: (error as Error).message });
  }
  const { tickets, unreadable } = await readTickets(directory, labels);
  if (unreadable !== undefined) warnings.push({ kind: "issues-unreadable", message: unreadable });
  return { slug, spec: { source }, tickets, warnings };
}
