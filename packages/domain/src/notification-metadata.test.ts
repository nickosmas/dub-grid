import { describe, expect, it } from "vitest";
import { extractNotificationAction, formatNotificationMetadata } from "./notification-metadata";

const profileChangeRequest = {
  requestedBy: "Jane Doe",
  "Phone number": "555-0100 → 555-0199",
  adminNote: "Confirmed with HR",
  note: "New number from today",
  actionUrl: "/people?section=requests",
  actionLabel: "Review request",
};

const impersonationStart = {
  session_id: "3f8c2c1e-8b1a-4c7e-9d2a-6c1f4a2b9e10",
  expires_at: "2026-09-18T12:00:00Z",
  justification: "Support ticket 4821",
  gridmaster_id: "0b1a2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
  gridmaster_email: "ops@dubgrid.test",
  target_user_id: "9e8d7c6b-5a4f-3e2d-1c0b-a9f8e7d6c5b4",
};

const paymentFailed = {
  stripeInvoiceId: "in_1Pabc",
  amountDue: 4900,
  currency: "usd",
};

describe("formatNotificationMetadata for an organization's own people", () => {
  it("shows only the human notes, note first", () => {
    expect(formatNotificationMetadata(profileChangeRequest, { audience: "org" })).toEqual([
      { label: "Note", value: "New number from today" },
      { label: "Admin note", value: "Confirmed with HR" },
    ]);
  });

  it("renders nothing for platform and billing plumbing", () => {
    expect(formatNotificationMetadata(impersonationStart, { audience: "org" })).toEqual([]);
    expect(formatNotificationMetadata(paymentFailed, { audience: "org" })).toEqual([]);
  });

  it("skips an empty note", () => {
    expect(
      formatNotificationMetadata({ note: "   ", adminNote: "ok" }, { audience: "org" }),
    ).toEqual([{ label: "Admin note", value: "ok" }]);
  });

  it("handles missing metadata", () => {
    expect(formatNotificationMetadata(null, { audience: "org" })).toEqual([]);
    expect(formatNotificationMetadata(undefined, { audience: "org" })).toEqual([]);
  });
});

describe("formatNotificationMetadata for platform staff", () => {
  it("keeps humanized detail and drops ids", () => {
    const labels = formatNotificationMetadata(impersonationStart, { audience: "platform" }).map(
      (entry) => entry.label,
    );
    expect(labels).toEqual(["Expires at", "Justification", "Gridmaster email"]);
  });

  it("keeps the request context and hides the action wiring", () => {
    expect(formatNotificationMetadata(profileChangeRequest, { audience: "platform" })).toEqual([
      { label: "Requested by", value: "Jane Doe" },
      { label: "Phone number", value: "555-0100 → 555-0199" },
      { label: "Admin note", value: "Confirmed with HR" },
      { label: "Note", value: "New number from today" },
    ]);
  });

  it("hides the Stripe invoice id but keeps the amount fields", () => {
    expect(formatNotificationMetadata(paymentFailed, { audience: "platform" })).toEqual([
      { label: "Amount due", value: "4900" },
      { label: "Currency", value: "usd" },
    ]);
  });
});

describe("extractNotificationAction", () => {
  it("returns the action only when both parts are present", () => {
    expect(extractNotificationAction(profileChangeRequest)).toEqual({
      href: "/people?section=requests",
      label: "Review request",
    });
    expect(extractNotificationAction({ actionUrl: "/people" })).toBeNull();
    expect(extractNotificationAction(null)).toBeNull();
  });
});
