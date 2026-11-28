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
} from "@dubgrid/schedule-core";
import type { ShiftRequestType } from "@dubgrid/domain";
import { fetchAssignmentContext } from "@/lib/server/schedule-context";
import { createAssignmentDefinitionIdByPairMap } from "@/lib/shift-job-segments";

/** Far enough either side to name a whole run of days around the request. */
const SEARCH_DAYS = 31;

function parseState(value: unknown): ScheduleCellState | null {
  const parsed = scheduleCellStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Who approving a request awaiting approval would put over a work limit
 * (60c): the published schedule with the approval's shifts moved. An approval
 * publishes at once, so drafts never count.
 */
export async function loadRequestWorkLimits(
  serviceClient: SupabaseClient,
  orgId: string,
  requestId: string,
): Promise<NamedRequestWorkLimitPerson[]> {
  const { data: request, error } = await serviceClient
    .from("shift_requests")
    .select(
      "type, status, requester_emp_id, requester_shift_date, requester_state, target_emp_id, target_shift_date, target_state",
    )
    .eq("id", requestId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!request || request.status !== "pending_approval") return [];

  const { assignments, shiftCategories } = await fetchAssignmentContext(serviceClient, orgId);
  const lookups = {
    assignmentById: new Map(assignments.map((assignment) => [assignment.id, assignment])),
    assignmentIdByPair: createAssignmentDefinitionIdByPairMap(assignments, {
      includeArchived: true,
    }),
    shiftCategoriesById: new Map(shiftCategories.map((category) => [category.id, category])),
  };
  const hoursOf = (state: ScheduleCellState) => scheduleStateHours(state, lookups);

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
  const gaining = [...new Set(changes.filter((c) => c.shifts > 0).map((c) => c.employeeId))];
  if (gaining.length === 0) return [];

  const dates = changes.map((change) => change.dateKey).sort();
  const startDate = addDaysToIsoDate(dates[0], -SEARCH_DAYS);
  const endDate = addDaysToIsoDate(dates[dates.length - 1], SEARCH_DAYS);
  const [rowsByPerson, { data: people, error: peopleError }] = await Promise.all([
    Promise.all(
      gaining.map((employeeId) =>
        fetchPublishedMobileScheduleRows(serviceClient, { orgId, startDate, endDate, employeeId }),
      ),
    ),
    serviceClient
      .from("employees")
      .select("id, first_name, last_name")
      .eq("org_id", orgId)
      .in("id", gaining),
  ]);
  if (peopleError) throw peopleError;

  const publishedDays = new Map<string, { shifts: number; hours: number }>();
  for (const row of rowsByPerson.flat()) {
    if (row.state.kind !== "worked") continue;
    publishedDays.set(`${row.emp_id}|${row.date}`, {
      shifts: row.state.segments.length,
      hours: hoursOf(row.state),
    });
  }
  const names = new Map(
    (people ?? []).map((person) => [
      person.id as string,
      `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim(),
    ]),
  );

  return requestWorkLimitBreaks({
    changes,
    published: (employeeId, dateKey) =>
      publishedDays.get(`${employeeId}|${dateKey}`) ?? { shifts: 0, hours: 0 },
  }).map((person) => ({ ...person, name: names.get(person.employeeId) || "Someone" }));
}
