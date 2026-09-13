import { NextRequest } from "next/server";
import { createMfaLifecycleHandler } from "@/features/account/server/mfa-lifecycle";
import { requireLiveAuthenticatedSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";

const adapt = (gate: typeof requireLiveAuthenticatedSession) => async (req: NextRequest) => {
  const auth = await gate(req);
  return "response" in auth ? auth : { ...auth, accessToken: auth.session.access_token };
};
const handle = createMfaLifecycleHandler({
  surface: "web",
  liveAuth: adapt(requireLiveAuthenticatedSession),
  sensitiveAuth: adapt(requireSensitiveActionAuth),
});

export async function POST(req: NextRequest) {
  const csrf = validateCsrfOrigin(req);
  return csrf ?? handle(req);
}
