import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { getImpersonationFromCookie } from "@/lib/impersonation";
import { handleApiError } from "@/lib/error-handling";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { buildAssignableShiftDisplayMap } from "@/lib/assignable-shifts";
import { fetchAccountOrgContext } from "@/features/account/client";
import { useOrgRealtimeInvalidation } from "./useOrgRealtimeInvalidation";
import {
  fetchOrganizationBootstrap,
  type OrganizationBootstrap,
} from "@/features/organization/client";
import type {
  Organization,
  FocusArea,
  AssignmentDefinition,
  AbsenceType,
  ShiftCategory,
  JobDefinition,
  IndicatorType,
  NamedItem,
  Department,
  CoverageRequirement,
} from "@/types";

export interface SetupStatus {
  isComplete: boolean;
  missing: {
    focusAreas: boolean;
    scheduleDefinitions: boolean;
    certifications: boolean;
    orgRoles: boolean;
  };
}

export interface OrganizationData {
  org: Organization | null;
  focusAreas: FocusArea[];
  assignments: AssignmentDefinition[];
  allAssignmentDefinitions: AssignmentDefinition[];
  allAssignmentDefinitionsRef: React.RefObject<AssignmentDefinition[]>;
  absenceTypes: AbsenceType[];
  allAbsenceTypes: AbsenceType[];
  allAbsenceTypesRef: React.RefObject<AbsenceType[]>;
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  indicatorTypes: IndicatorType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  departments: Department[];
  assignmentLabelMap: Map<number, string>;
  absenceTypeMap: Map<number, string>;
  loading: boolean;
  loadError: string | null;
  setupStatus: SetupStatus;
  setOrg: (org: Organization) => void;
  setFocusAreas: (areas: FocusArea[]) => void;
  handleAssignmentDefinitionsChange: (codes: AssignmentDefinition[]) => void;
  handleAbsenceTypesChange: (types: AbsenceType[]) => void;
  setShiftCategories: (cats: ShiftCategory[]) => void;
  setJobs: (jobs: JobDefinition[]) => void;
  setIndicatorTypes: (types: IndicatorType[]) => void;
  handleCertificationsChange: (items: NamedItem[]) => Promise<void>;
  setOrgRoles: (items: NamedItem[]) => void;
  setDepartments: (items: Department[]) => void;
  coverageRequirements: CoverageRequirement[];
  setCoverageRequirements: (reqs: CoverageRequirement[]) => void;
}

interface OrgContext {
  orgId: string | null;
  isImpersonating: boolean;
  isGridmaster: boolean;
  resolved: boolean;
}

interface UseOrganizationDataOptions {
  includeAssignmentDefinitionCompatibility?: boolean;
  enabled?: boolean;
}

