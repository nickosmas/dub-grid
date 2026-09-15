import type { NextRequest } from "next/server";
import { handleRecoveryRequest } from "@/features/account/server/recovery-request";
import { validateCsrfOrigin } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  const csrfError = validateCsrfOrigin(request);
  if (csrfError) return csrfError;
  return handleRecoveryRequest(request);
}
