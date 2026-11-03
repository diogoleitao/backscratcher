import { describe, expect, it } from "vitest";
import type { NormalisedStatus, Ticket } from "../project-reader/project-reader.ts";
import { type BlockerGraph, layoutBlockerGraph } from "./blocker-graph.ts";

function ticket(
  number: number,
  {
    blockers = [],
    brokenBlockers = [],
    normalisedStatus = "none",
  }: {
    blockers?: number[];
    brokenBlockers?: string[];
    normalisedStatus?: NormalisedStatus;
  } = {},
): Ticket {
  return {
    file: fileOf(number),
    number,
    title: `Ticket ${number}`,
    normalisedStatus,
    blockers: blockers.map(fileOf),
    brokenBlockers,
    source: "",
    warnings: [],
  };
}

function fileOf(number: number): string {
  return `${String(number).padStart(2, "0")}-ticket.md`;
}

describe("layoutBlockerGraph", () => {
  it("puts every Ticket without Blockers in the first column, in Feature order", () => {
    const graph = layoutBlockerGraph([ticket(1), ticket(2), ticket(3)]);

    expect(graph.nodes).toEqual([
      { kind: "ticket", id: "01-ticket.md", ticket: ticket(1), column: 0, row: 0 },
      { kind: "ticket", id: "02-ticket.md", ticket: ticket(2), column: 0, row: 1 },
      { kind: "ticket", id: "03-ticket.md", ticket: ticket(3), column: 0, row: 2 },
    ]);
    expect(graph.edges).toEqual([]);
    expect(graph.columns).toBe(1);
    expect(graph.rows).toBe(3);
  });

  it("puts a blocked Ticket one column right of its furthest Blocker, with an edge from each Blocker", () => {
    const graph = layoutBlockerGraph([
      ticket(1),
      ticket(2, { blockers: [1] }),
      ticket(3, { blockers: [1, 2] }),
      ticket(4),
    ]);

    expect(placesOf(graph)).toEqual([
      { id: "01-ticket.md", column: 0, row: 0 },
      { id: "02-ticket.md", column: 1, row: 0 },
      { id: "03-ticket.md", column: 2, row: 0 },
      { id: "04-ticket.md", column: 0, row: 1 },
    ]);
    expect(graph.edges).toEqual([
      { from: "01-ticket.md", to: "02-ticket.md", broken: false },
      { from: "01-ticket.md", to: "03-ticket.md", broken: false },
      { from: "02-ticket.md", to: "03-ticket.md", broken: false },
    ]);
    expect(graph.columns).toBe(3);
    expect(graph.rows).toBe(2);
  });

  it("leaves out done Blockers when placing a Ticket, so the first column holds every Ticket that can start", () => {
    const graph = layoutBlockerGraph([
      ticket(1, { normalisedStatus: "done" }),
      ticket(2, { blockers: [1] }),
      ticket(3, { blockers: [1, 2] }),
      ticket(4, { normalisedStatus: "wontfix" }),
      ticket(5, { blockers: [4] }),
    ]);

    expect(placesOf(graph)).toEqual([
      { id: "01-ticket.md", column: 0, row: 0 },
      { id: "02-ticket.md", column: 0, row: 1 },
      { id: "03-ticket.md", column: 1, row: 0 },
      { id: "04-ticket.md", column: 0, row: 2 },
      { id: "05-ticket.md", column: 1, row: 1 },
    ]);
    expect(graph.edges).toEqual([
      { from: "01-ticket.md", to: "02-ticket.md", broken: false },
      { from: "01-ticket.md", to: "03-ticket.md", broken: false },
      { from: "02-ticket.md", to: "03-ticket.md", broken: false },
      { from: "04-ticket.md", to: "05-ticket.md", broken: false },
    ]);
  });

  it("draws a Broken Blocker reference as a placeholder one column left of its Ticket, with a broken edge", () => {
    const graph = layoutBlockerGraph([
      ticket(1),
      ticket(2, { brokenBlockers: ["99"] }),
      ticket(3, { blockers: [2], brokenBlockers: ["Missing thing"] }),
    ]);

    expect(placesOf(graph)).toEqual([
      { id: "01-ticket.md", column: 0, row: 0 },
      { id: "02-ticket.md#broken-0", column: 0, row: 1 },
      { id: "02-ticket.md", column: 1, row: 0 },
      { id: "03-ticket.md#broken-0", column: 1, row: 1 },
      { id: "03-ticket.md", column: 2, row: 0 },
    ]);
    expect(graph.nodes.filter((node) => node.kind === "broken")).toEqual([
      { kind: "broken", id: "02-ticket.md#broken-0", reference: "99", column: 0, row: 1 },
      { kind: "broken", id: "03-ticket.md#broken-0", reference: "Missing thing", column: 1, row: 1 },
    ]);
    expect(graph.edges).toEqual([
      { from: "02-ticket.md#broken-0", to: "02-ticket.md", broken: true },
      { from: "02-ticket.md", to: "03-ticket.md", broken: false },
      { from: "03-ticket.md#broken-0", to: "03-ticket.md", broken: true },
    ]);
    expect(graph.columns).toBe(3);
    expect(graph.rows).toBe(2);
  });

  it("still places every Ticket in a Blocker cycle, none in the first column, keeping every edge", () => {
    const graph = layoutBlockerGraph([
      ticket(1, { blockers: [2] }),
      ticket(2, { blockers: [1] }),
      ticket(3, { blockers: [2] }),
    ]);

    expect(placesOf(graph)).toEqual([
      { id: "01-ticket.md", column: 2, row: 0 },
      { id: "02-ticket.md", column: 1, row: 0 },
      { id: "03-ticket.md", column: 2, row: 1 },
    ]);
    expect(graph.columns).toBe(3);
    expect(graph.rows).toBe(2);
    expect(graph.edges).toEqual([
      { from: "02-ticket.md", to: "01-ticket.md", broken: false },
      { from: "01-ticket.md", to: "02-ticket.md", broken: false },
      { from: "02-ticket.md", to: "03-ticket.md", broken: false },
    ]);
  });
});

function placesOf({ nodes }: BlockerGraph) {
  return nodes.map(({ id, column, row }) => ({ id, column, row }));
}
