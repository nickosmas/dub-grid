import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbEmployee } from "@dubgrid/db-types";
import type { Employee } from "@/types";
import logger from "@/lib/logger";
import { rowToEmployee } from "@/lib/db/mappers";
import { EMPLOYEE_COLS } from "@/lib/db/shared";

export interface SeniorityMove {
  id: string;
  seniority: number;
  version: number;
}

export type ReorderSeniorityResult =
  | { kind: "saved"; changed: Array<{ before: Employee; after: Employee }> }
  | { kind: "conflict" }
  | { kind: "missing" };

// An `in` filter rides in the URL; a few hundred ids keep it well under limits.
const READ_CHUNK = 200;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

async function readEmployees(
  client: SupabaseClient,
  orgId: string,
  ids: string[],
): Promise<Map<string, Employee>> {
  const current = new Map<string, Employee>();
  for (const part of chunks(ids, READ_CHUNK)) {
    const { data, error } = await client
      .from("employees")
      .select(EMPLOYEE_COLS)
      .eq("org_id", orgId)
      .in("id", part);
    if (error) throw error;
    for (const row of (data ?? []) as DbEmployee[]) {
      const employee = rowToEmployee(row);
      current.set(employee.id, employee);
    }
  }
  return current;
}

async function writeSeniority(
  client: SupabaseClient,
  orgId: string,
  id: string,
  seniority: number,
  version: number,
): Promise<Employee | null> {
  const { data, error } = await client
    .from("employees")
    .update({ seniority, version: version + 1 })
    .eq("org_id", orgId)
    .eq("id", id)
    .eq("version", version)
    .select(EMPLOYEE_COLS)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToEmployee(data as DbEmployee) : null;
}

/**
 * Saves a new seniority order all or nothing. Every version is checked before
 * anything is written, and if a write still fails (someone saved one of them
 * in between), the rows already written are put back.
 */
export async function reorderSeniority(
  client: SupabaseClient,
  orgId: string,
  order: SeniorityMove[],
  writeChunk = 25,
): Promise<ReorderSeniorityResult> {
  const ids = order.map((move) => move.id);
  if (new Set(ids).size !== ids.length) return { kind: "missing" };

  const current = await readEmployees(client, orgId, ids);
  if (current.size !== ids.length) return { kind: "missing" };
  if (order.some((move) => current.get(move.id)?.version !== move.version)) {
    return { kind: "conflict" };
  }

  const moves = order.filter((move) => current.get(move.id)?.seniority !== move.seniority);
  const changed: Array<{ before: Employee; after: Employee }> = [];
  try {
    for (const part of chunks(moves, writeChunk)) {
      const written = await Promise.allSettled(
        part.map((move) => writeSeniority(client, orgId, move.id, move.seniority, move.version)),
      );
      let refused = false;
      let failure: unknown = null;
      written.forEach((outcome, index) => {
        const before = current.get(part[index].id) as Employee;
        if (outcome.status === "rejected") failure ??= outcome.reason;
        else if (outcome.value) changed.push({ before, after: outcome.value });
        else refused = true;
      });
      if (failure) throw failure;
      if (refused) {
        await putBack(client, orgId, changed);
        return { kind: "conflict" };
      }
    }
  } catch (error) {
    await putBack(client, orgId, changed);
    throw error;
  }

  return { kind: "saved", changed };
}

async function putBack(
  client: SupabaseClient,
  orgId: string,
  changed: Array<{ before: Employee; after: Employee }>,
) {
  const restored = await Promise.allSettled(
    changed.map(({ before, after }) =>
      writeSeniority(client, orgId, after.id, before.seniority, after.version),
    ),
  );
  const lost = restored.filter(
    (outcome) => outcome.status === "rejected" || outcome.value === null,
  ).length;
  if (lost > 0) {
    logger.error({ orgId, lost }, "Seniority reorder could not put every row back");
  }
}
