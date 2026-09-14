/**
 * One SQL transport for the two remote-database scripts.
 *
 * `reset-remote-db.ts` and `seed.ts` both need a raw Postgres session, which
 * some networks make unreachable: routers and ISPs that filter database ports
 * let the TCP handshake through and then drop the payload, so `pg` fails with
 * ECONNRESET or a connect timeout on 5432/6543 alike, and Supabase's direct
 * host is IPv6-only. Supabase's Management API runs the same SQL over HTTPS,
 * so when the direct connection is blocked we fall back to it instead of
 * leaving the operator with no way to reset the project.
 *
 * Set SUPABASE_DB_TRANSPORT to `postgres` or `https` to pin one; the default
 * `auto` tries Postgres first and falls back.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { batchStatements, inlineParams, splitStatements } from "./sql-text";

const MANAGEMENT_API = "https://api.supabase.com";
const MANAGEMENT_API_TIMEOUT_MS = 15_000;

/**
 * Cap on a single Management API request body. Anything larger (the 300KB
 * `002_functions_triggers.sql`) is sent as batches of whole statements.
 */
const MAX_REQUEST_BYTES = 100_000;

const TOKEN_URL = "https://supabase.com/dashboard/account/tokens";

export interface SqlQueryResult<R> {
  rows: R[];
  rowCount: number;
}

export interface SqlClient {
  readonly transport: "postgres" | "management-api";
  /** Row type defaults to `any`, mirroring pg's own typing. */
  query<R = any>(text: string, values?: readonly unknown[]): Promise<SqlQueryResult<R>>;
  end(): Promise<void>;
}

/** Connection errors that mean "this network cannot reach Postgres". */
const UNREACHABLE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "EAI_AGAIN",
]);

function isUnreachable(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code && UNREACHABLE_CODES.has(code)) return true;
  const message = (err as { message?: string } | null)?.message ?? "";
  return /timeout expired|Connection terminated/i.test(message);
}

/** Env var first, then the token `supabase login` writes. */
function resolveManagementToken(): string | null {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const fromCli = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
    return fromCli.length > 0 ? fromCli : null;
  } catch {
    return null;
  }
}

class PostgresClient implements SqlClient {
  readonly transport = "postgres" as const;

  constructor(private readonly client: Client) {}

  async query<R>(text: string, values?: readonly unknown[]): Promise<SqlQueryResult<R>> {
    const result = await this.client.query(text, values ? [...values] : undefined);
    // A multi-statement query (a whole migration file) resolves to one result
    // per statement; the last one is what the caller asked about.
    const last = (Array.isArray(result) ? result[result.length - 1] : result) as
      { rows?: R[]; rowCount?: number | null } | undefined;
    const rows = last?.rows ?? [];
    return { rows, rowCount: last?.rowCount ?? rows.length };
  }

  async end(): Promise<void> {
    await this.client.end();
  }
}

class ManagementApiClient implements SqlClient {
  readonly transport = "management-api" as const;

  constructor(
    private readonly projectRef: string,
    private readonly token: string,
  ) {}

  async query<R>(text: string, values?: readonly unknown[]): Promise<SqlQueryResult<R>> {
    const sql = values && values.length > 0 ? inlineParams(text, values) : text;

    if (Buffer.byteLength(sql) <= MAX_REQUEST_BYTES) {
      return this.post<R>(sql);
    }

    // Too big for one request: run whole statements in order and report the
    // last batch's rows, which is what a multi-statement query returns anyway.
    let last: SqlQueryResult<R> = { rows: [], rowCount: 0 };
    for (const batch of batchStatements(splitStatements(sql), MAX_REQUEST_BYTES)) {
      try {
        last = await this.post<R>(batch);
      } catch (err) {
        // The batch is all the caller has to go on, since a split script has no
        // single position to point at.
        (err as Error).message += `\n  While running: ${batch.slice(0, 200).trim()}...`;
        throw err;
      }
    }
    return last;
  }

