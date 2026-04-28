import { useQuery } from "@tanstack/react-query";
import { getBootstrap } from "../../../shared/lib/api";

export function useBootstrap(accessToken: string | null) {
  return useQuery({
    queryKey: ["mobile", "bootstrap", accessToken],
    queryFn: () => getBootstrap(accessToken!),
    enabled: Boolean(accessToken),
  });
}
