// src/hooks/index.ts
export {
  clearPermsCache,
  getUserViewActive,
  setUserViewActive,
  usePermissions,
} from "@/features/permissions/client";
export { getPermissionsFromSession } from "@/features/permissions";
export type { Permissions } from "@/features/permissions";

export { useRoleChange, generateIdempotencyKey } from "./useRoleChange";
export type {
  RoleChangeParams,
  RoleChangeResult,
  OrgMember,
} from "./useRoleChange";

export { useLogout } from "./useLogout";

export { useTermsAcceptanceStatus } from "./useTermsAcceptanceStatus";

export { useOrganizationData } from "./useOrganizationData";
export type { OrganizationData, SetupStatus } from "./useOrganizationData";
export {
  getOrgRealtimeInvalidationKeys,
  invalidateOrgRealtimeQueries,
  useOrgRealtimeInvalidation,
} from "./useOrgRealtimeInvalidation";
export {
  getGridmasterRealtimeInvalidationKeys,
  invalidateGridmasterRealtimeQueries,
  resolveGridmasterRealtimeOrgId,
  useGridmasterRealtimeInvalidation,
} from "./useGridmasterRealtimeInvalidation";

export { useEmployees } from "./useEmployees";
export type { EmployeesData } from "./useEmployees";

export { useEmployeeCount } from "./useEmployeeCount";
export type { EmployeeCountData } from "./useEmployeeCount";

export { useIsInSandbox, useSandboxSourceOrgId } from "./useIsInSandbox";

export { useDirectory } from "./useDirectory";
export type { DirectoryData } from "./useDirectory";

export { useCellLocks } from "./useCellLocks";
export type { CellLock, OnlineUser } from "./useCellLocks";
export {
  useReliableRealtimeBroadcasts,
  type ReliableBroadcastOptions,
} from "./useReliableRealtimeBroadcasts";

export {
  useMediaQuery,
  MOBILE,
  TABLET,
  SMALL_DESKTOP,
  AUTO_ONE_WEEK,
  DESKTOP,
} from "./useMediaQuery";

export { useShiftRequests } from "./useShiftRequests";
export type { ShiftRequestsData } from "./useShiftRequests";

export { useSelfProfileData } from "./useSelfProfileData";
export type { SelfProfileRecord } from "./useSelfProfileData";

export { useOrgClaims } from "./useOrgClaims";
export type { OrgClaims } from "./useOrgClaims";