export function computeOrganizationSetupStatus({
  focusAreas,
  shiftCategories,
  jobs,
  certifications,
  orgRoles,
  departments,
}: Pick<
  OrganizationData,
  "focusAreas" | "shiftCategories" | "jobs" | "certifications" | "orgRoles" | "departments"
>): SetupStatus {
  const scheduledDepartmentIds = new Set(
    departments
      .filter((department) => department.type === "scheduled" && !department.archivedAt)
      .map((department) => department.id),
  );
  const activeFocusAreas = focusAreas.filter((focusArea) => !focusArea.archivedAt);
  const activeFocusAreaIds = new Set(activeFocusAreas.map((focusArea) => focusArea.id));
  const focusAreasPlaced =
    scheduledDepartmentIds.size > 0 &&
    activeFocusAreas.length > 0 &&
    activeFocusAreas.every(
      (focusArea) =>
        focusArea.departmentId != null &&
        scheduledDepartmentIds.has(focusArea.departmentId),
    );
  const activeShifts = shiftCategories.filter((shift) => !shift.archivedAt);
  const shiftsPlaced =
    activeShifts.length > 0 &&
    activeShifts.every(
      (shift) =>
        shift.focusAreaId != null &&
        activeFocusAreaIds.has(shift.focusAreaId),
    );
  const visibleJobs = jobs.filter((job) => !job.archivedAt && job.showOnGrid !== false);
  const jobsPlaced =
    visibleJobs.length > 0 &&
    visibleJobs.every((job) => {
      if (job.assignmentMode === "shiftless") {
        return true;
      }
      const departmentIds = job.departmentIds ?? [];
      const focusAreaIds = job.focusAreaIds ?? [];
      const hasDepartmentPlacement = departmentIds.some((id) =>
        scheduledDepartmentIds.has(id),
      );
      const hasFocusAreaPlacement = focusAreaIds.some((id) =>
        activeFocusAreaIds.has(id),
      );
      const shiftIds = job.applicableShiftIds ?? [];
      const shiftsAreInScope =
        shiftIds.length > 0 &&
        shiftIds.every((id) => activeShifts.some((shift) => shift.id === id));

      return (hasDepartmentPlacement || hasFocusAreaPlacement) && shiftsAreInScope;
    });
  const scheduleDefinitionsReady = shiftsPlaced && jobsPlaced;

  return {
    isComplete:
      focusAreasPlaced &&
      scheduleDefinitionsReady &&
      certifications.length > 0 &&
      orgRoles.length > 0,
    missing: {
      focusAreas: !focusAreasPlaced,
      scheduleDefinitions: !scheduleDefinitionsReady,
      certifications: certifications.length === 0,
      orgRoles: orgRoles.length === 0,
    },
  };
}

const INITIAL_CTX: OrgContext = {
  orgId: null,
  isImpersonating: false,
  isGridmaster: false,
  resolved: false,
};

