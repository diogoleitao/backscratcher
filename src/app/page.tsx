import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AddProjectForm } from "./project-forms.tsx";
import { projectHref } from "./project-urls.ts";
import { listProjects } from "./projects.ts";
import { Alert } from "./ui.tsx";

export default async function HomePage() {
  await connection();
  const projectList = await listProjects();
  if ("error" in projectList) return <Alert>{projectList.error}</Alert>;
  if (projectList.projects.length > 0) redirect(projectHref(projectList.projects[0]));

  return (
    <section className="space-y-4 rounded-md border border-border px-6 py-12 text-center">
      <p className="text-xl font-semibold">No Projects yet.</p>
      <p className="text-fg-muted">
        Run <code>backscratcher add</code> inside a folder to register it as a Project, or
        paste its path below.
      </p>
      <div className="flex justify-center">
        <AddProjectForm />
      </div>
    </section>
  );
}
