import type { MobileScheduleEntry, MobileScheduleEntrySegment } from "@dubgrid/contracts";

// Types and pure helpers for the shift-detail screen, extracted from
// ShiftDetailScreen.tsx so they are unit-testable and the screen file stays
// focused on stateful UI. Everything here must remain hookless and free of
// react-native imports beyond types.

export type RequestMode = "coverage" | "swap" | null;

export type ShiftTimeRange = {
  start: string;
  end: string;
};

export type ShiftmateSegmentMatch = {
  entry: MobileScheduleEntry;
  segment: MobileScheduleEntrySegment;
};

export type ShiftmateSegmentGroup = {
  key: string;
  label: string;
  title: string;
  timeRange: string | null;
  entries: ShiftmateSegmentMatch[];
};
