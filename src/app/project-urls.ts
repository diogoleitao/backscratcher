import path from "node:path";
import type { Project } from "../registry/registry.ts";

// Split on this platform's separator only: on POSIX a backslash is part of a
// folder name, and encoding keeps it distinct from a slash in the URL.
function segmentsOf(projectPath: string): string[] {
  return projectPath.split(path.sep).filter(Boolean);
}

function hrefFor(segments: string[]): string {
  return `/projects/${segments.map(encodeURIComponent).join("/")}`;
}

// A Project's URL mirrors its absolute path, so it can be bookmarked.
export function projectHref(project: Project): string {
  return hrefFor(segmentsOf(project.path));
}

export function featureHref(project: Project, slug: string): string {
  return `${projectHref(project)}?feature=${encodeURIComponent(slug)}`;
}

// Catch-all params arrive still percent-encoded. Next rejects a malformed
// escape before the page runs.
export function decodeSegments(segments: string[]): string[] {
  return segments.map(decodeURIComponent);
}

export function findProject(projects: Project[], segments: string[]): Project | undefined {
  const href = hrefFor(segments);
  return projects.find((project) => projectHref(project) === href);
}
