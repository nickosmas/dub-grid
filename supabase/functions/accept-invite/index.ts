// supabase/functions/accept-invite/index.ts
import { createClient } from "@supabase/supabase-js";

export default async (req: Request): Promise<Response> => {
  const { token, email, password } = await req.json();

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Atomically claim the invitation
  const { data: invite, error } = await adminClient
    .from("org_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("token", token)
    .eq("email", email.toLowerCase())
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .select()
    .single();

  if (error || !invite) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired invitation" }),
      { status: 400 },
    );
  }

  // Create user via admin API
  const { data: authUser, error: signUpError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        role: invite.role_to_assign,
        org_id: invite.org_id,
      },
    });

  if (signUpError) {
    // Rollback invitation claim
    await adminClient
      .from("org_invitations")
      .update({ accepted_at: null })
      .eq("token", token);

    return new Response(JSON.stringify({ error: signUpError.message }), {
      status: 500,
    });
  }

  // Upsert profile — the on_auth_user_created trigger inserts a default row
  // when createUser runs, so upsert ensures correct role and org are set.
  const { error: profileError } = await adminClient.from("profiles").upsert(
    {
      id: authUser.user.id,
      org_id: invite.org_id,
      org_role: invite.role_to_assign,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return new Response(
      JSON.stringify({ error: "Failed to create profile" }),
      { status: 500 },
    );
  }

  return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
};
