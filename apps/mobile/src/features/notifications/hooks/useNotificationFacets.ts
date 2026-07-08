import { useQuery } from "@tanstack/react-query";
import { getNotificationFacets } from "../../../shared/lib/api";

export function getNotificationFacetsQueryKey(accessToken: string | null) {
  return ["mobile", "notification-facets", accessToken] as const;
}

export function useNotificationFacets(accessToken: string | null) {
  return useQuery({
    queryKey: getNotificationFacetsQueryKey(accessToken),
    queryFn: () => getNotificationFacets(accessToken!),
    enabled: Boolean(accessToken),
  });
}
