import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as db from "@/lib/db";
import { validateConfig } from "@/lib/supabase";
import { handleApiError } from "@/lib/error-handling";
import type {
  Organization,
  FocusArea,
  ShiftCode,
  ShiftCategory,
  IndicatorType,
  NamedItem,
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        validateConfig();

        const fetchedOrg = await db.fetchUserOrganization();
        if (!fetchedOrg) {
          setLoadError("No organization found. Check your database setup.");
          return;
        }

        const [w, allCodes, cats, indicators, certs, roles] = await Promise.all([
          db.fetchFocusAreas(fetchedOrg.id),
          db.fetchShiftCodes(fetchedOrg.id, true),
          db.fetchShiftCategories(fetchedOrg.id),
          db.fetchIndicatorTypes(fetchedOrg.id),
          db.fetchCertifications(fetchedOrg.id),
          db.fetchOrganizationRoles(fetchedOrg.id),
        ]);

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
        };

        // Update React state
        setOrgState(fetchedOrg);
        setFocusAreasState(w);
        setShiftCodesState(activeCodes);
        setShiftCategoriesState(cats);
        setIndicatorTypesState(indicators);
        setCertificationsState(certs);
        setOrgRolesState(roles);
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
  };
}
