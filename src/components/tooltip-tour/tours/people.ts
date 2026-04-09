import type { TourConfig } from "../types";
import type { TourContent } from "@/components/ui/hint.types";

export const peopleTour: TourConfig = {
  pageKey: "people",
  entryModal: {
    headline: "Manage your team from one place",
    timeEstimate: "~30 sec",
  },
  steps: [
    {
      target: "staff-tabs",
      title: "Staff Categories",
      body: "Switch between On Schedule, Departments, Benched, and Terminated views for your workforce." as TourContent,
      side: "bottom",
    },
    {
      target: "staff-add-btn",
      title: "Add to Schedule",
      body: "Create a new employee and add them to the schedule. Assign focus areas and roles from their panel." as TourContent,
      side: "bottom",
      requiredPermission: "canManageEmployees",
    },
    {
      target: "staff-table",
      title: "Click to Edit",
      body: "Click any row to open the employee panel — edit departments, certifications, roles, and assignments." as TourContent,
      side: "top",
      completionLabel: "Got it",
    },
  ],
};
