import type { Ticket } from "../project-reader/project-reader.ts";

export type Place = { column: number; row: number };

// A placeholder stands in for a Broken Blocker reference, which names no
// Ticket to draw.
export type BlockerGraphNode =
  | ({ kind: "ticket"; id: string; ticket: Ticket } & Place)
  | ({ kind: "broken"; id: string; reference: string } & Place);

export type BlockerGraphEdge = { from: string; to: string; broken: boolean };

export type BlockerGraph = {
  nodes: BlockerGraphNode[];
  edges: BlockerGraphEdge[];
  columns: number;
  rows: number;
};

const brokenId = (ticket: Ticket, index: number) => `${ticket.file}#broken-${index}`;

// Lays a Feature's Tickets out left to right: a Ticket sits one column right
// of its furthest Blocker that is not done, so the first column holds every
// Ticket that can start, next to the done Tickets. A Broken Blocker reference
// counts as a Blocker, its placeholder one column left of its Ticket. Within a
// column, nodes keep Feature order.
export function layoutBlockerGraph(tickets: Ticket[]): BlockerGraph {
  const byFile = new Map(tickets.map((ticket) => [ticket.file, ticket]));
  const openBlockers = (ticket: Ticket): Ticket[] =>
    ticket.blockers.flatMap((file) => {
      const blocker = byFile.get(file);
      return blocker && blocker.normalisedStatus !== "done" ? [blocker] : [];
    });
  const columns = new Map<string, number>();
  const visiting = new Set<string>();
  // A Blocker still being placed closes a cycle, so it does not push the
  // Ticket right; its edge is drawn pointing back. The Ticket still leaves the
  // first column, which a cycle with no way in can leave empty.
  const columnOf = (ticket: Ticket): number => {
    const known = columns.get(ticket.file);
    if (known !== undefined) return known;
    visiting.add(ticket.file);
    const blockers = openBlockers(ticket);
    let column = blockers.length > 0 || ticket.brokenBlockers.length > 0 ? 1 : 0;
    for (const blocker of blockers) {
      if (!visiting.has(blocker.file)) column = Math.max(column, columnOf(blocker) + 1);
    }
    visiting.delete(ticket.file);
    columns.set(ticket.file, column);
    return column;
  };
  const rowsUsed: number[] = [];
  const place = (column: number): Place => {
    const row = rowsUsed[column] ?? 0;
    rowsUsed[column] = row + 1;
    return { column, row };
  };
  const nodes = tickets.flatMap((ticket): BlockerGraphNode[] => {
    const column = columnOf(ticket);
    return [
      ...ticket.brokenBlockers.map(
        (reference, index): BlockerGraphNode => ({
          kind: "broken",
          id: brokenId(ticket, index),
          reference,
          ...place(column - 1),
        }),
      ),
      { kind: "ticket", id: ticket.file, ticket, ...place(column) },
    ];
  });
  const edges = tickets.flatMap((ticket) => [
    ...ticket.blockers.map((file) => ({ from: file, to: ticket.file, broken: false })),
    ...ticket.brokenBlockers.map((_, index) => ({
      from: brokenId(ticket, index),
      to: ticket.file,
      broken: true,
    })),
  ]);
  return {
    nodes,
    edges,
    columns: rowsUsed.length,
    // Array.from visits the hole an empty first column leaves, unlike map.
    rows: Math.max(0, ...Array.from(rowsUsed, (used) => used ?? 0)),
  };
}
