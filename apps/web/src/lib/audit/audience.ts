import type { Audience } from "@dubgrid/domain";
import { ORG_AUDIENCE_ACTIONS } from "./registry";

/**
 * The action filter an audit-log query may run for a reader. Platform staff
 * pass their prefixes through; an organization's own admins get an explicit
 * allowlist of action names instead, narrowed by any prefixes they asked for.
 * An empty allowlist must never reach the query: `get_filtered_audit_log`
 * treats an empty prefix array as "no filter", so the caller returns nothing.
 */
export type AuditActionScope =
  { kind: "open"; prefixes: string[] | undefined } | { kind: "allowlist"; actions: string[] };

export function resolveAuditActionScope(
  audience: Audience,
  requestedPrefixes: string[] | undefined,
): AuditActionScope {
  if (audience === "platform") return { kind: "open", prefixes: requestedPrefixes };
  const actions = requestedPrefixes?.length
    ? ORG_AUDIENCE_ACTIONS.filter((action) =>
        requestedPrefixes.some((prefix) => action.startsWith(prefix)),
      )
    : [...ORG_AUDIENCE_ACTIONS];
  return { kind: "allowlist", actions };
}
