import path from "node:path";
import type { Project } from "../../../registry/registry.ts";
import { FeaturePage } from "../../feature-page.tsx";
import { LiveUpdates } from "../../live-updates.tsx";
import { TrackerFolderForm } from "../../project-forms.tsx";
import { ProjectLevelPageView } from "../../project-level-page.tsx";
import { ProjectOverview } from "../../project-overview.tsx";
import { ProjectSwitcher } from "../../project-switcher.tsx";
import { decodeSegments, eventsHref, findProject } from "../../project-urls.ts";
import {
  listProjects,
  type ProjectRead,
  readRegisteredProject,
  versionOf,
} from "../../projects.ts";
import { TicketPage } from "../../ticket-page.tsx";
import { Alert } from "../../ui.tsx";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{
    feature?: string | string[];
    ticket?: string | string[];
    page?: string | string[];
  }>;
}) {
  const { path: rawSegments } = await params;
  const { feature, ticket, page } = await searchParams;
  const projectList = await listProjects();
  if ("error" in projectList) return <Alert>{projectList.error}</Alert>;

  const segments = decodeSegments(rawSegments);
  const project = findProject(projectList.projects, segments);
  // One read renders the page and names its version, so live updates catch
  // any change made after it.
  const read = project && (await readRegisteredProject(project));
  return (
    <>
      <ProjectSwitcher projects={projectList.projects} current={project} />
      {project && read ? (
        <section className="space-y-6">
          {/* The stream reads the Project once, so a new Tracker folder needs a new one. */}
          <LiveUpdates
            key={project.trackerFolder}
            href={eventsHref(project)}
            version={versionOf(read)}
          />
          <div className="space-y-3 border-b border-border pb-4">
            <h2 className="text-2xl font-semibold">{path.basename(project.path)}</h2>
            <p className="font-mono text-sm text-fg-muted">{project.path}</p>
            <TrackerFolderForm key={project.trackerFolder} project={project} />
          </div>
          <ProjectContent
            project={project}
            read={read}
            feature={feature}
            ticket={ticket}
            page={page}
          />
        </section>
      ) : (
        <Alert>/{segments.join("/")} is not a registered Project.</Alert>
      )}
    </>
  );
}

function count(n: number, noun: string): string | undefined {
  if (n === 0) return undefined;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function ProjectContent({
  project,
  read,
  feature,
  ticket,
  page,
}: {
  project: Project;
  read: ProjectRead;
  feature?: string | string[];
  ticket?: string | string[];
  page?: string | string[];
}) {
  const slugs = [feature ?? []].flat();
  const files = [ticket ?? []].flat();
  const pagePaths = [page ?? []].flat();
  if (slugs.length + pagePaths.length > 1 || files.length > 1) {
    const named = [
      count(slugs.length, "Feature"),
      count(files.length, "Ticket"),
      count(pagePaths.length, "Project-level page"),
    ]
      .filter(Boolean)
      .join(" and ");
    return <Alert>This URL names {named}. Open one at a time.</Alert>;
  }
  const [slug] = slugs;
  const [file] = files;
  const [pagePath] = pagePaths;
  if ("error" in read) return <Alert>{read.error}</Alert>;
  if (pagePath) {
    // Only paths the reader listed resolve, so the URL cannot reach other files.
    const found = read.model.pages.find((candidate) => candidate.path === pagePath);
    if (found === undefined) {
      return <Alert>{pagePath} is not a Project-level page in this Project.</Alert>;
    }
    return <ProjectLevelPageView project={project} page={found} pages={read.model.pages} />;
  }
  if (!slug) return <ProjectOverview project={project} model={read.model} />;

  const found = read.model.features.find((candidate) => candidate.slug === slug);
  if (found === undefined) {
    return <Alert>{slug} is not a Feature in this Project.</Alert>;
  }
  if (!file) return <FeaturePage project={project} feature={found} />;

  const foundTicket = found.tickets.find((candidate) => candidate.file === file);
  if (foundTicket === undefined) {
    return <Alert>{file} is not a Ticket in {slug}.</Alert>;
  }
  return <TicketPage project={project} feature={found} ticket={foundTicket} />;
}
