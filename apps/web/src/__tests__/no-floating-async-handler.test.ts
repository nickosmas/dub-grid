// @vitest-environment node
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { noFloatingAsyncHandler } from "../../../../eslint-rules/no-floating-async-handler.mjs";

// The rule lives at the repo root rather than in a workspace, so it has no
// suite of its own; running it here is what gets it executed by `turbo run
// test` at all.
RuleTester.describe = describe;
RuleTester.it = it;

// The rule reads only the JSX/ESTree shape of a handler, so the fixtures need
// no TypeScript syntax and the default parser covers them.
const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("no-floating-async-handler", noFloatingAsyncHandler, {
  valid: [
    // A bare concise body hands the promise back.
    "async function save() {}; const A = () => <Button onClick={() => save()} />;",
    // `void` on a synchronous call discards nothing that matters.
    "function sync() {}; const B = () => <Button onClick={() => void sync()} />;",
    // An async handler already returns a promise.
    "async function save() {}; const C = () => <Button onClick={async () => { await save(); }} />;",
    // A block body that returns the call is the documented fix.
    "async function save() {}; const D = () => <Button onClick={() => { setOpen(false); return save(); }} />;",
    // A prop-sourced callee is out of this file's reach, so it stays quiet.
    "const E = ({ onSave }) => <Button onClick={() => void onSave()} />;",
  ],
  invalid: [
    {
      // The concise-body `void` that this rule used to walk straight past.
      code: "async function createLink() {}; const F = () => <Button onClick={() => void createLink()} />;",
      errors: [{ messageId: "voided", data: { name: "createLink" } }],
    },
    {
      // The block-bodied case the rule already covered.
      code: "async function publish() {}; const G = () => <Button onClick={() => { setOpen(false); publish(); }} />;",
      errors: [{ messageId: "floating", data: { name: "publish" } }],
    },
    {
      code: "async function refetch() {}; const H = () => <Button onPress={() => void refetch()} />;",
      errors: [{ messageId: "voided", data: { name: "refetch" } }],
    },
  ],
});
