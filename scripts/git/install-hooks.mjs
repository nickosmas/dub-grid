// Enables the repo's git hooks and the merge driver `.gitattributes` names.
// Git config is shared by every worktree of a clone, so this runs once.

import { execFileSync } from "node:child_process";

const config = (key, value) => execFileSync("git", ["config", key, value]);

config("core.hooksPath", ".githooks");
config("merge.dubgrid-generated.name", "rebuild generated documentation files after a merge");
// A branch from before the driver existed has no script, so fall back to an
// ordinary text merge there rather than failing the merge.
config(
  "merge.dubgrid-generated.driver",
  "if [ -f scripts/git/merge-generated.mjs ]; then node scripts/git/merge-generated.mjs %O %A %B %P; else git merge-file %A %O %B; fi",
);

console.log("Git hooks (.githooks) and the dubgrid-generated merge driver are enabled.");
