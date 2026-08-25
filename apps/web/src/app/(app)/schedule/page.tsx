import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import SchedulerPageClient, { type SchedulePageInitialState } from "./SchedulePageClient";
import { requireSupabasePublishableKey } from "@/lib/supabase-keys";
import { verifyAccessToken } from "@/lib/auth/verify-token";

async function loadInitialScheduleState(): Promise<SchedulePageInitialState> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    requireSupabasePublishableKey(),
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

  // getSession reads cookies; the token it returns is then verified locally
  // against Supabase's JWKS. This used to also call getUser(), which blocked
  // the whole server render on a round trip to Supabase Auth just to learn
  // the user id — and that id is the token's own `sub` claim.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const verified = session?.access_token ? await verifyAccessToken(session.access_token) : null;

  // org_id is a top-level claim the JWT hook already baked in. Read it off the
  // verified payload rather than an unverified decode.
  const orgId = typeof verified?.claims.org_id === "string" ? verified.claims.org_id : null;

  return {
    authenticatedUserId: verified?.userId ?? null,
    orgId,
    serverLoadedAt: new Date().toISOString(),
  };
}

export default async function SchedulePage() {
  const initialState = await loadInitialScheduleState();

  return <SchedulerPageClient initialState={initialState} />;
}