  async end(): Promise<void> {
    // Stateless transport — nothing to close.
  }

  private async post<R>(sql: string, attempt = 1): Promise<SqlQueryResult<R>> {
    let response: Response;
    try {
      response = await fetch(`${MANAGEMENT_API}/v1/projects/${this.projectRef}/database/query`, {
        method: "POST",
        signal: AbortSignal.timeout(MANAGEMENT_API_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      });
    } catch (err) {
      if (attempt < 3) return this.post<R>(sql, attempt + 1);
      throw err;
    }

    const body = await response.text();

    if (!response.ok) {
      // The gateway, not the query, on these — worth another try.
      if ([429, 502, 503, 504].includes(response.status) && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        return this.post<R>(sql, attempt + 1);
      }
      throw toSqlError(response.status, body);
    }

    const parsed: unknown = body.length > 0 ? JSON.parse(body) : [];
    const rows = (Array.isArray(parsed) ? parsed : []) as R[];
    return { rows, rowCount: rows.length };
  }
}

/**
 * Rebuilds a pg-shaped error from the API's JSON so callers can keep reading
 * `.code` / `.detail` / `.hint` / `.position` the way they do over Postgres.
 */
function toSqlError(status: number, body: string): Error {
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
  } catch {
    // Non-JSON body — keep the raw text as the message.
  }

  const message = typeof payload.message === "string" ? payload.message : body || `HTTP ${status}`;
  const error = Object.assign(new Error(message), {
    code: payload.code,
    detail: payload.detail ?? payload.details,
    hint: payload.hint,
    position: payload.position,
    status,
  });

  if (status === 401 || status === 403) {
    error.message = `${message} — the Supabase access token was rejected. Create a fresh one at ${TOKEN_URL}.`;
  }
  return error;
}

export interface ConnectOptions {
  connectionString: string;
  /** Set only for remote projects; it enables the HTTPS fallback. */
  projectRef?: string | null;
}

export async function connectSqlClient({
  connectionString,
  projectRef,
}: ConnectOptions): Promise<SqlClient> {
  const preference = (process.env.SUPABASE_DB_TRANSPORT ?? "auto").toLowerCase();

  if (preference === "https") {
    if (!projectRef) {
      throw new Error("SUPABASE_DB_TRANSPORT=https needs a remote Supabase project.");
    }
    const token = resolveManagementToken();
    if (!token) throw new Error(missingTokenMessage());
    console.log("Running SQL over the Supabase Management API (HTTPS).\n");
    return new ManagementApiClient(projectRef, token);
  }

  const ssl = connectionString.includes("supabase") ? { rejectUnauthorized: false } : undefined;
  const client = new Client({ connectionString, ssl, connectionTimeoutMillis: 10_000 });

  try {
    await client.connect();
    return new PostgresClient(client);
  } catch (err) {
    await client.end().catch(() => {});

    if (preference === "postgres" || !projectRef || !isUnreachable(err)) throw err;

    const token = resolveManagementToken();
    const reason = (err as Error).message;
    if (!token) {
      throw new Error(`${unreachableMessage(reason)}\n\n${missingTokenMessage()}`);
    }

    console.warn(`${unreachableMessage(reason)}`);
    console.warn("Falling back to the Supabase Management API over HTTPS.\n");
    return new ManagementApiClient(projectRef, token);
  }
}

function unreachableMessage(reason: string): string {
  return [
    `Direct Postgres connection failed (${reason}).`,
    "Ports 5432/6543 are commonly filtered by routers and ISPs; a phone hotspot usually works.",
  ].join("\n");
}

function missingTokenMessage(): string {
  return [
    "To run this over HTTPS instead, add a Supabase personal access token:",
    `  1. create one at ${TOKEN_URL}`,
    "  2. add SUPABASE_ACCESS_TOKEN=sbp_... to .env.remote (or run `npx supabase login`)",
  ].join("\n");
}
