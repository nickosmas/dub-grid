// supabase/functions/invalidate-user-session/index.ts
import { createClient } from "@supabase/supabase-js";

const FORCED_LOGOUT_REASONS = [
  "role_change",
  "account_suspended",
  "security_incident",
];

export default async (req: Request): Promise<Response> => {
  // Authenticate the caller via their JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing authorization" }),
      { status: 401 },
    );
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Verify caller identity server-side
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user: caller },
    error: authError,
  } = await adminClient.auth.getUser(token);

  if (authError || !caller) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 },
    );
  }

  // Only admins and gridmasters can invalidate sessions
  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("platform_role, org_role")
    .eq("id", caller.id)
    .single();

  if (
    !callerProfile ||
    (callerProfile.platform_role !== "gridmaster" &&
      callerProfile.org_role !== "admin")
  ) {
    return new Response(
      JSON.stringify({ error: "Forbidden: insufficient permissions" }),
      { status: 403 },
    );
  }

  const { target_user_id, reason } = await req.json();

  const revokeScope = FORCED_LOGOUT_REASONS.includes(reason)
    ? "global"
    : "local";

  if (revokeScope === "global") {
    const { error } = await adminClient.auth.admin.signOut(
      target_user_id,
      "others",
    );
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
      });
    }
  }

  // Note: session invalidation is already audited via the role_change_log
  // written by the change_user_role RPC that triggers this function.

  return new Response(JSON.stringify({ status: "ok", scope: revokeScope }), {
    status: 200,
  });
};
