import Link from "next/link";
import {
  type BlockerGraphNode,
  layoutBlockerGraph,
  type Place,
} from "../blocker-graph/blocker-graph.ts";
import type { Feature, NormalisedStatus } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { ticketHref } from "./project-urls.ts";
import { statusText } from "./status-text.ts";

const NODE_WIDTH = 190;
const NODE_HEIGHT = 44;
const COLUMN_GAP = 60;
const ROW_GAP = 16;
// Leaves room for an edge in the gap above the first row.
const MARGIN = ROW_GAP;
const LABEL_LENGTH = 24;
// Arrows and Ticket box outlines.
const LINE = "#4b5563";
const BROKEN = "#dc2626";
const DASH = "5 4";

const FILLS: Record<NormalisedStatus, string> = {
  "needs-triage": "#fde68a",
  "needs-info": "#fdba74",
  "ready-for-agent": "#93c5fd",
  "ready-for-human": "#c4b5fd",
  wontfix: "#d1d5db",
  done: "#bbf7d0",
  other: "#f9a8d4",
  none: "#ffffff",
};

const xOf = (column: number) => MARGIN + column * (NODE_WIDTH + COLUMN_GAP);
const yOf = (row: number) => MARGIN + row * (NODE_HEIGHT + ROW_GAP);

// An edge to the next column curves across the gap between them. Any other
// edge, one that skips a column or points back in a cycle, runs along the gap
// above the blocked Ticket's row, so it never passes behind a node.
function edgePath(from: Place, to: Place): string {
  const x1 = xOf(from.column) + NODE_WIDTH;
  const y1 = yOf(from.row) + NODE_HEIGHT / 2;
  const x2 = xOf(to.column);
  const y2 = yOf(to.row) + NODE_HEIGHT / 2;
  const middle = COLUMN_GAP / 2;
  if (to.column === from.column + 1) {
    return `M${x1},${y1} C${x1 + middle},${y1} ${x2 - middle},${y2} ${x2},${y2}`;
  }
  const lane = yOf(to.row) - ROW_GAP / 2;
  return `M${x1},${y1} H${x1 + middle} V${lane} H${x2 - middle} V${y2} H${x2}`;
}

const shorten = (text: string) =>
  text.length > LABEL_LENGTH ? `${text.slice(0, LABEL_LENGTH - 1)}…` : text;

// The Feature's Tickets as boxes coloured by Status, with an arrow from each
// Blocker to the Ticket it blocks, so the Tickets that can start now stand
// out at the left.
export function BlockerGraph({ project, feature }: { project: Project; feature: Feature }) {
  const graph = layoutBlockerGraph(feature.tickets);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const width = xOf(graph.columns) - COLUMN_GAP + MARGIN;
  const height = yOf(graph.rows) - ROW_GAP + MARGIN;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Blocker graph"
        fontFamily="sans-serif"
        fontSize={12}
      >
        <defs>
          <Arrowhead id="arrow" colour={LINE} />
          <Arrowhead id="arrow-broken" colour={BROKEN} />
        </defs>
        {graph.edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          return (
            <path
              key={`${edge.from}->${edge.to}`}
              d={edgePath(from, to)}
              fill="none"
              stroke={edge.broken ? BROKEN : LINE}
              strokeDasharray={edge.broken ? DASH : undefined}
              markerEnd={edge.broken ? "url(#arrow-broken)" : "url(#arrow)"}
            />
          );
        })}
        {graph.nodes.map((node) => (
          <GraphNode key={node.id} project={project} feature={feature} node={node} />
        ))}
      </svg>
    </div>
  );
}

function GraphNode({
  project,
  feature,
  node,
}: {
  project: Project;
  feature: Feature;
  node: BlockerGraphNode;
}) {
  const x = xOf(node.column);
  const y = yOf(node.row);
  if (node.kind === "broken") {
    return (
      <g>
        <title>{`${node.reference}: no Ticket in this Feature matches`}</title>
        <Box x={x} y={y} fill="#ffffff" stroke={BROKEN} dashed />
        <text x={x + 10} y={y + 27} fill={BROKEN}>
          {shorten(node.reference)}
        </text>
      </g>
    );
  }
  const { ticket } = node;
  return (
    <Link href={ticketHref(project, feature, ticket)}>
      <g opacity={ticket.normalisedStatus === "done" ? 0.4 : 1}>
        <title>{`#${ticket.number} ${ticket.title} (${statusText(ticket)})`}</title>
        <Box x={x} y={y} fill={FILLS[ticket.normalisedStatus]} stroke={LINE} />
        <text x={x + 10} y={y + 18} fill="#111827">
          #{ticket.number} {shorten(ticket.title)}
        </text>
        <text x={x + 10} y={y + 34} fill="#374151" fontSize={11}>
          {shorten(statusText(ticket))}
        </text>
      </g>
    </Link>
  );
}

function Arrowhead({ id, colour }: { id: string; colour: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX={10}
      refY={5}
      markerWidth={8}
      markerHeight={8}
      orient="auto"
    >
      <path d="M0,0 L10,5 L0,10 z" fill={colour} />
    </marker>
  );
}

function Box({
  x,
  y,
  fill,
  stroke,
  dashed = false,
}: {
  x: number;
  y: number;
  fill: string;
  stroke: string;
  dashed?: boolean;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={NODE_WIDTH}
      height={NODE_HEIGHT}
      rx={6}
      fill={fill}
      stroke={stroke}
      strokeDasharray={dashed ? DASH : undefined}
    />
  );
}
