"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Import as ImportIcon, SlidersHorizontal, Upload } from "lucide-react";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import {
  fetchOrganizationInvitations,
  removeUserFromOrganization,
  resendInvitation,
  revokeInvitation,
  updateAppOnlyUser,
  updatePendingInvitation,
} from "@/features/organization/client";
import { updateEmployeeIdentity } from "@/features/employees/client";
import * as Sentry from "@/lib/sentry";
import {
  applyManagementDirectoryUpdate,
  mergeEmployeeIntoDirectoryPerson,
  upsertEmployeeInList,
} from "@/lib/staff-directory";
import type {
  Department,
  DirectoryPerson,
  Employee,
  FocusArea,
  Invitation,
  NamedItem,
  OrganizationRole,
} from "@/types";
import { useDirectory, useMediaQuery, MOBILE, TABLET } from "@/hooks";
import InviteEmployeeModal from "@/components/InviteEmployeeModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import { getAvatarInitials } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow as UITableRow,
} from "@/components/ui/table";
import { BulkImportModal } from "./BulkImportModal";
import { DirectorySummaryCards } from "./DirectorySummaryCards";
import { EmployeeManagementAccessModal } from "./EmployeeManagementAccessModal";
import { ManagementStaffPanel } from "./ManagementStaffPanel";
import { InlineRoleSelect } from "./InlineRoleSelect";
import { updateOrganizationMembershipGuarded } from "@/features/organization/client/access";
import { AddManagementUserToScheduleModal } from "./AddManagementUserToScheduleModal";
import { SortIcon } from "./SortIcon";
import { StaffContextBar } from "./StaffContextBar";
import { StaffDetailPanel } from "./StaffDetailPanel";
import { StaffReadOnlyDetailPanel } from "./StaffReadOnlyDetailPanel";
import { StaffEmptyState } from "./StaffEmptyState";
import { StaffFilterPopover } from "./StaffFilterPopover";
import { StaffPagination } from "./StaffPagination";
import { StaffReorderListRow, StaffTableRow } from "./StaffTableRow";
import { useStaffFilters } from "./useStaffFilters";
import { useStaffReorder } from "./useStaffReorder";
import { useStaffSelection } from "./useStaffSelection";

const REORDER_SETTLE_MS = 220;

type BulkStaffAction = "bench" | "activate" | "terminate";

export interface MembersSectionProps {
  employees: Employee[];
  benchedEmployees: Employee[];
  terminatedEmployees: Employee[];
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  onSave: (emp: Employee) => void;
  onDelete: (empId: string) => void;
  onBench: (empId: string, note?: string) => void;
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
  departments?: Department[];
  departmentLabel?: string;
  managementDepartmentLabel?: string;
}

