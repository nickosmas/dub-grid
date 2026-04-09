import type { TourContent } from "@/components/ui/hint.types";

export interface TourStep {
  /** Value of the data-tour attribute on the target element. */
  target: string;
  /** Bold heading shown in the popover. */
  title: string;
  /** Body text — keep under 150 characters. */
  body: TourContent;
  /** Preferred side for popover placement. */
  side?: "top" | "bottom" | "left" | "right";
  /** If set, this step is only shown when the user has this permission. */
  requiredPermission?: string;
  /** If true, step auto-advances when the user performs the described action. */
  actionGated?: boolean;
  /** Custom label for the final step CTA (default: "Got it"). */
  completionLabel?: string;
  /** Milliseconds to wait before auto-skipping when target is not found (default: 2000). */
  autoSkipTimeout?: number;
}

export interface TourConfig {
  /** Unique key stored in the DB JSONB column (e.g. "dashboard", "schedule"). */
  pageKey: string;
  /** Ordered list of tour steps. */
  steps: TourStep[];
  /** Entry modal configuration. Shown before Step 1. */
  entryModal?: {
    /** Benefit statement shown as headline. */
    headline: string;
    /** E.g. "3 steps · ~1 min" */
    timeEstimate: string;
    /** CTA label to start the tour (default: "Let's go"). */
    startLabel?: string;
    /** Show a "Talk to a specialist" link (default: false). */
    showSpecialistLink?: boolean;
  };
}
