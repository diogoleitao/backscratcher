import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { isPlainObject, openConfigFile } from "../config/file.ts";
import { ifExists } from "../fs.ts";

// trackerFolder overrides the Project's Tracker folder, relative to its folder.
export type Project = { path: string; trackerFolder?: string };

export type Registry = ReturnType<typeof openRegistry>;

export class RegistryError extends Error {}

export class AlreadyRegisteredError extends RegistryError {
  constructor(readonly path: string) {
    super(`${path} is already a registered Project`);
  }
}

const TRACKER_FOLDER_RULE = "a relative path to a folder inside the Project";

// Stands in for any Project folder: the check depends only on the path's text.
// Not the file system root, where `..` would resolve back to the root itself.
const SOME_PROJECT = path.resolve("/project");

// The Tracker folder is a folder inside the Project, never the Project folder
// itself. Checked on the text alone; a symlink inside the Project is followed.
function isTrackerFolder(value: unknown): value is string {
  if (typeof value !== "string" || value === "" || path.isAbsolute(value)) return false;
  const relative = path.relative(SOME_PROJECT, path.resolve(SOME_PROJECT, value));
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

function checkTrackerFolder(trackerFolder: string): void {
  if (!isTrackerFolder(trackerFolder)) {
    throw new RegistryError(
      `invalid Tracker folder ${JSON.stringify(trackerFolder)} (expected ${TRACKER_FOLDER_RULE})`,
    );
  }
}

// A Project as stored, before its trackerFolder is checked.
type StoredProject = { path: string; trackerFolder?: unknown };

function isStoredProject(value: unknown): value is StoredProject {
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
function canonicalPath(projectPath: string): Promise<string | undefined> {
  return ifExists(realpath(projectPath));
}

// The Projects the dev has added, kept in the app's config file.
export function openRegistry(configPath: string) {
  const file = openConfigFile(configPath);

  async function load() {
    const config = await file.load();
    const stored = config.projects === undefined ? [] : config.projects;
    if (!Array.isArray(stored) || !stored.every(isStoredProject)) {
      throw file.error('projects must be a list of {"path": "<absolute path>"}');
    }
    const seen = new Set<string>();
    for (const project of stored) {
      if (seen.has(project.path)) {
        throw file.error(`projects lists ${project.path} more than once`);
      }
      if (project.trackerFolder !== undefined && !isTrackerFolder(project.trackerFolder)) {
        throw file.error(`the trackerFolder of ${project.path} must be ${TRACKER_FOLDER_RULE}`);
      }
      seen.add(project.path);
    }
    // Every trackerFolder was checked above.
    return { config, projects: stored as Project[] };
  }

  // Replaces a registered Project with what change makes of it. A Project
  // whose folder is gone can still be changed by its stored path.
  async function update(
    projectPath: string,
    change: (project: Project) => Project,
  ): Promise<string> {
    const canonical = (await canonicalPath(projectPath)) ?? projectPath;
    const { config, projects } = await load();
    if (!projects.some((project) => project.path === canonical)) {
      throw new RegistryError(`${projectPath} is not a registered Project`);
    }
    await file.save({
      ...config,
      projects: projects.map((project) =>
        project.path === canonical ? change(project) : project,
      ),
    });
    return canonical;
  }

  return {
    async list(): Promise<Project[]> {
      return (await load()).projects;
    },

    // Adding a registered Project again is a no-op, unless it names an
    // override: that is rejected rather than changing the Project.
    async add(
      projectPath: string,
      { trackerFolder }: { trackerFolder?: string } = {},
    ): Promise<{ path: string; added: boolean }> {
      if (trackerFolder !== undefined) checkTrackerFolder(trackerFolder);
      const canonical = await canonicalPath(projectPath);
      if (canonical === undefined || !(await stat(canonical)).isDirectory()) {
        throw new RegistryError(`${projectPath} is not a directory`);
      }
      const { config, projects } = await load();
      if (projects.some((project) => project.path === canonical)) {
        if (trackerFolder !== undefined) throw new AlreadyRegisteredError(canonical);
        return { path: canonical, added: false };
      }
      const project: Project = { path: canonical };
      if (trackerFolder !== undefined) project.trackerFolder = trackerFolder;
      await file.save({ ...config, projects: [...projects, project] });
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

    async setTrackerFolder(projectPath: string, trackerFolder: string): Promise<string> {
      checkTrackerFolder(trackerFolder);
      return update(projectPath, (project) => ({ ...project, trackerFolder }));
    },

    async clearTrackerFolder(projectPath: string): Promise<string> {
      return update(projectPath, ({ trackerFolder: _cleared, ...project }) => project);
    },
  };
}
