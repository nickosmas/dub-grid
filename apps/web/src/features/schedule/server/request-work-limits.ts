import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleCellStateSchema, type ScheduleCellState } from "@dubgrid/contracts";
import { fetchPublishedMobileScheduleRows } from "@dubgrid/data-access";
import {
  addDaysToIsoDate,
  requestDayChanges,
  requestWorkLimitBreaks,
  scheduleStateHours,
  type NamedRequestWorkLimitPerson,
  type RequestDayChange,
} from "@dubgrid/schedule-core";
import type { ShiftRequestType } from "@dubgrid/domain";
import { fetchAssignmentContext } from "@/lib/server/schedule-context";
import { createAssignmentDefinitionIdByPairMap } from "@/lib/shift-job-segments";

/** Far enough either side to name a whole run of days around a request. */
const SEARCH_DAYS = 31;

function parseState(value: unknown): ScheduleCellState | null {
  const parsed = scheduleCellStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Who approving each request awaiting approval would put over a work limit
 * (60c): the published schedule with that approval's shifts moved. An
 * approval publishes at once, so drafts never count. Requests not awaiting
 * approval, or that give nobody a shift, map to an empty list.
 */
export async function loadRequestsWorkLimits(
  serviceClient: SupabaseClient,
  orgId: string,
  requestIds: ReadonlyArray<string>,
): Promise<Map<string, NamedRequestWorkLimitPerson[]>> {
  const result = new Map<string, NamedRequestWorkLimitPerson[]>(requestIds.map((id) => [id, []]));
  if (requestIds.length === 0) return result;
  const { data: requests, error } = await serviceClient
    .from("shift_requests")
    .select(
      "id, type, status, requester_emp_id, requester_shift_date, requester_state, target_emp_id, target_shift_date, target_state",
    )
    .eq("org_id", orgId)
    .eq("status", "pending_approval")
    .in("id", [...requestIds]);
  if (error) throw error;
  if (!requests || requests.length === 0) return result;

  const { assignments, shiftCategories } = await fetchAssignmentContext(serviceClient, orgId);
  const lookups = {
    assignmentById: new Map(assignments.map((assignment) => [assignment.id, assignment])),
    assignmentIdByPair: createAssignmentDefinitionIdByPairMap(assignments, {
      includeArchived: true,
    }),
    shiftCategoriesById: new Map(shiftCategories.map((category) => [category.id, category])),
  };
  const hoursOf = (state: ScheduleCellState) => scheduleStateHours(state, lookups);

  const changesByRequest = new Map<string, RequestDayChange[]>();
  const rangeByPerson = new Map<string, { start: string; end: string }>();
  for (const request of requests) {
    const changes = requestDayChanges(
      {
        type: request.type as ShiftRequestType,
        requesterEmpId: request.requester_emp_id,
        requesterShiftDate: request.requester_shift_date,
        requesterState: parseState(request.requester_state),
        targetEmpId: request.target_emp_id,
        targetShiftDate: request.target_shift_date,
        targetState: parseState(request.target_state),
      },
      hoursOf,
    );
    changesByRequest.set(request.id, changes);
    for (const change of changes) {
      const range = rangeByPerson.get(change.employeeId);
      rangeByPerson.set(change.employeeId, {
        start: range && range.start < change.dateKey ? range.start : change.dateKey,
        end: range && range.end > change.dateKey ? range.end : change.dateKey,
      });
    }
  }
  const people = [...rangeByPerson.keys()];
  if (people.length === 0) return result;

  const [rowsByPerson, { data: employees, error: employeesError }] = await Promise.all([
    Promise.all(
      people.map((employeeId) => {
        const range = rangeByPerson.get(employeeId)!;
        return fetchPublishedMobileScheduleRows(serviceClient, {
          orgId,
          employeeId,
          startDate: addDaysToIsoDate(range.start, -SEARCH_DAYS),
          endDate: addDaysToIsoDate(range.end, SEARCH_DAYS),
        });
      }),
    ),
    serviceClient
      .from("employees")
      .select("id, first_name, last_name")
      .eq("org_id", orgId)
      .in("id", people),
  ]);
  if (employeesError) throw employeesError;

  const publishedDays = new Map<string, { shifts: number; hours: number }>();
  for (const row of rowsByPerson.flat()) {
    if (row.state.kind !== "worked") continue;
    publishedDays.set(`${row.emp_id}|${row.date}`, {
      shifts: row.state.segments.length,
      hours: hoursOf(row.state),
    });
  }
  const names = new Map(
    (employees ?? []).map((person) => [
      person.id as string,
      `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim(),
    ]),
  );
  const published = (employeeId: string, dateKey: string) =>
    publishedDays.get(`${employeeId}|${dateKey}`) ?? { shifts: 0, hours: 0 };

  for (const [requestId, changes] of changesByRequest) {
    result.set(
      requestId,
      requestWorkLimitBreaks({ changes, published }).map((person) => ({
        ...person,
        name: names.get(person.employeeId) || "Someone",
      })),
    );
  }
  return result;
}

/** The same for one request. */
export async function loadRequestWorkLimits(
  serviceClient: SupabaseClient,
  orgId: string,
  requestId: string,
): Promise<NamedRequestWorkLimitPerson[]> {
  const byRequest = await loadRequestsWorkLimits(serviceClient, orgId, [requestId]);
  return byRequest.get(requestId) ?? [];
}
