import { useSessionState } from "../../../shared/providers/AuthSessionProvider";

export function useAccessToken() {
  return useSessionState().accessToken;
}
