"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { getEmployeeProfileHref, isCurrentUsersEmployee } from "@/lib/profile-links";
import { Button } from "@/components/Button";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Import as ImportIcon,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import {
  fetchOrganizationInvitations,
  replaceOrganizationInvitationAccessGuarded,
  resendInvitation,
  revokeInvitation,
  updateAppOnlyUser,
  updatePendingInvitation,
} from "@/features/organization/client";
import { updateEmployeeIdentity } from "@/features/employees/client";
import {
  countStaffByCertification,
  isSelfAction,
  summarizeStaffByCredential,
} from "@dubgrid/domain";
import { getAvatarTypography, getAvatarTone } from "@dubgrid/design-tokens";
import { useAuth } from "@/components/AuthProvider";
import * as Sentry from "@/lib/sentry";
import {
  applyManagementDirectoryUpdate,
  mergeEmployeeIntoDirectoryPerson,
} from "@/lib/staff-directory";
import type {
  AdminPermissions,
  Department,
  DirectoryPerson,
  Employee,
  FocusArea,
  Invitation,
  NamedItem,
  OrganizationRole,
  OrganizationUser,
} from "@/types";
import { useClientFeatureFlags, useDirectory, useMediaQuery, MOBILE } from "@/hooks";
import { formatClientErrorMessage } from "@/lib/client-facing";
import InviteEmployeeModal from "@/components/InviteEmployeeModal";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import CustomSelect from "@/components/CustomSelect";
import { CloseButton } from "@/components/ui/CloseButton";
import { MaybeHint } from "@/components/ui/hint";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";
import { NumericBadge } from "@/components/ui/numeric-badge";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { getAvatarInitials, getDirectoryPersonAvatarSeed } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow as UITableRow,
} from "@/components/ui/table";
import { BulkImportModal } from "./BulkImportModal";
import { DirectoryCertificationCards } from "./DirectoryCertificationCards";
import { DirectorySummaryCards } from "./DirectorySummaryCards";
import { EmployeeManagementAccessEditor } from "./EmployeeManagementAccessModal";
import { ManagementStaffPanel } from "./ManagementStaffPanel";
import { hasSavedScheduleAssignment } from "./capability-state";
import { InlineRoleSelect } from "./InlineRoleSelect";
import { updateOrganizationMembershipGuarded } from "@/features/organization/client/access";
import { AddManagementUserToScheduleModal } from "./AddManagementUserToScheduleModal";
import { SortIcon } from "./SortIcon";
import { StaffContextBar } from "./StaffContextBar";
import { StaffDetailPanel } from "./StaffDetailPanel";
import { StaffReadOnlyDetailPanel } from "./StaffReadOnlyDetailPanel";
import { AccessInsignia } from "./AccessInsignia";
import { StaffEmptyState } from "./StaffEmptyState";
import { StaffFilterPopover } from "./StaffFilterPopover";
import { ManagementFilterPopover } from "./ManagementFilterPopover";
import { isPendingManagementInvite, useManagementFilters } from "./useManagementFilters";
import { StaffPagination } from "./StaffPagination";
import { StaffReorderListRow, StaffTableRow } from "./StaffTableRow";
import { STAFF_SORT_OPTIONS, useStaffFilters, type EmployeeTab } from "./useStaffFilters";
import { useStaffReorder } from "./useStaffReorder";
import { useStaffSelection } from "./useStaffSelection";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import ScrollableTabs from "@/components/ScrollableTabs";

const REORDER_SETTLE_MS = 220;

type BulkStaffAction = "deactivate" | "activate" | "remove";

export interface MembersSectionProps {
  employees: Employee[];
  inactiveEmployees: Employee[];
  removedEmployees: Employee[];
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  useCompactRoleCertificationLabels?: boolean;
  onSave: (emp: Employee) => void;
  /** Called instead of `onSave` when the admin confirms changing an
   *  on-schedule employee's email while a pending invitation exists — see
   *  EditEmployeePanel. */
  onSaveWithReinvite?: (
    updatedEmployee: Employee,
    oldInvitation: Invitation,
  ) => void | Promise<void>;
  onRemove: (empId: string, note?: string) => void;
  onDeactivate: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
  onAdd: () => void;
  canViewEmployeeDetails: boolean;
  canManageEmployees: boolean;
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
  orgId?: string;
  orgName?: string;
  isSuperAdmin?: boolean;
  isGridmaster?: boolean;
  // Self signal: the viewer's own employees row has management department
  // access. Widens visibility (view-only) of the Members/Management list to
  // non-admin management-only users — see canSeeManagementUsers below.
  isManagementUser?: boolean;
  departments?: Department[];
  departmentLabel?: string;
  managementDepartmentLabel?: string;
}

