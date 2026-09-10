import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");
const migration = fs.readFileSync(
  path.join(repoRoot, "supabase/migrations/017_bind_effective_tenants_to_auth_sessions.sql"),
  "utf8",
);
const sandboxEntry = fs.readFileSync(
  path.join(repoRoot, "apps/web/src/components/test-sandbox/CreateSandboxDialog.tsx"),
  "utf8",
);
const sandboxBanner = fs.readFileSync(
  path.join(repoRoot, "apps/web/src/components/test-sandbox/SandboxBanner.tsx"),
  "utf8",
);
const impersonationUi = fs.readFileSync(
  path.join(repoRoot, "apps/web/src/components/gridmaster/EnhancedImpersonation.tsx"),
  "utf8",
);

describe("temporary effective-tenant session ownership", () => {
  it("records auth-session ownership for both Test Sandbox and impersonation state", () => {
    expect(migration).toContain("sandbox_owner_session_id UUID");
    expect(migration).toContain("auth_session_id UUID");
    expect(migration).toContain("NEW.auth_session_id := v_auth_session_id");
    expect(migration).toContain("auth.jwt() ->> 'session_id'");
  });

  it("requires the current JWT session before RLS recognizes an owned Test Sandbox", () => {
    expect(migration).toMatch(
      /o\.sandbox_owner_session_id\s*=\s*NULLIF\(auth\.jwt\(\) ->> 'session_id', ''\)::UUID/,
    );
    expect(migration).toContain("AND o.archived_at IS NULL");
  });

  it("discards prior-tenant client state whenever temporary tenant context changes", () => {
    expect(sandboxEntry).toContain("window.location.reload()");
    expect(sandboxBanner.match(/window\.location\.reload\(\)/g)).toHaveLength(1);
    expect(impersonationUi).toMatch(/queryClient\.clear\(\);[\s\S]*window\.location\.replace/);
  });
});
