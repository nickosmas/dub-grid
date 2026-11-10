import type { ConfirmSummary } from "./ConfirmSummaryBox";

export type ConfirmationAlertInput = {
  title: string;
  body?: string;
  summary?: ConfirmSummary;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: string;
  secondaryAction?: { label: string };
};

export type ConfirmationAlertButton = {
  kind: "cancel" | "secondary" | "confirm";
  text: string;
  style: "cancel" | "default" | "destructive";
};

export type ConfirmationAlertSpec = {
  title: string;
  message: string | undefined;
  buttons: ConfirmationAlertButton[];
};

function summaryLines(summary: ConfirmSummary | undefined): string[] {
  if (!summary || summary.points.length === 0) return [];
  if (summary.points.length === 1 && !summary.title) return [summary.points[0]!];
  const bullets = summary.points.map((point) => `• ${point}`).join("\n");
  return [summary.title ? `${summary.title}\n${bullets}` : bullets];
}

/**
 * The system alert a word-only confirmation becomes: its message (the body,
 * then the summary as bullets) and its buttons in order, cancel first.
 */
export function confirmationAlertSpec(input: ConfirmationAlertInput): ConfirmationAlertSpec {
  const buttons: ConfirmationAlertButton[] = [
    { kind: "cancel", text: input.cancelLabel ?? "Cancel", style: "cancel" },
  ];
  if (input.secondaryAction) {
    buttons.push({ kind: "secondary", text: input.secondaryAction.label, style: "default" });
  }
  buttons.push({
    kind: "confirm",
    text: input.confirmLabel,
    style: input.confirmTone === "danger" ? "destructive" : "default",
  });
  const message = [input.body, ...summaryLines(input.summary)].filter(Boolean).join("\n\n");
  return { title: input.title, message: message || undefined, buttons };
}
