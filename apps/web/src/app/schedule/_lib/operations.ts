export type { ScheduleCellInput } from "@/types";

export type ScheduleOperation = {
  kind: "autofill" | "import_previous" | "repeat_series";
  title: string;
  detail?: string;
  progress: number;
};

export const IMPORT_PREVIOUS_BATCH_SIZE = 20;
export const DRAFT_CHANGED_BROADCAST_KEY = "draft_changed";
export const OPERATION_MODAL_DISMISS_MS = 450;
export const PUBLISH_WINDOW_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress)));
}
