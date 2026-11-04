import Link from "next/link";
import type {
  ProjectLevelPage,
  ProjectLevelPageKind,
  ProjectModel,
  SkippedDirectory,
} from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { featureHref, pageHref } from "./project-urls.ts";
import { WarningBadges } from "./warning-badges.tsx";

// One heading per kind, in display order.
const pageHeadings: Record<ProjectLevelPageKind, string> = {
  glossary: "Glossary",
  adr: "ADRs",
  tracker: "Tracker folder",
  "out-of-scope": "Out of scope",
};

export function ProjectOverview({ project, model }: { project: Project; model: ProjectModel }) {
  return (
    <>
      <Features project={project} model={model} />
      <ProjectLevelPages project={project} pages={model.pages} />
    </>
  );
}

function Features({ project, model }: { project: Project; model: ProjectModel }) {
  if (!model.trackerFolder.exists) {
    return (
      <p>
        No Tracker folder at <code>{model.trackerFolder.path}</code>. Features appear here once it
        exists.
      </p>
    );
  }
  if (model.trackerFolder.unreadable !== undefined) {
    return (
      <p>
        Could not read the Tracker folder at <code>{model.trackerFolder.path}</code>:{" "}
        {model.trackerFolder.unreadable}
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
              <Link href={featureHref(project, feature.slug)}>{feature.slug}</Link>{" "}
              <WarningBadges warnings={feature.warnings} />
            </li>
          ))}
        </ul>
      )}
      {model.skipped.length > 0 && (
        <p>Skipped: {model.skipped.map((entry) => `${entry.slug} (${skipReason(entry)})`).join(", ")}</p>
      )}
    </>
  );
}

function skipReason(entry: SkippedDirectory): string {
  return entry.reason === "no-spec" ? "no spec.md" : `could not read it: ${entry.message}`;
}

function ProjectLevelPages({ project, pages }: { project: Project; pages: ProjectLevelPage[] }) {
  if (pages.length === 0) return null;
  const groups = Object.entries(pageHeadings) as [ProjectLevelPageKind, string][];
  return (
    <>
      <h3>Project-level pages</h3>
      {groups.map(([kind, heading]) => {
        const group = pages.filter((page) => page.kind === kind);
        if (group.length === 0) return null;
        return (
          <section key={kind}>
            <h4>{heading}</h4>
            <ul>
              {group.map((page) => (
                <li key={page.path}>
                  <Link href={pageHref(project, page.path)}>{page.path}</Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
