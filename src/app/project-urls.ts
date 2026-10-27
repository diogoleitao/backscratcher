import type { Project } from "../registry/registry.ts";

function segmentsOf(projectPath: string): string[] {
  return projectPath.split(/[\\/]/).filter(Boolean);
}

function hrefFor(segments: string[]): string {
  return `/projects/${segments.map(encodeURIComponent).join("/")}`;
}

// A Project's URL mirrors its absolute path, so it can be bookmarked.
export function projectHref(project: Project): string {
  return hrefFor(segmentsOf(project.path));
}

// Catch-all params arrive still percent-encoded; a malformed escape gives undefined.
export function decodeSegments(segments: string[]): string[] | undefined {
  try {
    return segments.map(decodeURIComponent);
  } catch {
    return undefined;
  }
}

export function findProject(projects: Project[], segments: string[]): Project | undefined {
  const href = hrefFor(segments);
  return projects.find((project) => projectHref(project) === href);
}
