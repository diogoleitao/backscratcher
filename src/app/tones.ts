import type { NormalisedStatus } from "../project-reader/project-reader.ts";

// The colour tones the app draws with, each as a pill and as a Blocker graph
// box. Each class is written out whole so Tailwind finds it in this file.
export const TONES = {
  attention: {
    pill: "bg-attention-subtle text-attention border-attention/40",
    box: "fill-attention-subtle stroke-attention",
  },
  severe: {
    pill: "bg-severe-subtle text-severe border-severe/40",
    box: "fill-severe-subtle stroke-severe",
  },
  accent: {
    pill: "bg-accent-subtle text-accent border-accent/40",
    box: "fill-accent-subtle stroke-accent",
  },
  success: {
    pill: "bg-success-subtle text-success border-success/40",
    box: "fill-success-subtle stroke-success",
  },
  done: {
    pill: "bg-done-subtle text-done border-done/40",
    box: "fill-done-subtle stroke-done",
  },
  neutral: {
    pill: "bg-neutral-subtle text-neutral border-neutral/40",
    box: "fill-neutral-subtle stroke-neutral",
  },
  // No colour of its own, for a Status the app does not recognise or a missing one.
  outline: {
    pill: "bg-transparent text-fg-muted border-border",
    box: "fill-canvas stroke-border",
  },
};

export type Tone = (typeof TONES)[keyof typeof TONES];

// One tone per normalised Status, shared by Status pills and Blocker graph boxes.
const STATUS_TONES: Record<NormalisedStatus, keyof typeof TONES> = {
  "needs-triage": "attention",
  "needs-info": "severe",
  "ready-for-agent": "accent",
  "ready-for-human": "success",
  done: "done",
  wontfix: "neutral",
  other: "outline",
  none: "outline",
};

export function statusTone(status: NormalisedStatus): Tone {
  return TONES[STATUS_TONES[status]];
}
