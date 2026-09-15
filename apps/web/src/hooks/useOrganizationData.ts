import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { getImpersonationFromCookie } from "@/lib/impersonation";
import { handleApiError } from "@/lib/error-handling";
import { formatClientErrorMessage, isSessionExpiredError } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { buildAssignableShiftDisplayMap } from "@/lib/assignable-shifts";
import { fetchAccountOrgContext } from "@/features/account/client";
import { useOrgRealtimeInvalidation } from "./useOrgRealtimeInvalidation";
import {
  getOrganizationBootstrapQueryPolicy,
  isRetryableOrganizationBootstrapError,
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
  /** Same as `assignmentLabelMap` but always spelled out in full, for surfaces outside the grid. */
  assignmentNameMap: Map<number, string>;
  absenceTypeMap: Map<number, string>;
  loading: boolean;
  loadError: string | null;
  bootstrapRetryable: boolean;
  entryGate: OrganizationBootstrap["entryGate"] | null;
  setupStatus: SetupStatus;
  /** Active employees in the org — see OrganizationBootstrap.activeEmployeeCount. */
  activeEmployeeCount: number;
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
        focusArea.departmentId != null && scheduledDepartmentIds.has(focusArea.departmentId),
    );
  const activeShifts = shiftCategories.filter((shift) => !shift.archivedAt);
  const shiftsPlaced =
    activeShifts.length > 0 &&
    activeShifts.every(
      (shift) => shift.focusAreaId != null && activeFocusAreaIds.has(shift.focusAreaId),
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
      const hasDepartmentPlacement = departmentIds.some((id) => scheduledDepartmentIds.has(id));
      const hasFocusAreaPlacement = focusAreaIds.some((id) => activeFocusAreaIds.has(id));
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

/**
 * Resolves which org this browser is acting as.
 *
 * This is a React Query query rather than a bare effect because
 * useOrganizationData has 19 call sites and several mount at once on a single
 * page (AppShell, AppHeader, OnboardingGate, the page itself). As a raw
 * useEffect + fetch it had no cache and no in-flight dedupe, so each of those
 * fired its own /api/account/org-context request on every mount and every
 * navigation. One query key means one request, reused.
 *
 * The request cannot be replaced by reading the JWT client-side, tempting as
 * that looks: /api/account/org-context goes through
 * requireAuthenticatedUserWithClaims, which rewrites org_id to the sandbox org
 * when a valid sandbox cookie is present. That cookie is httpOnly by design, so
 * the browser cannot derive the sandbox org on its own, and a JWT-only answer
 * would silently point a sandboxed user at their real organization.
 *
 * Impersonation is different — its cookie *is* client-readable, so that case
 * short-circuits with no request at all, exactly as before.
 */
function useOrgContext(): OrgContext {
  // Read once on mount, like the effect this replaced. Entering or leaving
  // impersonation clears the whole query cache and re-renders from scratch.
  const [impersonation] = useState(() =>
    typeof document === "undefined" ? null : getImpersonationFromCookie(document.cookie),
  );

  const query = useQuery({
    queryKey: queryKeys.account.orgContext(),
    queryFn: fetchAccountOrgContext,
    enabled: !impersonation,
    // Only a sandbox enter/exit, an impersonation change or an org switch moves
    // this, and each of those hard-reloads or clears the cache. Nothing is
    // gained by re-asking during a session.
    staleTime: Infinity,
    retry: 1,
  });

  return useMemo(() => {
    if (impersonation) {
      return {
        orgId: impersonation.targetOrgId,
        isImpersonating: true,
        isGridmaster: false,
        resolved: true,
      };
    }

    // A failed lookup still resolves: the original effect swallowed the error
    // and carried on without a server-side hint, and bootstrap resolves the org
    // server-side anyway. Staying unresolved would wedge every dependent query.
    if (query.isPending) return INITIAL_CTX;

    return {
      orgId: query.data?.isGridmaster ? null : (query.data?.orgId ?? null),
      isImpersonating: false,
      isGridmaster: query.data?.isGridmaster ?? false,
      resolved: true,
    };
  }, [impersonation, query.isPending, query.data]);
}

export function useOrganizationData(options?: UseOrganizationDataOptions): OrganizationData {
  const queryClient = useQueryClient();
  const ctx = useOrgContext();
  const includeAssignmentDefinitionCompatibility =
    options?.includeAssignmentDefinitionCompatibility ?? true;
  const enabled = options?.enabled ?? true;
  const bootstrapQueryKey = queryKeys.org.bootstrap();

  // Deliberately not gated on ctx.resolved. The request carries no org id —
  // the server resolves the org from the caller's claims and sandbox cookie —
  // so waiting for the org-context round trip only serialised two requests that
  // can run at once. ctx is still used below for the *identity* of the result
  // (effectiveOrgId), which is a different question from whether to ask.
  const bootstrapQuery = useQuery({
    queryKey: bootstrapQueryKey,
    ...getOrganizationBootstrapQueryPolicy(),
    enabled,
  });

  const bootstrap = bootstrapQuery.data;
  const org = bootstrap?.org ?? null;
  const effectiveOrgId = ctx.orgId ?? org?.id ?? null;
  useOrgRealtimeInvalidation({
    orgId: effectiveOrgId,
    queryClient,
  });

  const updateBootstrapCache = useCallback(
    (updater: (current: OrganizationBootstrap) => OrganizationBootstrap) => {
      if (!effectiveOrgId) return;
      queryClient.setQueriesData<OrganizationBootstrap>(
        { queryKey: queryKeys.org.bootstrap() },
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
      broadcastInvalidation(queryKeys.org.bootstrap());
      void queryClient.invalidateQueries({
        queryKey: queryKeys.org.bootstrap(),
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
    queryClient.setQueryData(
      queryKeys.org.shiftCategories(effectiveOrgId),
      bootstrap.shiftCategories,
    );
    queryClient.setQueryData(queryKeys.org.jobs(effectiveOrgId), bootstrap.jobs);
    queryClient.setQueryData(
      queryKeys.org.indicatorTypes(effectiveOrgId),
      bootstrap.indicatorTypes,
    );
    queryClient.setQueryData(
      queryKeys.org.certifications(effectiveOrgId),
      bootstrap.certifications,
    );
    queryClient.setQueryData(queryKeys.org.orgRoles(effectiveOrgId), bootstrap.orgRoles);
    queryClient.setQueryData(queryKeys.org.departments(effectiveOrgId), bootstrap.departments);
    queryClient.setQueryData(
      queryKeys.org.coverageRequirements(effectiveOrgId),
      bootstrap.coverageRequirements,
    );
    if (includeAssignmentDefinitionCompatibility) {
      queryClient.setQueryData(
        queryKeys.org.assignments(effectiveOrgId),
        bootstrap.allAssignmentDefinitions,
      );
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

  const allAssignmentDefinitionsRef = useLatestRef(allAssignmentDefinitions);
  const allAbsenceTypesRef = useLatestRef(allAbsenceTypes);

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

  const assignmentNameMap = useMemo(
    () =>
      includeAssignmentDefinitionCompatibility
        ? buildAssignableShiftDisplayMap({
            assignments: allAssignmentDefinitions,
            shiftCategories,
            jobs,
            focusAreas,
            shiftDisplayMode: "name",
          })
        : new Map<number, string>(),
    [
      allAssignmentDefinitions,
      focusAreas,
      includeAssignmentDefinitionCompatibility,
      jobs,
      shiftCategories,
    ],
  );

  const absenceTypeMap = useMemo(
    () =>
      new Map(
        allAbsenceTypes.map((absenceType) => [
          absenceType.id,
          org?.shiftDisplayMode === "name"
            ? absenceType.name || absenceType.label
            : absenceType.label,
        ]),
      ),
    [allAbsenceTypes, org?.shiftDisplayMode],
  );

  const loading = !ctx.resolved || bootstrapQuery.isLoading;
  const loadError = bootstrapQuery.isError
    ? formatClientErrorMessage(
        bootstrapQuery.error,
        "We couldn't load organization. Refresh and try again.",
      )
    : null;
  const bootstrapRetryable =
    bootstrapQuery.isError && isRetryableOrganizationBootstrapError(bootstrapQuery.error);

  const handledErrorsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (bootstrapQuery.error && !handledErrorsRef.current.has("bootstrap")) {
      handledErrorsRef.current.add("bootstrap");
      // The bootstrap is a page-level dependency, not a background action.
      // Its recovery UI is rendered by OnboardingGate; a toast here is both
      // redundant and, because no page can render without this data, can be
      // the only thing a client sees. Preserve the special session-expiry
      // handling, which signs out safely, and send every other failure to
      // monitoring without exposing server failure copy to the client.
      Sentry.captureException(bootstrapQuery.error);
      if (isSessionExpiredError(bootstrapQuery.error)) {
        void handleApiError(bootstrapQuery.error);
      }
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

  const setOrg = useCallback(
    (nextOrg: Organization) => {
      const key = ctx.orgId ? queryKeys.org.detail(ctx.orgId) : queryKeys.org.bySubdomain();
      queryClient.setQueryData(key, nextOrg);
      if (!ctx.orgId) {
        queryClient.setQueryData(queryKeys.org.detail(nextOrg.id), nextOrg);
      }
      updateBootstrapCache((current) => ({ ...current, org: nextOrg }));
      broadcastOrgInvalidations(queryKeys.org.detail(nextOrg.id));
    },
    [broadcastOrgInvalidations, queryClient, ctx.orgId, updateBootstrapCache],
  );

  const setFocusAreas = useCallback(
    (areas: FocusArea[]) => {
      if (effectiveOrgId) {
        queryClient.setQueryData(queryKeys.org.focusAreas(effectiveOrgId), areas);
        updateBootstrapCache((current) => ({ ...current, focusAreas: areas }));
        broadcastOrgInvalidations(queryKeys.org.focusAreas(effectiveOrgId));
      }
    },
    [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache],
  );

  const handleAssignmentDefinitionsChange = useCallback(
    (nextAssignments: AssignmentDefinition[]) => {
      if (!effectiveOrgId) return;
      const archived = allAssignmentDefinitionsRef.current.filter(
        (assignment) => assignment.archivedAt,
      );
      const nextAllAssignments = [...nextAssignments, ...archived];
      queryClient.setQueryData(queryKeys.org.assignments(effectiveOrgId), nextAllAssignments);
      updateBootstrapCache((current) => ({
        ...current,
        allAssignmentDefinitions: nextAllAssignments,
      }));
      broadcastOrgInvalidations(queryKeys.org.assignments(effectiveOrgId));
    },
    [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache],
  );

  const handleAbsenceTypesChange = useCallback(
    (types: AbsenceType[]) => {
      if (!effectiveOrgId) return;
      const archived = allAbsenceTypesRef.current.filter((absenceType) => absenceType.archivedAt);
      const nextAllAbsenceTypes = [...types, ...archived];
      queryClient.setQueryData(queryKeys.org.absenceTypes(effectiveOrgId), nextAllAbsenceTypes);
      updateBootstrapCache((current) => ({
        ...current,
        allAbsenceTypes: nextAllAbsenceTypes,
      }));
      broadcastOrgInvalidations(queryKeys.org.absenceTypes(effectiveOrgId));
    },
    [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache],
  );

  const setShiftCategories = useCallback(
    (categories: ShiftCategory[]) => {
      if (effectiveOrgId) {
        queryClient.setQueryData(queryKeys.org.shiftCategories(effectiveOrgId), categories);
        updateBootstrapCache((current) => ({ ...current, shiftCategories: categories }));
        broadcastOrgInvalidations(queryKeys.org.shiftCategories(effectiveOrgId));
      }
    },
    [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache],
  );

  const setJobs = useCallback(
    (items: JobDefinition[]) => {
      if (effectiveOrgId) {
        queryClient.setQueryData(queryKeys.org.jobs(effectiveOrgId), items);
        updateBootstrapCache((current) => ({ ...current, jobs: items }));
        broadcastOrgInvalidations(queryKeys.org.jobs(effectiveOrgId));
      }
    },
    [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache],
  );

  const setIndicatorTypes = useCallback(
    (types: IndicatorType[]) => {
      if (effectiveOrgId) {
        queryClient.setQueryData(queryKeys.org.indicatorTypes(effectiveOrgId), types);
        updateBootstrapCache((current) => ({ ...current, indicatorTypes: types }));
        broadcastOrgInvalidations(queryKeys.org.indicatorTypes(effectiveOrgId));
      }
    },
    [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache],
  );

  const handleCertificationsChange = useCallback(
    async (items: NamedItem[]) => {
      if (!effectiveOrgId) return;
      queryClient.setQueryData(queryKeys.org.certifications(effectiveOrgId), items);
      updateBootstrapCache((current) => ({ ...current, certifications: items }));
      broadcastOrgInvalidations(queryKeys.org.certifications(effectiveOrgId));
      try {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.org.assignments(effectiveOrgId),
        });
        broadcastInvalidation(queryKeys.org.assignments(effectiveOrgId));
      } catch (error) {
        Sentry.captureException(error);
        toast.error("We couldn't refresh the schedule options. Refresh and try again.");
      }
    },
    [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache],
  );

  const setOrgRoles = useCallback(
    (items: NamedItem[]) => {
      if (effectiveOrgId) {
        queryClient.setQueryData(queryKeys.org.orgRoles(effectiveOrgId), items);
        updateBootstrapCache((current) => ({ ...current, orgRoles: items }));
        broadcastOrgInvalidations(queryKeys.org.orgRoles(effectiveOrgId));
      }
    },
    [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache],
  );

  const setDepartments = useCallback(
    (items: Department[]) => {
      if (effectiveOrgId) {
        queryClient.setQueryData(queryKeys.org.departments(effectiveOrgId), items);
        updateBootstrapCache((current) => ({ ...current, departments: items }));
        broadcastOrgInvalidations(queryKeys.org.departments(effectiveOrgId));
      }
    },
    [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache],
  );

  const setCoverageRequirements = useCallback(
    (requirements: CoverageRequirement[]) => {
      if (effectiveOrgId) {
        queryClient.setQueryData(queryKeys.org.coverageRequirements(effectiveOrgId), requirements);
        updateBootstrapCache((current) => ({
          ...current,
          coverageRequirements: requirements,
        }));
        broadcastOrgInvalidations(queryKeys.org.coverageRequirements(effectiveOrgId));
      }
    },
    [broadcastOrgInvalidations, queryClient, effectiveOrgId, updateBootstrapCache],
  );

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
    assignmentNameMap,
    absenceTypeMap,
    loading,
    loadError,
    bootstrapRetryable,
    entryGate: bootstrap?.entryGate ?? null,
    setupStatus,
    activeEmployeeCount: bootstrap?.activeEmployeeCount ?? 0,
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
