import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AddProjectForm } from "./project-forms.tsx";
import { projectHref } from "./project-urls.ts";
import { listProjects } from "./projects.ts";

export default async function HomePage() {
  await connection();
  const projectList = await listProjects();
  if ("error" in projectList) return <p role="alert">{projectList.error}</p>;
  if (projectList.projects.length > 0) redirect(projectHref(projectList.projects[0]));

  return (
    <>
      <p>No Projects yet.</p>
      <p>
        Run <code>backscratcher add</code> inside a folder to register it as a Project, or
        paste its path below.
      </p>
      <AddProjectForm />
    </>
  );
}
