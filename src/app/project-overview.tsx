import Link from "next/link";
import type { ProjectModel } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { featureHref } from "./project-urls.ts";

export function ProjectOverview({ project, model }: { project: Project; model: ProjectModel }) {
  if (!model.trackerFolder.exists) {
    return (
      <p>
        No Tracker folder at <code>{model.trackerFolder.path}</code>. Features appear here once it
        exists.
      </p>
    );
  }
  return (
    <>
      <h3>Features</h3>
      {model.features.length === 0 ? (
        <p>
          No Features in <code>{model.trackerFolder.path}</code>.
        </p>
      ) : (
        <ul>
          {model.features.map((feature) => (
            <li key={feature.slug}>
              <Link href={featureHref(project, feature.slug)}>{feature.slug}</Link>
            </li>
          ))}
        </ul>
      )}
      {model.skipped.length > 0 && <p>Skipped, no spec.md: {model.skipped.join(", ")}</p>}
    </>
  );
}
