import Link from "next/link";
import type { Feature } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { MarkdownArticle } from "./markdown.tsx";
import { projectHref, ticketHref } from "./project-urls.ts";
import { ReferencedPrs } from "./referenced-prs.tsx";
import { WarningBadges } from "./warning-badges.tsx";

export function FeaturePage({
  project,
  feature,
  prLookupError,
}: {
  project: Project;
  feature: Feature;
  prLookupError?: string;
}) {
  return (
    <>
      <p>
        <Link href={projectHref(project)}>All Features</Link>
      </p>
      <h3>{feature.slug}</h3>
      <MarkdownArticle source={feature.spec.source} />
      <h4>Tickets</h4>
      {feature.tickets.length === 0 ? (
        <p>No Tickets in this Feature's issues/ folder.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {feature.tickets.map((ticket) => (
              <tr key={ticket.file}>
                <td>{ticket.number}</td>
                <td>
                  <Link href={ticketHref(project, feature, ticket)}>{ticket.title}</Link>{" "}
                  <WarningBadges warnings={ticket.warnings} />
                </td>
                <td>{ticket.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ReferencedPrs
        prs={feature.referencedPrs}
        error={prLookupError}
        ticketHref={(ticket) => ticketHref(project, feature, ticket)}
      />
    </>
  );
}
