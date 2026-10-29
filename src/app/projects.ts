import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { resolveConfigPath } from "../config/config.ts";
import { type ProjectModel, readProject } from "../project-reader/project-reader.ts";
import { watchProject } from "../project-watcher/project-watcher.ts";
import { openRegistry, type Project } from "../registry/registry.ts";

export type ProjectList = { projects: Project[] } | { error: string };

// The app's entry into the registry, reading the process environment the way
// the CLI's main does. The CLI sets BACKSCRATCHER_CONFIG to the config file it
// resolved; under `next dev` the env var or the default applies.
export async function listProjects(): Promise<ProjectList> {
  const configPath = resolveConfigPath({
    home: homedir(),
    envPath: process.env.BACKSCRATCHER_CONFIG,
  });
  try {
    return { projects: await openRegistry(configPath).list() };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export type ProjectRead = { model: ProjectModel } | { error: string };

// The read and the watch of a registered Project live together so they always
// agree on its Tracker folder.
export async function readRegisteredProject(project: Project): Promise<ProjectRead> {
  try {
    return { model: await readProject(project.path, { prLookup: async () => [] }) };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export function watchRegisteredProject(
  project: Project,
  onChange: () => void,
): Promise<() => void> {
  return watchProject(project.path, {}, onChange);
}

// Identifies what a read returned, so a page rendered from it can tell the
// server which version it shows.
export function versionOf(read: ProjectRead): string {
  return createHash("sha1").update(JSON.stringify(read)).digest("hex");
}
