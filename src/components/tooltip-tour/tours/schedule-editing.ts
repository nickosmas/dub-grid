import type { TourConfig } from "../types";
import type { TourContent } from "@/components/ui/hint.types";

export const scheduleEditingTour: TourConfig = {
  pageKey: "schedule-editing",
  entryModal: {
    headline: "Master shift editing — drag, copy, and customize",
    timeEstimate: "~30 sec",
  },
  steps: [
    {
      target: "grid-shift-pill",
      title: "Drag to Move",
      body: "Grab a shift pill and drag it to another employee or day. Qualifications are checked." as TourContent,
      side: "top",
    },
    {
      target: "grid-occupied-cell",
      title: "Right-Click for More",
      body: "Right-click any cell for copy, paste, delete, and shift request options." as TourContent,
      side: "top",
    },
    {
      target: "grid-occupied-cell",
      title: "Edit & Customize",
      body: "Click any shift to open the editor — change the code, set custom start/end times, or delete." as TourContent,
      side: "bottom",
      completionLabel: "Got it",
    },
  ],
};
