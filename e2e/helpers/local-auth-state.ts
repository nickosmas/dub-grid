import { createHmac } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.LOCAL_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlLWRlbW8iLCJyb2xlIjoiYW5vbiIsImV4cCI6MTk4MzgxMjk5Nn0.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";

async function withDatabase<T>(operation: (database: Client) => Promise<T>): Promise<T> {
  const database = new Client({ connectionString: DB_URL });
  await database.connect();
  try {
    return await operation(database);
  } finally {
    await database.end();
  }
}

export async function setLocalOrganizationSubscription(
  slug: string,
  subscriptionStatus: string | null,
): Promise<string | null> {
  return withDatabase(async (database) => {
    const current = await database.query<{ subscription_status: string | null }>(
      "SELECT subscription_status FROM public.organizations WHERE slug = $1",
      [slug],
    );
    if (current.rowCount !== 1) throw new Error(`Local organization ${slug} was not found`);

    await database.query(
      "UPDATE public.organizations SET subscription_status = $1 WHERE slug = $2",
      [subscriptionStatus, slug],
    );
    return current.rows[0]?.subscription_status ?? null;
  });
}

export async function clearLocalMfaFactors(email: string): Promise<void> {
  await withDatabase(async (database) => {
    await database.query(
      `DELETE FROM auth.mfa_factors
       WHERE user_id = (SELECT id FROM auth.users WHERE email = $1)`,
      [email],
    );
  });
}

function decodeBase32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/u, "").toUpperCase()) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("Invalid base32 TOTP secret");
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateLocalTotp(
  secret: string,
  epochSeconds = Math.floor(Date.now() / 1000),
): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(epochSeconds / 30)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

export async function enrollLocalTotp(
  email: string,
  password: string,
): Promise<{ secret: string }> {
  await clearLocalMfaFactors(email);
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storageKey: `release-qualification-${Date.now()}`,
    },
  });

  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  const enrollment = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Release qualification",
  });
  if (enrollment.error || !enrollment.data) {
    throw enrollment.error ?? new Error("Local TOTP enrollment returned no factor");
  }

  const secret = enrollment.data.totp.secret;
  const verification = await client.auth.mfa.challengeAndVerify({
    factorId: enrollment.data.id,
    code: generateLocalTotp(secret),
  });
  if (verification.error) throw verification.error;
  await client.auth.signOut({ scope: "local" });

  return { secret };
}
