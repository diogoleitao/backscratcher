import Link from "next/link";
import path from "node:path";
import type { Project } from "../registry/registry.ts";
import { AddProjectForm, RemoveProjectButton } from "./project-forms.tsx";
import { projectHref } from "./project-urls.ts";

export function ProjectSwitcher({
  projects,
  current,
}: {
  projects: Project[];
  current?: Project;
}) {
  return (
    <nav aria-label="Projects" className="overflow-hidden rounded-md border border-border">
      <ul className="divide-y divide-border-muted">
        {projects.map((project) => (
          <li
            key={project.path}
            className={`flex items-center gap-3 border-l-2 px-4 py-2 ${project === current ? "border-l-accent bg-canvas-subtle" : "border-l-transparent"}`}
          >
            <Link
              href={projectHref(project)}
              aria-current={project === current ? "page" : undefined}
              title={project.path}
              className="font-semibold aria-[current=page]:text-fg"
            >
              {path.basename(project.path)}
            </Link>{" "}
            <small className="truncate font-mono text-xs text-fg-muted">{project.path}</small>
            <RemoveProjectButton project={project} />
          </li>
        ))}
      </ul>
      <div className="border-t border-border bg-canvas-subtle px-4 py-3">
        <AddProjectForm />
      </div>
    </nav>
  );
}
