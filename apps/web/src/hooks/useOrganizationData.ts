import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { decodeJwt } from "jose";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { fetchUserOrganization, fetchOrganizationById, fetchFocusAreas, fetchAssignmentDefinitions as fetchAssignmentDefinitions, fetchAbsenceTypes, fetchShiftCategories, fetchJobDefinitions, fetchIndicatorTypes, fetchCertifications, fetchOrganizationRoles, fetchDepartments, fetchCoverageRequirements, autoMigrateOrphanedFocusAreas } from "@/lib/db";
import { supabase, validateConfig } from "@/lib/supabase";
import { getImpersonationFromCookie } from "@/lib/impersonation";
import { handleApiError } from "@/lib/error-handling";
import { queryKeys } from "@/lib/query-keys";
import { buildAssignableShiftDisplayMap } from "@/lib/assignable-shifts";
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

// ── Types ────────────────────────��───────────────────────────────────────────

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

// ── Org context resolution ───────────────��───────────────────────────────────

interface OrgContext {
  orgId: string | null;
  isImpersonating: boolean;
  isGridmaster: boolean;
  resolved: boolean;
}

interface UseOrganizationDataOptions {
  includeAssignmentDefinitionCompatibility?: boolean;
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
      try { validateConfig(); } catch { /* proceed */ }

      let earlyOrgId: string | null = null;
      let isImpersonating = false;

      if (typeof document !== "undefined") {
        const imp = getImpersonationFromCookie(document.cookie);
        if (imp) {
          earlyOrgId = imp.targetOrgId;
          isImpersonating = true;
        }
      }

      if (!earlyOrgId) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const payload = decodeJwt(session.access_token) as Record<string, unknown>;
            if (payload.platform_role === "gridmaster") {
              if (!cancelled) setCtx({ orgId: null, isImpersonating: false, isGridmaster: true, resolved: true });
              return;
            }
            earlyOrgId = (payload.org_id as string) || null;
          }
        } catch { /* proceed without hint */ }
      }

      if (!cancelled) {
        setCtx({ orgId: earlyOrgId, isImpersonating, isGridmaster: false, resolved: true });
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, []);

  return ctx;
}

// ── Hook ��──────────────────��─────────────────────────────────��───────────────

