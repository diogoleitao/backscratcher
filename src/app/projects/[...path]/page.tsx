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
  const { feature: slug } = await searchParams;
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
          <ProjectContent project={project} slug={typeof slug === "string" ? slug : undefined} />
        </section>
      ) : (
        <p role="alert">/{segments.join("/")} is not a registered Project.</p>
      )}
    </>
  );
}

async function ProjectContent({ project, slug }: { project: Project; slug?: string }) {
  const model = await readRegisteredProject(project);
  if (slug === undefined) return <ProjectOverview project={project} model={model} />;

  const feature = model.features.find((candidate) => candidate.slug === slug);
  if (feature === undefined) {
    return <p role="alert">{slug} is not a Feature in this Project.</p>;
  }
  return <FeaturePage project={project} feature={feature} />;
}
