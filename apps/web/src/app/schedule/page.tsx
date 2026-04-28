import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import SchedulerPageClient, {
  type SchedulePageInitialState,
} from "./SchedulePageClient";

type Claims = {
  org_id?: unknown;
};

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

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let orgId: string | null = null;
  if (session?.access_token) {
    const { data } = await supabase.auth.getClaims(session.access_token);
    const claims = data?.claims as Claims | undefined;
    orgId = typeof claims?.org_id === "string" ? claims.org_id : null;
  }

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
