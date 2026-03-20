import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeJwt } from "jose";
import * as db from "@/lib/db";
import { supabase, validateConfig } from "@/lib/supabase";
import { handleApiError } from "@/lib/error-handling";
import type {
  Organization,
  FocusArea,
  ShiftCode,
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

export interface OrganizationData {
  org: Organization | null;
  focusAreas: FocusArea[];
  shiftCodes: ShiftCode[];
  allShiftCodesRef: React.RefObject<ShiftCode[]>;
  shiftCategories: ShiftCategory[];
  indicatorTypes: IndicatorType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  shiftCodeMap: Map<number, string>;
  loading: boolean;
  loadError: string | null;
  setOrg: (org: Organization) => void;
  setFocusAreas: (areas: FocusArea[]) => void;
  handleShiftCodesChange: (codes: ShiftCode[]) => void;
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

        // Extract orgId from JWT to parallelize org + subsidiary fetches.
        // getSession() reads from local storage (~5ms), decodeJwt is sync.
        let earlyOrgId: string | null = null;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const payload = decodeJwt(session.access_token) as Record<string, unknown>;
            earlyOrgId = (payload.org_id as string) || null;
          }
        } catch { /* proceed without hint */ }

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
        let w: FocusArea[], allCodes: ShiftCode[], cats: ShiftCategory[];
        let indicators: IndicatorType[], certs: NamedItem[], roles: NamedItem[];
        let covReqs: CoverageRequirement[];

        if (earlyOrgId) {
          // Fast path: fetch org details AND subsidiary data in parallel
          const [orgResult, ...parallelData] = await Promise.all([
            db.fetchUserOrganization(),
            db.fetchFocusAreas(earlyOrgId),
            db.fetchShiftCodes(earlyOrgId, true),
            db.fetchShiftCategories(earlyOrgId),
            db.fetchIndicatorTypes(earlyOrgId),
            db.fetchCertifications(earlyOrgId),
            db.fetchOrganizationRoles(earlyOrgId),
            db.fetchCoverageRequirements(earlyOrgId),
          ]);
          fetchedOrg = orgResult;

          if (fetchedOrg && fetchedOrg.id === earlyOrgId) {
            // JWT orgId matches — use parallel data
            [w, allCodes, cats, indicators, certs, roles, covReqs] = parallelData;
          } else if (fetchedOrg) {
            // Rare: JWT orgId stale — refetch with correct id
            [w, allCodes, cats, indicators, certs, roles, covReqs] = await Promise.all([
              db.fetchFocusAreas(fetchedOrg.id),
              db.fetchShiftCodes(fetchedOrg.id, true),
              db.fetchShiftCategories(fetchedOrg.id),
              db.fetchIndicatorTypes(fetchedOrg.id),
              db.fetchCertifications(fetchedOrg.id),
              db.fetchOrganizationRoles(fetchedOrg.id),
              db.fetchCoverageRequirements(fetchedOrg.id),
            ]);
          } else {
            setLoadError("No organization found. Check your database setup.");
            return;
          }
        } else {
          // Fallback: sequential (no JWT org_id available)
          fetchedOrg = await db.fetchUserOrganization();
          if (!fetchedOrg) {
            setLoadError("No organization found. Check your database setup.");
            return;
          }
          [w, allCodes, cats, indicators, certs, roles, covReqs] = await Promise.all([
            db.fetchFocusAreas(fetchedOrg.id),
            db.fetchShiftCodes(fetchedOrg.id, true),
            db.fetchShiftCategories(fetchedOrg.id),
            db.fetchIndicatorTypes(fetchedOrg.id),
            db.fetchCertifications(fetchedOrg.id),
            db.fetchOrganizationRoles(fetchedOrg.id),
            db.fetchCoverageRequirements(fetchedOrg.id),
          ]);
        }

        if (cancelled) return;

        const activeCodes = allCodes.filter((sc) => !sc.archivedAt);
        allShiftCodesRef.current = allCodes;

        // Update cache
        orgDataCache = {
          org: fetchedOrg,
          focusAreas: w,
          allShiftCodes: allCodes,
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
        setShiftCategoriesState(cats);
        setIndicatorTypesState(indicators);
        setCertificationsState(certs);
        setOrgRolesState(roles);
        setCoverageRequirementsState(covReqs);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        handleApiError(err);
        // Only set error if no cached data exists — a background re-fetch failure
        // shouldn't wipe out valid cached state or trigger hooks-order violations.
        if (!orgDataCache) {
          setLoadError(err instanceof Error ? err.message : "Failed to load data");
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

  const handleShiftCodesChange = useCallback((codes: ShiftCode[]) => {
    const archivedCodes = allShiftCodesRef.current.filter((sc) => sc.archivedAt);
    const allCodes = [...codes, ...archivedCodes];
    allShiftCodesRef.current = allCodes;
    setShiftCodesState(codes);
    if (orgDataCache) orgDataCache.allShiftCodes = allCodes;
  }, []);

  const handleCertificationsChange = useCallback(async (items: NamedItem[]) => {
    setCertificationsState(items);
    if (orgDataCache) orgDataCache.certifications = items;
    if (org) {
      try {
        const allCodes = await db.fetchShiftCodes(org.id, true);
        const activeCodes = allCodes.filter((sc) => !sc.archivedAt);
        allShiftCodesRef.current = allCodes;
        setShiftCodesState(activeCodes);
        if (orgDataCache) orgDataCache.allShiftCodes = allCodes;
      } catch (err) {
        console.error("re-fetch shift codes after cert change:", err);
      }
    }
  }, [org]);

  return {
    org,
    focusAreas,
    shiftCodes,
    allShiftCodesRef,
    shiftCategories,
    indicatorTypes,
    certifications,
    orgRoles,
    shiftCodeMap,
    loading,
    loadError,
    setOrg,
    setFocusAreas,
    handleShiftCodesChange,
    setShiftCategories,
    setIndicatorTypes,
    handleCertificationsChange,
    setOrgRoles,
    coverageRequirements,
    setCoverageRequirements,
  };
}
