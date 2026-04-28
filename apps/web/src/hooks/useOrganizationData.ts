import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { getImpersonationFromCookie } from "@/lib/impersonation";
import { handleApiError } from "@/lib/error-handling";
import { queryKeys } from "@/lib/query-keys";
import { buildAssignableShiftDisplayMap } from "@/lib/assignable-shifts";
import { fetchAccountOrgContext } from "@/features/account/client";
import { fetchOrganizationBootstrap } from "@/features/organization/client";
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

  const bootstrapQuery = useQuery({
    queryKey: [
      "organization-bootstrap",
      ctx.orgId ?? "auto",
      includeAssignmentDefinitionCompatibility,
    ],
    queryFn: () =>
      fetchOrganizationBootstrap({
        includeAssignments: includeAssignmentDefinitionCompatibility,
      }),
    enabled: ctx.resolved,
    staleTime: 5 * 60_000,
  });

  const bootstrap = bootstrapQuery.data;
  const org = bootstrap?.org ?? null;
  const effectiveOrgId = ctx.orgId ?? org?.id ?? null;

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
    ? (bootstrapQuery.error instanceof Error
        ? bootstrapQuery.error.message
        : "Failed to load organization")
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

  const setOrg = useCallback((nextOrg: Organization) => {
    const key = ctx.orgId
      ? queryKeys.org.detail(ctx.orgId)
      : queryKeys.org.bySubdomain();
    queryClient.setQueryData(key, nextOrg);
    if (!ctx.orgId) {
      queryClient.setQueryData(queryKeys.org.detail(nextOrg.id), nextOrg);
    }
  }, [queryClient, ctx.orgId]);

  const setFocusAreas = useCallback((areas: FocusArea[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.focusAreas(effectiveOrgId), areas);
    }
  }, [queryClient, effectiveOrgId]);

  const handleAssignmentDefinitionsChange = useCallback((nextAssignments: AssignmentDefinition[]) => {
    if (!effectiveOrgId) return;
    const archived = allAssignmentDefinitionsRef.current.filter((assignment) => assignment.archivedAt);
    queryClient.setQueryData(queryKeys.org.assignments(effectiveOrgId), [
      ...nextAssignments,
      ...archived,
    ]);
  }, [queryClient, effectiveOrgId]);

  const handleAbsenceTypesChange = useCallback((types: AbsenceType[]) => {
    if (!effectiveOrgId) return;
    const archived = allAbsenceTypesRef.current.filter((absenceType) => absenceType.archivedAt);
    queryClient.setQueryData(queryKeys.org.absenceTypes(effectiveOrgId), [
      ...types,
      ...archived,
    ]);
  }, [queryClient, effectiveOrgId]);

  const setShiftCategories = useCallback((categories: ShiftCategory[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(queryKeys.org.shiftCategories(effectiveOrgId), categories);
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
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org.assignments(effectiveOrgId) });
    } catch (error) {
      Sentry.captureException(error);
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

  const setCoverageRequirements = useCallback((requirements: CoverageRequirement[]) => {
    if (effectiveOrgId) {
      queryClient.setQueryData(
        queryKeys.org.coverageRequirements(effectiveOrgId),
        requirements,
      );
    }
  }, [queryClient, effectiveOrgId]);

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
