import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import { noFloatingServerWork } from "./no-floating-server-work.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

tester.run("no-floating-server-work", noFloatingServerWork, {
  valid: [
    "async function f() { await dispatchNotificationEvent(id, event); }",
    "after(() => dispatchNotificationEvent(id, event));",
    "after(async () => { await client.from('audit_log').insert(row); });",
    "function f() { return send().catch(log); }",
    "async function f() { await Promise.all([a(), b()]); }",
    "const pending = send().catch(log);",
    "void 0;",
    "logger.info(message);",
    // A handler on a promise awaited elsewhere only keeps it from going unhandled.
    "const facts = load(); facts.catch(() => {}); await facts;",
  ],
  invalid: [
    {
      code: "void dispatchNotificationEvent(id, event);",
      errors: [{ messageId: "floating" }],
    },
    {
      code: "void client.from('audit_log').insert(row).then(({ error }) => log(error));",
      errors: [{ messageId: "floating" }],
    },
    {
      code: "send().catch(log);",
      errors: [{ messageId: "floating" }],
    },
    {
      code: "client.from('x').insert(row).then(log);",
      errors: [{ messageId: "floating" }],
    },
    {
      code: "dispatchNotificationEvent(id, event);",
      errors: [{ messageId: "floating" }],
    },
    {
      code: "send()?.catch(log);",
      errors: [{ messageId: "floating" }],
    },
    {
      code: "void client?.from('x').insert(row);",
      errors: [{ messageId: "floating" }],
    },
  ],
});
