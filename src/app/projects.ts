import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { defaultConfigPath } from "../config/config.ts";
import { type ProjectModel, readProject } from "../project-reader/project-reader.ts";
import { watchProject } from "../project-watcher/project-watcher.ts";
import { openRegistry, type Project } from "../registry/registry.ts";

export type ProjectList = { projects: Project[] } | { error: string };

// The app's entry into the registry, at the config file the CLI's main uses.
export function appRegistry() {
  return openRegistry(defaultConfigPath(homedir()));
}

export function errorMessage(error: unknown): string {
  return (error as Error).message;
}

export async function listProjects(): Promise<ProjectList> {
  try {
    return { projects: await appRegistry().list() };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export type ProjectRead = { model: ProjectModel } | { error: string };

// Where a registered Project keeps its files, built once for both the read
// and the watch so they always use the same Tracker folder.
function folderOptions(project: Project): { trackerFolder?: string } {
  return { trackerFolder: project.trackerFolder };
}

export async function readRegisteredProject(project: Project): Promise<ProjectRead> {
  try {
    const options = { ...folderOptions(project), prLookup: async () => [] };
    return { model: await readProject(project.path, options) };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export function watchRegisteredProject(
  project: Project,
  onChange: () => void,
): Promise<() => void> {
  return watchProject(project.path, folderOptions(project), onChange);
}

// Identifies what a read returned, so a page rendered from it can tell the
// server which version it shows.
export function versionOf(read: ProjectRead): string {
  return createHash("sha1").update(JSON.stringify(read)).digest("hex");
}
