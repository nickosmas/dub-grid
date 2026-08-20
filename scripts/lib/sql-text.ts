/**
 * A small SQL scanner shared by the remote-database scripts.
 *
 * Both jobs it does — inlining `$1` parameters and splitting a migration file
 * into statements — are only correct if `$1`, `;`, and friends are ignored
 * inside string literals, quoted identifiers, dollar-quoted function bodies and
 * comments. `002_functions_triggers.sql` is 300KB of `$$ ... $$` bodies, so a
 * naive regex would shred it.
 */

/**
 * If a non-code region (literal, quoted identifier, dollar quote, comment)
 * starts at `i`, returns the index just past it. Returns `null` when `sql[i]`
 * is ordinary code.
 */
function skipNonCode(sql: string, i: number): number | null {
  const two = sql.slice(i, i + 2);

  if (two === "--") {
    const end = sql.indexOf("\n", i);
    return end === -1 ? sql.length : end + 1;
  }

  if (two === "/*") {
    // Postgres block comments nest.
    let depth = 1;
    let j = i + 2;
    while (j < sql.length && depth > 0) {
      if (sql.startsWith("/*", j)) {
        depth++;
        j += 2;
      } else if (sql.startsWith("*/", j)) {
        depth--;
        j += 2;
      } else {
        j++;
      }
    }
    return j;
  }

  if (sql[i] === "'") {
    // `E'...'` gives backslash its escaping meaning back.
    const escaped = /[eE]$/.test(sql.slice(Math.max(0, i - 1), i));
    let j = i + 1;
    while (j < sql.length) {
      if (escaped && sql[j] === "\\") {
        j += 2;
        continue;
      }
      if (sql[j] === "'") {
        if (sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        return j + 1;
      }
      j++;
    }
    return sql.length;
  }

  if (sql[i] === '"') {
    let j = i + 1;
    while (j < sql.length) {
      if (sql[j] === '"') {
        if (sql[j + 1] === '"') {
          j += 2;
          continue;
        }
        return j + 1;
      }
      j++;
    }
    return sql.length;
  }

  if (sql[i] === "$") {
    // A dollar quote opens with `$$` or `$tag$`; `$1` is a parameter, not a tag.
    const tag = /^\$([A-Za-z_][A-Za-z_0-9]*)?\$/.exec(sql.slice(i));
    if (tag) {
      const close = sql.indexOf(tag[0], i + tag[0].length);
      return close === -1 ? sql.length : close + tag[0].length;
    }
  }

  return null;
}

/** Renders a JS value as a Postgres literal. */
export function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot bind non-finite number ${value} into SQL`);
    }
    return String(value);
  }
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString("hex")}'::bytea`;
  if (Array.isArray(value)) {
    if (value.length === 0) return "'{}'";
    return `ARRAY[${value.map(toSqlLiteral).join(", ")}]`;
  }
  if (typeof value === "object") return quote(JSON.stringify(value));
  return quote(String(value));
}

/**
 * `standard_conforming_strings` is on by default, so a backslash is an ordinary
 * character and doubling the quote is the whole escape.
 */
function quote(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * Substitutes `$1`-style placeholders with literals, leaving anything inside a
 * literal, identifier, dollar quote or comment untouched.
 */
export function inlineParams(sql: string, values: readonly unknown[]): string {
  let out = "";
  let i = 0;

  while (i < sql.length) {
    const skipped = skipNonCode(sql, i);
    if (skipped !== null) {
      out += sql.slice(i, skipped);
      i = skipped;
      continue;
    }

    const param = sql[i] === "$" ? /^\$(\d+)/.exec(sql.slice(i)) : null;
    if (param) {
      const position = Number(param[1]);
      if (position < 1 || position > values.length) {
        throw new Error(`SQL references $${position} but ${values.length} values were bound`);
      }
      out += toSqlLiteral(values[position - 1]);
      i += param[0].length;
      continue;
    }

    out += sql[i];
    i++;
  }

  return out;
}

/** Strips comments so a statement can be checked for actual content. */
function stripComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const isComment = sql.startsWith("--", i) || sql.startsWith("/*", i);
    const skipped = skipNonCode(sql, i);
    if (skipped !== null) {
      if (!isComment) out += sql.slice(i, skipped);
      i = skipped;
      continue;
    }
    out += sql[i];
    i++;
  }
  return out;
}

/** Splits a script into complete statements, dropping blank/comment-only ones. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let i = 0;

  const push = (end: number) => {
    const statement = sql.slice(start, end).trim();
    if (stripComments(statement).replace(/[\s;]/g, "").length > 0) statements.push(statement);
    start = end;
  };

  while (i < sql.length) {
    const skipped = skipNonCode(sql, i);
    if (skipped !== null) {
      i = skipped;
      continue;
    }
    if (sql[i] === ";") {
      push(i + 1);
      i++;
      continue;
    }
    i++;
  }
  push(sql.length);

  return statements;
}

/** Groups statements into request-sized batches, each under `maxBytes`. */
export function batchStatements(statements: readonly string[], maxBytes: number): string[] {
  const batches: string[] = [];
  let current = "";

  for (const statement of statements) {
    const next = current.length === 0 ? statement : `${current}\n${statement}`;
    if (current.length > 0 && Buffer.byteLength(next) > maxBytes) {
      batches.push(current);
      current = statement;
      continue;
    }
    current = next;
  }
  if (current.length > 0) batches.push(current);

  return batches;
}
