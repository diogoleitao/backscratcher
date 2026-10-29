import path from "node:path";
import type { Project } from "../../../registry/registry.ts";
import { FeaturePage } from "../../feature-page.tsx";
import { LiveUpdates } from "../../live-updates.tsx";
import { ProjectLevelPageView } from "../../project-level-page.tsx";
import { ProjectOverview } from "../../project-overview.tsx";
import { ProjectSwitcher } from "../../project-switcher.tsx";
import { decodeSegments, eventsHref, findProject } from "../../project-urls.ts";
import {
  listProjects,
  type ProjectRead,
  readRegisteredProject,
  versionOf,
} from "../../projects.ts";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ feature?: string | string[]; page?: string | string[] }>;
}) {
  const { path: rawSegments } = await params;
  const { feature, page } = await searchParams;
  const projectList = await listProjects();
  if ("error" in projectList) return <p role="alert">{projectList.error}</p>;

  const segments = decodeSegments(rawSegments);
  const project = findProject(projectList.projects, segments);
  // One read renders the page and names its version, so live updates catch
  // any change made after it.
  const read = project && (await readRegisteredProject(project));
  return (
    <>
      <ProjectSwitcher projects={projectList.projects} current={project} />
      {project && read ? (
        <section>
          <LiveUpdates href={eventsHref(project, versionOf(read))} />
          <h2>{path.basename(project.path)}</h2>
          <p>{project.path}</p>
          <ProjectContent project={project} read={read} feature={feature} page={page} />
        </section>
      ) : (
        <p role="alert">/{segments.join("/")} is not a registered Project.</p>
      )}
    </>
  );
}

function count(n: number, noun: string): string | undefined {
  if (n === 0) return undefined;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function ProjectContent({
  project,
  read,
  feature,
  page,
}: {
  project: Project;
  read: ProjectRead;
  feature?: string | string[];
  page?: string | string[];
}) {
  const slugs = [feature ?? []].flat();
  const pagePaths = [page ?? []].flat();
  if (slugs.length + pagePaths.length > 1) {
    const named = [count(slugs.length, "Feature"), count(pagePaths.length, "Project-level page")]
      .filter(Boolean)
      .join(" and ");
    return <p role="alert">This URL names {named}. Open one at a time.</p>;
  }
  const [slug] = slugs;
  const [pagePath] = pagePaths;
  if ("error" in read) return <p role="alert">{read.error}</p>;
  if (pagePath) {
    // Only paths the reader listed resolve, so the URL cannot reach other files.
    const found = read.model.pages.find((candidate) => candidate.path === pagePath);
    if (found === undefined) {
      return <p role="alert">{pagePath} is not a Project-level page in this Project.</p>;
    }
    return <ProjectLevelPageView project={project} page={found} pages={read.model.pages} />;
  }
  if (!slug) return <ProjectOverview project={project} model={read.model} />;

  const found = read.model.features.find((candidate) => candidate.slug === slug);
  if (found === undefined) {
    return <p role="alert">{slug} is not a Feature in this Project.</p>;
  }
  return <FeaturePage project={project} feature={found} />;
}
