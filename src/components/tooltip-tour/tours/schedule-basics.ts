import type { TourConfig } from "../types";
import type { TourContent } from "@/components/ui/hint.types";

export const scheduleBasicsTour: TourConfig = {
  pageKey: "schedule-basics",
  entryModal: {
    headline: "Learn to create your first shift in under a minute",
    timeEstimate: "~30 sec",
  },
  steps: [
    {
      target: "grid-empty-cell",
      title: "Click to Add a Shift",
      body: "Hover over any cell and click to open the shift picker" as TourContent,
      side: "bottom",
      actionGated: true,
    },
    {
      target: "shift-picker",
      title: "Choose a Shift Code",
      body: "Select a shift code to assign it. Codes are filtered by qualifications." as TourContent,
      side: "bottom",
      actionGated: true,
    },
    {
      target: "draft-banner",
      title: "Saved as Draft",
      body: "Your change is saved as a draft. Click Publish when you're ready to go live." as TourContent,
      side: "bottom",
      completionLabel: "Got it",
      autoSkipTimeout: 5000,
    },
  ],
};
