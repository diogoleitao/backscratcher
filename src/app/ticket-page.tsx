import Link from "next/link";
import type { Feature, Ticket } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { MarkdownArticle } from "./markdown.tsx";
import { featureHref } from "./project-urls.ts";
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
  return (
    <>
      <p>
        <Link href={featureHref(project, feature.slug)}>{feature.slug}</Link>
      </p>
      <h3>
        #{ticket.number} {ticket.title}
      </h3>
      <p>
        {ticket.file}
        {ticket.status && <> · Status: {ticket.status}</>}
      </p>
      {ticket.warnings.length > 0 && (
        <p>
          <WarningBadges warnings={ticket.warnings} />
        </p>
      )}
      <MarkdownArticle source={ticket.source} />
    </>
  );
}
