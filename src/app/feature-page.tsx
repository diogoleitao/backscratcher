import Link from "next/link";
import type { Feature } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { BlockerLinks } from "./blocker-links.tsx";
import { MarkdownArticle } from "./markdown.tsx";
import { projectHref, ticketHref } from "./project-urls.ts";
import { WarningBadges } from "./warning-badges.tsx";

export function FeaturePage({ project, feature }: { project: Project; feature: Feature }) {
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
                <td>{ticket.status}</td>
                <td>
                  <BlockerLinks project={project} feature={feature} ticket={ticket} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
