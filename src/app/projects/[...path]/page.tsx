import path from "node:path";
import { ProjectSwitcher } from "../../project-switcher.tsx";
import { decodeSegments, findProject } from "../../project-urls.ts";
import { listProjects } from "../../projects.ts";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path: rawSegments } = await params;
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
          <p>No Features to show yet.</p>
        </section>
      ) : (
        <p role="alert">/{segments.join("/")} is not a registered Project.</p>
      )}
    </>
  );
}
