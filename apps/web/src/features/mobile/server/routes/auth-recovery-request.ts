import { handleRecoveryRequest } from "@/features/account/server/recovery-request";

export async function POST(request: Request): Promise<Response> {
  return handleRecoveryRequest(request);
}
