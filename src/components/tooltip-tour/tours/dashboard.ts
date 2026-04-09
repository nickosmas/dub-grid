import type { TourConfig } from "../types";
import type { TourContent } from "@/components/ui/hint.types";

export const dashboardTour: TourConfig = {
  pageKey: "dashboard",
  entryModal: {
    headline: "Get oriented with your dashboard",
    timeEstimate: "~1 min",
  },
  steps: [
    {
      target: "dashboard-period-nav",
      title: "Jump to Today",
      body: "Snap back to the current period. The label updates to match your view — Today, This Week, or Current." as TourContent,
      side: "bottom",
    },
    {
      target: "dashboard-view-mode",
      title: "Adjust Your Time Scale",
      body: "2-Week view spots coverage gaps across pay periods. Day view is best for real-time staffing." as TourContent,
      side: "bottom",
    },
    {
      target: "dashboard-cards",
      title: "Expand for Details",
      body: "Click expand on any card to drill into staffing breakdowns, open shifts, and pending requests." as TourContent,
      side: "top",
    },
  ],
};
