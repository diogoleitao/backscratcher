import Link from "next/link";
import type {
  ProjectLevelPage,
  ProjectLevelPageKind,
  ProjectModel,
  SkippedDirectory,
} from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { featureHref, pageHref } from "./project-urls.ts";
import { Card } from "./ui.tsx";
import { WarningBadges } from "./warning-badges.tsx";

// One heading per kind, in display order.
const pageHeadings: Record<ProjectLevelPageKind, string> = {
  glossary: "Glossary",
  adr: "ADRs",
  tracker: "Tracker folder",
  "out-of-scope": "Out of scope",
};

const LIST = "divide-y divide-border-muted";
const ITEM = "px-4 py-2";

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
      <p className="text-fg-muted">
        No Tracker folder at <code>{model.trackerFolder.path}</code>. Features appear here once it
        exists.
      </p>
    );
  }
  if (model.trackerFolder.unreadable !== undefined) {
    return (
      <p className="text-fg-muted">
        Could not read the Tracker folder at <code>{model.trackerFolder.path}</code>:{" "}
        {model.trackerFolder.unreadable}
      </p>
    );
  }
  return (
    <Card title={<h3>Features</h3>}>
      {model.features.length === 0 ? (
        <p className={`${ITEM} text-fg-muted`}>
          No Features in <code>{model.trackerFolder.path}</code>.
        </p>
      ) : (
        <ul className={LIST}>
          {model.features.map((feature) => (
            <li key={feature.slug} className={ITEM}>
              <Link href={featureHref(project, feature.slug)} className="font-medium">
                {feature.slug}
              </Link>{" "}
              <WarningBadges warnings={feature.warnings} />
            </li>
          ))}
        </ul>
      )}
      {model.skipped.length > 0 && (
        <p className={`${ITEM} border-t border-border-muted text-sm text-fg-muted`}>
          Skipped: {model.skipped.map((entry) => `${entry.slug} (${skipReason(entry)})`).join(", ")}
        </p>
      )}
    </Card>
  );
}

function skipReason(entry: SkippedDirectory): string {
  return entry.reason === "no-spec" ? "no spec.md" : `could not read it: ${entry.message}`;
}

function ProjectLevelPages({ project, pages }: { project: Project; pages: ProjectLevelPage[] }) {
  if (pages.length === 0) return null;
  const groups = Object.entries(pageHeadings) as [ProjectLevelPageKind, string][];
  return (
    <Card title={<h3>Project-level pages</h3>}>
      {groups.map(([kind, heading]) => {
        const group = pages.filter((page) => page.kind === kind);
        if (group.length === 0) return null;
        return (
          <section key={kind} className="border-b border-border-muted last:border-b-0">
            <h4 className="px-4 pt-3 text-xs font-semibold tracking-wide text-fg-muted uppercase">
              {heading}
            </h4>
            <ul className={LIST}>
              {group.map((page) => (
                <li key={page.path} className={ITEM}>
                  <Link href={pageHref(project, page.path)}>{page.path}</Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </Card>
  );
}
