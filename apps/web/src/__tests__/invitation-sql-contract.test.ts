import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INVITATION_LIFETIME_HOURS } from "@dubgrid/domain";
import {
  latestFunctionDefinition,
  repoRootDir,
  supabaseMigrationsDir,
} from "./helpers/sql-inventory";

const migrations = supabaseMigrationsDir();
const files = readdirSync(migrations)
  .filter((file) => /^\d{3}_.*\.sql$/.test(file))
  .sort();
const read = (file: string) => readFileSync(join(migrations, file), "utf8");

// The app and SQL each carried their own copy of these (41d2).
describe("invitation SQL the app depends on", () => {
  it("expires an invitation after the same hours the app states", () => {
    const table = read("001_schema.sql").split("CREATE TABLE public.invitations (")[1] ?? "";
    const columns = table.slice(0, table.indexOf(");"));

    expect(columns).toMatch(
      new RegExp(
        `expires_at\\s+TIMESTAMPTZ NOT NULL DEFAULT now\\(\\) \\+ INTERVAL '${INVITATION_LIFETIME_HOURS} hours'`,
      ),
    );
    for (const file of files.filter((name) => name !== "001_schema.sql")) {
      expect(read(file), file).not.toMatch(/ALTER TABLE[^;]*invitations[^;]*expires_at/i);
    }
  });

  it("still raises each message the invitations route matches", () => {
    const body = latestFunctionDefinition("replace_pending_invitation_access").text.toLowerCase();
    // Read from the route, so a message it starts matching is checked too (F-50).
    const route = readFileSync(
      resolve(repoRootDir(), "apps/web/src/app/api/organizations/invitations/route.ts"),
      "utf8",
    );
    const call = route.indexOf(`"replace_pending_invitation_access"`);
    const handling = route.slice(call, route.indexOf("throw replacementError", call));
    const messages = [...handling.matchAll(/message\.includes\("([^"]+)"\)/g)].map(
      (match) => match[1]!,
    );

    expect(messages.length).toBeGreaterThanOrEqual(4);
    for (const message of messages) {
      expect(body, message).toMatch(new RegExp(`raise exception '[^']*${message}`));
    }
  });
});
