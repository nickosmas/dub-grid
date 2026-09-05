import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MobilePerson } from "@dubgrid/contracts";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { getMobilePerson } from "../../../shared/lib/api";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";

/**
 * Everything a screen that edits one person needs to get going: the person, the
 * org data behind the pickers, and the cache write that keeps the detail page
 * and the People list in step when the edit lands.
 *
 * The person detail page has already fetched this under the same key, so a
 * screen pushed from it usually opens on warm cache rather than a spinner.
 */
export function usePersonEditor(personId: string | undefined) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const bootstrapQuery = useBootstrap(accessToken);
  const personQuery = useQuery({
    queryKey: ["mobile", "person", accessToken, personId],
    queryFn: () => getMobilePerson(accessToken!, personId!),
    enabled: Boolean(accessToken && personId && bootstrapQuery.data),
  });

  const contentState = useMobileContentState({
    // Bootstrap belongs in both halves: the pickers are built from it, and a
    // form rendered before it lands shows empty options next to a live "select
    // at least one" error, which reads as broken rather than as loading.
    hasData: personQuery.data !== undefined && bootstrapQuery.data !== undefined,
    isLoading: personQuery.isLoading || bootstrapQuery.isLoading,
    error: personQuery.error ?? bootstrapQuery.error,
  });

  const manualRefresh = useManualRefresh(() =>
    Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]),
  );

  const updateCachedPerson = useCallback(
    (nextPerson: MobilePerson) => {
      queryClient.setQueryData(["mobile", "person", accessToken, nextPerson.id], {
        person: nextPerson,
      });
      queryClient.setQueryData(
        ["mobile", "people", accessToken],
        (current: { people: MobilePerson[] } | undefined) =>
          current
            ? {
                people: current.people.map((item) =>
                  item.id === nextPerson.id ? nextPerson : item,
                ),
              }
            : current,
      );
    },
    [accessToken, queryClient],
  );

  return {
    accessToken,
    bootstrapQuery,
    personQuery,
    person: personQuery.data?.person ?? null,
    contentState,
    manualRefresh,
    updateCachedPerson,
  };
}
