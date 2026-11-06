/**
 * ESLint rule: an update or delete on an organization's table filters on org_id.
 *
 * Server routes use the service client, which bypasses row level security, so
 * `.eq("id", id)` alone reaches any organization's row. A client-supplied id
 * then rewrites another organization's data, as it did in F-190.
 *
 *   service.from("jobs").update(row).eq("id", id);                     // any org
 *   service.from("jobs").update(row).eq("org_id", orgId).eq("id", id);
 *
 * Not flagged: a chain that names `org_id` in `.eq`, `.in` or `.match`, one
 * scoped to a single account, whose row is that person's in whichever
 * organization holds it, and writes to tables with no organization of their
 * own. A query built across several statements isn't visible to this rule, so
 * filter in the first one.
 */

const TENANT_TABLES = new Set([
  "absence_types",
  "calendar_feed_tokens",
  "certifications",
  "coverage_requirements",
  "departments",
  "employee_job_preferences",
  "employee_shift_preferences",
  "employees",
  "focus_areas",
  "indicator_types",
  "invitations",
  "job_shift_overrides",
  "jobs",
  "organization_memberships",
  "organization_roles",
  "profile_change_requests",
  "publish_history",
  "recurring_shifts",
  "schedule_cell_corrections",
  "schedule_cell_segments",
  "schedule_cell_snapshots",
  "schedule_cells",
  "schedule_notes",
  "schedule_publish_changes",
  "shift_categories",
  "shift_requests",
  "shift_series",
  "subscriptions",
]);
const WRITE_METHODS = new Set(["update", "delete"]);
const SCOPE_COLUMNS = new Set(["org_id", "user_id", "requester_user_id"]);

function methodName(call) {
  const callee = call.callee;
  return callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
    ? callee.property.name
    : null;
}

function namesScope(call) {
  const name = methodName(call);
  const [first] = call.arguments;
  if (name === "match") {
    return (
      first?.type === "ObjectExpression" &&
      first.properties.some(
        (property) =>
          property.type === "Property" &&
          SCOPE_COLUMNS.has(property.key.name ?? property.key.value),
      )
    );
  }
  return (
    (name === "eq" || name === "in") && first?.type === "Literal" && SCOPE_COLUMNS.has(first.value)
  );
}

/** The calls chained onto `from`, in order. */
function chainedCalls(fromCall) {
  const calls = [];
  let current = fromCall;
  while (
    current.parent?.type === "MemberExpression" &&
    current.parent.object === current &&
    current.parent.parent?.type === "CallExpression" &&
    current.parent.parent.callee === current.parent
  ) {
    current = current.parent.parent;
    calls.push(current);
  }
  return calls;
}

export const noUnscopedTenantWrite = {
  meta: {
    type: "problem",
    docs: {
      description: "Filter an update or delete on an organization's table by org_id",
    },
    schema: [],
    messages: {
      unscoped:
        'Add .eq("org_id", orgId) to this {{method}} on {{table}}. The service client bypasses row level security, so an id alone reaches any organization.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (methodName(node) !== "from") return;
        const [table] = node.arguments;
        if (table?.type !== "Literal" || !TENANT_TABLES.has(table.value)) return;

        const calls = chainedCalls(node);
        const write = calls.find((call) => WRITE_METHODS.has(methodName(call)));
        if (!write || calls.some(namesScope)) return;

        context.report({
          node: write,
          messageId: "unscoped",
          data: { method: methodName(write), table: table.value },
        });
      },
    };
  },
};
