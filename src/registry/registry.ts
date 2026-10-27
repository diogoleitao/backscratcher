import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { isPlainObject, openConfigFile } from "../config/file.ts";

export type Project = { path: string };

export class RegistryError extends Error {}

function isProject(value: unknown): value is Project {
  return (
    isPlainObject(value) && typeof value.path === "string" && path.isAbsolute(value.path)
  );
}

// The absolute path a CLI argument names, the working directory by default.
export function resolveProjectPath(cwd: string, target = "."): string {
  return path.resolve(cwd, target);
}

// The folder's real path, so the same folder reached through a symlink or a
// different letter case on a case-insensitive file system is one Project.
// Undefined when no folder is there: missing, under a file (ENOTDIR), or a
// symlink loop (ELOOP).
async function canonicalPath(projectPath: string): Promise<string | undefined> {
  try {
    return await realpath(projectPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") return undefined;
    throw error;
  }
}

// The Projects the dev has added, kept in the app's config file.
export function openRegistry(configPath: string) {
  const file = openConfigFile(configPath);

  async function load() {
    const config = await file.load();
    const projects = config.projects === undefined ? [] : config.projects;
    if (!Array.isArray(projects) || !projects.every(isProject)) {
      throw file.error('projects must be a list of {"path": "<absolute path>"}');
    }
    const seen = new Set<string>();
    for (const project of projects) {
      if (seen.has(project.path)) {
        throw file.error(`projects lists ${project.path} more than once`);
      }
      seen.add(project.path);
    }
    return { config, projects };
  }

  return {
    async list(): Promise<Project[]> {
      return (await load()).projects;
    },

    async add(projectPath: string): Promise<{ path: string; added: boolean }> {
      const canonical = await canonicalPath(projectPath);
      if (canonical === undefined || !(await stat(canonical)).isDirectory()) {
        throw new RegistryError(`${projectPath} is not a directory`);
      }
      const { config, projects } = await load();
      if (projects.some((project) => project.path === canonical)) {
        return { path: canonical, added: false };
      }
      await file.save({ ...config, projects: [...projects, { path: canonical }] });
      return { path: canonical, added: true };
    },

    // A Project whose folder is gone can still be removed by its stored path.
    async remove(projectPath: string): Promise<string> {
      const canonical = (await canonicalPath(projectPath)) ?? projectPath;
      const { config, projects } = await load();
      const kept = projects.filter((project) => project.path !== canonical);
      if (kept.length === projects.length) {
        throw new RegistryError(`${projectPath} is not a registered Project`);
      }
      await file.save({ ...config, projects: kept });
      return canonical;
    },
  };
}
