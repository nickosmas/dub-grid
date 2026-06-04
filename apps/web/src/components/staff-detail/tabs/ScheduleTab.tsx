"use client";

import { useState, useMemo, Fragment } from "react";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import type {
  Employee,
  ShiftMap,
  AssignmentDefinition,
  FocusArea,
  ShiftCategory,
  ShiftRequest,
  RecurringShift,
  AbsenceType,
  ShiftDisplayMode,
} from "@/types";
import { fmt12h } from "@/lib/utils";
import { computeShiftDurationHours } from "@/lib/dashboard-stats";
import { joinShiftJobSegmentNames } from "@/lib/shift-job-segments";
import { DAY_LABELS } from "@/lib/constants";
import {
  formatShiftRequestStatusLabel,
  formatShiftRequestTypeLabel,
} from "@/lib/client-facing";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, History, Clock } from "lucide-react";

interface ScheduleTabProps {
  employee: Employee;
  shifts: ShiftMap;
  assignmentById: Map<number, AssignmentDefinition>;
  focusAreas: FocusArea[];
  categoryById: Map<number, ShiftCategory>;
  focusAreaById: Map<number, FocusArea>;
  absenceTypeById: Map<number, AbsenceType>;
  auditNames: Map<string, string>;
  shiftRequests: ShiftRequest[];
  recurringShifts: RecurringShift[];
  canViewRecurringShifts: boolean;
  shiftDisplayMode?: ShiftDisplayMode;
}

