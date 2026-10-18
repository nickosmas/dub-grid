import { describe, expect, it } from "vitest";
import type { ShiftDiffDescriptorResult } from "@/lib/shift-diff-badges";
import {
  formatPublishedMetadata,
  publishCellLevelBadge,
  publishedAtFormatter,
} from "./gridHelpers";

const newBadge = { kind: "new" as const, text: "New", detail: "Added N." };
const changedBadge = { kind: "modified" as const, text: "Changed", detail: "Was D." };
const pill = (kind: "new" | null) => ({ borderKind: kind, badge: kind ? newBadge : null });

describe("publishCellLevelBadge", () => {
  it("admits a plain New on a single pill", () => {
    const summary: ShiftDiffDescriptorResult = { pillDiffs: [pill("new")], cellBadge: newBadge };
    expect(publishCellLevelBadge(summary, 1)).toBe(newBadge);
  });

  it("admits a plain New on an absence, which has no pills", () => {
    const summary: ShiftDiffDescriptorResult = { pillDiffs: [], cellBadge: newBadge };
    expect(publishCellLevelBadge(summary, 1)).toBe(newBadge);
  });

  it("leaves a two-pill New to the pills themselves", () => {
    const summary: ShiftDiffDescriptorResult = {
      pillDiffs: [pill(null), pill("new")],
      cellBadge: newBadge,
    };
    expect(publishCellLevelBadge(summary, 2)).toBeNull();
  });

  it("keeps Changed at cell level whatever the pill count", () => {
    const summary: ShiftDiffDescriptorResult = { pillDiffs: [pill(null)], cellBadge: changedBadge };
    expect(publishCellLevelBadge(summary, 1)).toBe(changedBadge);
    expect(publishCellLevelBadge(summary, 2)).toBe(changedBadge);
  });

  it("returns null without a summary", () => {
    expect(publishCellLevelBadge(null, 1)).toBeNull();
    expect(publishCellLevelBadge({ pillDiffs: [pill(null)], cellBadge: null }, 1)).toBeNull();
  });
});

describe("formatPublishedMetadata", () => {
  const publishedAt = "2026-10-18T14:05:00.000Z";
  const legacyOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };

  it.each([undefined, "UTC", "America/New_York", "Asia/Kolkata", "Pacific/Chatham"])(
    "matches toLocaleString in time zone %s",
    (timeZone) => {
      const expected = new Date(publishedAt).toLocaleString(undefined, {
        ...legacyOptions,
        ...(timeZone ? { timeZone } : {}),
      });
      expect(formatPublishedMetadata({ publishedAt, publishedBy: null, timeZone })).toBe(
        `Published ${expected}.`,
      );
    },
  );

  it("treats an empty time zone as the runtime default", () => {
    expect(formatPublishedMetadata({ publishedAt, publishedBy: null, timeZone: "" })).toBe(
      formatPublishedMetadata({ publishedAt, publishedBy: null }),
    );
  });

  it("names the publisher only when a resolver is given", () => {
    const base = { publishedAt, publishedBy: "user-1", timeZone: "UTC" };
    expect(formatPublishedMetadata(base)).toBe("Published Oct 18, 2026, 2:05 PM UTC.");
    expect(formatPublishedMetadata({ ...base, resolvePublisherName: () => "Mina" })).toBe(
      "Published Oct 18, 2026, 2:05 PM UTC by Mina.",
    );
    expect(formatPublishedMetadata({ ...base, resolvePublisherName: () => null })).toBe(
      "Published Oct 18, 2026, 2:05 PM UTC by Unknown author.",
    );
  });

  it("says when the publish time is unreadable", () => {
    expect(formatPublishedMetadata({ publishedAt: "not a date", publishedBy: null })).toBe(
      "Published at an unknown time.",
    );
  });

  it("reuses one formatter per time zone", () => {
    expect(publishedAtFormatter("UTC")).toBe(publishedAtFormatter("UTC"));
    expect(publishedAtFormatter(undefined)).toBe(publishedAtFormatter(null));
    expect(publishedAtFormatter("UTC")).not.toBe(publishedAtFormatter("Asia/Kolkata"));
  });
});
