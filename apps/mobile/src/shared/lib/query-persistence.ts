import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Query } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import { queryClient } from "./query-client";

/**
 * A cold open showed nothing until the session refresh, the bootstrap and then
 * Home's own queries had all answered. The bootstrap and Home's queries are
 * kept on the device so the splash can lift on the last session's data while
 * the network refreshes it. Only those, only for a day, and only for the app
 * version that wrote them: each key already names its user and organization,
 * and signing out or switching organization removes the stored copy.
 */
const PERSISTED_CACHE_KEY = "dubgrid-query-cache";
const PERSISTED_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Bump when a persisted response's shape changes within one app version.
const PERSISTED_CACHE_SCHEMA = 1;

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: PERSISTED_CACHE_KEY,
  throttleTime: 1_000,
});

/** The bootstrap and the queries Home opens with, once they have answered. */
export function shouldPersistQuery(query: Pick<Query, "queryKey" | "state">): boolean {
  if (query.state.status !== "success") return false;
  const [root, family, scope] = query.queryKey;
  if (root !== "mobile") return false;
  switch (family) {
    case "bootstrap":
    case "dashboard":
      return true;
    case "schedule":
      return scope === "mine";
    case "requests":
      // The identity key follows directly; history and availability name themselves first.
      return Array.isArray(scope);
    default:
      return false;
  }
}

/** Restores the stored queries, then keeps them saved; resolves once restored or abandoned. */
export function startQueryPersistence(): Promise<void> {
  const [, restored] = persistQueryClient({
    queryClient,
    persister: queryPersister,
    maxAge: PERSISTED_CACHE_MAX_AGE_MS,
    buster: `${Constants.expoConfig?.version ?? "dev"}:${PERSISTED_CACHE_SCHEMA}`,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  });
  return restored.catch(() => undefined);
}

/** Forgets every query, on screen and on the device. */
export function clearQueryCache(): void {
  queryClient.clear();
  void queryPersister.removeClient();
}