export function MembersSection({
  employees,
  benchedEmployees,
  terminatedEmployees,
  focusAreas,
  certifications,
  roles,
  onSave,
  onDelete,
  onBench,
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
  departments: departmentItems = [],
  departmentLabel = "Scheduled Departments",
  managementDepartmentLabel = "Management Departments",
}: MembersSectionProps) {
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);
  const queryClient = useQueryClient();
  const canManageManagementAccess = !!isSuperAdmin || !!isGridmaster;
  const canViewManagementUsers = canManageEmployees || canManageManagementAccess;
  const directoryOrgId = canViewManagementUsers ? orgId ?? null : null;
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  const filters = useStaffFilters({
    employees,
    benchedEmployees,
    terminatedEmployees,
  });
  const {
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
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
    filterEmailPresence,
    setFilterEmailPresence,
    filterPhonePresence,
    setFilterPhonePresence,
    hasActiveFilters,
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

  const { selectedIds, toggleSelect, toggleSelectAll, clearSelection } =
    useStaffSelection();
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

  const getRowHeight = useCallback((index: number) => {
    const employee = baseList[index];
    if (!employee) return 56;
    return rowRectsRef.current.get(employee.id)?.height ?? 56;
  }, [baseList]);

  const getDraggedTargetDelta = useCallback((sourceIdx: number, dropIdx: number) => {
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
  }, [getRowHeight]);

  const handleReorderPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>, index: number) => {
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
  }, [baseList, cancelSettleAnimation, handleDragStart, isReordering]);

  const handleReorderPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
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
  }, [handleDragMove]);

  const handleReorderPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
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
  }, [getDraggedTargetDelta, handleDrop]);

  const handleReorderPointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
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
  }, [cancelSettleAnimation, handleDragEnd]);

  const rowDragOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    if (
      !isReordering ||
      draggedIdx === null ||
      dragOverIdx === null
    ) {
      return offsets;
    }

    const draggedEmployee = baseList[draggedIdx];
    if (!draggedEmployee) return offsets;

    const draggedHeight =
      rowRectsRef.current.get(draggedEmployee.id)?.height ?? 56;

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
    filterPhonePresence,
    filterRole,
    searchQuery,
    sortConfig,
  ]);

  const [inviteEmployee, setInviteEmployee] = useState<Employee | null>(null);
  const [inviteQueue, setInviteQueue] = useState<Employee[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const [, setRevokingId] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<{
    action: BulkStaffAction;
    employeeIds: string[];
  } | null>(null);
  const [isBulkActionRunning, setIsBulkActionRunning] = useState(false);
  const [exportConfirm, setExportConfirm] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    fetchOrganizationInvitations(orgId)
      .then((invites) => {
        if (cancelled) return;
        setPendingInvitations(
          invites.filter(
            (inv) =>
              !inv.acceptedAt &&
              !inv.revokedAt &&
              new Date(inv.expiresAt) > new Date(),
          ),
        );
      })
      .catch((err) => {
        Sentry.captureException(err);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const pendingInviteByEmployeeId = useMemo(() => {
    const map = new Map<string, Invitation>();
    for (const inv of pendingInvitations) {
      if (inv.employeeId) {
        map.set(inv.employeeId, inv);
      }
    }
    return map;
  }, [pendingInvitations]);

  const { directory } = useDirectory(directoryOrgId);
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
  // Returns an inline role-change handler when the viewer may manage access and
  // the person has an editable login; otherwise undefined (read-only cell).
  const roleChangeHandlerFor = (
    userId: string | null | undefined,
    membershipUpdatedAt: string | null | undefined,
  ): ((newRole: OrganizationRole) => Promise<void>) | undefined => {
    if (!canManageManagementAccess || !orgId || !userId || !membershipUpdatedAt) {
      return undefined;
    }
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
  const [deptFilterId, setDeptFilterId] = useState<number | null>(null);
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [managementAccessEmployee, setManagementAccessEmployee] =
    useState<Employee | null>(null);
  const [managementSchedulePerson, setManagementSchedulePerson] =
    useState<DirectoryPerson | null>(null);

  const filteredDeptUsers = useMemo(() => {
    let list = departmentUsers;

    if (deptFilterId === -1) {
      list = list.filter((user) => user.managementDepartmentIds.length === 0);
    } else if (deptFilterId !== null) {
      list = list.filter((user) =>
        user.managementDepartmentIds.includes(deptFilterId),
      );
    }

    if (showManagement && searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (user) =>
          `${user.firstName} ${user.lastName}`.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          (user.phone && user.phone.includes(query)),
      );
    }

    return list;
  }, [departmentUsers, deptFilterId, searchQuery, showManagement]);

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

  useEffect(() => {
    if (!showManagement) {
      setDeptFilterId(null);
      setExpandedPersonId(null);
    }
  }, [showManagement]);

  useEffect(() => {
    if (!canViewManagementUsers && showManagement) {
      setShowManagement(false);
    }
  }, [canViewManagementUsers, showManagement]);

  const [showManagementInvite, setShowManagementInvite] = useState(false);
  const [showImport, setShowImport] = useState(false);

  function handleExport() {
    if (!orgId) return;
    window.open(`/api/export?type=staff&orgId=${orgId}`, "_blank");
  }

  async function handleConfirmBulkAction() {
    if (!bulkConfirm || isBulkActionRunning) return;

    const pendingAction = bulkConfirm;
    setIsBulkActionRunning(true);
    try {
      for (const employeeId of pendingAction.employeeIds) {
        if (pendingAction.action === "bench") {
          await onBench(employeeId);
        } else if (pendingAction.action === "activate") {
          await onActivate(employeeId);
        } else {
          await onDelete(employeeId);
        }
      }
      setBulkConfirm(null);
      clearSelection();
    } finally {
      setIsBulkActionRunning(false);
    }
  }

  function refreshInvitations() {
    if (!orgId) return;

    fetchOrganizationInvitations(orgId)
      .then((invites) => {
        setPendingInvitations(
          invites.filter(
            (inv) =>
              !inv.acceptedAt &&
              !inv.revokedAt &&
              new Date(inv.expiresAt) > new Date(),
          ),
        );
      })
      .catch(() => {});
  }

  async function handleRevokeInvitation(
    invitationId: string,
  ): Promise<boolean> {
    if (!orgId) return false;
    setRevokingId(invitationId);

    try {
      await revokeInvitation(invitationId, orgId);
      refreshInvitations();
      toast.success("Invitation revoked");
      return true;
    } catch {
      toast.error("Failed to revoke invitation");
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

  const handleDelete = useCallback(
    (employeeId: string) => {
      onDelete(employeeId);
      setExpandedEmpId(null);
    },
    [onDelete],
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

  const tabs: {
    key: "active" | "benched" | "terminated";
    label: string;
    count: number;
  }[] = canManageEmployees
    ? [
        { key: "active", label: "All", count: employees.length },
        { key: "benched", label: "Benched", count: benchedEmployees.length },
        { key: "terminated", label: "Terminated", count: terminatedEmployees.length },
      ]
    : [{ key: "active", label: "All", count: employees.length }];

  const selectedEmployee = expandedEmpId
    ? [...employees, ...benchedEmployees, ...terminatedEmployees].find(
        (employee) => employee.id === expandedEmpId,
      ) ?? null
    : null;
  const selectedEmployeeDirectoryPerson = selectedEmployee
    ? directory.find((person) => person.employeeId === selectedEmployee.id) ??
      null
    : null;
  const selectedPerson = expandedPersonId
    ? departmentUsers.find((user) => user.personId === expandedPersonId) ?? null
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

  const syncExistingEmployeeInCaches = useCallback(
    (updatedEmployee?: Employee | null) => {
      if (!orgId || !updatedEmployee) return;

      queryClient.setQueryData(
        queryKeys.employees.all(orgId),
        (current: Employee[] | undefined) =>
          current ? upsertEmployeeInList(current, updatedEmployee) : current,
      );
      queryClient.setQueryData(
        queryKeys.org.directory(orgId),
        (current: DirectoryPerson[] | undefined) =>
          current?.map((person) =>
            person.employeeId === updatedEmployee.id
              ? mergeEmployeeIntoDirectoryPerson(person, updatedEmployee)
              : person,
          ) ?? current,
      );
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
      syncDirectoryPersonInCaches(
        mergeEmployeeIntoDirectoryPerson(person, employee),
      );
    },
    [orgId, syncDirectoryPersonInCaches, syncExistingEmployeeInCaches],
  );

  return (
    <>
      <div className="p-4 md:p-6 lg:px-12 lg:py-10">
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
              Directory
            </h2>
            <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
              View and manage your organization&apos;s staff roster.
            </p>
          </div>

          <DirectorySummaryCards
            onScheduleCount={employees.length}
            fullTimeCount={employmentSummary.fullTime}
            partTimeCount={employmentSummary.partTime}
          />

          <div className="relative">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]"
              style={{ left: 12 }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="dg-input w-full"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name, email, or phone..."
              style={{ height: 40, paddingLeft: 36 }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {canViewManagementUsers && managementDepts.length > 0 && (
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
                    if (value === "schedule") {
                      setActiveTab("active");
                    }
                  }}
                  style={{ minWidth: 180 }}
                  fontSize={13}
                />
              )}

              {!showManagement && (
                <button
                  ref={filterBtnRef}
                  onClick={() => setFilterOpen((current) => !current)}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                  style={{ position: "relative" }}
                >
                  <SlidersHorizontal size={14} strokeWidth={2.25} aria-hidden="true" />
                  {isMobile ? "" : "Filter"}
                  {hasActiveFilters && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--color-brand)]" />
                  )}
                </button>
              )}

              {canShowReorder && (
                <button
                  onClick={() => {
                    if (!hasReorderableStaffRows) return;
                    handleEnterReorder();
                    setExpandedEmpId(null);
                    setPage(1);
                  }}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
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
                </button>
              )}

              {!showManagement && (
                <div className="dg-span-tabs dg-span-tabs--light" style={{ flex: "0 1 auto" }}>
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
                              background: showDivider
                                ? "var(--color-border)"
                                : "transparent",
                              flexShrink: 0,
                              alignSelf: "center",
                            }}
                          />
                        )}
                        <button
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
                                : "var(--color-border-light)",
                              color: active
                                ? "inherit"
                                : "var(--color-text-muted)",
                              marginLeft: 3,
                            }}
                          >
                            {tab.count}
                          </span>
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {showManagement && departmentItems.length > 0 && (
                <div className="dg-span-tabs dg-span-tabs--light" style={{ flex: "0 1 auto" }}>
                  <button
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
                            : "var(--color-border-light)",
                        color:
                          deptFilterId === null
                            ? "inherit"
                            : "var(--color-text-muted)",
                        marginLeft: 3,
                      }}
                    >
                      {departmentUsers.length}
                    </span>
                  </button>
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
                              background: showDivider
                                ? "var(--color-border)"
                                : "transparent",
                              flexShrink: 0,
                              alignSelf: "center",
                            }}
                          />
                          <button
                            onClick={() =>
                              setDeptFilterId(active ? null : department.id)
                            }
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
                                  : "var(--color-border-light)",
                                color: active
                                  ? "inherit"
                                  : "var(--color-text-muted)",
                                marginLeft: 3,
                              }}
                            >
                              {deptCounts.get(department.id) ?? 0}
                            </span>
                          </button>
                        </span>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {!showManagement && canManageEmployees && orgId && !isMobile && (
                <button
                  onClick={() => setShowImport(true)}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                >
                  <ImportIcon size={14} />
                  Import
                </button>
              )}

              {!showManagement &&
                canViewManagementUsers &&
                orgId &&
                !isMobile && (
                  <button
                    onClick={() => setExportConfirm(true)}
                    className="dg-btn dg-btn-secondary dg-btn-sm"
                    disabled={!hasExportableStaffRows}
                  >
                    <Upload size={14} />
                    Export
                  </button>
                )}

              {((showManagement && canManageManagementAccess) ||
                (!showManagement && canManageEmployees)) && (
                <button
                  onClick={
                    showManagement
                      ? () => setShowManagementInvite(true)
                      : onAdd
                  }
                  className="dg-btn dg-btn-primary dg-btn-sm"
                >
                  + Add
                </button>
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
              departments={departmentItems}
              focusAreaLabel={focusAreaLabel}
              certificationLabel={certificationLabel}
              roleLabel={roleLabel}
              departmentLabel={departmentLabel}
              selectionCount={selectedIds.size}
              selectedIds={selectedIds}
              activeTab={activeTab}
              canManageEmployees={canManageEmployees}
              displayList={displayList}
              pendingInviteByEmployeeId={pendingInviteByEmployeeId}
              onBulkInvite={(employeesToInvite) => {
                setInviteEmployee(employeesToInvite[0]);
                setInviteQueue(employeesToInvite.slice(1));
              }}
              onBulkBench={(employeeIds) => {
                setBulkConfirm({ action: "bench", employeeIds });
              }}
              onBulkActivate={(employeeIds) => {
                setBulkConfirm({ action: "activate", employeeIds });
              }}
              onBulkTerminate={(employeeIds) => {
                setBulkConfirm({ action: "terminate", employeeIds });
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
              departments={departmentItems}
              focusAreaLabel={focusAreaLabel}
              certificationLabel={certificationLabel}
              roleLabel={roleLabel}
              departmentLabel={departmentLabel}
              unlinkedCount={unlinkedCount}
              filterAccountLink={filterAccountLink}
              onFilterAccountLinkChange={setFilterAccountLink}
              filterEmailPresence={filterEmailPresence}
              onFilterEmailPresenceChange={setFilterEmailPresence}
              filterPhonePresence={filterPhonePresence}
              onFilterPhonePresenceChange={setFilterPhonePresence}
              onClearAll={clearFilters}
              hasActiveFilters={hasActiveFilters}
            />
          )}

          {!showManagement &&
            (rawList.length > 0 ? (
              <>
                <div
                  data-tour="staff-table"
                  data-testid="staff-table"
                  className="overflow-hidden rounded-[var(--dg-radius-md)] border border-[var(--color-border-light)] bg-[var(--color-surface)]"
                >
                  {isReordering ? (
                    <div className="dg-staff-directory-table">
                      <div className="dg-staff-directory-header bg-[var(--color-bg)]">
                        <div className="dg-staff-directory-head-cell flex pl-6">
                          <span className="inline-flex select-none items-center gap-1">
                            #{" "}
                            <SortIcon
                              active={sortConfig.key === "seniority"}
                              dir={sortConfig.dir}
                            />
                          </span>
                        </div>
                        <div className="dg-staff-directory-head-cell flex">
                          <span className="inline-flex items-center gap-1">
                            Name{" "}
                            <SortIcon
                              active={sortConfig.key === "name"}
                              dir={sortConfig.dir}
                            />
                          </span>
                        </div>
                        <div className="dg-staff-directory-head-cell hidden md:flex">
                          {focusAreaLabel}
                        </div>
                        <div className="dg-staff-directory-head-cell hidden md:flex">
                          {certificationLabel}
                        </div>
                        <div className="dg-staff-directory-head-cell hidden lg:flex">
                          Roles
                        </div>
                        <div className="dg-staff-directory-head-cell hidden lg:flex">
                          Account
                        </div>
                        <div className="dg-staff-directory-head-cell hidden lg:flex">
                          Access
                        </div>
                        <div className="dg-staff-directory-head-cell flex pr-6" />
                      </div>
                      <div className="dg-staff-directory-body">
                        {paginatedList.map((employee, index) => {
                          const isDragging =
                            draggedIdx !== null &&
                            baseList[draggedIdx]?.id === employee.id;
                          const dragOffsetY = isDragging
                            ? dragDeltaY
                            : rowDragOffsets.get(employee.id) ?? 0;

                          return (
                            <StaffReorderListRow
                              key={employee.id}
                              emp={employee}
                              globalIndex={index}
                              isExpanded={false}
                              isReordering
                              isDragging={isDragging}
                              dragPhase={isDragging ? dragPhase ?? undefined : undefined}
                              canManageEmployees={canManageEmployees}
                              canNavigateToDetailsPage={canManageEmployees}
                              isSelected={selectedIds.has(employee.id)}
                              focusAreas={focusAreas}
                              certifications={certifications}
                              roles={roles}
                              orgRole={orgRoleByEmployeeId.get(employee.id) ?? null}
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
                    <Table>
                      <TableHeader>
                        <UITableRow className="bg-[var(--color-bg)] hover:bg-transparent">
                          <TableHead className="w-[60px] pl-6 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
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
                                  className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-today-text)]"
                                />
                              )}
                              <span
                                className="inline-flex cursor-pointer select-none items-center gap-1"
                                onClick={() => handleSort("seniority")}
                              >
                                #{" "}
                                <SortIcon
                                  active={sortConfig.key === "seniority"}
                                  dir={sortConfig.dir}
                                />
                              </span>
                            </div>
                          </TableHead>
                          <TableHead
                            className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]"
                            onClick={() => handleSort("name")}
                          >
                            <span className="inline-flex items-center gap-1">
                              Name{" "}
                              <SortIcon
                                active={sortConfig.key === "name"}
                                dir={sortConfig.dir}
                              />
                            </span>
                          </TableHead>
                          <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)] md:table-cell">
                            {focusAreaLabel}
                          </TableHead>
                          <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)] md:table-cell">
                            {certificationLabel}
                          </TableHead>
                          <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)] lg:table-cell">
                            Roles
                          </TableHead>
                          <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)] lg:table-cell">
                            Account
                          </TableHead>
                          <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)] lg:table-cell">
                            Access
                          </TableHead>
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
                              canNavigateToDetailsPage={canManageEmployees}
                              isSelected={selectedIds.has(employee.id)}
                              focusAreas={focusAreas}
                              certifications={certifications}
                              roles={roles}
                              orgRole={orgRoleByEmployeeId.get(employee.id) ?? null}
                              onRoleChange={roleChangeHandlerFor(
                                directoryByEmployeeId.get(employee.id)?.userId,
                                directoryByEmployeeId.get(employee.id)?.membershipUpdatedAt,
                              )}
                              pendingInviteByEmployeeId={pendingInviteByEmployeeId}
                              onToggleSelect={toggleSelect}
                              onRowClick={(employeeId) =>
                                setExpandedEmpId(
                                  isExpanded ? null : employeeId,
                                )
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

          {canViewManagementUsers && showManagement &&
            (filteredDeptUsers.length > 0 ? (
              <div className="overflow-hidden rounded-[var(--dg-radius-md)] border border-[var(--color-border-light)] bg-[var(--color-surface)]">
                <Table>
                  <TableHeader>
                    <UITableRow className="bg-[var(--color-bg)] hover:bg-transparent">
                      <TableHead className="pl-6 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                        Name
                      </TableHead>
                      {!isMobile && !isTablet && (
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                          {managementDepartmentLabel}
                        </TableHead>
                      )}
                      {!isMobile && !isTablet && (
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                          Role
                        </TableHead>
                      )}
                      {!isMobile && !isTablet && (
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                          Status
                        </TableHead>
                      )}
                      <TableHead className="w-[40px] pr-6" />
                    </UITableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeptUsers.map((person) => {
                      const personDepts = person.managementDepartmentIds
                        .map((departmentId) =>
                          managementDepts.find(
                            (department) => department.id === departmentId,
                          ),
                        )
                        .filter(
                          (
                            department,
                          ): department is NonNullable<typeof department> =>
                            department != null,
                        );
                      const isPending =
                        person.invitationStatus !== null && !person.hasAppAccess;
                      const isExpanded = person.personId === expandedPersonId;
                      const statusLabel = isPending
                        ? person.invitationStatus === "expired"
                          ? "Expired"
                          : "Pending"
                        : person.employeeStatus === "terminated"
                          ? "Terminated"
                          : person.employeeStatus === "benched"
                            ? "Benched"
                            : "Active";
                      const statusColors = isPending
                        ? {
                            background: "var(--color-warning-bg)",
                            color: "var(--color-warning-text)",
                          }
                        : person.employeeStatus === "terminated"
                          ? {
                              background: "var(--color-danger-bg)",
                              color: "var(--color-danger-text)",
                            }
                          : person.employeeStatus === "benched"
                            ? {
                                background: "var(--color-warning-bg)",
                                color: "var(--color-warning-text)",
                              }
                            : {
                                background: "var(--color-success-bg)",
                                color: "var(--color-success-text)",
                              };
                      const displayName = person.firstName || person.lastName
                        ? `${person.firstName} ${person.lastName}`.trim()
                        : person.email;
                      const initials = getAvatarInitials(displayName);

                      return (
                        <UITableRow
                          key={person.personId}
                          className={`cursor-pointer transition-colors ${
                            isExpanded
                              ? "bg-[var(--color-control-active-bg)]"
                              : "hover:bg-[var(--color-bg)]"
                          }`}
                          onClick={() =>
                            setExpandedPersonId(
                              isExpanded ? null : person.personId,
                            )
                          }
                          style={{ opacity: isPending ? 0.7 : 1 }}
                        >
                          <TableCell className="py-4 pl-6">
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                                style={{
                                  background: isPending
                                    ? "var(--color-surface)"
                                    : "var(--color-control-active-bg)",
                                  color: isPending
                                    ? "var(--color-text-muted)"
                                    : "var(--color-control-active-text)",
                                }}
                              >
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[14px] font-medium text-[var(--color-text-primary)]">
                                    {displayName}
                                  </span>
                                  {person.source === "employee" && (
                                    <span
                                      className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                                      style={{
                                        background: "var(--color-today-bg)",
                                        color: "var(--color-today-text)",
                                      }}
                                    >
                                      On Schedule
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 truncate text-[12px] text-[var(--color-text-muted)]">
                                  {person.email}
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          {!isMobile && !isTablet && (
                            <TableCell className="py-4">
                              <span className="text-[13px] text-[var(--color-text-muted)]">
                                {personDepts.length > 0
                                  ? personDepts.map((department) => department.name).join(", ")
                                  : "\u2014"}
                              </span>
                            </TableCell>
                          )}

                          {!isMobile && !isTablet && (
                            <TableCell className="py-4">
                              <InlineRoleSelect
                                orgRole={person.orgRole}
                                onChange={roleChangeHandlerFor(
                                  person.userId,
                                  person.membershipUpdatedAt,
                                )}
                              />
                            </TableCell>
                          )}

                          {!isMobile && !isTablet && (
                            <TableCell className="py-4">
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={statusColors}
                              >
                                {statusLabel}
                              </span>
                            </TableCell>
                          )}

                          <TableCell className="w-[40px] py-4 pr-6 text-right">
                            <div
                              className="flex items-center justify-center"
                              style={{
                                color: isExpanded
                                  ? "var(--color-control-active-text)"
                                  : "var(--color-text-faint)",
                              }}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="9 6 15 12 9 18" />
                              </svg>
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
                icon={
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                }
                title={searchQuery ? "No results found" : "No management members yet"}
                description={
                  searchQuery
                    ? "Try adjusting your search."
                    : "People assigned to management will show here."
                }
              />
            ))}
        </div>
      </div>

      {showImport && orgId && (
        <BulkImportModal
          orgId={orgId}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            window.location.reload();
          }}
        />
      )}

      {inviteEmployee && orgId && (
        <InviteEmployeeModal
          employee={inviteEmployee}
          orgId={orgId}
          orgName={orgName || "your organization"}
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
          employee={selectedEmployee}
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
          onDelete={handleDelete}
          onBench={(employeeId, note) => onBench(employeeId, note)}
          onActivate={(employeeId) => onActivate(employeeId)}
          onClose={() => setExpandedEmpId(null)}
          onInvite={(employee) => setInviteEmployee(employee)}
          canManageManagementAccess={canManageManagementAccess}
          hasManagementAccess={
            selectedEmployeeDirectoryPerson?.isManagementUser ?? false
          }
          hasPendingManagementInvite={
            !!selectedEmployeeDirectoryPerson &&
            selectedEmployeeDirectoryPerson.managementDepartmentIds.length > 0 &&
            selectedEmployeeDirectoryPerson.invitationStatus !== null &&
            !selectedEmployeeDirectoryPerson.hasAppAccess
          }
          onManageManagementAccess={
            canManageManagementAccess
              ? (employee) => setManagementAccessEmployee(employee)
              : undefined
          }
          onRevoke={handleRevokeInvitation}
          onRevokeAccess={
            isSuperAdmin && orgId
              ? async (userId: string) => {
                  try {
                    await removeUserFromOrganization(userId, orgId);
                    toast.success("App access revoked");
                    void queryClient.invalidateQueries({
                      queryKey: queryKeys.org.directory(orgId),
                    });
                  } catch {
                    toast.error("Failed to revoke app access");
                  }
                }
              : undefined
          }
          orgRole={selectedEmployeeDirectoryPerson?.orgRole ?? null}
          adminPermissions={selectedEmployeeDirectoryPerson?.adminPermissions ?? null}
          onRoleChange={
            canManageManagementAccess &&
            selectedEmployeeDirectoryPerson?.userId &&
            selectedEmployeeDirectoryPerson?.membershipUpdatedAt
              ? async (newRole) => {
                  const person = selectedEmployeeDirectoryPerson;
                  if (!orgId || !person?.userId || !person?.membershipUpdatedAt)
                    return;
                  await updateOrganizationMembershipGuarded({
                    orgId,
                    userId: person.userId,
                    expectedUpdatedAt: person.membershipUpdatedAt,
                    orgRole: newRole,
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
          onPermissionsChange={
            canManageManagementAccess &&
            selectedEmployeeDirectoryPerson?.userId &&
            selectedEmployeeDirectoryPerson?.membershipUpdatedAt
              ? async (perms) => {
                  const person = selectedEmployeeDirectoryPerson;
                  if (!orgId || !person?.userId || !person?.membershipUpdatedAt)
                    return;
                  await updateOrganizationMembershipGuarded({
                    orgId,
                    userId: person.userId,
                    expectedUpdatedAt: person.membershipUpdatedAt,
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
        />
      )}

      {selectedPerson && canViewManagementUsers && (
        <ManagementStaffPanel
          person={selectedPerson}
          departments={managementDepts}
          departmentLabel={managementDepartmentLabel}
          canManageScheduleEmployees={canManageEmployees}
          canManageManagementAccess={canManageManagementAccess}
          onRoleChange={
            canManageManagementAccess &&
            selectedPerson.userId &&
            selectedPerson.membershipUpdatedAt
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
              : undefined
          }
          onPermissionsChange={
            canManageManagementAccess &&
            selectedPerson.userId &&
            selectedPerson.membershipUpdatedAt
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

            let updatedEmployee: Employee | null = null;

            if (
              selectedPerson.source === "employee" &&
              selectedPerson.employeeId
            ) {
              await updateEmployeeIdentity({
                employeeId: selectedPerson.employeeId,
                orgId,
                userId: selectedPerson.userId,
                firstName: data.firstName,
                lastName: data.lastName,
                phone: data.phone,
              });
              const pendingInvitation = pendingInviteByEmployeeId.get(
                selectedPerson.employeeId,
              );
              if (selectedPerson.userId) {
                await updateAppOnlyUser(selectedPerson.userId, orgId, {
                  departmentIds: data.managementDepartmentIds,
                });
              } else if (pendingInvitation) {
                await updatePendingInvitation(pendingInvitation.id, orgId, {
                  firstName: data.firstName,
                  lastName: data.lastName,
                  phone: data.phone,
                  departmentIds: data.managementDepartmentIds,
                });
              }

              const currentEmployee = [
                ...employees,
                ...benchedEmployees,
                ...terminatedEmployees,
              ].find((employee) => employee.id === selectedPerson.employeeId);
              if (currentEmployee) {
                updatedEmployee = {
                  ...currentEmployee,
                  firstName: data.firstName,
                  lastName: data.lastName,
                  phone: data.phone,
                };
              }
            } else if (selectedPerson.source === "pending_invite") {
              await updatePendingInvitation(
                selectedPerson.personId.replace("inv:", ""),
                orgId,
                {
                  firstName: data.firstName,
                  lastName: data.lastName,
                  phone: data.phone,
                  departmentIds: data.managementDepartmentIds,
                },
              );
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

            syncDirectoryPersonInCaches(
              applyManagementDirectoryUpdate(selectedPerson, data),
            );
            refreshInvitations();
            void queryClient.invalidateQueries({
              queryKey: queryKeys.org.directory(orgId),
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.employees.all(orgId),
            });
            toast.success("Changes saved");
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
          onBench={canManageEmployees ? onBench : undefined}
          onActivate={canManageEmployees ? onActivate : undefined}
          onTerminate={canManageEmployees ? onDelete : undefined}
        />
      )}

      {managementSchedulePerson && orgId && (
        <AddManagementUserToScheduleModal
          orgId={orgId}
          person={managementSchedulePerson}
          focusAreas={focusAreas}
          certifications={certifications}
          roles={roles}
          focusAreaLabel={focusAreaLabel}
          certificationLabel={certificationLabel}
          roleLabel={roleLabel}
          onClose={() => setManagementSchedulePerson(null)}
          onAdded={(employee) => {
            syncManagementScheduleEmployeeInCaches(
              managementSchedulePerson,
              employee,
            );
            setManagementSchedulePerson(null);
            void queryClient.invalidateQueries({
              queryKey: queryKeys.org.directory(orgId),
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.employees.all(orgId),
            });
          }}
        />
      )}

      {managementAccessEmployee && orgId && canManageManagementAccess && (
        <EmployeeManagementAccessModal
          employee={managementAccessEmployee}
          orgId={orgId}
          orgName={orgName || "your organization"}
          managementDepartments={managementDepts}
          directoryPerson={selectedEmployeeDirectoryPerson}
          pendingInvitation={pendingInviteByEmployeeId.get(managementAccessEmployee.id)}
          onClose={() => setManagementAccessEmployee(null)}
          onCompleted={(updatedEmployee) => {
            syncExistingEmployeeInCaches(updatedEmployee);
            refreshInvitations();
            void queryClient.invalidateQueries({
              queryKey: queryKeys.org.directory(orgId),
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.employees.all(orgId),
            });
          }}
        />
      )}

      {bulkConfirm ? (
        <ConfirmDialog
          title={
            bulkConfirm.action === "bench"
              ? "Bench Selected Staff?"
              : bulkConfirm.action === "activate"
                ? "Activate Selected Staff?"
                : "Terminate Selected Staff?"
          }
          message={
            bulkConfirm.action === "bench"
              ? `Bench ${bulkConfirm.employeeIds.length} selected staff member${bulkConfirm.employeeIds.length === 1 ? "" : "s"}? They will be hidden from active scheduling.`
              : bulkConfirm.action === "activate"
                ? `Activate ${bulkConfirm.employeeIds.length} selected staff member${bulkConfirm.employeeIds.length === 1 ? "" : "s"}? They will return to active scheduling.`
                : `Terminate ${bulkConfirm.employeeIds.length} selected staff member${bulkConfirm.employeeIds.length === 1 ? "" : "s"}? They will be archived from active staff lists.`
          }
          confirmLabel={
            bulkConfirm.action === "bench"
              ? "Bench"
              : bulkConfirm.action === "activate"
                ? "Activate"
                : "Terminate"
          }
          variant={bulkConfirm.action === "terminate" ? "danger" : "warning"}
          isLoading={isBulkActionRunning}
          onConfirm={handleConfirmBulkAction}
          onCancel={() => {
            if (!isBulkActionRunning) setBulkConfirm(null);
          }}
        />
      ) : null}

      {exportConfirm ? (
        <ConfirmDialog
          title="Export Staff Data?"
          message="Export the current staff directory data as a downloadable file?"
          confirmLabel="Export"
          variant="warning"
          onConfirm={() => {
            setExportConfirm(false);
            handleExport();
          }}
          onCancel={() => setExportConfirm(false)}
        />
      ) : null}
    </>
  );
}
