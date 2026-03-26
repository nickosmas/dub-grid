import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeJwt } from "jose";
import { toast } from "sonner";
import { fetchUserOrganization, fetchOrganizationById, fetchFocusAreas, fetchShiftCodes, fetchAbsenceTypes, fetchShiftCategories, fetchIndicatorTypes, fetchCertifications, fetchOrganizationRoles, fetchCoverageRequirements } from "@/lib/db";
import { supabase, validateConfig } from "@/lib/supabase";
import { getImpersonationFromCookie } from "@/lib/impersonation";
import { handleApiError } from "@/lib/error-handling";
import type {
  Organization,
  FocusArea,
  ShiftCode,
  AbsenceType,
  ShiftCategory,
  IndicatorType,
  NamedItem,
  CoverageRequirement,
} from "@/types";

// ── Module-level cache ──────────────────────────────────────────────────────
// Survives across route navigations (plain JS variable outside React).
// Populated on first successful fetch, updated whenever state changes.
// NEVER treated as source of truth — always re-fetches in background.

interface OrgDataCache {
  org: Organization;
  focusAreas: FocusArea[];
  allShiftCodes: ShiftCode[];
  allAbsenceTypes: AbsenceType[];
  shiftCategories: ShiftCategory[];
  indicatorTypes: IndicatorType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  coverageRequirements: CoverageRequirement[];
  lastFetchedAt: number;
}

let orgDataCache: OrgDataCache | null = null;

