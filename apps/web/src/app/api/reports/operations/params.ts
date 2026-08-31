import { z } from "zod";
import {
  countRangeDays,
  getDatesInReportRange,
  type OperationsReportFilters,
  type OperationsReportRange,
} from "@/features/reports/server/operations";

const MAX_REPORT_RANGE_DAYS = 90;

export const operationsQuerySchema = z.object({
  orgId: z.string().uuid(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  employeeIds: z.string().optional(),
  focusAreaIds: z.string().optional(),
  shiftCategoryIds: z.string().optional(),
  jobIds: z.string().optional(),
  dates: z.string().optional(),
});

type OperationsQueryInput = z.infer<typeof operationsQuerySchema>;

function parseCsv(value: string | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function parseOperationsRange(
  input: Pick<OperationsQueryInput, "startDate" | "endDate">,
): OperationsReportRange {
  const range = {
    startDate: input.startDate,
    endDate: input.endDate,
  };
  const days = countRangeDays(range);
  if (days <= 0) {
    throw new RangeError("Choose a start date that is on or before the end date.");
  }
  if (days > MAX_REPORT_RANGE_DAYS) {
    throw new RangeError(
      `Reports can cover up to ${MAX_REPORT_RANGE_DAYS} days. Choose a shorter range.`,
    );
  }
  return range;
}

export function parseOperationsFilters(
  input: OperationsQueryInput,
  range: OperationsReportRange,
): OperationsReportFilters {
  const employeeIds = parseCsv(input.employeeIds);
  for (const employeeId of employeeIds) {
    if (!z.string().uuid().safeParse(employeeId).success) {
      throw new RangeError("Choose valid people before generating the report.");
    }
  }

  const focusAreaIds = parseCsv(input.focusAreaIds).map((value) => {
    if (!/^\d+$/.test(value)) {
      throw new RangeError("Choose valid focus areas before generating the report.");
    }
    return Number(value);
  });
  const shiftCategoryIds = parseCsv(input.shiftCategoryIds).map((value) => {
    if (!/^\d+$/.test(value)) {
      throw new RangeError("Choose valid shift categories before generating the report.");
    }
    return Number(value);
  });
  const jobIds = parseCsv(input.jobIds).map((value) => {
    if (!/^\d+$/.test(value)) {
      throw new RangeError("Choose valid jobs before generating the report.");
    }
    return Number(value);
  });

  const rangeDateSet = new Set(getDatesInReportRange(range));
  const dates = parseCsv(input.dates);
  for (const date of dates) {
    if (!z.string().date().safeParse(date).success || !rangeDateSet.has(date)) {
      throw new RangeError("Choose dates inside the selected report range.");
    }
  }

  return {
    employeeIds,
    focusAreaIds,
    shiftCategoryIds,
    jobIds,
    dates,
  };
}
