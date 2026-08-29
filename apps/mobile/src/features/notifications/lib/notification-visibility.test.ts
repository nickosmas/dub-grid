import { describe, expect, it } from "vitest";
import type { MobileNotification } from "@dubgrid/contracts";
import {
  filterNotificationsForViewer,
  isNotificationVisibleToViewer,
} from "./notification-visibility";

function makeNotification(
  metadata: Record<string, unknown>,
  id = "00000000-0000-4000-8000-000000000001",
): MobileNotification {
  return {
    id,
    type: "shift_request_new",
    channel: "in_app",
    category: "shift_requests",
    priority: "normal",
    title: "Request",
    message: "A request needs attention.",
    metadata,
    readAt: null,
    archivedAt: null,
    createdAt: "2026-04-24T12:00:00.000Z",
  } as unknown as MobileNotification;
}

describe("isNotificationVisibleToViewer", () => {
  it("hides an approval alert from someone without the approve permission", () => {
    expect(
      isNotificationVisibleToViewer(makeNotification({ action: "approve_request" }), {
        canApproveShiftRequests: false,
      }),
    ).toBe(false);
  });

  it("hides an alert routed to the approval tab", () => {
    expect(
      isNotificationVisibleToViewer(makeNotification({ tab: "approval" }), {
        canApproveShiftRequests: false,
      }),
    ).toBe(false);
  });

  it("shows an approval alert to an approver", () => {
    expect(
      isNotificationVisibleToViewer(
        makeNotification({ action: "approve_request", tab: "approval" }),
        { canApproveShiftRequests: true },
      ),
    ).toBe(true);
  });

  it("leaves a request addressed to the viewer alone", () => {
    expect(
      isNotificationVisibleToViewer(
        makeNotification({ action: "respond_to_request", tab: "mine" }),
        { canApproveShiftRequests: false },
      ),
    ).toBe(true);
  });

  it("leaves an alert with no routing metadata alone", () => {
    expect(
      isNotificationVisibleToViewer(makeNotification({ requestId: "req-1" }), {
        canApproveShiftRequests: false,
      }),
    ).toBe(true);
  });

  it("ignores non-string metadata rather than treating it as a role gate", () => {
    expect(
      isNotificationVisibleToViewer(makeNotification({ action: 7, tab: null }), {
        canApproveShiftRequests: false,
      }),
    ).toBe(true);
  });
});

describe("filterNotificationsForViewer", () => {
  it("keeps only the alerts the viewer's role covers", () => {
    const visible = filterNotificationsForViewer(
      [
        makeNotification({ action: "approve_request" }, "00000000-0000-4000-8000-00000000000a"),
        makeNotification({ action: "respond_to_request" }, "00000000-0000-4000-8000-00000000000b"),
      ],
      { canApproveShiftRequests: false },
    );

    expect(visible.map((notification) => notification.id)).toEqual([
      "00000000-0000-4000-8000-00000000000b",
    ]);
  });
});
