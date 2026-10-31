import path from "node:path";
import type { Feature, Ticket } from "../project-reader/project-reader.ts";
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

function queryHref(project: Project, key: "feature" | "page", value: string): string {
  return `${projectHref(project)}?${key}=${encodeURIComponent(value)}`;
}

export function featureHref(project: Project, slug: string): string {
  return queryHref(project, "feature", slug);
}

export function pageHref(project: Project, pagePath: string): string {
  return queryHref(project, "page", pagePath);
}

// A Ticket is named by its file, so two files sharing a number stay distinct.
export function ticketHref(
  project: Project,
  feature: Feature,
  ticket: Pick<Ticket, "file">,
): string {
  return `${featureHref(project, feature.slug)}&ticket=${encodeURIComponent(ticket.file)}`;
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
