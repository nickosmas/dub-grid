import { describe, expect, it } from "vitest";
import type { ShiftDiffDescriptorResult } from "@/lib/shift-diff-badges";
import {
  formatCorrectionLabel,
  formatPublishedMetadata,
  publishCellLevelBadge,
  publishedAtFormatter,
  shiftCellHeight,
  singleShiftNeedsRoom,
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

describe("formatCorrectionLabel", () => {
  const correctedAt = "2026-10-30T22:12:00.000Z";

  it("says when, by whom, and why", () => {
    expect(
      formatCorrectionLabel({
        reason: "Left at 1 PM, not 3",
        correctedAt,
        correctedBy: "user-1",
        resolveName: () => "Mina",
        timeZone: "UTC",
      }),
    ).toBe("Corrected Oct 30, 2026, 10:12 PM UTC by Mina.\nReason: Left at 1 PM, not 3");
  });

  it("reads a reason key stored before reasons were typed", () => {
    expect(formatCorrectionLabel({ reason: "called_off", correctedAt, timeZone: "UTC" })).toBe(
      "Corrected Oct 30, 2026, 10:12 PM UTC.\nReason: Called off",
    );
  });

  it("leaves out what it doesn't know", () => {
    expect(formatCorrectionLabel({ reason: null })).toBe("Corrected.");
    expect(
      formatCorrectionLabel({ reason: null, correctedBy: "user-1", resolveName: () => null }),
    ).toBe("Corrected by Unknown author.");
    expect(formatCorrectionLabel({ reason: null, correctedAt: "not a date" })).toBe("Corrected.");
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

describe("shiftCellHeight", () => {
  const base = {
    pillsDown: 2,
    isNameMode: false,
    hasSecondary: true,
    hasTime: false,
    hasNotes: false,
    hasChip: false,
  };

  it("adds only the lines a double shift shows", () => {
    expect(shiftCellHeight(base)).toBe("calc(8px + 2 * (var(--dg-fs-title) * 1.2 + 8px) + 4px)");
    expect(shiftCellHeight({ ...base, hasTime: true })).toBe(
      "calc(8px + 2 * (var(--dg-fs-title) * 1.2 + 1px + var(--dg-fs-footnote) + 8px) + 4px)",
    );
  });

  it("gives notes a row of their own, even below a time line", () => {
    expect(shiftCellHeight({ ...base, hasNotes: true })).toContain("+ 14px");
    expect(shiftCellHeight({ ...base, hasTime: true, hasNotes: true })).toBe(
      "calc(8px + 2 * (var(--dg-fs-title) * 1.2 + 1px + var(--dg-fs-footnote) + 14px + 8px) + 4px)",
    );
  });

  it("keeps a chip room above the words", () => {
    // Room above one pill's words, and a wider gap in case it rides the lower pill.
    expect(shiftCellHeight({ ...base, hasChip: true })).toBe(
      "calc(8px + 2 * (var(--dg-fs-title) * 1.2 + 8px) + 17px)",
    );
  });

  it("sizes a side-by-side pair, or a single pill, as one pill tall", () => {
    expect(shiftCellHeight({ ...base, pillsDown: 1 })).toBe(
      "calc(8px + 1 * (var(--dg-fs-title) * 1.2 + 8px) + 0px)",
    );
  });

  it("gives a timed single pill with notes its time line and the notes' row", () => {
    expect(shiftCellHeight({ ...base, pillsDown: 1, hasTime: true, hasNotes: true })).toBe(
      "calc(8px + 1 * (var(--dg-fs-title) * 1.2 + 1px + var(--dg-fs-footnote) + 14px + 8px) + 0px)",
    );
  });

  it("gives a name-mode pill with a job and notes one name line, the job line and the row", () => {
    expect(shiftCellHeight({ ...base, pillsDown: 1, isNameMode: true, hasNotes: true })).toBe(
      "calc(8px + 1 * (var(--dg-fs-caption) * 1.2 * 1 + 1px + var(--dg-fs-footnote) * 1.3 + 14px + 8px) + 0px)",
    );
  });
});

describe("singleShiftNeedsRoom", () => {
  const single = { isNameMode: false, hasSecondary: false, hasTime: false, hasNotes: false };

  it("grows a pill whose notes' row sits below a second line", () => {
    expect(singleShiftNeedsRoom({ ...single, hasTime: true, hasNotes: true })).toBe(true);
    expect(
      singleShiftNeedsRoom({ ...single, isNameMode: true, hasSecondary: true, hasNotes: true }),
    ).toBe(true);
  });

  it("leaves a one-line pill with notes, or two lines without notes, at the normal height", () => {
    expect(singleShiftNeedsRoom({ ...single, hasNotes: true })).toBe(false);
    // Code mode keeps the job beside the shift, on the same line.
    expect(singleShiftNeedsRoom({ ...single, hasSecondary: true, hasNotes: true })).toBe(false);
    expect(singleShiftNeedsRoom({ ...single, hasTime: true })).toBe(false);
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
