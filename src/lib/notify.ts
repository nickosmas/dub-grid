/**
 * Fire-and-forget client-side helpers to trigger server-side notifications
 * via the /api/send-notification route. Failures are silently logged — they
 * must never block the primary user action.
 */

type NotifyPayload =
  | {
      action: "shift_request_created" | "shift_request_claimed";
      orgId: string;
      requestId: string;
      requestType: "pickup" | "swap" | "calloff";
    }
  | {
      action: "shift_request_resolved";
      orgId: string;
      requestId: string;
      requestType: "pickup" | "swap" | "calloff";
      approved: boolean;
      adminNote?: string;
    }
  | {
      action: "schedule_published";
      orgId: string;
      startDate: string;
      endDate: string;
    }
  | {
      action: "role_changed";
      orgId: string;
      targetUserId: string;
      fromRole: string;
      toRole: string;
    };

export function queueNotification(payload: NotifyPayload): void {
  fetch("/api/send-notification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Best-effort — notification failure must never disrupt the UI
  });
}
