import Link from "next/link";
import type { FeatureReferencedPr, Ticket } from "../project-reader/project-reader.ts";

export function ReferencedPrs({
  prs,
  error,
  ticketHref,
}: {
  prs: FeatureReferencedPr[];
  error?: string;
  ticketHref?: (ticket: Pick<Ticket, "file">) => string;
}) {
  return (
    <>
      <h4>Referenced PRs</h4>
      {error && <p role="alert">Could not get PR state from GitHub: {error}</p>}
      {prs.length === 0 ? (
        !error && <p>No Referenced PRs.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>PR</th>
              <th>Title</th>
              <th>Repo</th>
              <th>State</th>
              {ticketHref && <th>From</th>}
            </tr>
          </thead>
          <tbody>
            {prs.map((pr) => (
              <tr key={`${pr.repo}#${pr.number}@${pr.ticket?.file ?? "spec"}`}>
                <td>
                  <a href={pr.url}>#{pr.number}</a>
                </td>
                <td>{pr.title}</td>
                <td>{pr.repo}</td>
                <td>{pr.state}</td>
                {ticketHref && (
                  <td>
                    {pr.ticket ? (
                      <Link href={ticketHref(pr.ticket)}>
                        #{pr.ticket.number} {pr.ticket.title}
                      </Link>
                    ) : (
                      "Spec"
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
