import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

function isMissingSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const {
    name,
    code,
    status,
    message,
  } = error as {
    name?: string;
    code?: string;
    status?: number;
    message?: string;
  };

  return (
    name === "AuthSessionMissingError" ||
    code === "session_not_found" ||
    (status === 400 && message?.toLowerCase().includes("auth session missing") === true)
  );
}

export async function getBrowserSession(): Promise<Session | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    if (isMissingSessionError(error)) return null;
    throw error;
  }
  return session;
}

export async function getVerifiedBrowserUser(): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    if (isMissingSessionError(error)) return null;
    throw error;
  }
  return user;
}

export async function getVerifiedBrowserAuth(): Promise<{
  session: Session | null;
  user: User | null;
}> {
  const [session, user] = await Promise.all([
    getBrowserSession(),
    getVerifiedBrowserUser(),
  ]);

  if (!session?.access_token || !user) {
    return { session: null, user: null };
  }

  return { session, user };
}
