import { describe, expect, it } from "vitest";
import { countMobileAdminPermissions } from "./admin-permission-count";

describe("countMobileAdminPermissions", () => {
  it("counts an Admin's granted permissions out of those stored", () => {
    expect(
      countMobileAdminPermissions({
        org_role: "admin",
        admin_permissions: { canEditShifts: true, canPublishSchedule: false, canViewStaff: true },
      }),
    ).toEqual({ granted: 2, total: 3 });
  });

  it("gives no count for another tier or nothing stored", () => {
    expect(
      countMobileAdminPermissions({ org_role: "super_admin", admin_permissions: { a: true } }),
    ).toBeNull();
    expect(countMobileAdminPermissions({ org_role: "admin", admin_permissions: null })).toBeNull();
    expect(countMobileAdminPermissions({ org_role: "admin", admin_permissions: {} })).toBeNull();
    expect(countMobileAdminPermissions(null)).toBeNull();
  });
});