function compactName(fullName: string): string {
  const parts = fullName.split(" ").filter(Boolean);
  if (parts.length <= 1) return fullName;
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

export function ScheduleTab({
  employee,
  shifts,
  assignmentById,
  categoryById,
  focusAreaById,
  absenceTypeById,
  auditNames,
  shiftRequests,
  recurringShifts,
  canViewRecurringShifts,
  shiftDisplayMode = "code",
}: ScheduleTabProps) {
  const isNameMode = shiftDisplayMode === "name";
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const shiftEntries = useMemo(() => {
    return Object.entries(shifts)
      .filter(([key]) => key.startsWith(`${employee.id}_`))
      .filter(([, entry]) => !entry.isDelete && (entry.assignmentIds.length > 0 || entry.absenceTypeId != null))
      .map(([key, entry]) => ({
        dateKey: key.substring(key.indexOf("_") + 1),
        ...entry,
      }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [shifts, employee.id]);

  const totalPages = Math.ceil(shiftEntries.length / PAGE_SIZE);
  const pageEntries = shiftEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const groupedEntries = useMemo(() => {
    const groups: { month: string; entries: typeof pageEntries }[] = [];
    let currentMonth = "";
    for (const entry of pageEntries) {
      const date = new Date(`${entry.dateKey}T00:00:00`);
      const month = date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
      if (month !== currentMonth) {
        currentMonth = month;
        groups.push({ month, entries: [] });
      }
      groups[groups.length - 1].entries.push(entry);
    }
    return groups;
  }, [pageEntries]);

  return (
    <div className="flex flex-col gap-4">
      {canViewRecurringShifts && (
        <div className="dg-card">
          <div className="dg-card-header">
            <div>
              <div className="dg-card-title flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-[var(--color-text-muted)]" />
                Recurring schedule
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 py-0 font-mono text-[10px]">
                  {recurringShifts.length}
                </Badge>
              </div>
              <div className="dg-card-subtitle">Weekly pattern for repeating assignments.</div>
            </div>
          </div>
          <div className="dg-card-body">
            {recurringShifts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CalendarClock className="mb-3 h-7 w-7 text-[var(--color-text-faint)]" />
                <p className="text-[13px] text-[var(--color-text-muted)]">No recurring shifts configured</p>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {DAY_LABELS.map((day, i) => {
                    const recurringShift = recurringShifts.find((shift) => shift.dayOfWeek === i);
                    return (
                      <div
                        key={day}
                        className={`flex flex-col items-center justify-center rounded-lg border py-2.5 ${
                          recurringShift
                            ? "border-[var(--color-border-light)] bg-[var(--color-bg)]"
                            : "border-transparent bg-transparent"
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
                          {day}
                        </span>
                        <span
                          className={`mt-1 max-w-full truncate px-0.5 text-[11px] font-semibold ${
                            recurringShift
                              ? "text-[var(--color-text-primary)]"
                              : "text-[var(--color-text-faint)]"
                          }`}
                        >
                          {recurringShift ? recurringShift.shiftLabel : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {recurringShifts.some((shift) => shift.effectiveUntil) && (
                  <p className="mt-3 text-center text-[10px] text-[var(--color-text-muted)]">
                    {recurringShifts
                      .filter((shift) => shift.effectiveUntil)
                      .map((shift) => `${DAY_LABELS[shift.dayOfWeek]}: until ${shift.effectiveUntil}`)
                      .join(" · ")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="dg-card">
        <div className="dg-card-header">
          <div>
            <div className="dg-card-title flex items-center gap-2">
              <History className="h-4 w-4 text-[var(--color-text-muted)]" />
              Shift history
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 py-0 font-mono text-[10px]">
                {shiftEntries.length}
              </Badge>
            </div>
            <div className="dg-card-subtitle">Published and draft assignment history for this person.</div>
          </div>
        </div>
        <div className="p-0">
          {shiftEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="mb-3 h-7 w-7 text-[var(--color-text-faint)]" />
              <p className="text-[13px] text-[var(--color-text-muted)]">No shifts found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Focus Area</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Edited By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedEntries.map((group) => (
                      <Fragment key={`month-${group.month}`}>
                        <TableRow>
                          <TableCell colSpan={7} className="bg-[var(--color-bg)] px-4 py-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-text-subtle)]">
                              {group.month}
                            </span>
                          </TableCell>
                        </TableRow>
                        {group.entries.map((entry) => {
                          const isAbsence = entry.absenceTypeId != null;
                          const absenceType = isAbsence ? absenceTypeById.get(entry.absenceTypeId!) ?? null : null;
                          const publishedSet = new Set(entry.publishedAssignmentDefinitionIds ?? []);
                          const codes = !isAbsence
                            ? entry.assignmentIds.map((id) => {
                                const assignment =
                                  assignmentById.get(id);
                                const focusArea =
                                  assignment?.focusAreaId != null
                                    ? focusAreaById.get(assignment.focusAreaId)
                                    : null;
                                const isCodeDraft = !publishedSet.has(id);
                                return {
                                  assignment: assignment ?? null,
                                  focusArea,
                                  isCodeDraft,
                                };
                              })
                            : [];

                          const hours = isAbsence
                            ? 0
                            : computeShiftDurationHours(
                                entry.assignmentIds,
                                assignmentById,
                                entry.customStartTime,
                                entry.customEndTime,
                                categoryById,
                              );
                          const date = new Date(`${entry.dateKey}T00:00:00`);
                          const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
                          const isSplit = codes.length > 1;

                          return (
                            <TableRow key={entry.dateKey}>
                              <TableCell>
                                <span className="mr-1.5 font-semibold text-[var(--color-text-primary)]">{dayName}</span>
                                <span className="text-[var(--color-text-muted)]">{entry.dateKey}</span>
                              </TableCell>
                              <TableCell>
                                <div className={`flex gap-1 ${isSplit ? "flex-col" : "flex-wrap"}`}>
                                  {isAbsence ? (
                                    absenceType ? (
                                      <Badge
                                        variant="outline"
                                        style={{
                                          backgroundColor: absenceType.color,
                                          color: absenceType.text,
                                          borderColor: absenceType.border,
                                        }}
                                        className="h-5 w-fit px-1.5 py-0 text-[10px]"
                                      >
                                        {isNameMode ? (absenceType.name || absenceType.label) : absenceType.label}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="h-5 w-fit px-1.5 py-0 text-[10px] text-muted-foreground">
                                        {entry.label || "?"}
                                      </Badge>
                                    )
                                  ) : (
                                    codes.map(({ assignment, isCodeDraft }, idx) =>
                                      assignment ? (
                                        <div key={assignment.id} className="flex items-center gap-1.5">
                                          <Badge
                                            variant="outline"
                                            style={{
                                              backgroundColor: assignment.color,
                                              color: assignment.text,
                                              borderColor: assignment.border,
                                            }}
                                            className="h-5 px-1.5 py-0 text-[10px]"
                                          >
                                            {isNameMode
                                              ? (assignment.name ||
                                                  assignment.label)
                                              : assignment.label}
                                          </Badge>
                                          {!isNameMode &&
                                            isSplit &&
                                            assignment.name && (
                                            <span className="text-[11px] text-[var(--color-text-muted)]">
                                              {assignment.name}
                                            </span>
                                          )}
                                          {isSplit && entry.isDraft && (
                                            <span
                                              className="text-[10px] font-semibold"
                                              style={{
                                                color: isCodeDraft ? "var(--color-warning)" : "var(--color-success)",
                                              }}
                                            >
                                              {isCodeDraft ? "Draft" : "Live"}
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <Badge key={`unknown-${idx}`} variant="outline" className="h-5 px-1.5 py-0 text-[10px] text-muted-foreground">
                                          ?
                                        </Badge>
                                      ),
                                    )
                                  )}
                                  {entry.fromRecurring && (
                                    <Hint content={hint("From recurring schedule")} side="top">
                                      <span className="text-[11px] text-[var(--color-text-muted)]">↻</span>
                                    </Hint>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-[13px] text-[var(--color-text-muted)]">
                                {isAbsence ? "—" : isSplit ? (
                                  <div className="flex flex-col gap-0.5">
                                    {codes.map(({ focusArea }, idx) => (
                                      <span key={idx}>{focusArea ? focusArea.name : "—"}</span>
                                    ))}
                                  </div>
                                ) : (
                                  codes[0]?.focusArea?.name ?? "—"
                                )}
                              </TableCell>
                              <TableCell className="text-[13px] text-[var(--color-text-muted)]">
                                {isAbsence ? "—" : isSplit ? (
                                  <div className="flex flex-col gap-0.5">
                                    {codes.map(({ assignment }, idx) => {
                                      const customStarts = entry.customStartTime?.split("|") ?? [];
                                      const customEnds = entry.customEndTime?.split("|") ?? [];
                                      const start =
                                        customStarts[idx] ||
                                        assignment?.defaultStartTime;
                                      const end =
                                        customEnds[idx] ||
                                        assignment?.defaultEndTime;
                                      return (
                                        <span key={idx}>
                                          {start && end ? `${fmt12h(start)} – ${fmt12h(end)}` : "—"}
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : (() => {
                                  const assignment =
                                    codes[0]?.assignment;
                                  const start =
                                    entry.customStartTime ??
                                    assignment?.defaultStartTime;
                                  const end =
                                    entry.customEndTime ??
                                    assignment?.defaultEndTime;
                                  return start && end ? `${fmt12h(start)} – ${fmt12h(end)}` : "—";
                                })()}
                              </TableCell>
                              <TableCell className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                                {hours > 0 ? `${Math.round(hours * 10) / 10}h` : "—"}
                              </TableCell>
                              <TableCell>
                                {isSplit && entry.isDraft && codes.some((code) => code.isCodeDraft) && codes.some((code) => !code.isCodeDraft) ? (
                                  <div className="flex flex-col gap-0.5">
                                    {codes.map(({ isCodeDraft }, idx) => (
                                      <span
                                        key={idx}
                                        className="text-[12px] font-semibold"
                                        style={{ color: isCodeDraft ? "var(--color-warning)" : "var(--color-success)" }}
                                      >
                                        {isCodeDraft ? "Draft" : "Published"}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span
                                    className="text-[12px] font-semibold"
                                    style={{ color: entry.isDraft ? "var(--color-warning)" : "var(--color-success)" }}
                                  >
                                    {entry.isDraft ? "Draft" : "Published"}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-[12px] text-[var(--color-text-muted)]">
                                {(() => {
                                  const editorId = entry.updatedBy || entry.createdBy;
                                  if (!editorId) return "—";
                                  const name = auditNames.get(editorId);
                                  if (!name) return "—";
                                  const timestamp = entry.updatedAt || entry.createdAt;
                                  const label = <span>{compactName(name)}</span>;
                                  if (!timestamp) return label;
                                  return (
                                    <Hint content={hint(new Date(timestamp).toLocaleString())} side="bottom">
                                      {label}
                                    </Hint>
                                  );
                                })()}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-[var(--color-border-light)] px-4 py-3">
                  <span className="text-[12px] text-[var(--color-text-muted)]">
                    Page {page + 1} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                      disabled={page === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((currentPage) => Math.min(totalPages - 1, currentPage + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {shiftRequests.length > 0 && (
        <div className="dg-card">
          <div className="dg-card-header">
            <div>
              <div className="dg-card-title flex items-center gap-2">
                <Clock className="h-4 w-4 text-[var(--color-text-muted)]" />
                Shift requests
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 py-0 font-mono text-[10px]">
                  {shiftRequests.length}
                </Badge>
              </div>
              <div className="dg-card-subtitle">Requests initiated by or for this person.</div>
            </div>
          </div>
          <div className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shiftRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="text-[13px] font-medium">{formatShiftRequestTypeLabel(request.type)}</TableCell>
                      <TableCell className="text-[13px]">{request.requesterShiftDate}</TableCell>
                      <TableCell className="text-[13px] font-semibold">
                        {request.requesterSegments?.length
                          ? joinShiftJobSegmentNames(request.requesterSegments)
                          : request.requesterShiftLabel}
                      </TableCell>
                      <TableCell>
                        <span
                          className="text-[12px] font-semibold capitalize"
                          style={{
                            color:
                              request.status === "approved"
                                ? "var(--color-success)"
                                : request.status === "rejected"
                                  ? "var(--color-danger)"
                                  : "var(--color-warning)",
                          }}
                        >
                          {formatShiftRequestStatusLabel(request.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-[13px] text-[var(--color-text-muted)]">
                        {new Date(request.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
