import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { extractJwtClaims } from "@/features/permissions/shared";
import SchedulerPageClient, { type SchedulePageInitialState } from "./SchedulePageClient";

async function loadInitialScheduleState(): Promise<SchedulePageInitialState> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Server Components cannot mutate cookies. Client auth guards handle redirects.
        },
      },
    },
  );

  // getSession (reads cookies) and getUser (validates against the auth server)
  // are independent, so run them in parallel instead of sequentially.
  const [
    {
      data: { session },
    },
    {
      data: { user },
    },
  ] = await Promise.all([supabase.auth.getSession(), supabase.auth.getUser()]);

  // org_id is a top-level claim the JWT hook already baked in — decode it
  // locally instead of an extra supabase.auth.getClaims() round-trip.
  const orgId = session?.access_token ? extractJwtClaims(session.access_token).orgId : null;

  return {
    authenticatedUserId: user?.id ?? null,
    orgId,
    serverLoadedAt: new Date().toISOString(),
  };
}

export default async function SchedulePage() {
  const initialState = await loadInitialScheduleState();

  return <SchedulerPageClient initialState={initialState} />;
}
