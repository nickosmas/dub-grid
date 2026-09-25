import type { Client } from "pg";

/**
 * Claims as a real access token carries them. Tokens always hold
 * `mfa_enrolled` (migration 037) and policies fail closed without it (041),
 * so it defaults to false; pass `mfa_enrolled: true` with or without
 * `aal: "aal2"` to act as an enrolled caller.
 */
export function simulatedTokenClaims(claims: Record<string, unknown>): Record<string, unknown> {
  return { mfa_enrolled: false, ...claims };
}

/**
 * Acts as an authenticated caller for the rest of the transaction, the way
 * PostgREST does, so policies and grants answer rather than the routes.
 */
export async function actAsAuthenticated(
  db: Pick<Client, "query">,
  claims: Record<string, unknown>,
): Promise<void> {
  await db.query(`SET LOCAL ROLE authenticated`);
  await db.query(`SELECT set_config('request.jwt.claims', $1::text, true)`, [
    JSON.stringify(simulatedTokenClaims(claims)),
  ]);
}
