import { homedir } from "node:os";
import { resolveConfigPath } from "../config/config.ts";
import { ghPrLookup } from "../pr-lookup/gh.ts";
import { type ProjectModel, readProject } from "../project-reader/project-reader.ts";
import { openRegistry, type Project } from "../registry/registry.ts";

export type ProjectList = { projects: Project[] } | { error: string };

// The app's entry into the registry, reading the process environment the way
// the CLI's main does. The CLI sets BACKSCRATCHER_CONFIG to the config file it
// resolved; under `next dev` the env var or the default applies.
export function appRegistry() {
  return openRegistry(
    resolveConfigPath({ home: homedir(), envPath: process.env.BACKSCRATCHER_CONFIG }),
  );
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

export async function readRegisteredProject(
  project: Project,
): Promise<{ model: ProjectModel } | { error: string }> {
  try {
    return {
      model: await readProject(project.path, {
        trackerFolder: project.trackerFolder,
        prLookup: ghPrLookup,
      }),
    };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
