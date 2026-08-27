"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { addDays, formatDate, formatDateKey } from "@/lib/utils";
import {
  importPreviousSchedule,
  type ImportPreviousScheduleOutcome,
} from "@/features/schedule/client";
import {
  formatImportPreviousSkipDescription,
  summarizeImportPreviousOutcomes,
  type ImportPreviousBreakdown,
  type ScheduleOperation,
} from "../_lib/operations";

export type ImportPreviewState = {
  sourceRange: string;
  targetRange: string;
  sourceStartDate: string;
  sourceEndDate: string;
  targetStartDate: string;
  targetEndDate: string;
  outcomes: ImportPreviousScheduleOutcome[];
  breakdown: ImportPreviousBreakdown;
};

export type ImportResultsState = {
  sourceRange: string;
  targetRange: string;
  outcomes: ImportPreviousScheduleOutcome[];
  breakdown: ImportPreviousBreakdown;
};

/**
 * Owns the "import previous schedule" flow for the scheduler: the dry-run
 * preview, the confirm dialog state, the import itself (with progress via the
 * schedule-operation modal), and the skipped-shift results modal. Extracted
 * verbatim from SchedulePageClient.
 */
export function useScheduleImport({
  org,
  spanWeeks,
  weekStart,
  employeeNameById,
  refetchScheduleData,
  startScheduleOperation,
  updateScheduleOperation,
  finishScheduleOperation,
  clearScheduleOperation,
}: {
  org: { id: string } | null;
  spanWeeks: 1 | 2 | "month";
  weekStart: Date;
  employeeNameById: Map<string, string>;
  refetchScheduleData: (opts?: {
    ensureStart?: string;
    ensureEnd?: string;
    recenter?: boolean;
  }) => Promise<unknown>;
  startScheduleOperation: (operation: ScheduleOperation) => void;
  updateScheduleOperation: (
    kind: ScheduleOperation["kind"],
    updates: Partial<Omit<ScheduleOperation, "kind">>,
  ) => void;
  finishScheduleOperation: (kind: ScheduleOperation["kind"], detail?: string) => void;
  clearScheduleOperation: (kind: ScheduleOperation["kind"]) => void;
}) {
  const [isImportingPrevious, setIsImportingPrevious] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(null);
  const [importResults, setImportResults] = useState<ImportResultsState | null>(null);
  const [showImportResults, setShowImportResults] = useState(false);

  const handleImportPreviousPreview = useCallback(async () => {
    if (!org || spanWeeks === "month") return;

    const days = spanWeeks * 7;
    const sourceStart = addDays(weekStart, -days);
    const sourceEnd = addDays(sourceStart, days - 1);
    const targetEnd = addDays(weekStart, days - 1);
    const sourceStartKey = formatDateKey(sourceStart);
    const sourceEndKey = formatDateKey(sourceEnd);
    const targetStartKey = formatDateKey(weekStart);
    const targetEndKey = formatDateKey(targetEnd);

    setIsImportingPrevious(true);
    try {
      const outcomes = await importPreviousSchedule({
        orgId: org.id,
        sourceStartDate: sourceStartKey,
        sourceEndDate: sourceEndKey,
        targetStartDate: targetStartKey,
        targetEndDate: targetEndKey,
        dryRun: true,
      });

      if (outcomes.length === 0) {
        toast.info("Nothing to import — the previous period has no shifts.");
        return;
      }

      const breakdown = summarizeImportPreviousOutcomes(outcomes);
      if (breakdown.imported === 0 && breakdown.totalSkipped > 0) {
        toast.info(
          `Nothing new to import — ${formatImportPreviousSkipDescription(outcomes, breakdown, employeeNameById)}.`,
        );
        return;
      }

      setImportPreview({
        sourceRange: `${formatDate(sourceStart)} – ${formatDate(sourceEnd)}`,
        targetRange: `${formatDate(weekStart)} – ${formatDate(targetEnd)}`,
        sourceStartDate: sourceStartKey,
        sourceEndDate: sourceEndKey,
        targetStartDate: targetStartKey,
        targetEndDate: targetEndKey,
        outcomes,
        breakdown,
      });
      setShowImportConfirm(true);
    } catch (err) {
      Sentry.captureException(err);
      toast.error("Couldn't load the import preview. Try again.");
    } finally {
      setIsImportingPrevious(false);
    }
  }, [org, spanWeeks, weekStart, employeeNameById]);

  const handleImportPrevious = useCallback(async () => {
    if (!org || spanWeeks === "month" || !importPreview) return;

    const expected = importPreview.breakdown.imported;
    startScheduleOperation({
      kind: "import_previous",
      title: "Importing previous schedule",
      detail: `Copying ${expected} shift${expected === 1 ? "" : "s"} from ${importPreview.sourceRange} into ${importPreview.targetRange}.`,
      progress: 25,
    });
    setShowImportConfirm(false);
    setIsImportingPrevious(true);

    try {
      const outcomes = await importPreviousSchedule({
        orgId: org.id,
        sourceStartDate: importPreview.sourceStartDate,
        sourceEndDate: importPreview.sourceEndDate,
        targetStartDate: importPreview.targetStartDate,
        targetEndDate: importPreview.targetEndDate,
        dryRun: false,
      });

      updateScheduleOperation("import_previous", {
        progress: 80,
        detail: "Refreshing the schedule with the imported shifts...",
      });
      // Widen the refetch window so newly imported drafts in a target period
      // beyond the default ±90 days from today still come back from the API
      // and show up in the grid.
      await refetchScheduleData({
        ensureStart: importPreview.targetStartDate,
        ensureEnd: importPreview.targetEndDate,
      });
      finishScheduleOperation("import_previous");

      const breakdown = summarizeImportPreviousOutcomes(outcomes);
      const skipDescription = formatImportPreviousSkipDescription(
        outcomes,
        breakdown,
        employeeNameById,
      );

      if (breakdown.totalSkipped > 0) {
        setImportResults({
          sourceRange: importPreview.sourceRange,
          targetRange: importPreview.targetRange,
          outcomes,
          breakdown,
        });
      }

      if (breakdown.imported === 0) {
        toast.info(
          skipDescription ? `Nothing imported — ${skipDescription}.` : "Nothing imported.",
          breakdown.totalSkipped > 0
            ? { action: { label: "View details", onClick: () => setShowImportResults(true) } }
            : undefined,
        );
      } else if (breakdown.totalSkipped > 0) {
        toast.warning(
          `Imported ${breakdown.imported} shift${
            breakdown.imported === 1 ? "" : "s"
          }, skipped ${breakdown.totalSkipped} (${skipDescription}).`,
          {
            duration: 12000,
            action: { label: "View details", onClick: () => setShowImportResults(true) },
          },
        );
      } else {
        toast.success(
          `Imported ${breakdown.imported} shift${
            breakdown.imported === 1 ? "" : "s"
          } from previous ${spanWeeks === 1 ? "week" : "2 weeks"}.`,
        );
      }
    } catch (err) {
      clearScheduleOperation("import_previous");
      Sentry.captureException(err);
      toast.error("Couldn't import the previous schedule. Refreshing now.");
      await refetchScheduleData();
    } finally {
      setIsImportingPrevious(false);
      setImportPreview(null);
    }
  }, [
    org,
    spanWeeks,
    importPreview,
    employeeNameById,
    refetchScheduleData,
    startScheduleOperation,
    updateScheduleOperation,
    finishScheduleOperation,
    clearScheduleOperation,
  ]);

  const cancelImportConfirm = useCallback(() => {
    setShowImportConfirm(false);
    setImportPreview(null);
  }, []);

  const closeImportResults = useCallback(() => {
    setShowImportResults(false);
  }, []);

  return {
    importPreview,
    importResults,
    showImportConfirm,
    showImportResults,
    isImportingPrevious,
    handleImportPreviousPreview,
    handleImportPrevious,
    cancelImportConfirm,
    closeImportResults,
  };
}
