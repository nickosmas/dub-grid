"use client";

import { useState, useMemo, Fragment } from "react";
import type {
  Employee,
  ShiftMap,
  ShiftCode,
  FocusArea,
  ShiftCategory,
  ShiftRequest,
  RecurringShift,
  AbsenceType,
} from "@/types";
import { fmt12h } from "@/lib/utils";
import { computeShiftDurationHours } from "@/lib/dashboard-stats";
import { DAY_LABELS } from "@/lib/constants";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, History, Clock } from "lucide-react";

interface ScheduleTabProps {
  employee: Employee;
  shifts: ShiftMap;
  shiftCodeById: Map<number, ShiftCode>;
  focusAreas: FocusArea[];
  categoryById: Map<number, ShiftCategory>;
  focusAreaById: Map<number, FocusArea>;
  absenceTypeById: Map<number, AbsenceType>;
  auditNames: Map<string, string>;
  shiftRequests: ShiftRequest[];
  recurringShifts: RecurringShift[];
}

/** Format a full name as "F. LastName" for compact display. */
function compactName(fullName: string): string {
  const parts = fullName.split(" ").filter(Boolean);
  if (parts.length <= 1) return fullName;
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

export function ScheduleTab({
  employee,
  shifts,
  shiftCodeById,
  categoryById,
  focusAreaById,
  absenceTypeById,
  auditNames,
  shiftRequests,
  recurringShifts,
}: ScheduleTabProps) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const shiftEntries = useMemo(() => {
    return Object.entries(shifts)
      .filter(([key]) => key.startsWith(`${employee.id}_`))
      .filter(([, entry]) => !entry.isDelete && (entry.shiftCodeIds.length > 0 || entry.absenceTypeId != null))
      .map(([key, entry]) => ({
        dateKey: key.substring(key.indexOf("_") + 1),
        ...entry,
      }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [shifts, employee.id]);

  const totalPages = Math.ceil(shiftEntries.length / PAGE_SIZE);
  const pageEntries = shiftEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Group page entries by month
  const groupedEntries = useMemo(() => {
    const groups: { month: string; entries: typeof pageEntries }[] = [];
    let currentMonth = "";
    for (const entry of pageEntries) {
      const date = new Date(entry.dateKey + "T00:00:00");
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
      {/* Recurring Schedule */}
      <Card className="shadow-sm">
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-[14px] font-bold text-foreground flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
            Recurring Schedule
            <Badge variant="secondary" className="ml-1 font-mono text-[10px] px-1.5 py-0 h-4">{recurringShifts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recurringShifts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CalendarClock className="w-7 h-7 text-muted-foreground/30 mb-3" />
              <p className="text-[13px] text-muted-foreground">No recurring shifts configured</p>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {DAY_LABELS.map((day, i) => {
                  const rs = recurringShifts.find(r => r.dayOfWeek === i);
                  return (
                    <div
                      key={day}
                      className={`flex flex-col items-center justify-center py-2.5 rounded-lg border ${
                        rs ? 'bg-muted/50 border-border' : 'bg-transparent border-transparent'
                      }`}
                    >
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{day}</span>
                      <span className={`text-[11px] mt-1 font-semibold truncate max-w-full px-0.5 ${
                        rs ? 'text-foreground' : 'text-muted-foreground/30'
                      }`}>
                        {rs ? rs.shiftLabel : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
              {recurringShifts.some(rs => rs.effectiveUntil) && (
                <p className="text-[10px] text-muted-foreground mt-3 text-center">
                  {recurringShifts
                    .filter(rs => rs.effectiveUntil)
                    .map(rs => `${DAY_LABELS[rs.dayOfWeek]}: until ${rs.effectiveUntil}`)
                    .join(" · ")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shift History */}
      <Card className="shadow-sm">
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-[14px] font-bold text-foreground flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            Shift History
            <Badge variant="secondary" className="ml-1 font-mono text-[10px] px-1.5 py-0 h-4">{shiftEntries.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {shiftEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="w-7 h-7 text-muted-foreground/30 mb-3" />
              <p className="text-[13px] text-muted-foreground">No shifts found</p>
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
                          <TableCell colSpan={7} className="bg-muted/30 py-1.5 px-4">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.05em]">
                              {group.month}
                            </span>
                          </TableCell>
                        </TableRow>
                        {group.entries.map((entry) => {
                          const isAbsence = entry.absenceTypeId != null;
                          const absenceType = isAbsence ? absenceTypeById.get(entry.absenceTypeId!) ?? null : null;

                          // Resolve each shift code with its focus area, times, and per-code draft status
                          const pubSet = new Set(entry.publishedShiftCodeIds ?? []);
                          const codes = !isAbsence
                            ? entry.shiftCodeIds.map((id) => {
                                const sc = shiftCodeById.get(id);
                                const fa = sc?.focusAreaId != null ? focusAreaById.get(sc.focusAreaId) : null;
                                const isCodeDraft = !pubSet.has(id);
                                return { sc: sc ?? null, fa, isCodeDraft };
                              })
                            : [];

                          const hours = isAbsence ? 0 : computeShiftDurationHours(
                            entry.shiftCodeIds,
                            shiftCodeById,
                            entry.customStartTime,
                            entry.customEndTime,
                            categoryById,
                            focusAreaById,
                          );
                          const date = new Date(entry.dateKey + "T00:00:00");
                          const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
                          const isSplit = codes.length > 1;

                          return (
                            <TableRow key={entry.dateKey}>
                              <TableCell>
                                <span className="font-semibold text-foreground mr-1.5">{dayName}</span>
                                <span className="text-muted-foreground">{entry.dateKey}</span>
                              </TableCell>
                              <TableCell>
                                <div className={`flex ${isSplit ? 'flex-col' : 'flex-wrap'} gap-1`}>
                                  {isAbsence ? (
                                    absenceType ? (
                                      <Badge
                                        variant="outline"
                                        style={{
                                          backgroundColor: absenceType.color,
                                          color: absenceType.text,
                                          borderColor: absenceType.border,
                                        }}
                                        className="px-1.5 py-0 h-5 text-[10px] w-fit"
                                      >
                                        {absenceType.label}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="px-1.5 py-0 h-5 text-[10px] w-fit text-muted-foreground">
                                        {entry.label || "?"}
                                      </Badge>
                                    )
                                  ) : (
                                    codes.map(({ sc }, idx) =>
                                      sc ? (
                                        <div key={sc.id} className="flex items-center gap-1.5">
                                          <Badge
                                            variant="outline"
                                            style={{
                                              backgroundColor: sc.color,
                                              color: sc.text,
                                              borderColor: sc.border,
                                            }}
                                            className="px-1.5 py-0 h-5 text-[10px]"
                                          >
                                            {sc.label}
                                          </Badge>
                                          {isSplit && sc.name && (
                                            <span className="text-[11px] text-muted-foreground">{sc.name}</span>
                                          )}
                                        </div>
                                      ) : (
                                        <Badge key={`unknown-${idx}`} variant="outline" className="px-1.5 py-0 h-5 text-[10px] text-muted-foreground">
                                          ?
                                        </Badge>
                                      ),
                                    )
                                  )}
                                  {entry.fromRecurring && (
                                    <span className="text-muted-foreground text-[11px]" title="From recurring schedule">↻</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-[13px] text-muted-foreground">
                                {isAbsence ? "—" : isSplit ? (
                                  <div className="flex flex-col gap-0.5">
                                    {codes.map(({ fa }, idx) => (
                                      <span key={idx}>{fa ? fa.name : "—"}</span>
                                    ))}
                                  </div>
                                ) : (
                                  codes[0]?.fa?.name ?? "—"
                                )}
                              </TableCell>
                              <TableCell className="text-[13px] text-muted-foreground">
                                {isAbsence ? "—" : isSplit ? (
                                  <div className="flex flex-col gap-0.5">
                                    {codes.map(({ sc }, idx) => {
                                      // Parse pipe-delimited custom times for split shifts
                                      const customStarts = entry.customStartTime?.split("|") ?? [];
                                      const customEnds = entry.customEndTime?.split("|") ?? [];
                                      const start = customStarts[idx] || sc?.defaultStartTime;
                                      const end = customEnds[idx] || sc?.defaultEndTime;
                                      return (
                                        <span key={idx}>
                                          {start && end ? `${fmt12h(start)} – ${fmt12h(end)}` : "—"}
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : (() => {
                                  const sc = codes[0]?.sc;
                                  const start = entry.customStartTime ?? sc?.defaultStartTime;
                                  const end = entry.customEndTime ?? sc?.defaultEndTime;
                                  return start && end ? `${fmt12h(start)} – ${fmt12h(end)}` : "—";
                                })()}
                              </TableCell>
                              <TableCell className="font-semibold text-foreground text-[13px]">
                                {hours > 0 ? `${Math.round(hours * 10) / 10}h` : "—"}
                              </TableCell>
                              <TableCell>
                                {isSplit && entry.isDraft && codes.some(c => c.isCodeDraft) && codes.some(c => !c.isCodeDraft) ? (
                                  <div className="flex flex-col gap-0.5">
                                    {codes.map(({ isCodeDraft }, idx) => (
                                      <span key={idx} className={`text-[12px] font-semibold ${isCodeDraft ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        {isCodeDraft ? "Draft" : "Published"}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className={`text-[12px] font-semibold ${entry.isDraft ? 'text-amber-600' : 'text-emerald-600'}`}>
                                    {entry.isDraft ? "Draft" : "Published"}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-[12px] text-muted-foreground">
                                {(() => {
                                  const editorId = entry.updatedBy || entry.createdBy;
                                  if (!editorId) return "—";
                                  const name = auditNames.get(editorId);
                                  if (!name) return "—";
                                  const timestamp = entry.updatedAt || entry.createdAt;
                                  return (
                                    <span title={timestamp ? new Date(timestamp).toLocaleString() : undefined}>
                                      {compactName(name)}
                                    </span>
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <span className="text-[12px] text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Shift Requests */}
      {shiftRequests.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-[14px] font-bold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Shift Requests
              <Badge variant="secondary" className="ml-1 font-mono text-[10px] px-1.5 py-0 h-4">{shiftRequests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
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
                  {shiftRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="capitalize font-medium text-[13px]">{req.type}</TableCell>
                      <TableCell className="text-[13px]">{req.requesterShiftDate}</TableCell>
                      <TableCell className="font-semibold text-[13px]">{req.requesterShiftLabel}</TableCell>
                      <TableCell>
                        <span className={`text-[12px] font-semibold capitalize ${
                          req.status === 'approved' ? 'text-emerald-600' :
                          req.status === 'rejected' ? 'text-rose-600' :
                          'text-amber-600'
                        }`}>
                          {req.status.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">
                        {new Date(req.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
