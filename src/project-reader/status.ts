const TRIAGE_ROLES = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
] as const;

type TriageRole = (typeof TRIAGE_ROLES)[number];

// A Status the app recognises, "other" for any other value, or "none" for a
// Ticket without one.
export type NormalisedStatus = TriageRole | "done" | "other" | "none";

// Each label string in a Project's tracker, in lower case, mapped to the role
// it stands for.
export type TriageLabels = Map<string, TriageRole>;

// The path of a Project's label mapping, relative to the Project.
export const TRIAGE_LABELS_FILE = "docs/agents/triage-labels.md";

const ROLE_HEADER = /label in mattpocock\/skills/i;
const LABEL_HEADER = /label in our tracker/i;

const unbacktick = (text: string) => text.replaceAll("`", "");

// Reads the "Label in our tracker" column of triage-labels.md back to the
// role in the "Label in mattpocock/skills" column. A role the file does not
// list keeps its own string as its label, unless the file gives that string
// to another role.
export function triageLabels(source: string | undefined): TriageLabels {
  const labels: TriageLabels = new Map();
  let roleColumn = -1;
  let labelColumn = -1;
  for (const line of (source ?? "").split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => unbacktick(cell).trim());
    if (cells.some((cell) => LABEL_HEADER.test(cell))) {
      roleColumn = cells.findIndex((cell) => ROLE_HEADER.test(cell));
      labelColumn = cells.findIndex((cell) => LABEL_HEADER.test(cell));
      continue;
    }
    const role = TRIAGE_ROLES.find((role) => role === cells[roleColumn]);
    const label = cells[labelColumn];
    if (role && label) labels.set(label.toLowerCase(), role);
  }
  const mapped = new Set(labels.values());
  for (const role of TRIAGE_ROLES) {
    if (!mapped.has(role) && !labels.has(role)) labels.set(role, role);
  }
  return labels;
}

export function normaliseStatus(raw: string | undefined, labels: TriageLabels): NormalisedStatus {
  if (raw === undefined) return "none";
  // The first word before any . or , so prose lines such as
  // "done. Prevents a bug..." still classify.
  const firstWord = unbacktick(raw).split(/[.,]/)[0].trim().split(/\s+/)[0].toLowerCase();
  if (firstWord === "done") return "done";
  return labels.get(firstWord) ?? "other";
}