export function useOrganizationData(options?: UseOrganizationDataOptions): OrganizationData {
  const queryClient = useQueryClient();
  const ctx = useOrgContext();
  const includeAssignmentDefinitionCompatibility =
    options?.includeAssignmentDefinitionCompatibility ?? true;

  // ── Step 1: Fetch organization ────────────���────────────────────────��────
  const orgQuery = useQuery({
    queryKey: ctx.orgId
      ? queryKeys.org.detail(ctx.orgId)
      : queryKeys.org.bySubdomain(),
    queryFn: async () => {
      if (ctx.isImpersonating && ctx.orgId) {
        return fetchOrganizationById(ctx.orgId);
      }
      const org = await fetchUserOrganization();
      if (!org) throw new Error("No organization found. Check your database setup.");
      return org;
    },
    enabled: ctx.resolved && !ctx.isGridmaster,
    staleTime: 5 * 60_000, // 5 min — org data rarely changes mid-session
  });

  const org = orgQuery.data ?? null;
  const effectiveOrgId = ctx.orgId ?? org?.id ?? null;

  // When org loads via subdomain and we didn't have an orgId, also seed the
  // detail key so subsequent lookups by id hit the cache.
  useEffect(() => {
    if (org && !ctx.orgId) {
      queryClient.setQueryData(queryKeys.org.detail(org.id), org);
    }
  }, [org, ctx.orgId, queryClient]);

  // ── Step 2: Fetch config entities (enabled once orgId is known) ─────────
  // Config queries use a longer staleTime (5 min) since these entities
  // rarely change mid-session and setter functions update the cache directly.
  const CONFIG_STALE_TIME = 5 * 60_000;

  const focusAreasQuery = useQuery({
    queryKey: queryKeys.org.focusAreas(effectiveOrgId!),
    queryFn: () => fetchFocusAreas(effectiveOrgId!),
    enabled: !!effectiveOrgId,
    staleTime: CONFIG_STALE_TIME,
  });

  const allAssignmentDefinitionsQuery = useQuery({
    queryKey: queryKeys.org.assignments(effectiveOrgId!),
    queryFn: () => fetchAssignmentDefinitions(effectiveOrgId!, true),
    enabled: !!effectiveOrgId && includeAssignmentDefinitionCompatibility,
    staleTime: CONFIG_STALE_TIME,
  });

  const allAbsenceTypesQuery = useQuery({
    queryKey: queryKeys.org.absenceTypes(effectiveOrgId!),
    queryFn: () => fetchAbsenceTypes(effectiveOrgId!, true),
    enabled: !!effectiveOrgId,
    staleTime: CONFIG_STALE_TIME,
  });

  const shiftCategoriesQuery = useQuery({
    queryKey: queryKeys.org.shiftCategories(effectiveOrgId!),
    queryFn: () => fetchShiftCategories(effectiveOrgId!),
    enabled: !!effectiveOrgId,
    staleTime: CONFIG_STALE_TIME,
  });

  const jobsQuery = useQuery({
    queryKey: queryKeys.org.jobs(effectiveOrgId!),
    queryFn: () => fetchJobDefinitions(effectiveOrgId!),
    enabled: !!effectiveOrgId,
    staleTime: CONFIG_STALE_TIME,
  });

  const indicatorTypesQuery = useQuery({
    queryKey: queryKeys.org.indicatorTypes(effectiveOrgId!),
    queryFn: () => fetchIndicatorTypes(effectiveOrgId!),
    enabled: !!effectiveOrgId,
    staleTime: CONFIG_STALE_TIME,
  });

  const certificationsQuery = useQuery({
    queryKey: queryKeys.org.certifications(effectiveOrgId!),
    queryFn: () => fetchCertifications(effectiveOrgId!),
    enabled: !!effectiveOrgId,
    staleTime: CONFIG_STALE_TIME,
  });

  const orgRolesQuery = useQuery({
    queryKey: queryKeys.org.orgRoles(effectiveOrgId!),
    queryFn: () => fetchOrganizationRoles(effectiveOrgId!),
    enabled: !!effectiveOrgId,
    staleTime: CONFIG_STALE_TIME,
  });

  const departmentsQuery = useQuery({
    queryKey: queryKeys.org.departments(effectiveOrgId!),
    queryFn: () => fetchDepartments(effectiveOrgId!),
    enabled: !!effectiveOrgId,
    staleTime: CONFIG_STALE_TIME,
  });

  const coverageReqsQuery = useQuery({
    queryKey: queryKeys.org.coverageRequirements(effectiveOrgId!),
    queryFn: () => fetchCoverageRequirements(effectiveOrgId!),
    enabled: !!effectiveOrgId,
    staleTime: CONFIG_STALE_TIME,
  });

  // ── Derived values (memoized to stabilize references for downstream deps) ─
  const focusAreas = useMemo(() => focusAreasQuery.data ?? [], [focusAreasQuery.data]);
  const allAssignmentDefinitions = useMemo(
    () => allAssignmentDefinitionsQuery.data ?? [],
    [allAssignmentDefinitionsQuery.data],
  );
  const allAbsenceTypes = useMemo(() => allAbsenceTypesQuery.data ?? [], [allAbsenceTypesQuery.data]);
  const shiftCategories = useMemo(() => shiftCategoriesQuery.data ?? [], [shiftCategoriesQuery.data]);
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const indicatorTypes = useMemo(() => indicatorTypesQuery.data ?? [], [indicatorTypesQuery.data]);
  const certifications = useMemo(() => certificationsQuery.data ?? [], [certificationsQuery.data]);
  const orgRoles = useMemo(() => orgRolesQuery.data ?? [], [orgRolesQuery.data]);
  const departments = useMemo(() => departmentsQuery.data ?? [], [departmentsQuery.data]);
  const coverageRequirements = useMemo(() => coverageReqsQuery.data ?? [], [coverageReqsQuery.data]);

  const assignments = useMemo(
    () => allAssignmentDefinitions.filter((preset) => !preset.archivedAt),
    [allAssignmentDefinitions],
  );
  const absenceTypes = useMemo(
    () => allAbsenceTypes.filter((at) => !at.archivedAt),
    [allAbsenceTypes],
  );

  // Auto-migrate orphaned focus areas → create default scheduled department
  const migrationRanRef = useRef(false);
  const focusAreasData = focusAreasQuery.data;
  const departmentsData = departmentsQuery.data;
  const refetchFocusAreas = focusAreasQuery.refetch;
  const refetchDepartments = departmentsQuery.refetch;
  useEffect(() => {
    if (!effectiveOrgId || migrationRanRef.current) return;
    if (!focusAreasData || !departmentsData) return;
    const orphaned = focusAreasData.filter(fa => fa.departmentId === null);
    const hasScheduledDepts = departmentsData.some(d => d.type === 'scheduled');
    if (orphaned.length === 0 || hasScheduledDepts) return;
    migrationRanRef.current = true;
    autoMigrateOrphanedFocusAreas(effectiveOrgId).then((migrated) => {
      if (migrated) {
        void refetchFocusAreas();
        void refetchDepartments();
      }
    }).catch(() => { /* silent — non-critical */ });
  }, [effectiveOrgId, focusAreasData, departmentsData, refetchFocusAreas, refetchDepartments]);

  const allAssignmentDefinitionsRef = useRef<AssignmentDefinition[]>(allAssignmentDefinitions);
  useEffect(() => {
    allAssignmentDefinitionsRef.current = allAssignmentDefinitions;
  }, [allAssignmentDefinitions]);

  const allAbsenceTypesRef = useRef<AbsenceType[]>(allAbsenceTypes);
  useEffect(() => { allAbsenceTypesRef.current = allAbsenceTypes; }, [allAbsenceTypes]);

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
    () => new Map(allAbsenceTypes.map((at) => [
      at.id,
      org?.shiftDisplayMode === 'name' ? (at.name || at.label) : at.label,
    ])),
    [allAbsenceTypes, org?.shiftDisplayMode],
  );

  // ── Loading & error states ──────────��───────────────────────────────────
  const configQueriesLoading =
    focusAreasQuery.isLoading ||
    allAssignmentDefinitionsQuery.isLoading ||
    allAbsenceTypesQuery.isLoading ||
    shiftCategoriesQuery.isLoading ||
    jobsQuery.isLoading ||
    indicatorTypesQuery.isLoading ||
    certificationsQuery.isLoading ||
    orgRolesQuery.isLoading ||
    coverageReqsQuery.isLoading ||
    departmentsQuery.isLoading;

  const loading = ctx.isGridmaster
    ? !ctx.resolved
    : !ctx.resolved || orgQuery.isLoading || configQueriesLoading;

  // Only the org query error is fatal — config query failures degrade gracefully
  const loadError = orgQuery.isError
    ? (orgQuery.error instanceof Error ? orgQuery.error.message : "Failed to load organization")
    : null;

  // Handle API errors per-query — each fires its own toast, clears on recovery
  const handledErrorsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const queries = [
      { key: "org", error: orgQuery.error },
      { key: "focusAreas", error: focusAreasQuery.error },
      { key: "assignments", error: allAssignmentDefinitionsQuery.error },
      { key: "absenceTypes", error: allAbsenceTypesQuery.error },
      { key: "shiftCategories", error: shiftCategoriesQuery.error },
      { key: "jobs", error: jobsQuery.error },
      { key: "indicatorTypes", error: indicatorTypesQuery.error },
      { key: "certifications", error: certificationsQuery.error },
      { key: "orgRoles", error: orgRolesQuery.error },
      { key: "coverageReqs", error: coverageReqsQuery.error },
    ];
    for (const { key, error } of queries) {
      if (error && !handledErrorsRef.current.has(key)) {
        handledErrorsRef.current.add(key);
        handleApiError(error);
      }
      if (!error && handledErrorsRef.current.has(key)) {
        handledErrorsRef.current.delete(key);
      }
    }
  }, [
    orgQuery.error, focusAreasQuery.error, allAssignmentDefinitionsQuery.error,
    allAbsenceTypesQuery.error, shiftCategoriesQuery.error,
    jobsQuery.error,
    indicatorTypesQuery.error, certificationsQuery.error,
    orgRolesQuery.error, coverageReqsQuery.error,
  ]);

  // ── Setup status ────────────────────────────────────────────────────────
  const setupStatus = useMemo<SetupStatus>(() => ({
    isComplete:
      focusAreas.length > 0 &&
      shiftCategories.length > 0 &&
      jobs.length > 0 &&
      certifications.length > 0 &&
      orgRoles.length > 0,
    missing: {
      focusAreas: focusAreas.length === 0,
      scheduleDefinitions: shiftCategories.length === 0 || jobs.length === 0,
      certifications: certifications.length === 0,
      orgRoles: orgRoles.length === 0,
    },
  }), [certifications, focusAreas, jobs.length, orgRoles, shiftCategories.length]);

  // ── Setter functions (update React Query cache) ─────────────────────────
  const setOrg = useCallback((o: Organization) => {
    const key = ctx.orgId
      ? queryKeys.org.detail(ctx.orgId)
      : queryKeys.org.bySubdomain();
    queryClient.setQueryData(key, o);
    if (!ctx.orgId) {
      queryClient.setQueryData(queryKeys.org.detail(o.id), o);
    }
  }, [queryClient, ctx.orgId]);

  const setFocusAreas = useCallback((areas: FocusArea[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.focusAreas(effectiveOrgId), areas);
    }
  }, [queryClient, effectiveOrgId]);

  const handleAssignmentDefinitionsChange = useCallback((presets: AssignmentDefinition[]) => {
    if (!effectiveOrgId) return;
    const archived = allAssignmentDefinitionsRef.current.filter((preset) => preset.archivedAt);
    queryClient.setQueryData(queryKeys.org.assignments(effectiveOrgId), [
      ...presets,
      ...archived,
    ]);
  }, [queryClient, effectiveOrgId]);

  const handleAbsenceTypesChange = useCallback((types: AbsenceType[]) => {
    if (!effectiveOrgId) return;
    const archived = allAbsenceTypesRef.current.filter((at) => at.archivedAt);
    queryClient.setQueryData(queryKeys.org.absenceTypes(effectiveOrgId), [...types, ...archived]);
  }, [queryClient, effectiveOrgId]);

  const setShiftCategories = useCallback((cats: ShiftCategory[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.shiftCategories(effectiveOrgId), cats);
    }
  }, [queryClient, effectiveOrgId]);

  const setJobs = useCallback((items: JobDefinition[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.jobs(effectiveOrgId), items);
    }
  }, [queryClient, effectiveOrgId]);

  const setIndicatorTypes = useCallback((types: IndicatorType[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.indicatorTypes(effectiveOrgId), types);
    }
  }, [queryClient, effectiveOrgId]);

  const handleCertificationsChange = useCallback(async (items: NamedItem[]) => {
    if (!effectiveOrgId) return;
    queryClient.setQueryData(queryKeys.org.certifications(effectiveOrgId), items);
    // Invalidate schedule options since they reference certifications.
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org.assignments(effectiveOrgId) });
    } catch (err) {
      Sentry.captureException(err);
      toast.error("Failed to refresh schedule assignments");
    }
  }, [queryClient, effectiveOrgId]);

  const setOrgRoles = useCallback((items: NamedItem[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.orgRoles(effectiveOrgId), items);
    }
  }, [queryClient, effectiveOrgId]);

  const setDepartments = useCallback((items: Department[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.departments(effectiveOrgId), items);
    }
  }, [queryClient, effectiveOrgId]);

  const setCoverageRequirements = useCallback((reqs: CoverageRequirement[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.coverageRequirements(effectiveOrgId), reqs);
    }
  }, [queryClient, effectiveOrgId]);

  return {
    org,
    focusAreas,
    assignments: assignments,
    allAssignmentDefinitions: allAssignmentDefinitions,
    allAssignmentDefinitionsRef: allAssignmentDefinitionsRef,
    absenceTypes,
    allAbsenceTypes,
    allAbsenceTypesRef,
    shiftCategories,
    jobs,
    indicatorTypes,
    certifications,
    orgRoles,
    departments,
    assignmentLabelMap: assignmentLabelMap,
    absenceTypeMap,
    loading,
    loadError,
    setupStatus,
    setOrg,
    setFocusAreas,
    handleAssignmentDefinitionsChange: handleAssignmentDefinitionsChange,
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
