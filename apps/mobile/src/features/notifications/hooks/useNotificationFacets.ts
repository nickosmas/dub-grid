import { useQuery } from "@tanstack/react-query";
import { getNotificationFacets } from "../../../shared/lib/api";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";

export function getNotificationFacetsQueryKey(accessToken: string | null) {
  return mobileQueryKeys.notificationFacets(accessToken);
}

export function useNotificationFacets(accessToken: string | null) {
  return useQuery({
    queryKey: getNotificationFacetsQueryKey(accessToken),
    queryFn: ({ signal }) => getNotificationFacets(accessToken!, signal),
    enabled: Boolean(accessToken),
  });
}
