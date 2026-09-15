import { createMfaLifecycleHandler } from "@/features/account/server/mfa-lifecycle";
import { requireMobileSensitiveActionAuth, requireMobileStepUpSession } from "../auth";

export const POST = createMfaLifecycleHandler({
  surface: "mobile",
  liveAuth: (req) => requireMobileStepUpSession(req),
  sensitiveAuth: (req) => requireMobileSensitiveActionAuth(req),
});
