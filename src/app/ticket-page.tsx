import type { Feature, Ticket } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { BlockerLinks } from "./blocker-links.tsx";
import { MarkdownArticle } from "./markdown.tsx";
import { featureHref } from "./project-urls.ts";
import { rawStatusBeside } from "./status-text.ts";
import { StatusPill } from "./status-pill.tsx";
import { PageHeader } from "./ui.tsx";
import { WarningBadges } from "./warning-badges.tsx";

export function TicketPage({
  project,
  feature,
  ticket,
}: {
  project: Project;
  feature: Feature;
  ticket: Ticket;
}) {
  const rawStatus = rawStatusBeside(ticket);
  return (
    <>
      <PageHeader
        back={{ href: featureHref(project, feature.slug), label: feature.slug }}
        title={
          <>
            <span className="font-normal text-fg-muted">#{ticket.number}</span> {ticket.title}
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          <span className="font-mono">{ticket.file}</span>
          {" · "}Status: <StatusPill ticket={ticket} />
          {rawStatus && (
            <>
              {" "}
              (written as <code>{rawStatus}</code>)
            </>
          )}
        </p>
        {(ticket.blockers.length > 0 || ticket.brokenBlockers.length > 0) && (
          <p className="text-sm text-fg-muted">
            Blocked by: <BlockerLinks project={project} feature={feature} ticket={ticket} />
          </p>
        )}
        {ticket.warnings.length > 0 && (
          <p>
            <WarningBadges warnings={ticket.warnings} />
          </p>
        )}
      </PageHeader>
      <MarkdownArticle source={ticket.source} />
    </>
  );
}
