// src/hooks/index.ts
export { usePermissions, getPermissionsFromSession, clearPermsCache, setUserViewActive, getUserViewActive } from "./usePermissions";
export type { Permissions } from "./usePermissions";

export { useRoleChange, generateIdempotencyKey } from "./useRoleChange";
export type {
  RoleChangeParams,
  RoleChangeResult,
  OrgMember,
} from "./useRoleChange";

export { useLogout } from "./useLogout";

export { useOrganizationData } from "./useOrganizationData";
export type { OrganizationData, SetupStatus } from "./useOrganizationData";

export { useEmployees } from "./useEmployees";
export type { EmployeesData } from "./useEmployees";

export { useEmployeeCount } from "./useEmployeeCount";
export type { EmployeeCountData } from "./useEmployeeCount";

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
