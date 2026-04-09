import type { TourConfig } from "../types";
import type { TourContent } from "@/components/ui/hint.types";

export const settingsTour: TourConfig = {
  pageKey: "settings",
  entryModal: {
    headline: "Configure your organization settings",
    timeEstimate: "~15 sec",
  },
  steps: [
    {
      target: "settings-sidebar",
      title: "Quick Navigation",
      body: "Sections grouped by Organization, Scheduling, and Staff. The sidebar collapses on smaller screens." as TourContent,
      side: "right",
      completionLabel: "Got it",
    },
  ],
};
