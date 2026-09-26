// Shared by the local Supabase Auth integration tests: the public local-stack
// defaults, a TOTP generator, and disposable-user cleanup.

import { createHmac } from "node:crypto";

import type { Session } from "@supabase/supabase-js";
import type { AuthenticationAssuranceClaims } from "@dubgrid/authz";
import { Client } from "pg";

export const SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const ANON_KEY =
  process.env.LOCAL_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlLWRlbW8iLCJyb2xlIjoiYW5vbiIsImV4cCI6MTk4MzgxMjk5Nn0.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";

export function decodeJwtClaims(token: string): AuthenticationAssuranceClaims {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Malformed JWT");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  return JSON.parse(
    Buffer.from(padded, "base64url").toString("utf8"),
  ) as AuthenticationAssuranceClaims;
}

export function matchingTimestamp(
  claims: AuthenticationAssuranceClaims,
  method: "password" | "totp",
) {
  if (!Array.isArray(claims.amr)) throw new Error("JWT has no AMR records");
  const timestamps = claims.amr
    .filter((entry) => entry?.method === method && typeof entry.timestamp === "number")
    .map((entry) => entry.timestamp as number);
  if (timestamps.length === 0) throw new Error(`JWT has no ${method} AMR record`);
  return Math.max(...timestamps);
}

export function decodeBase32(secret: string): Buffer {
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

export function generateTotp(secret: string, epochSeconds = Math.floor(Date.now() / 1000)): string {
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

export async function probeLocalSupabase(): Promise<boolean> {
  const database = new Client({ connectionString: DB_URL });
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
    });
    if (!response.ok) return false;
    await database.connect();
    await database.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await database.end().catch(() => undefined);
  }
}

export async function removeDisposableUser(userId: string): Promise<void> {
  const database = new Client({ connectionString: DB_URL });
  await database.connect();
  try {
    await database.query("DELETE FROM auth.users WHERE id = $1", [userId]);
  } finally {
    await database.end();
  }
}

export function requireSession(session: Session | null, context: string): Session {
  if (!session) throw new Error(`${context} did not return a session`);
  return session;
}
