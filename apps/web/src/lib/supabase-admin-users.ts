import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/supabase-keys";
import logger from "@/lib/logger";

/**
 * The subset of an auth user this app needs when resolving an account by its
 * email address.
 */
export type AdminAuthUser = {
  id: string;
  email: string;
  /** False for an account that was created but never confirmed its address. */
  emailConfirmed: boolean;
};

type GoTrueUser = {
  id?: unknown;
  email?: unknown;
  email_confirmed_at?: unknown;
  confirmed_at?: unknown;
};

/**
 * Resolve an auth user by email via the GoTrue admin API.
 *
 * `supabase.auth.admin` has no lookup-by-email — only `getUserById` and a
 * paginated `listUsers` — so this calls the admin users endpoint directly and
 * uses its `filter` parameter (an ILIKE on email, the same one Supabase Studio's
 * user search uses). The match is re-checked exactly here, since `filter` is a
 * substring match: `a@b.com` would also return `xa@b.com`.
 *
 * Returns null when the address has no account, and also when the lookup itself
 * fails — callers treat "not found" as "assume an account may exist" rather than
 * as permission to create one, so a failed lookup is never an opening.
 *
 * Server-only: uses the secret key.
 */
export async function findAuthUserByEmail(email: string): Promise<AdminAuthUser | null> {
  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;

  const normalized = email.trim().toLowerCase();
  const endpoint =
    `${url}/auth/v1/admin/users` + `?page=1&per_page=50&filter=${encodeURIComponent(normalized)}`;

  try {
    const response = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!response.ok) {
      logger.error({ status: response.status }, "admin user lookup by email failed");
      return null;
    }

    const body = (await response.json()) as { users?: GoTrueUser[] };
    const match = (body.users ?? []).find(
      (user) => typeof user.email === "string" && user.email.trim().toLowerCase() === normalized,
    );
    if (!match || typeof match.id !== "string") return null;

    return {
      id: match.id,
      email: normalized,
      emailConfirmed: Boolean(match.email_confirmed_at ?? match.confirmed_at),
    };
  } catch (error) {
    logger.error({ error }, "admin user lookup by email threw");
    return null;
  }
}
