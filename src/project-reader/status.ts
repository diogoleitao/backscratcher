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

const DEFAULT_TRIAGE_LABELS: TriageLabels = new Map(TRIAGE_ROLES.map((role) => [role, role]));

const ROLE_HEADER = /label in mattpocock\/skills/i;
const LABEL_HEADER = /label in our tracker/i;

const unbacktick = (text: string) => text.replaceAll("`", "");

// Reads the "Label in our tracker" column of triage-labels.md back to the
// role in the "Label in mattpocock/skills" column. Without the file, or
// without any mapping in it, the role strings themselves are the labels.
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
  return labels.size > 0 ? labels : DEFAULT_TRIAGE_LABELS;
}

export function normaliseStatus(raw: string | undefined, labels: TriageLabels): NormalisedStatus {
  if (raw === undefined) return "none";
  // The first word before any . or , so prose lines such as
  // "done. Prevents a bug..." still classify.
  const firstWord = unbacktick(raw).split(/[.,]/)[0].trim().split(/\s+/)[0].toLowerCase();
  if (firstWord === "done") return "done";
  return labels.get(firstWord) ?? "other";
}
