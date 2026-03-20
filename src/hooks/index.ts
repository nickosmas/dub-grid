// src/hooks/index.ts
export { usePermissions, getPermissionsFromSession, clearPermsCache } from "./usePermissions";
export type { Permissions } from "./usePermissions";

export { useRoleChange, generateIdempotencyKey } from "./useRoleChange";
export type {
  RoleChangeParams,
  RoleChangeResult,
  OrgMember,
} from "./useRoleChange";

export { useLogout } from "./useLogout";

export { useOrganizationData, clearOrgDataCache } from "./useOrganizationData";
export type { OrganizationData } from "./useOrganizationData";

export { useEmployees, clearEmployeeCache } from "./useEmployees";
export type { EmployeesData } from "./useEmployees";

export { useCellLocks } from "./useCellLocks";
export type { CellLock, OnlineUser } from "./useCellLocks";

export { useMediaQuery, MOBILE, TABLET, DESKTOP } from "./useMediaQuery";

export { useShiftRequests } from "./useShiftRequests";
export type { ShiftRequestsData } from "./useShiftRequests";
