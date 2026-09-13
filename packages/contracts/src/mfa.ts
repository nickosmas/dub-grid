import { z } from "zod";

export const mfaLifecycleRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll") }),
  z.object({ action: z.literal("remove"), factorId: z.string().uuid() }),
  z.object({ action: z.literal("cleanup"), factorId: z.string().uuid() }),
  z.object({ action: z.literal("reauthenticate"), password: z.string().min(1).max(1024) }),
]);

export type MfaLifecycleRequest = z.infer<typeof mfaLifecycleRequestSchema>;

export const mfaEnrollmentResponseSchema = z.object({
  id: z.string(),
  totp: z.object({ secret: z.string(), qr_code: z.string(), uri: z.string() }),
});

export const mfaReauthenticationResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});

export const mfaMutationResponseSchema = z.object({ success: z.literal(true) });
