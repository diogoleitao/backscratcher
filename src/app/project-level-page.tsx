import path from "node:path";
import Link from "next/link";
import type { ProjectLevelPage } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { MarkdownArticle } from "./markdown.tsx";
import { pageHref, projectHref } from "./project-urls.ts";

export function ProjectLevelPageView({
  project,
  page,
  pages,
}: {
  project: Project;
  page: ProjectLevelPage;
  pages: ProjectLevelPage[];
}) {
  // A relative link to another listed Project-level page, such as one ADR
  // citing another, opens that page in the app. A leading `/` means the
  // Project root.
  const linkToPage = (url: string) => {
    const [file, fragment] = url.split("#", 2);
    const target = file.startsWith("/")
      ? path.posix.normalize(file.slice(1))
      : path.posix.join(path.posix.dirname(page.path), file);
    if (!pages.some((candidate) => candidate.path === target)) return undefined;
    return pageHref(project, target) + (fragment === undefined ? "" : `#${fragment}`);
  };
  return (
    <>
      <p>
        <Link href={projectHref(project)}>Project overview</Link>
      </p>
      <h3>{page.path}</h3>
      <MarkdownArticle source={page.source} resolveRelative={linkToPage} />
    </>
  );
}
