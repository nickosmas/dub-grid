import { RuleTester } from "eslint";
import { describe, it } from "node:test";
import { noUnscopedTenantWrite } from "./no-unscoped-tenant-write.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

new RuleTester({ languageOptions: { ecmaVersion: 2024, sourceType: "module" } }).run(
  "no-unscoped-tenant-write",
  noUnscopedTenantWrite,
  {
    valid: [
      'db.from("jobs").update(row).eq("org_id", orgId).eq("id", id);',
      'db.from("jobs").update(row).eq("id", id).eq("org_id", orgId).select().maybeSingle();',
      'db.from("jobs").delete().in("org_id", orgIds);',
      'db.from("jobs").delete().match({ org_id: orgId, id });',
      'db.from("jobs").select("id").eq("id", id);',
      'db.from("employees").update(row).eq("user_id", userId);',
      'db.from("jobs").insert(row);',
      'db.from("profiles").update(row).eq("id", id);',
      'db.from(table).update(row).eq("id", id);',
    ],
    invalid: [
      {
        code: 'db.from("jobs").update(row).eq("id", id);',
        errors: [{ messageId: "unscoped" }],
      },
      {
        code: 'db.from("employees").delete().eq("id", id).select();',
        errors: [{ messageId: "unscoped" }],
      },
      {
        code: 'db.from("jobs").update(row).match({ id });',
        errors: [{ messageId: "unscoped" }],
      },
    ],
  },
);
