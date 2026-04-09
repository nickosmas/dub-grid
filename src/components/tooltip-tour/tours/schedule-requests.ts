import type { TourConfig } from "../types";
import type { TourContent } from "@/components/ui/hint.types";

export const scheduleRequestsTour: TourConfig = {
  pageKey: "schedule-requests",
  entryModal: {
    headline: "Manage your shifts — swap, pick up, and call off",
    timeEstimate: "~15 sec",
  },
  steps: [
    {
      target: "grid-occupied-cell",
      title: "Shift Requests",
      body: "Click any of your shifts to swap with a colleague, post it for pickup, or submit a call-off." as TourContent,
      side: "bottom",
      completionLabel: "Got it",
    },
  ],
};
