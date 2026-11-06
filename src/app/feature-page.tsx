import Link from "next/link";
import type { Feature } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { BlockerGraph } from "./blocker-graph.tsx";
import { BlockerLinks } from "./blocker-links.tsx";
import { MarkdownArticle } from "./markdown.tsx";
import { projectHref, ticketHref } from "./project-urls.ts";
import { StatusPill } from "./status-pill.tsx";
import { Card, PageHeader } from "./ui.tsx";
import { WarningBadges } from "./warning-badges.tsx";

const CELL = "px-4 py-2 text-left align-top";

export function FeaturePage({ project, feature }: { project: Project; feature: Feature }) {
  // Each warning shows in place of the part it says could not be read.
  const specWarnings = feature.warnings.filter((warning) => warning.kind === "spec-unreadable");
  const issuesWarnings = feature.warnings.filter((warning) => warning.kind === "issues-unreadable");
  return (
    <>
      <PageHeader back={{ href: projectHref(project), label: "All Features" }} title={feature.slug} />
      {feature.spec.source === undefined ? (
        <p>
          <WarningBadges warnings={specWarnings} />
        </p>
      ) : (
        <MarkdownArticle source={feature.spec.source} />
      )}
      <Card title={<h4>Tickets</h4>}>
        {issuesWarnings.length > 0 ? (
          <p className="px-4 py-3">
            <WarningBadges warnings={issuesWarnings} />
          </p>
        ) : feature.tickets.length === 0 ? (
          <p className="px-4 py-3 text-fg-muted">No Tickets in this Feature's issues/ folder.</p>
        ) : (
          <>
            <div className="border-b border-border p-2">
              <BlockerGraph project={project} feature={feature} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-canvas-subtle font-semibold text-fg-muted">
                  <tr>
                    <th className={`${CELL} w-12`}>#</th>
                    <th className={CELL}>Title</th>
                    <th className={CELL}>Status</th>
                    <th className={CELL}>Blocked by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted">
                  {feature.tickets.map((ticket) => (
                    <tr key={ticket.file} className="hover:bg-canvas-subtle">
                      <td className={`${CELL} font-mono text-fg-muted`}>{ticket.number}</td>
                      <td className={CELL}>
                        <Link href={ticketHref(project, feature, ticket)} className="font-medium">
                          {ticket.title}
                        </Link>{" "}
                        <WarningBadges warnings={ticket.warnings} />
                      </td>
                      <td className={`${CELL} whitespace-nowrap`}>
                        <StatusPill ticket={ticket} />
                      </td>
                      <td className={CELL}>
                        <BlockerLinks project={project} feature={feature} ticket={ticket} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
