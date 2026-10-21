import { describe, expect, it } from "vitest";
import type { ShiftDiffDescriptorResult } from "@/lib/shift-diff-badges";
import {
  formatPublishedMetadata,
  publishCellLevelBadge,
  publishedAtFormatter,
  doubleShiftCellHeight,
  joinedCustomTimes,
  stacksShifts,
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

describe("stacksShifts", () => {
  it("keeps a single shift and a wide column's pair side by side", () => {
    expect(stacksShifts(84, 1, false)).toBe(false);
    // One week at 1440px: each pill keeps a single pill's 76px.
    expect(stacksShifts(172, 2, false)).toBe(false);
  });

  it("stacks a pair whose pills would be narrower than a single shift's", () => {
    // Two weeks at 1440px: two 34px halves.
    expect(stacksShifts(84, 2, false)).toBe(true);
    expect(stacksShifts(164, 2, false)).toBe(false);
    expect(stacksShifts(160, 2, true)).toBe(true);
  });
});

describe("doubleShiftCellHeight", () => {
  const base = {
    pillsDown: 2,
    isNameMode: false,
    hasSecondary: true,
    hasTime: false,
    hasNotes: false,
    hasChip: false,
  };

  it("adds only the lines a double shift shows", () => {
    expect(doubleShiftCellHeight(base)).toBe(
      "calc(8px + 2 * (var(--dg-fs-title) * 1.2 + 8px) + 4px)",
    );
    // The time line ends with the dots, so notes add no strip of their own.
    expect(doubleShiftCellHeight({ ...base, hasTime: true, hasNotes: true })).toBe(
      "calc(8px + 2 * (var(--dg-fs-title) * 1.2 + 1px + var(--dg-fs-footnote) + 8px) + 4px)",
    );
  });

  it("gives an untimed pill's notes a strip and a chip room above the words", () => {
    expect(doubleShiftCellHeight({ ...base, hasNotes: true })).toContain("+ 14px");
    // Room above one pill's words, and a wider gap in case it rides the lower pill.
    expect(doubleShiftCellHeight({ ...base, hasChip: true })).toBe(
      "calc(8px + 2 * (var(--dg-fs-title) * 1.2 + 8px) + 17px)",
    );
  });

  it("sizes a side-by-side pair as one pill tall", () => {
    expect(doubleShiftCellHeight({ ...base, pillsDown: 1 })).toBe(
      "calc(8px + 1 * (var(--dg-fs-title) * 1.2 + 8px) + 0px)",
    );
  });
});

describe("joinedCustomTimes", () => {
  it("keeps the second shift's time, as when the last shift has a Worked until", () => {
    expect(
      joinedCustomTimes({
        start: "",
        end: "",
        perPill: [
          { start: "", end: "" },
          { start: "15:30", end: "19:00" },
        ],
      }),
    ).toEqual({ customStartTime: "|15:30", customEndTime: "|19:00" });
  });

  it("keeps a single shift's time", () => {
    expect(joinedCustomTimes({ start: "07:00", end: "11:30" })).toEqual({
      customStartTime: "07:00",
      customEndTime: "11:30",
    });
  });

  it("gives no times for a cell without any", () => {
    expect(joinedCustomTimes(null)).toEqual({ customStartTime: null, customEndTime: null });
  });
});