function useOrgContext(): OrgContext {
  const [ctx, setCtx] = useState<OrgContext>(INITIAL_CTX);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      let earlyOrgId: string | null = null;
      let isImpersonating = false;

      if (typeof document !== "undefined") {
        const impersonation = getImpersonationFromCookie(document.cookie);
        if (impersonation) {
          earlyOrgId = impersonation.targetOrgId;
          isImpersonating = true;
        }
      }

      if (!earlyOrgId) {
        try {
          const orgContext = await fetchAccountOrgContext();
          if (orgContext.isGridmaster) {
            if (!cancelled) {
              setCtx({
                orgId: null,
                isImpersonating: false,
                isGridmaster: true,
                resolved: true,
              });
            }
            return;
          }
          earlyOrgId = orgContext.orgId;
        } catch {
          // Proceed without a server-side hint.
        }
      }

      if (!cancelled) {
        setCtx({
          orgId: earlyOrgId,
          isImpersonating,
          isGridmaster: false,
          resolved: true,
        });
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  return ctx;
}

export function useOrganizationData(options?: UseOrganizationDataOptions): OrganizationData {
  const queryClient = useQueryClient();
  const ctx = useOrgContext();
  const includeAssignmentDefinitionCompatibility =
    options?.includeAssignmentDefinitionCompatibility ?? true;
  const enabled = options?.enabled ?? true;
  const bootstrapQueryKey = queryKeys.org.bootstrap(
    ctx.orgId,
    includeAssignmentDefinitionCompatibility,
  );

  const bootstrapQuery = useQuery({
    queryKey: bootstrapQueryKey,
    queryFn: () =>
      fetchOrganizationBootstrap({
        includeAssignments: includeAssignmentDefinitionCompatibility,
      }),
    enabled: enabled && ctx.resolved,
    staleTime: 5 * 60_000,
  });

  const bootstrap = bootstrapQuery.data;
  const org = bootstrap?.org ?? null;
  const effectiveOrgId = ctx.orgId ?? org?.id ?? null;
  useOrgRealtimeInvalidation({
    orgId: effectiveOrgId,
    disabled: org?.featureOverrides?.disable_realtime === true,
    queryClient,
  });

  const updateBootstrapCache = useCallback(
    (updater: (current: OrganizationBootstrap) => OrganizationBootstrap) => {
      if (!effectiveOrgId) return;
      queryClient.setQueriesData<OrganizationBootstrap>(
        { queryKey: queryKeys.org.bootstrapAll() },
        (current) => {
          if (!current?.org || current.org.id !== effectiveOrgId) {
            return current;
          }
          return updater(current);
        },
      );
    },
    [effectiveOrgId, queryClient],
  );

  const broadcastOrgInvalidations = useCallback(
    (...queryKeysToBroadcast: readonly (readonly unknown[])[]) => {
      // Cross-tab notification via BroadcastChannel. The channel does NOT
      // deliver to the sending tab, so we also invalidate locally below to
      // force same-tab consumers (e.g. settings panels rendering the just-
      // saved data in a sibling component) to refetch immediately.
      broadcastInvalidation(queryKeys.org.bootstrapAll());
      void queryClient.invalidateQueries({
        queryKey: queryKeys.org.bootstrapAll(),
      });
      for (const key of queryKeysToBroadcast) {
        broadcastInvalidation(key);
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [queryClient],
  );

  useEffect(() => {
    if (!bootstrap || !effectiveOrgId) return;

    if (bootstrap.org) {
      queryClient.setQueryData(queryKeys.org.detail(bootstrap.org.id), bootstrap.org);
    }
    queryClient.setQueryData(queryKeys.org.focusAreas(effectiveOrgId), bootstrap.focusAreas);
    queryClient.setQueryData(queryKeys.org.absenceTypes(effectiveOrgId), bootstrap.allAbsenceTypes);
    queryClient.setQueryData(queryKeys.org.shiftCategories(effectiveOrgId), bootstrap.shiftCategories);
    queryClient.setQueryData(queryKeys.org.jobs(effectiveOrgId), bootstrap.jobs);
    queryClient.setQueryData(queryKeys.org.indicatorTypes(effectiveOrgId), bootstrap.indicatorTypes);
    queryClient.setQueryData(queryKeys.org.certifications(effectiveOrgId), bootstrap.certifications);
    queryClient.setQueryData(queryKeys.org.orgRoles(effectiveOrgId), bootstrap.orgRoles);
    queryClient.setQueryData(queryKeys.org.departments(effectiveOrgId), bootstrap.departments);
    queryClient.setQueryData(queryKeys.org.coverageRequirements(effectiveOrgId), bootstrap.coverageRequirements);
    if (includeAssignmentDefinitionCompatibility) {
      queryClient.setQueryData(queryKeys.org.assignments(effectiveOrgId), bootstrap.allAssignmentDefinitions);
    }
  }, [bootstrap, effectiveOrgId, includeAssignmentDefinitionCompatibility, queryClient]);

  const focusAreas = useMemo(() => bootstrap?.focusAreas ?? [], [bootstrap?.focusAreas]);
  const allAssignmentDefinitions = useMemo(
    () => bootstrap?.allAssignmentDefinitions ?? [],
    [bootstrap?.allAssignmentDefinitions],
  );
  const allAbsenceTypes = useMemo(
    () => bootstrap?.allAbsenceTypes ?? [],
    [bootstrap?.allAbsenceTypes],
  );
  const shiftCategories = useMemo(
    () => bootstrap?.shiftCategories ?? [],
    [bootstrap?.shiftCategories],
  );
  const jobs = useMemo(() => bootstrap?.jobs ?? [], [bootstrap?.jobs]);
  const indicatorTypes = useMemo(
    () => bootstrap?.indicatorTypes ?? [],
    [bootstrap?.indicatorTypes],
  );
  const certifications = useMemo(
    () => bootstrap?.certifications ?? [],
    [bootstrap?.certifications],
  );
  const orgRoles = useMemo(() => bootstrap?.orgRoles ?? [], [bootstrap?.orgRoles]);
  const departments = useMemo(() => bootstrap?.departments ?? [], [bootstrap?.departments]);
  const coverageRequirements = useMemo(
    () => bootstrap?.coverageRequirements ?? [],
    [bootstrap?.coverageRequirements],
  );

  const assignments = useMemo(
    () => allAssignmentDefinitions.filter((assignment) => !assignment.archivedAt),
    [allAssignmentDefinitions],
  );
  const absenceTypes = useMemo(
    () => allAbsenceTypes.filter((absenceType) => !absenceType.archivedAt),
    [allAbsenceTypes],
  );

  const allAssignmentDefinitionsRef = useRef<AssignmentDefinition[]>(allAssignmentDefinitions);
  useEffect(() => {
    allAssignmentDefinitionsRef.current = allAssignmentDefinitions;
  }, [allAssignmentDefinitions]);

  const allAbsenceTypesRef = useRef<AbsenceType[]>(allAbsenceTypes);
  useEffect(() => {
    allAbsenceTypesRef.current = allAbsenceTypes;
  }, [allAbsenceTypes]);

  const assignmentLabelMap = useMemo(
    () =>
      includeAssignmentDefinitionCompatibility
        ? buildAssignableShiftDisplayMap({
            assignments: allAssignmentDefinitions,
            shiftCategories,
            jobs,
            focusAreas,
            shiftDisplayMode: org?.shiftDisplayMode ?? "code",
          })
        : new Map<number, string>(),
    [
      allAssignmentDefinitions,
      focusAreas,
      includeAssignmentDefinitionCompatibility,
      jobs,
      org?.shiftDisplayMode,
      shiftCategories,
    ],
  );

  const absenceTypeMap = useMemo(
    () =>
      new Map(
        allAbsenceTypes.map((absenceType) => [
          absenceType.id,
          org?.shiftDisplayMode === "name"
            ? (absenceType.name || absenceType.label)
            : absenceType.label,
        ]),
      ),
    [allAbsenceTypes, org?.shiftDisplayMode],
  );

  const loading = !ctx.resolved || bootstrapQuery.isLoading;
  const loadError = bootstrapQuery.isError
    ? formatClientErrorMessage(
        bootstrapQuery.error,
        "Failed to load organization",
      )
    : null;

  const handledErrorsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (bootstrapQuery.error && !handledErrorsRef.current.has("bootstrap")) {
      handledErrorsRef.current.add("bootstrap");
      handleApiError(bootstrapQuery.error);
    }
    if (!bootstrapQuery.error && handledErrorsRef.current.has("bootstrap")) {
      handledErrorsRef.current.delete("bootstrap");
    }
  }, [bootstrapQuery.error]);

  const setupStatus = useMemo(
    () =>
      computeOrganizationSetupStatus({
        focusAreas,
        shiftCategories,
        jobs,
        certifications,
        orgRoles,
        departments,
      }),
    [certifications, departments, focusAreas, jobs, orgRoles, shiftCategories],
  );

  const setOrg = useCallback((nextOrg: Organization) => {
    const key = ctx.orgId
      ? queryKeys.org.detail(ctx.orgId)
      : queryKeys.org.bySubdomain();
    queryClient.setQueryData(key, nextOrg);
    if (!ctx.orgId) {
      queryClient.setQueryData(queryKeys.org.detail(nextOrg.id), nextOrg);
    }
    updateBootstrapCache((current) => ({ ...current, org: nextOrg }));
    broadcastOrgInvalidations(queryKeys.org.detail(nextOrg.id));
  }, [broadcastOrgInvalidations, queryClient, ctx.orgId, updateBootstrapCache]);

  const setFocusAreas = useCallback((areas: FocusArea[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.focusAreas(effectiveOrgId), areas);
      updateBootstrapCache((current) => ({ ...current, focusAreas: areas }));
      broadcastOrgInvalidations(queryKeys.org.focusAreas(effectiveOrgId));
    }
  }, [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache]);

  const handleAssignmentDefinitionsChange = useCallback((nextAssignments: AssignmentDefinition[]) => {
    if (!effectiveOrgId) return;
    const archived = allAssignmentDefinitionsRef.current.filter((assignment) => assignment.archivedAt);
    const nextAllAssignments = [
      ...nextAssignments,
      ...archived,
    ];
    queryClient.setQueryData(queryKeys.org.assignments(effectiveOrgId), nextAllAssignments);
    updateBootstrapCache((current) => ({
      ...current,
      allAssignmentDefinitions: nextAllAssignments,
    }));
    broadcastOrgInvalidations(queryKeys.org.assignments(effectiveOrgId));
  }, [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache]);

  const handleAbsenceTypesChange = useCallback((types: AbsenceType[]) => {
    if (!effectiveOrgId) return;
    const archived = allAbsenceTypesRef.current.filter((absenceType) => absenceType.archivedAt);
    const nextAllAbsenceTypes = [
      ...types,
      ...archived,
    ];
    queryClient.setQueryData(queryKeys.org.absenceTypes(effectiveOrgId), nextAllAbsenceTypes);
    updateBootstrapCache((current) => ({
      ...current,
      allAbsenceTypes: nextAllAbsenceTypes,
    }));
    broadcastOrgInvalidations(queryKeys.org.absenceTypes(effectiveOrgId));
  }, [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache]);

  const setShiftCategories = useCallback((categories: ShiftCategory[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.shiftCategories(effectiveOrgId), categories);
      updateBootstrapCache((current) => ({ ...current, shiftCategories: categories }));
      broadcastOrgInvalidations(queryKeys.org.shiftCategories(effectiveOrgId));
    }
  }, [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache]);

  const setJobs = useCallback((items: JobDefinition[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.jobs(effectiveOrgId), items);
      updateBootstrapCache((current) => ({ ...current, jobs: items }));
      broadcastOrgInvalidations(queryKeys.org.jobs(effectiveOrgId));
    }
  }, [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache]);

  const setIndicatorTypes = useCallback((types: IndicatorType[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.indicatorTypes(effectiveOrgId), types);
      updateBootstrapCache((current) => ({ ...current, indicatorTypes: types }));
      broadcastOrgInvalidations(queryKeys.org.indicatorTypes(effectiveOrgId));
    }
  }, [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache]);

  const handleCertificationsChange = useCallback(async (items: NamedItem[]) => {
    if (!effectiveOrgId) return;
    queryClient.setQueryData(queryKeys.org.certifications(effectiveOrgId), items);
    updateBootstrapCache((current) => ({ ...current, certifications: items }));
    broadcastOrgInvalidations(queryKeys.org.certifications(effectiveOrgId));
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org.assignments(effectiveOrgId) });
      broadcastInvalidation(queryKeys.org.assignments(effectiveOrgId));
    } catch (error) {
      Sentry.captureException(error);
      toast.error("Failed to refresh schedule assignments");
    }
  }, [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache]);

  const setOrgRoles = useCallback((items: NamedItem[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.orgRoles(effectiveOrgId), items);
      updateBootstrapCache((current) => ({ ...current, orgRoles: items }));
      broadcastOrgInvalidations(queryKeys.org.orgRoles(effectiveOrgId));
    }
  }, [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache]);

  const setDepartments = useCallback((items: Department[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.departments(effectiveOrgId), items);
      updateBootstrapCache((current) => ({ ...current, departments: items }));
      broadcastOrgInvalidations(queryKeys.org.departments(effectiveOrgId));
    }
  }, [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache]);

  const setCoverageRequirements = useCallback((requirements: CoverageRequirement[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(
        queryKeys.org.coverageRequirements(effectiveOrgId),
        requirements,
      );
      updateBootstrapCache((current) => ({
        ...current,
        coverageRequirements: requirements,
      }));
      broadcastOrgInvalidations(queryKeys.org.coverageRequirements(effectiveOrgId));
    }
  }, [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache]);

  return {
    org,
    focusAreas,
    assignments,
    allAssignmentDefinitions,
    allAssignmentDefinitionsRef,
    absenceTypes,
    allAbsenceTypes,
    allAbsenceTypesRef,
    shiftCategories,
    jobs,
    indicatorTypes,
    certifications,
    orgRoles,
    departments,
    assignmentLabelMap,
    absenceTypeMap,
    loading,
    loadError,
    setupStatus,
    setOrg,
    setFocusAreas,
    handleAssignmentDefinitionsChange,
    handleAbsenceTypesChange,
    setShiftCategories,
    setJobs,
    setIndicatorTypes,
    handleCertificationsChange,
    setOrgRoles,
    setDepartments,
    coverageRequirements,
    setCoverageRequirements,
  };
}