export function MembersSection({
  employees: suppliedEmployees,
  inactiveEmployees: suppliedInactiveEmployees,
  removedEmployees: suppliedRemovedEmployees,
  focusAreas,
  certifications,
  roles,
  useCompactRoleCertificationLabels = false,
  onSave,
  onSaveWithReinvite,
  onRemove,
  onDeactivate,
  onActivate,
  onAdd,
  canViewEmployeeDetails,
  canManageEmployees,
  focusAreaLabel,
  certificationLabel,
  roleLabel,
  orgId,
  orgName,
  isSuperAdmin,
  isGridmaster,
  isManagementUser,
  departments: departmentItems = [],
  departmentLabel = "Scheduled Departments",
  managementDepartmentLabel = "Management Departments",
}: MembersSectionProps) {
  const isMobile = useMediaQuery(MOBILE);
  const featureFlags = useClientFeatureFlags();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const currentUserId = currentUser?.id ?? null;
  const regularUserMode = !canManageEmployees;
  const employees = useMemo(
    () =>
      regularUserMode
        ? suppliedEmployees.filter(
            (employee) => !isCurrentUsersEmployee(employee.userId, currentUserId),
          )
        : suppliedEmployees,
    [currentUserId, regularUserMode, suppliedEmployees],
  );
  const inactiveEmployees = useMemo(
    () =>
      regularUserMode
        ? suppliedInactiveEmployees.filter(
            (employee) => !isCurrentUsersEmployee(employee.userId, currentUserId),
          )
        : suppliedInactiveEmployees,
    [currentUserId, regularUserMode, suppliedInactiveEmployees],
  );
  const removedEmployees = useMemo(
    () =>
      regularUserMode
        ? suppliedRemovedEmployees.filter(
            (employee) => !isCurrentUsersEmployee(employee.userId, currentUserId),
          )
        : suppliedRemovedEmployees,
    [currentUserId, regularUserMode, suppliedRemovedEmployees],
  );
  const canManageManagementAccess = !!isSuperAdmin || !!isGridmaster;
  const canViewManagementUsers = canManageEmployees || canManageManagementAccess;
  // Broader, view-only gate: lets a non-admin management-only user see the
  // Members/Management list and open a (read-only) detail panel, without
  // granting any of the edit affordances that stay on canViewManagementUsers.
  const canSeeManagementUsers = canViewManagementUsers || !!isManagementUser;
  const directoryOrgId = canSeeManagementUsers ? (orgId ?? null) : null;
  // Access is admin-only information, and the tier map behind it only loads for
  // viewers who can read the directory. Without both, the access filter and the
  // access sort would be acting on a column this viewer never sees.
  const showAccessControls = !regularUserMode && canViewEmployeeDetails && canSeeManagementUsers;
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const loadedInvitationsForOrgIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!orgId || regularUserMode) return;
    let cancelled = false;

    fetchOrganizationInvitations(orgId)
      .then((invites) => {
        if (cancelled) return;
        loadedInvitationsForOrgIdRef.current = orgId;
        setPendingInvitations(
          invites.filter(
            (inv) => !inv.acceptedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date(),
          ),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        Sentry.captureException(err);
        loadedInvitationsForOrgIdRef.current = orgId;
        setPendingInvitations([]);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, regularUserMode]);

  const invitationStateReady =
    regularUserMode || !orgId || loadedInvitationsForOrgIdRef.current === orgId;

  // Re-derive against "now" on a slow tick so invitations that cross their
  // 72h expiry while the page is open stop rendering as "Pending". Without
  // this, refreshInvitations() only runs after revoke/resend/create and the
  // UI happily shows expired invites with stale CTAs (audit H4).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const pendingInviteByEmployeeId = useMemo(() => {
    const map = new Map<string, Invitation>();
    for (const inv of regularUserMode ? [] : pendingInvitations) {
      if (new Date(inv.expiresAt).getTime() <= nowMs) continue;
      if (inv.employeeId) {
        map.set(inv.employeeId, inv);
      }
    }
    return map;
  }, [pendingInvitations, nowMs, regularUserMode]);

  const {
    directory,
    hasMore: directoryHasMore,
    loadingMore: directoryLoadingMore,
    loadMore: loadMoreDirectory,
  } = useDirectory(directoryOrgId);
  // Access role (org_role) per linked employee, sourced from the directory.
  // Only populated when the viewer can load directory data; staff with no
  // linked login simply resolve to null and render an em dash.
  const orgRoleByEmployeeId = useMemo(() => {
    const map = new Map<string, NonNullable<DirectoryPerson["orgRole"]>>();
    for (const person of directory) {
      if (person.employeeId && person.orgRole) {
        map.set(person.employeeId, person.orgRole);
      }
    }
    return map;
  }, [directory]);
  // Full directory person per linked employee, for inline role editing.
  const directoryByEmployeeId = useMemo(() => {
    const map = new Map<string, DirectoryPerson>();
    for (const person of directory) {
      if (person.employeeId) map.set(person.employeeId, person);
    }
    return map;
  }, [directory]);
  // What the Access column actually prints: a live membership, else the tier a
  // pending invitation would grant. The filter and the sort read this same map,
  // so a control can never disagree with the column it acts on.
  const effectiveOrgRoleByEmployeeId = useMemo(() => {
    const map = new Map<string, OrganizationRole>(orgRoleByEmployeeId);
    for (const [employeeId, invitation] of pendingInviteByEmployeeId) {
      if (!map.has(employeeId) && invitation.roleToAssign) {
        map.set(employeeId, invitation.roleToAssign);
      }
    }
    return map;
  }, [orgRoleByEmployeeId, pendingInviteByEmployeeId]);

  const filters = useStaffFilters({
    employees,
    inactiveEmployees,
    removedEmployees,
    focusAreas,
    certifications,
    roles,
    regularUserMode,
    orgRoleByEmployeeId: effectiveOrgRoleByEmployeeId,
  });
  const {
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    setSortKey,
    filterEmploymentType,
    setFilterEmploymentType,
    filterDepartment,
    setFilterDepartment,
    filterDepartmentAdminOnly,
    setFilterDepartmentAdminOnly,
    filterFocusArea,
    setFilterFocusArea,
    filterCertification,
    setFilterCertification,
    filterRole,
    setFilterRole,
    filterAccountLink,
    setFilterAccountLink,
    filterOrgRole,
    setFilterOrgRole,
    filterEmailPresence,
    setFilterEmailPresence,
    filterPhonePresence,
    setFilterPhonePresence,
    hasActiveFilters,
    activeFilterCount,
    clearFilters: clearFiltersBase,
    rawList,
    sorted,
    paginatedList: filterPaginatedList,
    page,
    setPage,
    totalPages,
    totalCount,
    pageSize: pageSize,
    unlinkedCount,
  } = filters;
  const clearFilters = useCallback(() => {
    clearFiltersBase();
  }, [clearFiltersBase]);

  useEffect(() => {
    if (!filterOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [filterOpen]);

  const { selectedIds, toggleSelect, toggleSelectAll, clearSelection } = useStaffSelection();
  const reorder = useStaffReorder({ sorted, onSave });
  const {
    isReordering,
    isDirty,
    enterReorder: handleEnterReorder,
    saveOrder: handleSaveOrder,
    cancelReorder: handleCancelReorder,
    draggedIdx,
    dragOverIdx,
    handleDragStart,
    handleDragMove,
    handleDrop,
    handleDragEnd,
    displayList,
    baseList,
  } = reorder;

  const isDraggingRows = isReordering && draggedIdx !== null && dragOverIdx !== null;
  const paginatedList = useMemo(
    () => (isReordering ? (isDraggingRows ? baseList : displayList) : filterPaginatedList),
    [baseList, displayList, filterPaginatedList, isDraggingRows, isReordering],
  );
  const rowNodesRef = useRef(new Map<string, HTMLDivElement>());
  const rowRectsRef = useRef(new Map<string, DOMRect>());
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const [dragPhase, setDragPhase] = useState<"dragging" | "settling" | null>(null);
  const settleFrameRef = useRef<number | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);
  const dragSessionRef = useRef<{
    pointerId: number;
    draggedIdx: number;
    startY: number;
    dropIdx: number;
    centers: number[];
  } | null>(null);

  const handleRowRef = useCallback((employeeId: string, node: HTMLDivElement | null) => {
    if (node) {
      rowNodesRef.current.set(employeeId, node);
      return;
    }

    rowNodesRef.current.delete(employeeId);
  }, []);

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();

    for (const employee of paginatedList) {
      const node = rowNodesRef.current.get(employee.id);
      if (node) {
        nextRects.set(employee.id, node.getBoundingClientRect());
      }
    }

    rowRectsRef.current = nextRects;
  }, [paginatedList]);

  const cancelSettleAnimation = useCallback(() => {
    if (settleFrameRef.current !== null) {
      window.cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => cancelSettleAnimation, [cancelSettleAnimation]);

  const getRowHeight = useCallback(
    (index: number) => {
      const employee = baseList[index];
      if (!employee) return 56;
      return rowRectsRef.current.get(employee.id)?.height ?? 56;
    },
    [baseList],
  );

  const getDraggedTargetDelta = useCallback(
    (sourceIdx: number, dropIdx: number) => {
      if (sourceIdx === dropIdx) return 0;

      let targetDelta = 0;
      if (sourceIdx < dropIdx) {
        for (let index = sourceIdx + 1; index <= dropIdx; index += 1) {
          targetDelta += getRowHeight(index);
        }
        return targetDelta;
      }

      for (let index = dropIdx; index < sourceIdx; index += 1) {
        targetDelta -= getRowHeight(index);
      }
      return targetDelta;
    },
    [getRowHeight],
  );

  const handleReorderPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, index: number) => {
      if (!isReordering || event.button !== 0) return;

      const centers = baseList.map((employee) => {
        const rect =
          rowRectsRef.current.get(employee.id) ??
          rowNodesRef.current.get(employee.id)?.getBoundingClientRect();

        return rect ? rect.top + rect.height / 2 : null;
      });

      if (centers.some((center) => center === null)) return;

      if (!baseList[index]) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      dragSessionRef.current = {
        pointerId: event.pointerId,
        draggedIdx: index,
        startY: event.clientY,
        dropIdx: index,
        centers: centers as number[],
      };

      cancelSettleAnimation();
      setDragDeltaY(0);
      setDragPhase("dragging");
      handleDragStart(index);
    },
    [baseList, cancelSettleAnimation, handleDragStart, isReordering],
  );

  const handleReorderPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      event.preventDefault();

      const deltaY = event.clientY - session.startY;
      const draggedCenter = session.centers[session.draggedIdx] + deltaY;
      let nextDropIdx = 0;

      for (let index = 0; index < session.centers.length; index += 1) {
        if (index !== session.draggedIdx && draggedCenter > session.centers[index]) {
          nextDropIdx += 1;
        }
      }

      session.dropIdx = nextDropIdx;
      setDragDeltaY(deltaY);
      handleDragMove(nextDropIdx);
    },
    [handleDragMove],
  );

  const handleReorderPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      event.preventDefault();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      dragSessionRef.current = null;

      const currentDelta = event.clientY - session.startY;
      const targetDelta = getDraggedTargetDelta(session.draggedIdx, session.dropIdx);
      setDragDeltaY(currentDelta);

      settleFrameRef.current = window.requestAnimationFrame(() => {
        settleFrameRef.current = null;
        setDragPhase("settling");
        setDragDeltaY(targetDelta);
      });

      settleTimeoutRef.current = window.setTimeout(() => {
        settleTimeoutRef.current = null;
        setDragPhase(null);
        setDragDeltaY(0);
        handleDrop(session.dropIdx, session.draggedIdx);
      }, REORDER_SETTLE_MS + 10);
    },
    [getDraggedTargetDelta, handleDrop],
  );

  const handleReorderPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      dragSessionRef.current = null;
      cancelSettleAnimation();
      setDragPhase(null);
      setDragDeltaY(0);
      handleDragEnd();
    },
    [cancelSettleAnimation, handleDragEnd],
  );

  const rowDragOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    if (!isReordering || draggedIdx === null || dragOverIdx === null) {
      return offsets;
    }

    const draggedEmployee = baseList[draggedIdx];
    if (!draggedEmployee) return offsets;

    const draggedHeight = rowRectsRef.current.get(draggedEmployee.id)?.height ?? 56;

    if (draggedIdx < dragOverIdx) {
      for (let index = draggedIdx + 1; index <= dragOverIdx; index += 1) {
        const employee = baseList[index];
        if (employee) {
          offsets.set(employee.id, -draggedHeight);
        }
      }
      return offsets;
    }

    for (let index = dragOverIdx; index < draggedIdx; index += 1) {
      const employee = baseList[index];
      if (employee) {
        offsets.set(employee.id, draggedHeight);
      }
    }
    return offsets;
  }, [baseList, dragOverIdx, draggedIdx, isReordering]);

  useEffect(() => {
    clearSelection();
    setExpandedEmpId(null);
  }, [
    activeTab,
    clearSelection,
    filterAccountLink,
    filterCertification,
    filterDepartment,
    filterDepartmentAdminOnly,
    filterEmailPresence,
    filterEmploymentType,
    filterFocusArea,
    filterOrgRole,
    filterPhonePresence,
    filterRole,
    searchQuery,
    sortConfig,
  ]);

  const [inviteEmployee, setInviteEmployee] = useState<Employee | null>(null);
  const [inviteQueue, setInviteQueue] = useState<Employee[]>([]);
  const [, setRevokingId] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<{
    action: BulkStaffAction;
    employeeIds: string[];
  } | null>(null);
  const [bulkNote, setBulkNote] = useState("");
  const [isBulkActionRunning, setIsBulkActionRunning] = useState(false);
  const [exportConfirm, setExportConfirm] = useState(false);

  const replacePendingInvitationRole = (
    pendingInvitation: Invitation | null | undefined,
  ): ((newRole: OrganizationRole) => Promise<void>) | undefined => {
    if (!canManageManagementAccess || !orgId || !pendingInvitation?.updatedAt) return undefined;
    const expectedUpdatedAt = pendingInvitation.updatedAt;
    return async (newRole) => {
      const replacement = await replaceOrganizationInvitationAccessGuarded({
        orgId,
        invitationId: pendingInvitation.id,
        expectedUpdatedAt,
        roleToAssign: newRole,
      });
      setPendingInvitations((current) => [
        replacement.invitation,
        ...current.filter((invitation) => invitation.id !== pendingInvitation.id),
      ]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.org.invitations(orgId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) }),
      ]);
    };
  };

  // Returns an inline role-change handler when the viewer may manage access and
  // the person has an editable login or pending invitation.
  const roleChangeHandlerFor = (
    employeeId: string,
    userId: string | null | undefined,
    membershipUpdatedAt: string | null | undefined,
  ): ((newRole: OrganizationRole) => Promise<void>) | undefined => {
    // Never provide a role-change handler for the current user: you can't
    // change your own role (also blocked at the API/DB boundary).
    if (
      !canManageManagementAccess ||
      !orgId ||
      (userId ? isSelfAction(currentUserId, userId) : false)
    ) {
      return undefined;
    }
    const pendingInvitation = pendingInviteByEmployeeId.get(employeeId);
    if (!userId) {
      return replacePendingInvitationRole(pendingInvitation);
    }
    if (!membershipUpdatedAt) return undefined;
    const oid = orgId;
    const uid = userId;
    const expectedUpdatedAt = membershipUpdatedAt;
    return async (newRole) => {
      await updateOrganizationMembershipGuarded({
        orgId: oid,
        userId: uid,
        expectedUpdatedAt,
        orgRole: newRole,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org.directory(oid),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org.users(oid),
      });
    };
  };
  const departmentUsers = useMemo(
    () => directory.filter((person) => person.managementDepartmentIds.length > 0),
    [directory],
  );
  const [showManagement, setShowManagement] = useState(false);
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [managementAccessEmployee, setManagementAccessEmployee] = useState<Employee | null>(null);
  const [managementAccessDirty, setManagementAccessDirty] = useState(false);
  const closeManagementAccessPopup = useCallback(() => {
    setManagementAccessDirty(false);
    setManagementAccessEmployee(null);
  }, []);
  const openManagementAccessPopup = useCallback((employee: Employee) => {
    setManagementAccessDirty(false);
    setManagementAccessEmployee(employee);
  }, []);
  const {
    requestClose: requestManagementAccessClose,
    unsavedChangesDialog: managementAccessUnsavedChangesDialog,
  } = useUnsavedChangesPrompt({
    hasUnsavedChanges: managementAccessDirty,
    onDiscard: closeManagementAccessPopup,
  });
  const [managementSchedulePerson, setManagementSchedulePerson] = useState<DirectoryPerson | null>(
    null,
  );

  // The roster filters on its own attributes (department, access level,
  // invitation) rather than the staff panel's, which its rows can't answer.
  const managementFilters = useManagementFilters({
    managementUsers: departmentUsers,
    searchQuery,
    searchEnabled: showManagement,
  });
  const {
    deptFilterId,
    setDeptFilterId,
    filteredUsers: filteredDeptUsers,
    hasActiveFilters: managementHasActiveFilters,
    activeFilterCount: managementActiveFilterCount,
  } = managementFilters;
  const pendingManagementCount = useMemo(
    () => departmentUsers.filter(isPendingManagementInvite).length,
    [departmentUsers],
  );

  const deptCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const user of departmentUsers) {
      for (const departmentId of user.managementDepartmentIds) {
        counts.set(departmentId, (counts.get(departmentId) ?? 0) + 1);
      }
    }
    return counts;
  }, [departmentUsers]);

  const managementDepts = useMemo(
    () => departmentItems.filter((department) => department.type === "management"),
    [departmentItems],
  );

  const scheduledDepts = useMemo(
    () => departmentItems.filter((department) => department.type === "scheduled"),
    [departmentItems],
  );

  const canAddScheduled = canManageEmployees;
  const canAddManagement = canManageManagementAccess && managementDepts.length > 0;

  const clearManagementFilters = managementFilters.clearFilters;
  useEffect(() => {
    if (!showManagement) {
      clearManagementFilters();
      setExpandedPersonId(null);
    }
  }, [showManagement]);

  useEffect(() => {
    if (!canSeeManagementUsers && showManagement) {
      setShowManagement(false);
    }
  }, [canSeeManagementUsers, showManagement]);

  const [showManagementInvite, setShowManagementInvite] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  async function handleExport() {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/export?type=staff&orgId=${orgId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(formatClientErrorMessage(data?.error, "Export failed"));
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? "staff-export.csv";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Staff data exported");
    } catch {
      toast.error("Export failed");
    }
  }

  async function handleConfirmBulkAction() {
    if (!bulkConfirm || isBulkActionRunning) return;

    const pendingAction = bulkConfirm;
    const trimmedNote = bulkNote.trim() || undefined;

    // Pre-filter the actor's own employee row. The backend rejects self-actions
    // with a 403; dropping the id up front avoids the predictable failure and
    // lets us run the rest in parallel without a noisy "1 failed" toast.
    const cachedEmployees = orgId
      ? queryClient.getQueryData<Employee[]>(queryKeys.employees.all(orgId))
      : null;
    const targetIds = pendingAction.employeeIds.filter((employeeId) => {
      const emp = cachedEmployees?.find((e) => e.id === employeeId) ?? null;
      return !emp || !isSelfAction(currentUserId, emp.userId);
    });
    const droppedSelfCount = pendingAction.employeeIds.length - targetIds.length;

    if (targetIds.length === 0) {
      toast.error("You can't run that action on your own account.");
      setBulkConfirm(null);
      setBulkNote("");
      return;
    }

    setIsBulkActionRunning(true);
    try {
      const results = await Promise.allSettled(
        targetIds.map((employeeId) => {
          if (pendingAction.action === "deactivate") {
            return onDeactivate(employeeId, trimmedNote);
          }
          if (pendingAction.action === "activate") {
            return onActivate(employeeId);
          }
          return onRemove(employeeId, trimmedNote);
        }),
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - succeeded;

      if (failed === 0 && droppedSelfCount === 0) {
        toast.success(`${succeeded} ${succeeded === 1 ? "person" : "people"} updated`);
      } else if (failed === 0) {
        toast.success(
          `${succeeded} updated. Your own account was skipped (you can't run that action on yourself).`,
        );
      } else if (succeeded === 0) {
        toast.error(
          `Couldn't update ${failed} ${failed === 1 ? "person" : "people"}. Refresh and try again.`,
        );
      } else {
        toast.error(
          `${succeeded} updated, ${failed} failed. Refresh and retry the ones that didn't go through.`,
        );
      }

      setBulkConfirm(null);
      setBulkNote("");
      clearSelection();
    } finally {
      setIsBulkActionRunning(false);
    }
  }

  function refreshInvitations() {
    if (!orgId || regularUserMode) return;

    fetchOrganizationInvitations(orgId)
      .then((invites) => {
        setPendingInvitations(
          invites.filter(
            (inv) => !inv.acceptedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date(),
          ),
        );
      })
      .catch(() => {});
  }

  async function handleRevokeInvitation(invitationId: string): Promise<boolean> {
    if (!orgId) return false;
    setRevokingId(invitationId);

    try {
      await revokeInvitation(invitationId, orgId);
      refreshInvitations();
      toast.success("Invitation revoked");
      return true;
    } catch {
      toast.error("We couldn't cancel that invitation. Try again.");
      return false;
    } finally {
      setRevokingId(null);
    }
  }

  const handleSave = useCallback(
    (employee: Employee) => {
      onSave(employee);
    },
    [onSave],
  );

  const hasExportableStaffRows = employees.length > 0;
  const canShowReorder =
    activeTab === "active" &&
    sortConfig.key === "seniority" &&
    sortConfig.dir === "asc" &&
    !searchQuery &&
    filterEmploymentType === "all" &&
    !filterDepartment &&
    !filterDepartmentAdminOnly &&
    !filterFocusArea &&
    !filterCertification &&
    !filterRole &&
    filterAccountLink === "all" &&
    // Reordering writes seniority across the whole roster, so it must never run
    // against a list with rows filtered out of view.
    filterOrgRole === "all" &&
    filterEmailPresence === "all" &&
    filterPhonePresence === "all" &&
    canManageEmployees &&
    !showManagement;
  const hasReorderableStaffRows = sorted.length >= 2;
  const canReorder = canShowReorder && hasReorderableStaffRows;

  const employmentSummary = useMemo(
    () => ({
      fullTime: employees.filter((employee) => employee.employmentType !== "part_time").length,
      partTime: employees.filter((employee) => employee.employmentType === "part_time").length,
    }),
    [employees],
  );

  // Same basis as the other summary cards (active, on-schedule), so the four
  // numbers reconcile rather than reflecting the filtered table.
  const credentialSummary = useMemo(() => summarizeStaffByCredential(employees), [employees]);
  const certificationCounts = useMemo(
    () => countStaffByCertification(employees, certifications),
    [employees, certifications],
  );

  const tabs: {
    key: EmployeeTab;
    label: string;
    count: number;
  }[] = canManageEmployees
    ? [
        {
          key: "all",
          label: "All",
          count: employees.length + inactiveEmployees.length + removedEmployees.length,
        },
        { key: "active", label: "Active", count: employees.length },
        { key: "inactive", label: "Inactive", count: inactiveEmployees.length },
        { key: "removed", label: "Removed", count: removedEmployees.length },
      ]
    : [{ key: "active", label: "Active", count: employees.length }];

  const selectedEmployee = expandedEmpId
    ? ([...employees, ...inactiveEmployees, ...removedEmployees].find(
        (employee) => employee.id === expandedEmpId,
      ) ?? null)
    : null;
  const selectedEmployeeDirectoryPerson = selectedEmployee
    ? (directory.find((person) => person.employeeId === selectedEmployee.id) ?? null)
    : null;
  const selectedEmployeeHasPendingManagementInvite =
    !!selectedEmployeeDirectoryPerson &&
    selectedEmployeeDirectoryPerson.managementDepartmentIds.length > 0 &&
    selectedEmployeeDirectoryPerson.invitationStatus !== null &&
    !selectedEmployeeDirectoryPerson.hasAppAccess;
  const selectedPerson = expandedPersonId
    ? (departmentUsers.find((user) => user.personId === expandedPersonId) ?? null)
    : null;

  const syncDirectoryPersonInCaches = useCallback(
    (updatedPerson?: DirectoryPerson | null) => {
      if (!orgId || !updatedPerson) return;

      queryClient.setQueryData(
        queryKeys.org.directory(orgId),
        (current: DirectoryPerson[] | undefined) =>
          current?.map((person) =>
            person.personId === updatedPerson.personId ? updatedPerson : person,
          ) ?? current,
      );
      setManagementSchedulePerson((current) =>
        current?.personId === updatedPerson.personId ? updatedPerson : current,
      );
    },
    [orgId, queryClient],
  );

  const syncMembershipInCaches = useCallback(
    (membership: OrganizationUser) => {
      if (!orgId) return;
      queryClient.setQueryData(
        queryKeys.org.directory(orgId),
        (current: DirectoryPerson[] | undefined) =>
          current?.map((person) =>
            person.userId === membership.id
              ? {
                  ...person,
                  orgRole: membership.orgRole,
                  adminPermissions: membership.adminPermissions,
                  membershipUpdatedAt: membership.updatedAt,
                }
              : person,
          ),
      );
    },
    [orgId, queryClient],
  );

  const syncExistingEmployeeInCaches = useCallback(
    (updatedEmployee?: Employee | null) => {
      if (!orgId || !updatedEmployee) return;

      // Invalidate instead of manually patching the cache. The manual patch
      // had a race: if the directory query refetched between an admin's edit
      // and the patch, the patch could clobber fresher fields written by a
      // concurrent admin. Invalidate-and-refetch is slightly slower but
      // correct under concurrent edits. (audit M3)
      queryClient.invalidateQueries({
        queryKey: queryKeys.employees.all(orgId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.directory(orgId),
      });
      setManagementAccessEmployee((current) =>
        current?.id === updatedEmployee.id ? updatedEmployee : current,
      );
    },
    [orgId, queryClient],
  );

  const syncManagementScheduleEmployeeInCaches = useCallback(
    (person: DirectoryPerson, employee: Employee) => {
      if (!orgId) return;
      syncExistingEmployeeInCaches(employee);
      syncDirectoryPersonInCaches(mergeEmployeeIntoDirectoryPerson(person, employee));
    },
    [orgId, syncDirectoryPersonInCaches, syncExistingEmployeeInCaches],
  );

  const patchSelectedMembership = async (patch: {
    orgRole?: OrganizationRole;
    adminPermissions?: AdminPermissions;
  }) => {
    const person = selectedEmployeeDirectoryPerson;
    if (!orgId || !person?.userId || !person.membershipUpdatedAt) return;
    const membership = await updateOrganizationMembershipGuarded({
      orgId,
      userId: person.userId,
      expectedUpdatedAt: person.membershipUpdatedAt,
      ...patch,
    });
    syncMembershipInCaches(membership);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.org.users(orgId) }),
    ]);
  };

  const canWriteSelectedMembership = Boolean(
    canManageManagementAccess &&
    orgId &&
    selectedEmployeeDirectoryPerson?.userId &&
    selectedEmployeeDirectoryPerson.membershipUpdatedAt,
  );

  // Access writes for whoever's detail panel is open: the slide-over's header
  // role select and its on-panel permissions launcher. The management-access
  // popup gets neither, since it edits departments and nothing else. Someone
  // with no login yet holds their access on the pending invitation, so that
  // branch replaces the invite rather than patching a membership.
  const selectedEmployeeRoleChange = !canManageManagementAccess
    ? undefined
    : canWriteSelectedMembership
      ? (newRole: OrganizationRole) => patchSelectedMembership({ orgRole: newRole })
      : selectedEmployee
        ? roleChangeHandlerFor(selectedEmployee.id, null, null)
        : undefined;

  const selectedEmployeePermissionsChange = canWriteSelectedMembership
    ? (permissions: AdminPermissions) => patchSelectedMembership({ adminPermissions: permissions })
    : undefined;

  // The `employees` prop is the on-schedule list (parent filters out rows with
  // no focus areas). Management-only members have an employees row but no
  // focus areas, so they're absent from `employees`/`inactiveEmployees`/
  // `removedEmployees`. Read the unfiltered list from the React Query cache
  // (populated by useEmployees) so lookups by id still find them.
  const findEmployeeById = useCallback(
    (id: string | null): Employee | null => {
      if (!id) return null;
      if (orgId) {
        const cached = queryClient.getQueryData<Employee[]>(queryKeys.employees.all(orgId));
        const hit = cached?.find((employee) => employee.id === id);
        if (hit) return hit;
      }
      return (
        [...employees, ...inactiveEmployees, ...removedEmployees].find(
          (employee) => employee.id === id,
        ) ?? null
      );
    },
    [employees, inactiveEmployees, orgId, queryClient, removedEmployees],
  );

  return (
    <>
      <div className="px-[var(--dg-page-gutter)] py-4 md:py-6 lg:py-10">
        <div className="space-y-8">
          <div>
            <h1 className="text-[length:var(--dg-type-page-title-size)] font-bold tracking-tight text-[var(--dg-color-text-primary)]">
              Directory
            </h1>
            <p className="mt-1 text-[14px] text-[var(--dg-color-text-muted)]">
              {regularUserMode
                ? "Your colleagues and where they work."
                : "View and manage your organization's staff roster."}
            </p>
          </div>

          {directoryHasMore && (
            <div
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-[13px]"
              style={{
                borderColor: "var(--dg-color-border-light)",
                background: "var(--color-muted)",
                color: "var(--dg-color-text-muted)",
              }}
            >
              <span>Not everyone is shown yet. Use search or filters to find specific people.</span>
              <Button
                type="button"
                className="dg-btn dg-btn-secondary"
                onClick={loadMoreDirectory}
                disabled={directoryLoadingMore}
              >
                <ButtonLoading loading={directoryLoadingMore}>Load more</ButtonLoading>
              </Button>
            </div>
          )}

          {/* Headcount and credential totals are management reading; a
              regular user's directory is the list itself. */}
          {!regularUserMode && (
            <DirectorySummaryCards
              onScheduleCount={employees.length}
              fullTimeCount={employmentSummary.fullTime}
              partTimeCount={employmentSummary.partTime}
              showEmploymentCounts
            />
          )}

          {!showManagement && !regularUserMode && (
            <DirectoryCertificationCards
              counts={certificationCounts}
              certifications={certifications}
              certificationLabel={certificationLabel}
              useCompactRoleCertificationLabels={useCompactRoleCertificationLabels}
              certifiedCount={credentialSummary.certified}
              uncertifiedCount={credentialSummary.uncertified}
              selectedCertification={filterCertification}
              onSelectCertification={setFilterCertification}
            />
          )}

          <div
            data-testid="people-toolbar"
            className="dg-toolbar-type"
            style={
              isMobile
                ? { display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }
                : {
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    rowGap: 8,
                    flexWrap: "wrap",
                    paddingBottom: 4,
                  }
            }
          >
            <div
              data-testid="people-toolbar-controls"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flex: isMobile ? undefined : "1 1 auto",
                minWidth: 0,
                maxWidth: "100%",
                flexWrap: "wrap",
                ...(isMobile ? { width: "100%" } : {}),
              }}
            >
              {canSeeManagementUsers && managementDepts.length > 0 && (
                <CustomSelect
                  value={showManagement ? "management" : "schedule"}
                  options={[
                    {
                      value: "schedule",
                      label: `On Schedule (${employees.length})`,
                    },
                    {
                      value: "management",
                      label: `Management (${departmentUsers.length})`,
                    },
                  ]}
                  onChange={(value) => {
                    setShowManagement(value === "management");
                    setFilterOpen(false);
                    if (value === "schedule") {
                      // "All" is a tab only managers get. Landing anyone else on
                      // it would strand them there, since their strip is hidden.
                      setActiveTab(canManageEmployees ? "all" : "active");
                    }
                  }}
                  fontSize="var(--dg-fs-navigation-item)"
                  fontWeight="var(--dg-type-control-weight)"
                  activeFontWeight="var(--dg-type-control-weight)"
                  letterSpacing="normal"
                />
              )}

              {!showManagement && (
                <CustomSelect
                  ariaLabel="Sort staff by"
                  value={sortConfig.key}
                  options={
                    showAccessControls
                      ? STAFF_SORT_OPTIONS
                      : STAFF_SORT_OPTIONS.filter((option) => option.value !== "access")
                  }
                  onChange={setSortKey}
                  fontSize="var(--dg-fs-navigation-item)"
                  fontWeight="var(--dg-type-control-weight)"
                  activeFontWeight="var(--dg-type-control-weight)"
                  letterSpacing="normal"
                />
              )}

              {/* A strip with one tab is a label wearing a control's clothes:
                  it invites a choice the viewer does not have. Viewers who
                  can't manage employees only ever get "Active", and its count
                  is already on the summary card above. */}
              {!showManagement && tabs.length > 1 && (
                <ScrollableTabs
                  className="dg-span-tabs dg-span-tabs--light"
                  style={{
                    flex: "0 0 auto",
                    maxWidth: "100%",
                  }}
                >
                  {tabs.map((tab, index) => {
                    const active = activeTab === tab.key;
                    const prevActive = index > 0 && activeTab === tabs[index - 1].key;
                    const showDivider = index > 0 && !active && !prevActive;

                    return (
                      <span key={tab.key} style={{ display: "contents" }}>
                        {index > 0 && (
                          <div
                            style={{
                              width: 1,
                              height: 16,
                              background: showDivider ? "var(--dg-color-border)" : "transparent",
                              flexShrink: 0,
                              alignSelf: "center",
                            }}
                          />
                        )}
                        <Button
                          onClick={() => {
                            setActiveTab(tab.key);
                            setExpandedEmpId(null);
                            if (isReordering) {
                              handleCancelReorder();
                            }
                          }}
                          className={`dg-span-tab${active ? " active" : ""}`}
                        >
                          {tab.label}
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 18,
                              height: 18,
                              borderRadius: "50%",
                              padding: "0 4px",
                              fontSize: "var(--dg-fs-micro)",
                              fontWeight: 700,
                              lineHeight: 1,
                              background: active
                                ? "rgba(255,255,255,0.25)"
                                : "var(--dg-color-border-light)",
                              color: active ? "inherit" : "var(--dg-color-text-muted)",
                              marginLeft: 3,
                            }}
                          >
                            {tab.count}
                          </span>
                        </Button>
                      </span>
                    );
                  })}
                </ScrollableTabs>
              )}

              {showManagement && departmentItems.length > 0 && (
                <ScrollableTabs
                  className="dg-span-tabs dg-span-tabs--light"
                  style={{
                    flex: isMobile ? "1 1 180px" : "0 0 auto",
                    maxWidth: "100%",
                  }}
                >
                  <Button
                    onClick={() => setDeptFilterId(null)}
                    className={`dg-span-tab${deptFilterId === null ? " active" : ""}`}
                  >
                    All
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 18,
                        height: 18,
                        borderRadius: "50%",
                        padding: "0 4px",
                        fontSize: "var(--dg-fs-micro)",
                        fontWeight: 700,
                        lineHeight: 1,
                        background:
                          deptFilterId === null
                            ? "rgba(255,255,255,0.25)"
                            : "var(--dg-color-border-light)",
                        color: deptFilterId === null ? "inherit" : "var(--dg-color-text-muted)",
                        marginLeft: 3,
                      }}
                    >
                      {departmentUsers.length}
                    </span>
                  </Button>
                  {managementDepts
                    .filter((department) => deptCounts.has(department.id))
                    .map((department, index, visibleDepartments) => {
                      const active = deptFilterId === department.id;
                      const prevActive =
                        index === 0
                          ? deptFilterId === null
                          : deptFilterId === visibleDepartments[index - 1]?.id;
                      const showDivider = !active && !prevActive;

                      return (
                        <span key={department.id} style={{ display: "contents" }}>
                          <div
                            style={{
                              width: 1,
                              height: 16,
                              background: showDivider ? "var(--dg-color-border)" : "transparent",
                              flexShrink: 0,
                              alignSelf: "center",
                            }}
                          />
                          <Button
                            onClick={() => setDeptFilterId(active ? null : department.id)}
                            className={`dg-span-tab${active ? " active" : ""}`}
                          >
                            {department.name}
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 18,
                                height: 18,
                                borderRadius: "50%",
                                padding: "0 4px",
                                fontSize: "var(--dg-fs-micro)",
                                fontWeight: 700,
                                lineHeight: 1,
                                background: active
                                  ? "rgba(255,255,255,0.25)"
                                  : "var(--dg-color-border-light)",
                                color: active ? "inherit" : "var(--dg-color-text-muted)",
                                marginLeft: 3,
                              }}
                            >
                              {deptCounts.get(department.id) ?? 0}
                            </span>
                          </Button>
                        </span>
                      );
                    })}
                </ScrollableTabs>
              )}

              <Button
                ref={filterBtnRef}
                onClick={() => setFilterOpen((current) => !current)}
                aria-label="Filter"
                aria-expanded={filterOpen}
                aria-haspopup="dialog"
                className="dg-btn dg-btn-secondary"
                style={{ position: "relative" }}
              >
                <SlidersHorizontal size={14} strokeWidth={2.25} aria-hidden="true" />
                {isMobile ? "" : "Filter"}
                {/* Counts the half you're looking at, so it never reports
                    filters the visible list isn't being narrowed by. */}
                <NumericBadge
                  count={showManagement ? managementActiveFilterCount : activeFilterCount}
                  label={`${showManagement ? managementActiveFilterCount : activeFilterCount} active filters`}
                  size="sm"
                  tone="brand"
                  style={{ position: "absolute", top: -6, right: -6 }}
                />
              </Button>

              {canShowReorder && (
                <Button
                  onClick={() => {
                    if (!hasReorderableStaffRows) return;
                    handleEnterReorder();
                    setExpandedEmpId(null);
                    setPage(1);
                  }}
                  className="dg-btn dg-btn-secondary"
                  aria-label="Reorder"
                  disabled={!hasReorderableStaffRows}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="3" y="2" width="2" height="2" rx="1" />
                    <rect x="9" y="2" width="2" height="2" rx="1" />
                    <rect x="3" y="6" width="2" height="2" rx="1" />
                    <rect x="9" y="6" width="2" height="2" rx="1" />
                    <rect x="3" y="10" width="2" height="2" rx="1" />
                    <rect x="9" y="10" width="2" height="2" rx="1" />
                  </svg>
                  {isMobile ? "" : "Reorder"}
                </Button>
              )}

              <div
                data-testid="people-search"
                className="relative"
                style={{
                  minWidth: isMobile ? 0 : 280,
                  flex: isMobile ? "1 1 160px" : "1 1 300px",
                  maxWidth: isMobile ? undefined : 380,
                }}
              >
                <Search
                  size={14}
                  strokeWidth={2.5}
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--dg-color-text-faint)]"
                  style={{ left: 12 }}
                />
                <input
                  className="dg-input w-full"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={
                    regularUserMode
                      ? "Search by name or qualification..."
                      : "Search by name, email, or phone..."
                  }
                  style={{
                    paddingLeft: 32,
                    paddingRight: searchQuery ? 30 : 12,
                  }}
                />
                {searchQuery && (
                  <CloseButton
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    style={{
                      position: "absolute",
                      right: 4,
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                  />
                )}
              </div>
            </div>

            <div
              style={{
                marginLeft: isMobile ? 0 : "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: isMobile ? "flex-end" : undefined,
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {!showManagement && canManageEmployees && orgId && !isMobile && (
                <MaybeHint
                  content={
                    !featureFlags.csvImport
                      ? "Importing is unavailable right now. Try again in a moment."
                      : null
                  }
                >
                  <Button
                    onClick={() => setShowImport(true)}
                    className="dg-btn dg-btn-secondary"
                    disabled={!featureFlags.csvImport}
                  >
                    <ImportIcon size={14} />
                    Import
                  </Button>
                </MaybeHint>
              )}

              {!showManagement && canViewEmployeeDetails && orgId && !isMobile && (
                <MaybeHint
                  content={
                    !featureFlags.csvExport
                      ? "Exports are unavailable right now. Try again in a moment."
                      : null
                  }
                >
                  <Button
                    onClick={() => setExportConfirm(true)}
                    className="dg-btn dg-btn-secondary"
                    disabled={!hasExportableStaffRows || !featureFlags.csvExport}
                  >
                    <Upload size={14} />
                    Export
                  </Button>
                </MaybeHint>
              )}

              {canAddScheduled && canAddManagement && (
                <>
                  <Button
                    ref={addBtnRef}
                    onClick={() => setAddMenuOpen((open) => !open)}
                    aria-expanded={addMenuOpen}
                    aria-haspopup="menu"
                    className="dg-btn dg-btn-primary"
                  >
                    <Plus size={14} />
                    Add
                    <ChevronDown size={14} />
                  </Button>
                  {addMenuOpen && (
                    <Menu
                      open
                      onOpenChange={(nextOpen) => {
                        if (!nextOpen) setAddMenuOpen(false);
                      }}
                    >
                      <MenuContent
                        anchor={addBtnRef}
                        side="bottom"
                        align="end"
                        sideOffset={6}
                        positionMethod="fixed"
                        collisionPadding={8}
                        finalFocus={addBtnRef}
                        style={{ minWidth: 180 }}
                      >
                        <MenuItem
                          onClick={() => {
                            setAddMenuOpen(false);
                            onAdd();
                          }}
                        >
                          Scheduled staff
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            setAddMenuOpen(false);
                            setShowManagementInvite(true);
                          }}
                        >
                          Management staff
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  )}
                </>
              )}

              {canAddScheduled && !canAddManagement && (
                <Button onClick={onAdd} className="dg-btn dg-btn-primary">
                  <Plus size={14} />
                  Add
                </Button>
              )}

              {!canAddScheduled && canAddManagement && (
                <Button
                  onClick={() => setShowManagementInvite(true)}
                  className="dg-btn dg-btn-primary"
                >
                  <Plus size={14} />
                  Add
                </Button>
              )}
            </div>
          </div>

          {!showManagement && (
            <StaffContextBar
              filterEmploymentType={filterEmploymentType}
              filterDepartment={filterDepartment}
              filterDepartmentAdminOnly={filterDepartmentAdminOnly}
              filterFocusArea={filterFocusArea}
              filterCertification={filterCertification}
              filterRole={filterRole}
              filterAccountLink={filterAccountLink}
              filterEmailPresence={filterEmailPresence}
              filterPhonePresence={filterPhonePresence}
              hasActiveFilters={hasActiveFilters}
              onClearEmploymentType={() => setFilterEmploymentType("all")}
              onClearDepartment={() => setFilterDepartment(null)}
              onClearDepartmentAdminOnly={() => setFilterDepartmentAdminOnly(false)}
              onClearFocusArea={() => setFilterFocusArea(null)}
              onClearCertification={() => setFilterCertification(null)}
              onClearRole={() => setFilterRole(null)}
              onClearAccountLink={() => setFilterAccountLink("all")}
              onClearEmailPresence={() => setFilterEmailPresence("all")}
              onClearPhonePresence={() => setFilterPhonePresence("all")}
              onClearAll={clearFilters}
              focusAreas={focusAreas}
              certifications={certifications}
              roles={roles}
              departments={scheduledDepts}
              focusAreaLabel={focusAreaLabel}
              certificationLabel={certificationLabel}
              roleLabel={roleLabel}
              departmentLabel={departmentLabel}
              selectionCount={selectedIds.size}
              selectedIds={selectedIds}
              canManageEmployees={canManageEmployees}
              canManageManagementAccess={canManageManagementAccess}
              displayList={displayList}
              pendingInviteByEmployeeId={pendingInviteByEmployeeId}
              onBulkInvite={(employeesToInvite) => {
                setInviteEmployee(employeesToInvite[0]);
                setInviteQueue(employeesToInvite.slice(1));
              }}
              onBulkDeactivate={(employeeIds) => {
                setBulkNote("");
                setBulkConfirm({ action: "deactivate", employeeIds });
              }}
              onBulkActivate={(employeeIds) => {
                setBulkNote("");
                setBulkConfirm({ action: "activate", employeeIds });
              }}
              onBulkRemove={(employeeIds) => {
                setBulkNote("");
                setBulkConfirm({ action: "remove", employeeIds });
              }}
              onClearSelection={clearSelection}
              isReordering={isReordering}
              isDirty={isDirty}
              onSaveOrder={handleSaveOrder}
              onCancelReorder={handleCancelReorder}
            />
          )}

          {!showManagement && (
            <StaffFilterPopover
              open={filterOpen}
              onClose={() => setFilterOpen(false)}
              anchorRef={filterBtnRef.current}
              filterEmploymentType={filterEmploymentType}
              onFilterEmploymentTypeChange={setFilterEmploymentType}
              filterDepartment={filterDepartment}
              onFilterDepartmentChange={setFilterDepartment}
              filterDepartmentAdminOnly={filterDepartmentAdminOnly}
              onFilterDepartmentAdminOnlyChange={setFilterDepartmentAdminOnly}
              filterFocusArea={filterFocusArea}
              onFilterFocusAreaChange={setFilterFocusArea}
              filterCertification={filterCertification}
              onFilterCertificationChange={setFilterCertification}
              filterRole={filterRole}
              onFilterRoleChange={setFilterRole}
              focusAreas={focusAreas}
              certifications={certifications}
              roles={roles}
              departments={scheduledDepts}
              focusAreaLabel={focusAreaLabel}
              certificationLabel={certificationLabel}
              roleLabel={roleLabel}
              departmentLabel={departmentLabel}
              unlinkedCount={unlinkedCount}
              filterAccountLink={filterAccountLink}
              onFilterAccountLinkChange={setFilterAccountLink}
              filterOrgRole={filterOrgRole}
              onFilterOrgRoleChange={setFilterOrgRole}
              showAccessControls={showAccessControls}
              filterEmailPresence={filterEmailPresence}
              onFilterEmailPresenceChange={setFilterEmailPresence}
              filterPhonePresence={filterPhonePresence}
              onFilterPhonePresenceChange={setFilterPhonePresence}
              onClearAll={clearFilters}
              hasActiveFilters={hasActiveFilters}
              showAdministrativeFilters={!regularUserMode}
            />
          )}

          {showManagement && (
            <ManagementFilterPopover
              anchorRef={filterBtnRef.current}
              filterInvitation={managementFilters.filterInvitation}
              filterRole={managementFilters.filterRole}
              hasActiveFilters={managementHasActiveFilters}
              open={filterOpen}
              pendingCount={pendingManagementCount}
              sortKey={managementFilters.sortKey}
              onClearAll={managementFilters.clearFilters}
              onClose={() => setFilterOpen(false)}
              onFilterInvitationChange={managementFilters.setFilterInvitation}
              onFilterRoleChange={managementFilters.setFilterRole}
              onSortKeyChange={managementFilters.setSortKey}
            />
          )}

          {!showManagement &&
            (rawList.length > 0 ? (
              <>
                <div
                  data-tour="staff-table"
                  data-testid="staff-table"
                  className="overflow-x-auto rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border-light)] bg-[var(--dg-color-surface)]"
                >
                  {isReordering ? (
                    <div className="dg-staff-directory-table dg-staff-directory-table--without-status min-w-[1280px]">
                      <div className="dg-staff-directory-header bg-[var(--dg-color-bg)]">
                        <div className="dg-staff-directory-head-cell flex">
                          <span className="inline-flex select-none items-center gap-1">
                            ID{" "}
                            <SortIcon
                              active={sortConfig.key === "seniority"}
                              dir={sortConfig.dir}
                            />
                          </span>
                        </div>
                        <div className="dg-staff-directory-head-cell flex">
                          <span className="inline-flex items-center gap-1">
                            Name{" "}
                            <SortIcon active={sortConfig.key === "name"} dir={sortConfig.dir} />
                          </span>
                        </div>
                        <div className="dg-staff-directory-head-cell flex">Employment</div>
                        <div className="dg-staff-directory-head-cell flex">{focusAreaLabel}</div>
                        <div className="dg-staff-directory-head-cell flex">
                          {certificationLabel}
                        </div>
                        <div className="dg-staff-directory-head-cell flex">Roles</div>
                        <div className="dg-staff-directory-head-cell flex">Account</div>
                        <div className="dg-staff-directory-head-cell flex">Access</div>
                        <div className="dg-staff-directory-head-cell flex">Date Joined</div>
                        <div className="dg-staff-directory-head-cell flex" />
                      </div>
                      <div className="dg-staff-directory-body">
                        {paginatedList.map((employee, index) => {
                          const isDragging =
                            draggedIdx !== null && baseList[draggedIdx]?.id === employee.id;
                          const dragOffsetY = isDragging
                            ? dragDeltaY
                            : (rowDragOffsets.get(employee.id) ?? 0);

                          return (
                            <StaffReorderListRow
                              key={employee.id}
                              emp={employee}
                              globalIndex={index}
                              isExpanded={false}
                              isReordering
                              isDragging={isDragging}
                              dragPhase={isDragging ? (dragPhase ?? undefined) : undefined}
                              canManageEmployees={canManageEmployees}
                              canViewEmployeeDetails={canViewEmployeeDetails}
                              showStatusColumn={false}
                              canNavigateToDetailsPage={canManageEmployees}
                              isSelected={selectedIds.has(employee.id)}
                              focusAreas={focusAreas}
                              certifications={certifications}
                              roles={roles}
                              useCompactRoleCertificationLabels={useCompactRoleCertificationLabels}
                              orgRole={effectiveOrgRoleByEmployeeId.get(employee.id) ?? null}
                              invitationStateReady={invitationStateReady}
                              pendingInviteByEmployeeId={pendingInviteByEmployeeId}
                              onToggleSelect={toggleSelect}
                              onRowClick={() => undefined}
                              onRowRef={handleRowRef}
                              dragOffsetY={dragOffsetY}
                              onReorderPointerDown={handleReorderPointerDown}
                              onReorderPointerMove={handleReorderPointerMove}
                              onReorderPointerEnd={handleReorderPointerEnd}
                              onReorderPointerCancel={handleReorderPointerCancel}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <Table
                      className={canViewEmployeeDetails ? "min-w-[1280px]" : "min-w-[720px]"}
                      showScrollCues
                      scrollLabel="People roster"
                    >
                      <TableHeader>
                        <UITableRow className="bg-[var(--dg-color-bg)] hover:bg-transparent">
                          {canViewEmployeeDetails && (
                            <TableHead className="w-[100px] border-r border-[var(--dg-color-border-light)] pl-6">
                              <div className="flex items-center gap-1.5">
                                {canManageEmployees && (
                                  <input
                                    type="checkbox"
                                    checked={
                                      paginatedList.length > 0 &&
                                      paginatedList.every((employee) =>
                                        selectedIds.has(employee.id),
                                      )
                                    }
                                    onChange={() => toggleSelectAll(paginatedList)}
                                    onClick={(event) => event.stopPropagation()}
                                    className="h-3.5 w-3.5 cursor-pointer accent-[var(--dg-color-brand)]"
                                  />
                                )}
                                <span
                                  className="inline-flex cursor-pointer select-none items-center gap-1"
                                  onClick={() => handleSort("seniority")}
                                >
                                  ID{" "}
                                  <SortIcon
                                    active={sortConfig.key === "seniority"}
                                    dir={sortConfig.dir}
                                  />
                                </span>
                              </div>
                            </TableHead>
                          )}
                          <TableHead
                            className="cursor-pointer select-none border-r border-[var(--dg-color-border-light)]"
                            onClick={() => handleSort("name")}
                          >
                            <span className="inline-flex items-center gap-1">
                              Name{" "}
                              <SortIcon active={sortConfig.key === "name"} dir={sortConfig.dir} />
                            </span>
                          </TableHead>
                          {canViewEmployeeDetails && (
                            <TableHead className="w-[110px] border-r border-[var(--dg-color-border-light)]">
                              Employment
                            </TableHead>
                          )}
                          {canViewEmployeeDetails && activeTab === "all" && (
                            <TableHead className="w-[110px] border-[var(--dg-color-border-light)] md:border-r">
                              Status
                            </TableHead>
                          )}
                          <TableHead className="border-r border-[var(--dg-color-border-light)]">
                            {focusAreaLabel}
                          </TableHead>
                          <TableHead className="border-r border-[var(--dg-color-border-light)]">
                            {certificationLabel}
                          </TableHead>
                          <TableHead className="border-r border-[var(--dg-color-border-light)]">
                            Roles
                          </TableHead>
                          {canViewEmployeeDetails && (
                            <TableHead className="border-r border-[var(--dg-color-border-light)]">
                              Account
                            </TableHead>
                          )}
                          {canViewEmployeeDetails && (
                            <TableHead className="border-r border-[var(--dg-color-border-light)]">
                              Access
                            </TableHead>
                          )}
                          {canViewEmployeeDetails && (
                            <TableHead className="w-[140px]">Date joined</TableHead>
                          )}
                          <TableHead className="w-[40px] pr-6" />
                        </UITableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedList.map((employee, index) => {
                          const globalIndex = (page - 1) * pageSize + index;
                          const isExpanded = employee.id === expandedEmpId;

                          return (
                            <StaffTableRow
                              key={employee.id}
                              emp={employee}
                              globalIndex={globalIndex}
                              isExpanded={isExpanded}
                              isReordering={false}
                              isDragging={false}
                              canManageEmployees={canManageEmployees}
                              canViewEmployeeDetails={canViewEmployeeDetails}
                              showStatusColumn={activeTab === "all"}
                              canNavigateToDetailsPage={canManageEmployees}
                              isSelected={selectedIds.has(employee.id)}
                              focusAreas={focusAreas}
                              certifications={certifications}
                              roles={roles}
                              useCompactRoleCertificationLabels={useCompactRoleCertificationLabels}
                              orgRole={effectiveOrgRoleByEmployeeId.get(employee.id) ?? null}
                              onRoleChange={roleChangeHandlerFor(
                                employee.id,
                                directoryByEmployeeId.get(employee.id)?.userId,
                                directoryByEmployeeId.get(employee.id)?.membershipUpdatedAt,
                              )}
                              invitationStateReady={invitationStateReady}
                              pendingInviteByEmployeeId={pendingInviteByEmployeeId}
                              onToggleSelect={toggleSelect}
                              onRowClick={(employeeId) =>
                                setExpandedEmpId(isExpanded ? null : employeeId)
                              }
                            />
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>

                {!isReordering && (
                  <StaffPagination
                    page={page}
                    totalPages={totalPages}
                    totalCount={totalCount}
                    pageSize={pageSize}
                    onPageChange={setPage}
                  />
                )}
              </>
            ) : (
              <StaffEmptyState
                activeTab={activeTab}
                hasFilters={Boolean(searchQuery || hasActiveFilters)}
                onClearFilters={clearFilters}
              />
            ))}

          {canSeeManagementUsers &&
            showManagement &&
            (filteredDeptUsers.length > 0 ? (
              <div className="overflow-x-auto rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border-light)] bg-[var(--dg-color-surface)]">
                <Table className="min-w-[900px]" showScrollCues scrollLabel="People roster">
                  <TableHeader>
                    <UITableRow className="bg-[var(--dg-color-bg)] hover:bg-transparent">
                      {canViewEmployeeDetails && (
                        <TableHead className="w-[100px] border-r border-[var(--dg-color-border-light)] pl-6">
                          ID
                        </TableHead>
                      )}
                      <TableHead className="border-r border-[var(--dg-color-border-light)]">
                        Name
                      </TableHead>
                      <TableHead className="border-r border-[var(--dg-color-border-light)]">
                        {managementDepartmentLabel}
                      </TableHead>
                      <TableHead className="border-r border-[var(--dg-color-border-light)]">
                        Role
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[40px] pr-6" />
                    </UITableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeptUsers.map((person) => {
                      const personDepts = person.managementDepartmentIds
                        .map((departmentId) =>
                          managementDepts.find((department) => department.id === departmentId),
                        )
                        .filter(
                          (department): department is NonNullable<typeof department> =>
                            department != null,
                        );
                      const isPending = person.invitationStatus !== null && !person.hasAppAccess;
                      // On-schedule members open the same StaffDetailPanel/
                      // StaffReadOnlyDetailPanel the People table uses (via
                      // expandedEmpId), so every field is editable from
                      // whichever list you opened them from. Management-only
                      // people and pending invites still use the lighter
                      // ManagementStaffPanel via expandedPersonId.
                      const isOnScheduleMember =
                        hasSavedScheduleAssignment(person) && person.employeeId;
                      const isExpanded = isOnScheduleMember
                        ? person.employeeId === expandedEmpId
                        : person.personId === expandedPersonId;
                      const statusLabel = isPending
                        ? person.invitationStatus === "expired"
                          ? "Expired"
                          : "Pending"
                        : person.employeeStatus === "removed"
                          ? "Removed"
                          : person.employeeStatus === "inactive"
                            ? "Inactive"
                            : "Active";
                      const statusTone: StatusPillTone = isPending
                        ? "warning"
                        : person.employeeStatus === "removed"
                          ? "danger"
                          : person.employeeStatus === "inactive"
                            ? "warning"
                            : "success";
                      const displayName =
                        person.firstName || person.lastName
                          ? `${person.firstName} ${person.lastName}`.trim()
                          : // A pending invite carries no name, so the address is the only
                            // identity it has. Viewers without contact access get neither,
                            // and an unlabelled row is clearer than an empty one.
                            person.email || "Invited member";
                      const initials = getAvatarInitials(displayName);
                      const avatarTone = getAvatarTone(
                        getDirectoryPersonAvatarSeed(person),
                        isDarkTheme,
                      );
                      const isYou = isSelfAction(currentUserId, person.userId);

                      return (
                        <UITableRow
                          key={person.personId}
                          className={`cursor-pointer transition-colors ${
                            isExpanded
                              ? "bg-[var(--dg-color-control-active-bg)]"
                              : "hover:bg-[var(--dg-color-bg)]"
                          }`}
                          onClick={() =>
                            isOnScheduleMember
                              ? setExpandedEmpId(isExpanded ? null : person.employeeId)
                              : setExpandedPersonId(isExpanded ? null : person.personId)
                          }
                          style={{ opacity: isPending ? 0.7 : 1 }}
                        >
                          {canViewEmployeeDetails && (
                            <TableCell className="w-[100px] border-r border-[var(--dg-color-border-light)] py-4 pl-6">
                              <span className="text-[var(--dg-fs-footnote)] font-medium tabular-nums text-[var(--dg-color-text-faint)]">
                                {person.employeeNumber !== null
                                  ? `#${person.employeeNumber}`
                                  : "\u2014"}
                              </span>
                            </TableCell>
                          )}

                          <TableCell className="border-r border-[var(--dg-color-border-light)] py-4">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <div
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                                style={{
                                  ...getAvatarTypography(32),
                                  background: isPending
                                    ? "var(--dg-color-surface)"
                                    : avatarTone.backgroundColor,
                                  color: isPending
                                    ? "var(--dg-color-text-muted)"
                                    : avatarTone.textColor,
                                  border: isPending
                                    ? "1px solid var(--dg-color-border-light)"
                                    : `1px solid ${avatarTone.borderColor}`,
                                }}
                              >
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  {/* Match the on-schedule roster: the name
                                      links to the full profile page only for
                                      staff managers (the /people/[id] page is
                                      manager-only for management users); the
                                      self link just goes to /profile. Stop
                                      row-click propagation so the link doesn't
                                      also toggle the expanded popover. */}
                                  {person.employeeId &&
                                  (canManageEmployees ||
                                    isCurrentUsersEmployee(person.userId, currentUserId)) ? (
                                    <Link
                                      href={getEmployeeProfileHref(
                                        person.employeeId,
                                        person.userId,
                                        currentUserId,
                                      )}
                                      onClick={(event) => event.stopPropagation()}
                                      className="truncate text-[length:var(--dg-fs-body)] font-medium text-[var(--dg-color-text-primary)] hover:underline"
                                    >
                                      {displayName}
                                    </Link>
                                  ) : (
                                    <span className="truncate text-[length:var(--dg-fs-body)] font-medium text-[var(--dg-color-text-primary)]">
                                      {displayName}
                                    </span>
                                  )}
                                  {/* A pending invite is badged too: the row
                                      says the account isn't live yet, the star
                                      says which tier it will land on. */}
                                  <AccessInsignia orgRole={person.orgRole} />
                                  {isYou && (
                                    <span className="shrink-0 rounded-full bg-[var(--dg-color-control-active-bg)] px-1.5 py-px text-[length:var(--dg-type-badge-size)] font-medium text-[var(--dg-color-control-active-text)]">
                                      You
                                    </span>
                                  )}
                                  {/* "On Schedule" reflects whether the person
                                      actually appears on the schedule grid,
                                      which gates on focusAreaIds (see
                                      ScheduleGrid.tsx + PeoplePageContent's
                                      `employees` filter). `source === "employee"`
                                      is no longer a valid signal — every member
                                      has an employees row post-Flow-B. */}
                                  {hasSavedScheduleAssignment(person) && (
                                    <span
                                      className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[length:var(--dg-type-badge-size)] font-medium"
                                      style={{
                                        background: "var(--dg-color-today-bg)",
                                        color: "var(--dg-color-today-text)",
                                      }}
                                    >
                                      On Schedule
                                    </span>
                                  )}
                                </div>
                                {person.email && (
                                  <div className="mt-0.5 truncate text-[12px] text-[var(--dg-color-text-muted)]">
                                    {person.email}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="border-r border-[var(--dg-color-border-light)] py-4">
                            <span className="text-[13px] text-[var(--dg-color-text-muted)]">
                              {personDepts.length > 0
                                ? personDepts.map((department) => department.name).join(", ")
                                : "\u2014"}
                            </span>
                          </TableCell>

                          <TableCell className="border-r border-[var(--dg-color-border-light)] py-4">
                            <InlineRoleSelect
                              orgRole={person.orgRole}
                              onChange={
                                person.userId
                                  ? roleChangeHandlerFor(
                                      person.employeeId ?? "",
                                      person.userId,
                                      person.membershipUpdatedAt,
                                    )
                                  : replacePendingInvitationRole(
                                      pendingInvitations.find(
                                        (invitation) =>
                                          invitation.id === person.personId.replace("inv:", ""),
                                      ),
                                    )
                              }
                              isSelf={isSelfAction(currentUserId, person.userId)}
                              pendingInvitationEmail={person.userId ? undefined : person.email}
                            />
                          </TableCell>

                          <TableCell className="py-4">
                            <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
                          </TableCell>

                          <TableCell className="w-[40px] py-4 pr-6 text-right">
                            <div
                              className="flex items-center justify-center"
                              style={{
                                color: isExpanded
                                  ? "var(--dg-color-control-active-text)"
                                  : "var(--dg-color-text-faint)",
                              }}
                            >
                              <ChevronRight size={14} strokeWidth={2.5} />
                            </div>
                          </TableCell>
                        </UITableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={<User size={28} strokeWidth={1.5} />}
                title={
                  searchQuery || managementHasActiveFilters
                    ? "No results found"
                    : "No management members yet"
                }
                description={
                  searchQuery || managementHasActiveFilters
                    ? "Try adjusting your search or filters."
                    : "People assigned to management will show here."
                }
              />
            ))}
        </div>
      </div>

      {showImport && orgId && (
        <BulkImportModal
          orgId={orgId}
          focusAreas={focusAreas}
          certifications={certifications}
          roles={roles}
          onClose={() => setShowImport(false)}
          onImported={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.employees.all(orgId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.org.employeeCount(orgId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) });
          }}
        />
      )}

      {inviteEmployee && orgId && (
        <InviteEmployeeModal
          employee={inviteEmployee}
          orgId={orgId}
          orgName={orgName || "your organization"}
          pendingInvitation={pendingInviteByEmployeeId.get(inviteEmployee.id)}
          onClose={() => {
            setInviteEmployee(null);
            setInviteQueue([]);
          }}
          onInvited={(updatedEmployee) => {
            syncExistingEmployeeInCaches(updatedEmployee);
            refreshInvitations();
            if (orgId) {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.org.directory(orgId),
              });
              void queryClient.invalidateQueries({
                queryKey: queryKeys.employees.all(orgId),
              });
            }
            if (inviteQueue.length > 0) {
              setInviteEmployee(inviteQueue[0]);
              setInviteQueue((queue) => queue.slice(1));
            } else {
              setInviteEmployee(null);
            }
          }}
        />
      )}

      {showManagementInvite && canViewManagementUsers && orgId && (
        <InviteEmployeeModal
          employee={null}
          orgId={orgId}
          orgName={orgName || "your organization"}
          departments={departmentItems}
          onClose={() => setShowManagementInvite(false)}
          onInvited={() => {
            setShowManagementInvite(false);
            if (orgId) {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.org.directory(orgId),
              });
            }
          }}
        />
      )}

      {selectedEmployee && !canManageEmployees && selectedEmployee.status === "active" && (
        <StaffReadOnlyDetailPanel
          canViewEmployeeDetails={canViewEmployeeDetails}
          employee={selectedEmployee}
          orgRole={effectiveOrgRoleByEmployeeId.get(selectedEmployee.id) ?? null}
          focusAreas={focusAreas}
          certifications={certifications}
          roles={roles}
          roleLabel={roleLabel}
          focusAreaLabel={focusAreaLabel}
          certificationLabel={certificationLabel}
          departments={departmentItems}
          departmentLabel={departmentLabel}
          onClose={() => setExpandedEmpId(null)}
        />
      )}

      {selectedEmployee && canManageEmployees && (
        <StaffDetailPanel
          employee={selectedEmployee}
          focusAreas={focusAreas}
          certifications={certifications}
          roles={roles}
          roleLabel={roleLabel}
          focusAreaLabel={focusAreaLabel}
          certificationLabel={certificationLabel}
          departments={departmentItems}
          departmentLabel={departmentLabel}
          canManageEmployees={canManageEmployees}
          orgId={orgId}
          pendingInviteByEmployeeId={pendingInviteByEmployeeId}
          onSave={handleSave}
          onSaveWithReinvite={onSaveWithReinvite}
          onRemove={onRemove}
          onDeactivate={(employeeId, note) => onDeactivate(employeeId, note)}
          onActivate={(employeeId) => onActivate(employeeId)}
          onClose={() => setExpandedEmpId(null)}
          onInvite={
            canManageManagementAccess ? (employee) => setInviteEmployee(employee) : undefined
          }
          orgRole={effectiveOrgRoleByEmployeeId.get(selectedEmployee.id) ?? null}
          onRoleChange={selectedEmployeeRoleChange}
          adminPermissions={selectedEmployeeDirectoryPerson?.adminPermissions}
          onPermissionsChange={selectedEmployeePermissionsChange}
          canManageManagementAccess={canManageManagementAccess}
          hasManagementAccess={selectedEmployeeDirectoryPerson?.isManagementUser ?? false}
          hasPendingManagementInvite={selectedEmployeeHasPendingManagementInvite}
          onManageManagementAccess={
            canManageManagementAccess ? openManagementAccessPopup : undefined
          }
          onRevoke={handleRevokeInvitation}
        />
      )}

      {managementAccessEmployee && selectedEmployee && orgId && (
        <Modal
          title={
            selectedEmployeeDirectoryPerson?.isManagementUser ||
            selectedEmployeeHasPendingManagementInvite
              ? "Edit management access"
              : "Add to management"
          }
          onClose={closeManagementAccessPopup}
          onRequestClose={requestManagementAccessClose}
          className="dg-modal--tight-header"
          style={{ maxWidth: 560, width: "100%" }}
        >
          <EmployeeManagementAccessEditor
            employee={managementAccessEmployee}
            orgId={orgId}
            orgName={orgName || "your organization"}
            managementDepartments={managementDepts}
            directoryPerson={selectedEmployeeDirectoryPerson}
            pendingInvitation={pendingInviteByEmployeeId.get(managementAccessEmployee.id)}
            onDirtyChange={setManagementAccessDirty}
            onClose={closeManagementAccessPopup}
            onCompleted={async (updatedEmployee) => {
              syncExistingEmployeeInCaches(updatedEmployee);
              await refreshInvitations();
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: queryKeys.org.directory(orgId),
                }),
                queryClient.invalidateQueries({
                  queryKey: queryKeys.org.users(orgId),
                }),
                queryClient.invalidateQueries({
                  queryKey: queryKeys.employees.all(orgId),
                }),
              ]);
            }}
          />
        </Modal>
      )}
      {managementAccessUnsavedChangesDialog}

      {selectedPerson && canSeeManagementUsers && (
        <ManagementStaffPanel
          person={selectedPerson}
          contactEmail={findEmployeeById(selectedPerson.employeeId)?.email || null}
          departments={managementDepts}
          departmentLabel={managementDepartmentLabel}
          canManageScheduleEmployees={canManageEmployees}
          canManageManagementAccess={canManageManagementAccess}
          isSelf={isSelfAction(currentUserId, selectedPerson.userId)}
          onRoleChange={
            !canManageManagementAccess
              ? undefined
              : selectedPerson.userId && selectedPerson.membershipUpdatedAt
                ? async (newRole) => {
                    const userId = selectedPerson.userId;
                    const expectedUpdatedAt = selectedPerson.membershipUpdatedAt;
                    if (!orgId || !userId || !expectedUpdatedAt) return;
                    await updateOrganizationMembershipGuarded({
                      orgId,
                      userId,
                      expectedUpdatedAt,
                      orgRole: newRole,
                    });
                    await queryClient.invalidateQueries({
                      queryKey: queryKeys.org.directory(orgId),
                    });
                    await queryClient.invalidateQueries({
                      queryKey: queryKeys.org.users(orgId),
                    });
                  }
                : selectedPerson.employeeId
                  ? roleChangeHandlerFor(selectedPerson.employeeId, null, null)
                  : replacePendingInvitationRole(
                      pendingInvitations.find(
                        (item) => item.id === selectedPerson.personId.replace("inv:", ""),
                      ),
                    )
          }
          onPermissionsChange={
            canManageManagementAccess && selectedPerson.userId && selectedPerson.membershipUpdatedAt
              ? async (perms) => {
                  const userId = selectedPerson.userId;
                  const expectedUpdatedAt = selectedPerson.membershipUpdatedAt;
                  if (!orgId || !userId || !expectedUpdatedAt) return;
                  await updateOrganizationMembershipGuarded({
                    orgId,
                    userId,
                    expectedUpdatedAt,
                    adminPermissions: perms,
                  });
                  await queryClient.invalidateQueries({
                    queryKey: queryKeys.org.directory(orgId),
                  });
                  await queryClient.invalidateQueries({
                    queryKey: queryKeys.org.users(orgId),
                  });
                }
              : undefined
          }
          onClose={() => setExpandedPersonId(null)}
          onSave={async (data) => {
            if (!orgId) return;

            try {
              let updatedEmployee: Employee | null = null;
              let revokedInvitationEmail: string | null = null;

              if (selectedPerson.source === "employee" && selectedPerson.employeeId) {
                const currentEmployee = findEmployeeById(selectedPerson.employeeId);
                if (!currentEmployee) {
                  toast.error("Could not load the latest employee record. Refresh and try again.");
                  return;
                }
                const emailChanged = (currentEmployee.email || "") !== (data.email || "");
                const identityResult = await updateEmployeeIdentity({
                  employeeId: selectedPerson.employeeId,
                  orgId,
                  userId: selectedPerson.userId,
                  firstName: data.firstName,
                  lastName: data.lastName,
                  email: data.email,
                  phone: data.phone,
                  expectedVersion: currentEmployee.version,
                });
                const pendingInvitation = pendingInviteByEmployeeId.get(selectedPerson.employeeId);
                if (selectedPerson.userId) {
                  await updateAppOnlyUser(selectedPerson.userId, orgId, {
                    departmentIds: data.managementDepartmentIds,
                  });
                } else if (pendingInvitation && emailChanged) {
                  // employees.email is the single source of truth for the
                  // invitation's own target address now (the field is
                  // read-only in the panel whenever a contact email is
                  // already on file), so a real change here just backfilled
                  // it for the first time. If that value doesn't exactly
                  // match what the invitation was already sent to, the
                  // trg_revoke_invitation_on_email_change trigger has
                  // already revoked it as a side effect of the identity
                  // update above — patching its now-dead fields would only
                  // silently rewrite a corpse, so skip it and surface the
                  // revocation instead.
                  revokedInvitationEmail = pendingInvitation.email;
                } else if (pendingInvitation) {
                  await updatePendingInvitation(pendingInvitation.id, orgId, {
                    firstName: data.firstName,
                    lastName: data.lastName,
                    phone: data.phone,
                    departmentIds: data.managementDepartmentIds,
                  });
                }

                updatedEmployee = identityResult.employee;
              } else if (selectedPerson.source === "pending_invite") {
                await updatePendingInvitation(selectedPerson.personId.replace("inv:", ""), orgId, {
                  firstName: data.firstName,
                  lastName: data.lastName,
                  email: data.email || undefined,
                  phone: data.phone,
                  departmentIds: data.managementDepartmentIds,
                });
              } else if (selectedPerson.userId) {
                await updateAppOnlyUser(selectedPerson.userId, orgId, {
                  firstName: data.firstName,
                  lastName: data.lastName,
                  phone: data.phone,
                  departmentIds: data.managementDepartmentIds,
                });
              }

              if (updatedEmployee) {
                syncExistingEmployeeInCaches(updatedEmployee);
              }

              syncDirectoryPersonInCaches(applyManagementDirectoryUpdate(selectedPerson, data));
              refreshInvitations();
              void queryClient.invalidateQueries({
                queryKey: queryKeys.org.directory(orgId),
              });
              void queryClient.invalidateQueries({
                queryKey: queryKeys.employees.all(orgId),
              });
              toast.success(
                revokedInvitationEmail
                  ? `Changes saved. Their pending invitation to ${revokedInvitationEmail} was revoked.`
                  : "Changes saved",
              );
            } catch (err) {
              toast.error(formatClientErrorMessage(err, "We couldn't save those changes."));
            }
          }}
          onRevokeInvitation={
            canManageManagementAccess && orgId
              ? async (invitationId) => {
                  await revokeInvitation(invitationId, orgId);
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.org.directory(orgId),
                  });
                  toast.success("Invitation revoked");
                }
              : undefined
          }
          onResendInvitation={
            canManageManagementAccess && orgId
              ? async (invitationId) => {
                  await resendInvitation(invitationId, orgId);
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.org.directory(orgId),
                  });
                  toast.success("Invitation resent");
                }
              : undefined
          }
          onAddToSchedule={
            canManageEmployees
              ? (person) => {
                  setManagementSchedulePerson(person);
                }
              : undefined
          }
        />
      )}

      {managementSchedulePerson &&
        orgId &&
        (() => {
          const existingEmployee = findEmployeeById(managementSchedulePerson.employeeId);
          if (!existingEmployee) return null;
          return (
            <AddManagementUserToScheduleModal
              orgId={orgId}
              person={managementSchedulePerson}
              employee={existingEmployee}
              focusAreas={focusAreas}
              certifications={certifications}
              roles={roles}
              focusAreaLabel={focusAreaLabel}
              certificationLabel={certificationLabel}
              roleLabel={roleLabel}
              onClose={() => setManagementSchedulePerson(null)}
              onAdded={(employee) => {
                syncManagementScheduleEmployeeInCaches(managementSchedulePerson, employee);
                setManagementSchedulePerson(null);
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.org.directory(orgId),
                });
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.employees.all(orgId),
                });
              }}
            />
          );
        })()}

      {bulkConfirm
        ? (() => {
            const count = bulkConfirm.employeeIds.length;
            const plural = count === 1 ? "" : "s";
            const showReason = bulkConfirm.action !== "activate";
            const summary =
              bulkConfirm.action === "deactivate"
                ? `Deactivate ${count} selected staff member${plural}? They'll be hidden from active scheduling and can be reactivated anytime.`
                : bulkConfirm.action === "activate"
                  ? `Activate ${count} selected staff member${plural}? They'll return to active scheduling.`
                  : `Remove ${count} selected staff member${plural}? They'll lose access and won't appear in active staff lists.`;
            return (
              <ConfirmDialog
                title={
                  bulkConfirm.action === "deactivate"
                    ? "Deactivate Selected Staff?"
                    : bulkConfirm.action === "activate"
                      ? "Activate Selected Staff?"
                      : "Remove Selected Staff?"
                }
                message={
                  showReason ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <span>{summary}</span>
                      <input
                        className="dg-input"
                        value={bulkNote}
                        onChange={(e) => setBulkNote(e.target.value)}
                        disabled={isBulkActionRunning}
                        placeholder="Reason (optional, applies to all selected)"
                        style={{ fontSize: "var(--dg-fs-label)" }}
                      />
                    </div>
                  ) : (
                    summary
                  )
                }
                confirmLabel={
                  bulkConfirm.action === "deactivate"
                    ? "Deactivate"
                    : bulkConfirm.action === "activate"
                      ? "Activate"
                      : "Remove"
                }
                variant={bulkConfirm.action === "remove" ? "danger" : "warning"}
                isLoading={isBulkActionRunning}
                onConfirm={handleConfirmBulkAction}
                onCancel={() => {
                  if (!isBulkActionRunning) {
                    setBulkConfirm(null);
                    setBulkNote("");
                  }
                }}
              />
            );
          })()
        : null}

      {exportConfirm ? (
        <ConfirmDialog
          title="Export Staff Data?"
          message="Export the current staff directory data as a downloadable file?"
          confirmLabel="Export"
          variant="info"
          // Closing first unmounted the dialog before the export started, so
          // its confirm button never got to spin. Let the latch hold the
          // dialog open for the request and close once it settles.
          onConfirm={async () => {
            try {
              await handleExport();
            } finally {
              setExportConfirm(false);
            }
          }}
          onCancel={() => setExportConfirm(false)}
        />
      ) : null}
    </>
  );
}
