import Link from "next/link";
import path from "node:path";
import type { Project } from "../registry/registry.ts";
import { projectHref } from "./project-urls.ts";

export function ProjectSwitcher({
  projects,
  current,
}: {
  projects: Project[];
  current?: Project;
}) {
  return (
    <nav aria-label="Projects">
      <ul>
        {projects.map((project) => (
          <li key={project.path}>
            <Link
              href={projectHref(project)}
              aria-current={project === current ? "page" : undefined}
              title={project.path}
            >
              {path.basename(project.path)}
            </Link>{" "}
            <small>{project.path}</small>
          </li>
        ))}
      </ul>
    </nav>
  );
}
