import type { MobilePerson } from "@dubgrid/contracts";

/** An Admin's stored permissions as granted of total, counted the way web's staff page counts them. */
export function countMobileAdminPermissions(
  membership:
    { org_role: string; admin_permissions?: Record<string, boolean> | null } | null | undefined,
): MobilePerson["adminPermissionCount"] {
  if (membership?.org_role !== "admin" || !membership.admin_permissions) return null;
  const values = Object.values(membership.admin_permissions);
  if (values.length === 0) return null;
  return { granted: values.filter(Boolean).length, total: values.length };
}
