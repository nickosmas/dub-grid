import { describe, expect, it } from "vitest";
import { filterRequestHistory } from "@/components/shift-requests/request-history";
import type { ShiftRequest } from "@/types";

type Row = Pick<
  ShiftRequest,
  "id" | "status" | "requesterEmpId" | "targetEmpId" | "resolvedAt" | "createdAt"
>;

const row = (overrides: Partial<Row>): Row => ({
  id: "r",
  status: "approved",
  requesterEmpId: "me",
  targetEmpId: null,
  resolvedAt: "2026-11-01T10:00:00.000Z",
  createdAt: "2026-10-30T10:00:00.000Z",
  ...overrides,
});

const staff = { status: "all" as const, people: [], viewerEmpId: "me", canReviewOrg: false };

describe("filterRequestHistory", () => {
  it("gives staff only requests they made or were asked to take", () => {
    const rows = [
      row({ id: "mine" }),
      row({ id: "asked-me", requesterEmpId: "ana", targetEmpId: "me" }),
      row({ id: "theirs", requesterEmpId: "ana", targetEmpId: "ben" }),
    ];
    expect(filterRequestHistory(rows, staff).map((r) => r.id)).toEqual(["mine", "asked-me"]);
  });

  it("gives staff nothing without a staff row", () => {
    expect(filterRequestHistory([row({})], { ...staff, viewerEmpId: null })).toEqual([]);
  });

  it("leaves out requests still open or waiting", () => {
    const rows = [
      row({ id: "open", status: "open" }),
      row({ id: "waiting", status: "pending_approval" }),
      row({ id: "rejected", status: "rejected" }),
    ];
    expect(filterRequestHistory(rows, staff).map((r) => r.id)).toEqual(["rejected"]);
  });

  it("narrows by outcome", () => {
    const rows = [row({ id: "a" }), row({ id: "c", status: "cancelled" })];
    expect(filterRequestHistory(rows, { ...staff, status: "cancelled" }).map((r) => r.id)).toEqual([
      "c",
    ]);
  });

  it("puts the newest decision first, falling back to when it was asked", () => {
    const rows = [
      row({ id: "older", resolvedAt: "2026-11-01T10:00:00.000Z" }),
      row({
        id: "expired",
        status: "expired",
        resolvedAt: null,
        createdAt: "2026-11-03T10:00:00Z",
      }),
      row({ id: "newer", resolvedAt: "2026-11-02T10:00:00.000Z" }),
    ];
    expect(filterRequestHistory(rows, staff).map((r) => r.id)).toEqual([
      "expired",
      "newer",
      "older",
    ]);
  });

  it("lets a reviewer see everyone, narrowed by the people picked", () => {
    const rows = [
      row({ id: "ana", requesterEmpId: "ana" }),
      row({ id: "ben", requesterEmpId: "cy", targetEmpId: "ben" }),
      row({ id: "dee", requesterEmpId: "dee" }),
    ];
    const reviewer = { status: "all" as const, people: [], viewerEmpId: null, canReviewOrg: true };
    expect(filterRequestHistory(rows, reviewer).map((r) => r.id)).toEqual(["ana", "ben", "dee"]);
    expect(
      filterRequestHistory(rows, { ...reviewer, people: ["ana", "ben"] }).map((r) => r.id),
    ).toEqual(["ana", "ben"]);
  });
});
