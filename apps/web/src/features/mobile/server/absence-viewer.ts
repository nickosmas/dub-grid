import { scheduleViewerVisibility } from "@dubgrid/authz";
import type { MobileAuthContext } from "./auth";

/** Who is looking, for the mobile reads that may show colleagues' absences as Time off. */
export function mobileAbsenceViewer(
  auth: Pick<MobileAuthContext, "permissions" | "currentOrg" | "user">,
) {
  return {
    userId: auth.user.id,
    showAbsenceNames: scheduleViewerVisibility(auth.permissions, auth.currentOrg).showAbsenceNames,
  };
}
