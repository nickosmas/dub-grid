import type { MobileNotification } from "@dubgrid/contracts";

/**
 * The permissions an alert can depend on. Only the ones the inbox actually
 * gates on live here; add a field when a new alert needs one.
 */
export type NotificationViewerPermissions = {
  canApproveShiftRequests: boolean;
};

/** Metadata actions that only an approver can carry out. */
const APPROVER_ONLY_ACTIONS = new Set(["approve_request"]);

function readMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

/**
 * Whether this alert is one the viewer's current role can act on.
 *
 * Shift-request alerts fan out by role at send time: approvers get the
 * "needs your approval" copy, the requester and target get their own. Roles
 * change afterwards, though, so someone who has since lost
 * `canApproveShiftRequests` keeps a backlog of approval alerts they can no
 * longer do anything with — and which name other people's requests. Those are
 * filtered out here rather than left to dead-end on a tap.
 */
export function isNotificationVisibleToViewer(
  notification: MobileNotification,
  permissions: NotificationViewerPermissions,
): boolean {
  const action = readMetadataString(notification.metadata, "action");
  const tab = readMetadataString(notification.metadata, "tab");
  const needsApproverRole = APPROVER_ONLY_ACTIONS.has(action ?? "") || tab === "approval";

  return !needsApproverRole || permissions.canApproveShiftRequests;
}

export function filterNotificationsForViewer(
  notifications: ReadonlyArray<MobileNotification>,
  permissions: NotificationViewerPermissions,
): MobileNotification[] {
  return notifications.filter((notification) =>
    isNotificationVisibleToViewer(notification, permissions),
  );
}
