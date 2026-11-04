import Link from "next/link";
import type { Feature } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { BlockerGraph } from "./blocker-graph.tsx";
import { BlockerLinks } from "./blocker-links.tsx";
import { MarkdownArticle } from "./markdown.tsx";
import { projectHref, ticketHref } from "./project-urls.ts";
import { statusText } from "./status-text.ts";
import { WarningBadges } from "./warning-badges.tsx";

export function FeaturePage({ project, feature }: { project: Project; feature: Feature }) {
  // Each warning shows in place of the part it says could not be read.
  const specWarnings = feature.warnings.filter((warning) => warning.kind === "spec-unreadable");
  const issuesWarnings = feature.warnings.filter((warning) => warning.kind === "issues-unreadable");
  return (
    <>
      <p>
        <Link href={projectHref(project)}>All Features</Link>
      </p>
      <h3>{feature.slug}</h3>
      {feature.spec.source === undefined ? (
        <p>
          <WarningBadges warnings={specWarnings} />
        </p>
      ) : (
        <MarkdownArticle source={feature.spec.source} />
      )}
      <h4>Tickets</h4>
      {issuesWarnings.length > 0 ? (
        <p>
          <WarningBadges warnings={issuesWarnings} />
        </p>
      ) : feature.tickets.length === 0 ? (
        <p>No Tickets in this Feature's issues/ folder.</p>
      ) : (
        <>
          <BlockerGraph project={project} feature={feature} />
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Status</th>
                <th>Blocked by</th>
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
                  <td>{statusText(ticket)}</td>
                  <td>
                    <BlockerLinks project={project} feature={feature} ticket={ticket} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
