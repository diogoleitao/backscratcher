import Link from "next/link";
import { Fragment } from "react";
import type { Feature, Ticket } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { ticketHref } from "./project-urls.ts";

// A Ticket's Blockers as links, then its broken Blocker references struck
// through so a Blocker that names no Ticket stays visible.
export function BlockerLinks({
  project,
  feature,
  ticket,
}: {
  project: Project;
  feature: Feature;
  ticket: Ticket;
}) {
  const blockers = ticket.blockers.flatMap((file) => {
    const blocker = feature.tickets.find((other) => other.file === file);
    return blocker ? [blocker] : [];
  });
  const items = [
    ...blockers.map((blocker) => (
      <Link key={blocker.file} href={ticketHref(project, feature, blocker)} title={blocker.title}>
        #{blocker.number}
      </Link>
    )),
    ...ticket.brokenBlockers.map((reference, index) => (
      <s key={`broken-${index}`} title="No Ticket in this Feature matches">
        {reference}
      </s>
    )),
  ];
  return items.map((item, index) => (
    <Fragment key={index}>
      {index > 0 && ", "}
      {item}
    </Fragment>
  ));
}
