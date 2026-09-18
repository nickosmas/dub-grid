import { describe, expect, it } from "vitest";
import { ALERT_TYPES_WITHOUT_DESTINATION, resolveAlertDestination } from "./alert-destination";

const EMP_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("resolveAlertDestination", () => {
  it("lets a same-origin actionUrl win and carries its label", () => {
    expect(
      resolveAlertDestination({
        type: "system",
        metadata: { actionUrl: "/people?section=requests", actionLabel: "Review request" },
      }),
    ).toEqual({ href: "/people?section=requests", label: "Review request" });
    expect(
      resolveAlertDestination({ type: "shift_change", metadata: { actionUrl: "/schedule" } }),
    ).toEqual({ href: "/schedule", label: "Open" });
  });

  it("ignores an actionUrl that is not a plain path and falls back to the type", () => {
    for (const actionUrl of [
      "https://evil.example/x",
      "//evil.example/x",
      "javascript:alert(1)",
      "people?section=requests",
      "/people?x=1 2",
      "",
    ]) {
      expect(
        resolveAlertDestination({
          type: "shift_change",
          metadata: { actionUrl, date: "2026-09-18" },
        }),
        actionUrl,
      ).toEqual({ href: "/schedule?date=2026-09-18", label: "Open schedule" });
    }
  });

  it("sends a new request to the right board tab", () => {
    expect(
      resolveAlertDestination({ type: "shift_request_new", metadata: { tab: "approval" } }),
    ).toEqual({ href: "/schedule?requests=approval", label: "Open requests" });
    expect(
      resolveAlertDestination({ type: "shift_request_new", metadata: { tab: "mine" } }),
    ).toEqual({
      href: "/schedule?requests=mine",
      label: "Open requests",
    });
    expect(resolveAlertDestination({ type: "shift_request_new", metadata: {} })?.href).toBe(
      "/schedule?requests=mine",
    );
  });

  it("sends resolved requests to the reader's own requests", () => {
    for (const type of [
      "shift_request_approved",
      "shift_request_rejected",
      "shift_request_expired",
    ]) {
      expect(resolveAlertDestination({ type, metadata: { requestId: EMP_ID } })).toEqual({
        href: "/schedule?requests=mine",
        label: "Open requests",
      });
    }
  });

  it("sends schedule alerts to their date, or to the schedule without one", () => {
    expect(
      resolveAlertDestination({
        type: "schedule_published",
        metadata: { startDate: "2026-09-21", endDate: "2026-10-04" },
      }),
    ).toEqual({ href: "/schedule?date=2026-09-21", label: "Open schedule" });
    expect(
      resolveAlertDestination({ type: "shift_change", metadata: { date: "2026-09-18" } })?.href,
    ).toBe("/schedule?date=2026-09-18");
    expect(
      resolveAlertDestination({ type: "schedule_note_published", metadata: { date: "2026-09-18" } })
        ?.href,
    ).toBe("/schedule?date=2026-09-18");
    expect(resolveAlertDestination({ type: "schedule_published", metadata: {} })?.href).toBe(
      "/schedule",
    );
    for (const type of [
      "recurring_shift_updated",
      "shift_series_updated",
      "recurring_schedules_applied",
    ]) {
      expect(resolveAlertDestination({ type, metadata: {} })?.href).toBe("/schedule");
    }
  });

  it("falls back to the bare route on a malformed date or id", () => {
    expect(
      resolveAlertDestination({ type: "shift_change", metadata: { date: "Sep 18" } })?.href,
    ).toBe("/schedule");
    expect(
      resolveAlertDestination({ type: "shift_change", metadata: { date: "2026-09-18T00:00:00Z" } })
        ?.href,
    ).toBe("/schedule");
    expect(
      resolveAlertDestination({ type: "employee_created", metadata: { empId: "42" } })?.href,
    ).toBe("/people");
  });

  it("sends people alerts to the person", () => {
    for (const type of [
      "employee_created",
      "employee_status_changed",
      "employee_profile_changed",
    ]) {
      expect(resolveAlertDestination({ type, metadata: { empId: EMP_ID } })).toEqual({
        href: `/people/${EMP_ID}`,
        label: "Open person",
      });
    }
    expect(resolveAlertDestination({ type: "invitation_accepted", metadata: {} })?.href).toBe(
      "/people",
    );
    expect(resolveAlertDestination({ type: "membership_removed", metadata: {} })?.href).toBe(
      "/people",
    );
    for (const type of [
      "invitation_received",
      "invitation_resent",
      "invitation_revoked",
      "invitation_expired",
    ]) {
      expect(resolveAlertDestination({ type, metadata: {} })?.href).toBe(
        "/people?section=invitations",
      );
    }
  });

  it("sends changes to the reader's own access to their profile", () => {
    for (const type of ["admin_permissions_changed", "member_dept_changed", "system"]) {
      expect(
        resolveAlertDestination({ type, metadata: { fromRole: "user", toRole: "admin" } }),
      ).toEqual({ href: "/profile", label: "Open profile" });
    }
  });

  it("sends organization and billing alerts to settings", () => {
    expect(resolveAlertDestination({ type: "org_settings_changed", metadata: {} })?.href).toBe(
      "/settings",
    );
    for (const type of [
      "org_suspended",
      "org_unsuspended",
      "billing_subscription_changed",
      "billing_payment_failed",
      "billing_payment_succeeded",
      "billing_trial_ending_soon",
      "billing_trial_expired",
    ]) {
      expect(resolveAlertDestination({ type, metadata: { stripeInvoiceId: "in_1" } })).toEqual({
        href: "/settings?section=org-billing",
        label: "Open billing",
      });
    }
  });

  it("sends security and impersonation alerts to the security section", () => {
    for (const type of [
      "security_email_changed",
      "security_password_changed",
      "security_mfa_changed",
      "security_new_device",
      "security_session_revoked",
      "impersonation_start",
      "impersonation_end",
    ]) {
      expect(resolveAlertDestination({ type, metadata: { session_id: EMP_ID } })).toEqual({
        href: "/profile?section=security",
        label: "Open security",
      });
    }
  });

  it("gives platform rows and unknown types no destination", () => {
    for (const type of ALERT_TYPES_WITHOUT_DESTINATION) {
      expect(
        resolveAlertDestination({ type, metadata: { orgId: EMP_ID, slug: "calmhaven" } }),
      ).toBeNull();
    }
    expect(resolveAlertDestination({ type: "something_new", metadata: {} })).toBeNull();
    expect(resolveAlertDestination({ type: "shift_change", metadata: null })?.href).toBe(
      "/schedule",
    );
  });
});
