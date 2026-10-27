import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ifExists } from "../fs.ts";

export type PullRequestRef = { repo: string; number: number };

export type PullRequest = PullRequestRef & {
  title: string;
  state: "open" | "draft" | "merged" | "closed";
  url: string;
};

export type PrLookup = (refs: PullRequestRef[]) => Promise<PullRequest[]>;

export type Feature = { slug: string; spec: { source: string } };

export type ProjectModel = {
  trackerFolder: { path: string; exists: boolean };
  features: Feature[];
  skipped: string[];
};

async function readFolder(folderPath: string): Promise<string[] | undefined> {
  try {
    return await readdir(folderPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw error;
  }
}

export async function readProject(
  projectPath: string,
  options: { trackerFolder?: string; prLookup: PrLookup },
): Promise<ProjectModel> {
  const trackerPath = path.resolve(projectPath, options.trackerFolder ?? ".scratch");
  const entries = await readFolder(trackerPath);
  if (entries === undefined) {
    return { trackerFolder: { path: trackerPath, exists: false }, features: [], skipped: [] };
  }
  const features: Feature[] = [];
  const skipped: string[] = [];
  for (const slug of entries.sort()) {
    const directory = path.join(trackerPath, slug);
    if (!(await ifExists(stat(directory)))?.isDirectory()) continue;
    const specPath = path.join(directory, "spec.md");
    if ((await ifExists(stat(specPath)))?.isFile()) {
      features.push({ slug, spec: { source: await readFile(specPath, "utf8") } });
    } else {
      skipped.push(slug);
    }
  }
  return { trackerFolder: { path: trackerPath, exists: true }, features, skipped };
}
