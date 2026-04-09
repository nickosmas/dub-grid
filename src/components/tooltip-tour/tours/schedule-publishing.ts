import type { TourConfig } from "../types";
import type { TourContent } from "@/components/ui/hint.types";

export const schedulePublishingTour: TourConfig = {
  pageKey: "schedule-publishing",
  entryModal: {
    headline: "Understand the draft and publish workflow",
    timeEstimate: "~30 sec",
  },
  steps: [
    {
      target: "draft-banner-diff",
      title: "Preview Your Changes",
      body: "Toggle Show Changes to see exactly what will be published — new, modified, and deleted." as TourContent,
      side: "bottom",
    },
    {
      target: "draft-banner-publish",
      title: "Publish Schedule",
      body: "Publish makes your drafts live and notifies affected employees." as TourContent,
      side: "bottom",
    },
    {
      target: "draft-banner-discard",
      title: "Discard If Needed",
      body: "Discard reverts your draft changes. Admins can discard all users' changes." as TourContent,
      side: "bottom",
      completionLabel: "Got it",
    },
  ],
};
