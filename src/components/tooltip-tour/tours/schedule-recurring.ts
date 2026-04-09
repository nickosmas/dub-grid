import type { TourConfig } from "../types";
import type { TourContent } from "@/components/ui/hint.types";

export const scheduleRecurringTour: TourConfig = {
  pageKey: "schedule-recurring",
  entryModal: {
    headline: "Set up recurring shifts and bulk operations",
    timeEstimate: "~30 sec",
  },
  steps: [
    {
      target: "grid-occupied-cell",
      title: "Create Recurring Shifts",
      body: "Click any shift, then use the Repeat button to set up a daily, weekly, or biweekly pattern." as TourContent,
      side: "bottom",
    },
    {
      target: "toolbar-tools-btn",
      title: "Auto Fill & Import",
      body: "Open Tools to auto-fill recurring templates or import last week's shifts into empty cells." as TourContent,
      side: "bottom",
      completionLabel: "Got it",
    },
  ],
};