/** Clear the cache (call on logout to prevent cross-user data leaks). */
export function clearOrgDataCache(): void {
  orgDataCache = null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export interface SetupStatus {
  isComplete: boolean;
  missing: {
    focusAreas: boolean;
    shiftCodes: boolean;
    certifications: boolean;
    orgRoles: boolean;
  };
}

export interface OrganizationData {
  org: Organization | null;
  focusAreas: FocusArea[];
  shiftCodes: ShiftCode[];
  allShiftCodesRef: React.RefObject<ShiftCode[]>;
  absenceTypes: AbsenceType[];
  allAbsenceTypesRef: React.RefObject<AbsenceType[]>;
  shiftCategories: ShiftCategory[];
  indicatorTypes: IndicatorType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  shiftCodeMap: Map<number, string>;
  absenceTypeMap: Map<number, string>;
  loading: boolean;
  loadError: string | null;
  setupStatus: SetupStatus;
  setOrg: (org: Organization) => void;
  setFocusAreas: (areas: FocusArea[]) => void;
  handleShiftCodesChange: (codes: ShiftCode[]) => void;
  handleAbsenceTypesChange: (types: AbsenceType[]) => void;
  setShiftCategories: (cats: ShiftCategory[]) => void;
  setIndicatorTypes: (types: IndicatorType[]) => void;
  handleCertificationsChange: (items: NamedItem[]) => Promise<void>;
  setOrgRoles: (items: NamedItem[]) => void;
  coverageRequirements: CoverageRequirement[];
  setCoverageRequirements: (reqs: CoverageRequirement[]) => void;
}

export function useOrganizationData(): OrganizationData {
  // Initialize from cache for instant render on page transitions
  const [org, setOrgState] = useState<Organization | null>(orgDataCache?.org ?? null);
  const [focusAreas, setFocusAreasState] = useState<FocusArea[]>(orgDataCache?.focusAreas ?? []);
  const [shiftCodes, setShiftCodesState] = useState<ShiftCode[]>(
    () => orgDataCache?.allShiftCodes.filter((sc) => !sc.archivedAt) ?? [],
  );
  const allShiftCodesRef = useRef<ShiftCode[]>(orgDataCache?.allShiftCodes ?? []);
  const [absenceTypes, setAbsenceTypesState] = useState<AbsenceType[]>(
    () => orgDataCache?.allAbsenceTypes.filter((at) => !at.archivedAt) ?? [],
  );
  const allAbsenceTypesRef = useRef<AbsenceType[]>(orgDataCache?.allAbsenceTypes ?? []);
  const [shiftCategories, setShiftCategoriesState] = useState<ShiftCategory[]>(orgDataCache?.shiftCategories ?? []);
  const [indicatorTypes, setIndicatorTypesState] = useState<IndicatorType[]>(orgDataCache?.indicatorTypes ?? []);
  const [certifications, setCertificationsState] = useState<NamedItem[]>(orgDataCache?.certifications ?? []);
  const [orgRoles, setOrgRolesState] = useState<NamedItem[]>(orgDataCache?.orgRoles ?? []);
  const [coverageRequirements, setCoverageRequirementsState] = useState<CoverageRequirement[]>(orgDataCache?.coverageRequirements ?? []);
  const [loading, setLoading] = useState(!orgDataCache);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Wrapper setters that update both React state AND cache
  const setOrg = useCallback((o: Organization) => {
    setOrgState(o);
    if (orgDataCache) orgDataCache.org = o;
  }, []);

  const setFocusAreas = useCallback((areas: FocusArea[]) => {
    setFocusAreasState(areas);
    if (orgDataCache) orgDataCache.focusAreas = areas;
  }, []);

  const setShiftCategories = useCallback((cats: ShiftCategory[]) => {
    setShiftCategoriesState(cats);
    if (orgDataCache) orgDataCache.shiftCategories = cats;
  }, []);

  const setIndicatorTypes = useCallback((types: IndicatorType[]) => {
    setIndicatorTypesState(types);
    if (orgDataCache) orgDataCache.indicatorTypes = types;
  }, []);

  const setOrgRoles = useCallback((items: NamedItem[]) => {
    setOrgRolesState(items);
    if (orgDataCache) orgDataCache.orgRoles = items;
  }, []);

  const setCoverageRequirements = useCallback((reqs: CoverageRequirement[]) => {
    setCoverageRequirementsState(reqs);
    if (orgDataCache) orgDataCache.coverageRequirements = reqs;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        validateConfig();

        // ── Determine target orgId ──────────────────────────────────────
        // During impersonation the cookie's targetOrgId takes precedence
        // over the JWT's org_id (which belongs to the gridmaster, not
        // the user being impersonated).
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
              // Gridmaster users have no org — skip all org data fetching.
              // This prevents 9+ unnecessary API calls that would either fail
              // or return data for a random org the gridmaster doesn't need.
              if (payload.platform_role === "gridmaster") {
                setLoading(false);
                return;
              }
              earlyOrgId = (payload.org_id as string) || null;
            }
          } catch { /* proceed without hint */ }
        }

        // Skip re-fetch if cache is fresh (< 30s old) AND belongs to the
        // same org. Without the orgId check, an org switch could serve stale
        // data from the previous organization for up to 30 seconds.
        if (
          orgDataCache &&
          Date.now() - orgDataCache.lastFetchedAt < 30_000 &&
          (!earlyOrgId || orgDataCache.org.id === earlyOrgId)
        ) {
          setLoading(false);
          return;
        }

        let fetchedOrg: Organization | null;
        let w: FocusArea[], allCodes: ShiftCode[], absTypes: AbsenceType[], cats: ShiftCategory[];
        let indicators: IndicatorType[], certs: NamedItem[], roles: NamedItem[];
        let covReqs: CoverageRequirement[];

        if (earlyOrgId) {
          // Fast path: fetch org details AND subsidiary data in parallel.
          // During impersonation, fetch org by ID (not subdomain).
          const [orgResult, ...parallelData] = await Promise.all([
            isImpersonating ? fetchOrganizationById(earlyOrgId) : fetchUserOrganization(),
            fetchFocusAreas(earlyOrgId),
            fetchShiftCodes(earlyOrgId, true),
            fetchAbsenceTypes(earlyOrgId, true),
            fetchShiftCategories(earlyOrgId),
            fetchIndicatorTypes(earlyOrgId),
            fetchCertifications(earlyOrgId),
            fetchOrganizationRoles(earlyOrgId),
            fetchCoverageRequirements(earlyOrgId),
          ]);
          fetchedOrg = orgResult;

          if (fetchedOrg && fetchedOrg.id === earlyOrgId) {
            // orgId matches — use parallel data
            [w, allCodes, absTypes, cats, indicators, certs, roles, covReqs] = parallelData;
          } else if (fetchedOrg) {
            // Rare: orgId stale — refetch with correct id
            [w, allCodes, absTypes, cats, indicators, certs, roles, covReqs] = await Promise.all([
              fetchFocusAreas(fetchedOrg.id),
              fetchShiftCodes(fetchedOrg.id, true),
              fetchAbsenceTypes(fetchedOrg.id, true),
              fetchShiftCategories(fetchedOrg.id),
              fetchIndicatorTypes(fetchedOrg.id),
              fetchCertifications(fetchedOrg.id),
              fetchOrganizationRoles(fetchedOrg.id),
              fetchCoverageRequirements(fetchedOrg.id),
            ]);
          } else {
            setLoadError("No organization found. Check your database setup.");
            return;
          }
        } else {
          // Fallback: sequential (no org_id available)
          fetchedOrg = await fetchUserOrganization();
          if (!fetchedOrg) {
            setLoadError("No organization found. Check your database setup.");
            return;
          }
          [w, allCodes, absTypes, cats, indicators, certs, roles, covReqs] = await Promise.all([
            fetchFocusAreas(fetchedOrg.id),
            fetchShiftCodes(fetchedOrg.id, true),
            fetchAbsenceTypes(fetchedOrg.id, true),
            fetchShiftCategories(fetchedOrg.id),
            fetchIndicatorTypes(fetchedOrg.id),
            fetchCertifications(fetchedOrg.id),
            fetchOrganizationRoles(fetchedOrg.id),
            fetchCoverageRequirements(fetchedOrg.id),
          ]);
        }

        if (cancelled) return;

        const activeCodes = allCodes.filter((sc) => !sc.archivedAt);
        allShiftCodesRef.current = allCodes;
        const activeAbsTypes = absTypes.filter((at) => !at.archivedAt);
        allAbsenceTypesRef.current = absTypes;

        // Update cache
        orgDataCache = {
          org: fetchedOrg,
          focusAreas: w,
          allShiftCodes: allCodes,
          allAbsenceTypes: absTypes,
          shiftCategories: cats,
          indicatorTypes: indicators,
          certifications: certs,
          orgRoles: roles,
          coverageRequirements: covReqs,
          lastFetchedAt: Date.now(),
        };

        // Update React state
        setOrgState(fetchedOrg);
        setFocusAreasState(w);
        setShiftCodesState(activeCodes);
        setAbsenceTypesState(activeAbsTypes);
        setShiftCategoriesState(cats);
        setIndicatorTypesState(indicators);
        setCertificationsState(certs);
        setOrgRolesState(roles);
        setCoverageRequirementsState(covReqs);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        handleApiError(err);
        if (!orgDataCache) {
          // No cached data — surface the error so the UI can show an error state.
          setLoadError(err instanceof Error ? err.message : "Failed to load data");
        } else {
          // Cached data exists — show a non-blocking warning so the user knows
          // they may be viewing stale data.
          toast.warning("Data may be outdated — refresh to retry");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const shiftCodeMap = useMemo(
    () => new Map(allShiftCodesRef.current.map((sc) => [sc.id, sc.label])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shiftCodes],
  );

  const absenceTypeMap = useMemo(
    () => new Map(allAbsenceTypesRef.current.map((at) => [at.id, at.label])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [absenceTypes],
  );

  const handleAbsenceTypesChange = useCallback((types: AbsenceType[]) => {
    const archivedTypes = allAbsenceTypesRef.current.filter((at) => at.archivedAt);
    const allTypes = [...types, ...archivedTypes];
    allAbsenceTypesRef.current = allTypes;
    setAbsenceTypesState(types);
    if (orgDataCache) orgDataCache.allAbsenceTypes = allTypes;
  }, []);

  const handleShiftCodesChange = useCallback((codes: ShiftCode[]) => {
    const archivedCodes = allShiftCodesRef.current.filter((sc) => sc.archivedAt);
    const allCodes = [...codes, ...archivedCodes];
    allShiftCodesRef.current = allCodes;
    setShiftCodesState(codes);
    if (orgDataCache) orgDataCache.allShiftCodes = allCodes;
  }, []);

  const setupStatus = useMemo<SetupStatus>(() => ({
    isComplete:
      focusAreas.length > 0 &&
      shiftCodes.length > 0 &&
      certifications.length > 0 &&
      orgRoles.length > 0,
    missing: {
      focusAreas: focusAreas.length === 0,
      shiftCodes: shiftCodes.length === 0,
      certifications: certifications.length === 0,
      orgRoles: orgRoles.length === 0,
    },
  }), [focusAreas, shiftCodes, certifications, orgRoles]);

  const handleCertificationsChange = useCallback(async (items: NamedItem[]) => {
    setCertificationsState(items);
    if (orgDataCache) orgDataCache.certifications = items;
    if (org) {
      try {
        const allCodes = await fetchShiftCodes(org.id, true);
        const activeCodes = allCodes.filter((sc) => !sc.archivedAt);
        allShiftCodesRef.current = allCodes;
        setShiftCodesState(activeCodes);
        if (orgDataCache) orgDataCache.allShiftCodes = allCodes;
      } catch (err) {
        console.error("re-fetch shift codes after cert change:", err);
        toast.error("Failed to refresh shift codes");
      }
    }
  }, [org]);

  return {
    org,
    focusAreas,
    shiftCodes,
    allShiftCodesRef,
    absenceTypes,
    allAbsenceTypesRef,
    shiftCategories,
    indicatorTypes,
    certifications,
    orgRoles,
    shiftCodeMap,
    absenceTypeMap,
    loading,
    loadError,
    setupStatus,
    setOrg,
    setFocusAreas,
    handleShiftCodesChange,
    handleAbsenceTypesChange,
    setShiftCategories,
    setIndicatorTypes,
    handleCertificationsChange,
    setOrgRoles,
    coverageRequirements,
    setCoverageRequirements,
  };
}
