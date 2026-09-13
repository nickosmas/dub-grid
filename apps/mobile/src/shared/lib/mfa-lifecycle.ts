import {
  mfaEnrollmentResponseSchema,
  mfaMutationResponseSchema,
  mfaReauthenticationResponseSchema,
  type MfaLifecycleRequest,
} from "@dubgrid/contracts";
import { mobileApiRequest } from "./api";
import { getSupabaseClient } from "./supabase";

const path = "/api/mobile/v1/profile/mfa-lifecycle";

export class MfaRequestTimeoutError extends Error {
  constructor() {
    super("This request took too long. Refresh two-factor status before trying again.");
  }
}

/** Provider operations cannot be cancelled. A timeout must reconcile, not replay. */
export async function withMfaDeadline<T>(request: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new MfaRequestTimeoutError()), 15_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function reauthenticateMobileMfa(accessToken: string, password: string) {
  const session = await mobileApiRequest(
    path,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ action: "reauthenticate", password }),
    },
    (value) => mfaReauthenticationResponseSchema.parse(value),
  );
  const { error } = await getSupabaseClient().auth.setSession(session);
  if (error) throw error;
  return session;
}

export function enrollMobileMfa(accessToken: string) {
  return mobileApiRequest(
    path,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ action: "enroll" }),
    },
    (value) => mfaEnrollmentResponseSchema.parse(value),
  );
}

export function removeMobileMfa(accessToken: string, factorId: string, cleanup = false) {
  const body: MfaLifecycleRequest = { action: cleanup ? "cleanup" : "remove", factorId };
  return mobileApiRequest(
    path,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (value) => mfaMutationResponseSchema.parse(value),
  );
}
