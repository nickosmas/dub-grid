import type { ShiftDisplayMode } from "@/types";

export interface ScheduleGridLayoutInput {
  spanWeeks: 1 | 2;
  shiftDisplayMode: ShiftDisplayMode;
  containerWidth: number;
  hasOpenShifts: boolean;
  hasStackedCellContent: boolean;
}

export interface ScheduleGridLayoutResult {
  nameColWidth: number;
  colWidth: number;
  fitToContainer: boolean;
  minGridWidth: number;
}

const BASE_NAME_COL_WIDTH = 220;
const COMPACT_NAME_COL_WIDTH = 200;
const ONE_WEEK_CODE_COL_WIDTH = 84;
const ONE_WEEK_NAME_COL_WIDTH = 160;
const TWO_WEEK_CODE_COL_WIDTH = 72;
const TWO_WEEK_NAME_COL_WIDTH = 160;

function getTwoWeekMinimums(
  shiftDisplayMode: ShiftDisplayMode,
  hasOpenShifts: boolean,
  hasStackedCellContent: boolean,
) {
  if (shiftDisplayMode === "name") {
    return {
      nameColWidth: BASE_NAME_COL_WIDTH,
      dayColWidth: hasStackedCellContent ? 152 : 140,
    };
  }

  return {
    nameColWidth:
      hasOpenShifts || hasStackedCellContent
        ? BASE_NAME_COL_WIDTH
        : COMPACT_NAME_COL_WIDTH,
    dayColWidth: hasStackedCellContent ? 88 : hasOpenShifts ? 84 : 80,
  };
}

export function getScheduleGridLayout({
  spanWeeks,
  shiftDisplayMode,
  containerWidth,
  hasOpenShifts,
  hasStackedCellContent,
}: ScheduleGridLayoutInput): ScheduleGridLayoutResult {
  const numDays = spanWeeks * 7;

  if (spanWeeks === 1) {
    return {
      nameColWidth: BASE_NAME_COL_WIDTH,
      colWidth:
        shiftDisplayMode === "name"
          ? ONE_WEEK_NAME_COL_WIDTH
          : ONE_WEEK_CODE_COL_WIDTH,
      fitToContainer: false,
      minGridWidth:
        BASE_NAME_COL_WIDTH +
        numDays *
          (shiftDisplayMode === "name"
            ? ONE_WEEK_NAME_COL_WIDTH
            : ONE_WEEK_CODE_COL_WIDTH),
    };
  }

  const minimums = getTwoWeekMinimums(
    shiftDisplayMode,
    hasOpenShifts,
    hasStackedCellContent,
  );
  const minGridWidth = minimums.nameColWidth + numDays * minimums.dayColWidth;
  const fitToContainer = containerWidth >= minGridWidth;

  if (!fitToContainer || containerWidth <= 0) {
    return {
      nameColWidth: minimums.nameColWidth,
      colWidth:
        shiftDisplayMode === "name"
          ? Math.max(minimums.dayColWidth, TWO_WEEK_NAME_COL_WIDTH)
          : Math.max(minimums.dayColWidth, TWO_WEEK_CODE_COL_WIDTH),
      fitToContainer: false,
      minGridWidth,
    };
  }

  return {
    nameColWidth: minimums.nameColWidth,
    colWidth: Math.max(
      minimums.dayColWidth,
      Math.floor((containerWidth - minimums.nameColWidth) / numDays),
    ),
    fitToContainer: true,
    minGridWidth,
  };
}
