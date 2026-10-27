import { homedir } from "node:os";
import { resolveConfigPath } from "../config/config.ts";
import { type ProjectModel, readProject } from "../project-reader/project-reader.ts";
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

export function readRegisteredProject(project: Project): Promise<ProjectModel> {
  return readProject(project.path, { prLookup: async () => [] });
}
