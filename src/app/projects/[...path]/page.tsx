import path from "node:path";
import type { Project } from "../../../registry/registry.ts";
import { FeaturePage } from "../../feature-page.tsx";
import { ProjectOverview } from "../../project-overview.tsx";
import { ProjectSwitcher } from "../../project-switcher.tsx";
import { decodeSegments, findProject } from "../../project-urls.ts";
import { listProjects, readRegisteredProject } from "../../projects.ts";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ feature?: string | string[] }>;
}) {
  const { path: rawSegments } = await params;
  const { feature } = await searchParams;
  const projectList = await listProjects();
  if ("error" in projectList) return <p role="alert">{projectList.error}</p>;

  const segments = decodeSegments(rawSegments);
  const project = findProject(projectList.projects, segments);
  return (
    <>
      <ProjectSwitcher projects={projectList.projects} current={project} />
      {project ? (
        <section>
          <h2>{path.basename(project.path)}</h2>
          <p>{project.path}</p>
          <ProjectContent project={project} feature={feature} />
        </section>
      ) : (
        <p role="alert">/{segments.join("/")} is not a registered Project.</p>
      )}
    </>
  );
}

async function ProjectContent({
  project,
  feature: slug,
}: {
  project: Project;
  feature?: string | string[];
}) {
  if (Array.isArray(slug)) {
    return <p role="alert">This URL names {slug.length} Features. Open one at a time.</p>;
  }
  const read = await readRegisteredProject(project);
  if ("error" in read) return <p role="alert">{read.error}</p>;
  if (!slug) return <ProjectOverview project={project} model={read.model} />;

  const feature = read.model.features.find((candidate) => candidate.slug === slug);
  if (feature === undefined) {
    return <p role="alert">{slug} is not a Feature in this Project.</p>;
  }
  return <FeaturePage project={project} feature={feature} />;
}
