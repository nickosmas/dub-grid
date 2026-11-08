// Rebuilds what `merge-generated.mjs` left pending, from the merged working
// tree, and stages it; with --amend, folds it into the merge commit. Run by the
// post-merge and pre-commit hooks; a no-op when nothing is pending.

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

import {
  ACCURACY_MANIFEST,
  INVENTORY_FILES,
  pendingPath,
  readPending,
} from "./merge-generated.mjs";

const run = (args) => execFileSync("npm", ["run", "--silent", ...args], { stdio: "inherit" });

// After a merge commit MERGE_HEAD is gone, so post-merge says so itself.
function merging() {
  if (process.argv.includes("--merging")) return true;
  try {
    execFileSync("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function rebuild(pending) {
  const files = [];
  if (pending.inventory) {
    console.log("Rebuilding the documentation inventory from the merged code");
    run(["docs:inventory"]);
    files.push(...INVENTORY_FILES);
  }
  if (pending.pages.length > 0) {
    console.log(`Recording evidence again for ${pending.pages.join(", ")}`);
    run(["docs:fingerprint", "--", "--write", ...pending.pages]);
    files.push(ACCURACY_MANIFEST);
  }
  return files;
}

const pending = readPending();
// Left over from a merge that was aborted: nothing of it is being committed.
const files = merging() ? rebuild(pending) : [];
rmSync(pendingPath(), { force: true });

if (files.length > 0) {
  execFileSync("git", ["add", "--", ...files]);
  const changed = execFileSync("git", ["diff", "--cached", "--name-only", "--", ...files], {
    encoding: "utf8",
  });
  if (process.argv.includes("--amend") && changed.trim() !== "") {
    foldIntoHead();
    console.log("Folded the rebuilt files into the merge commit");
  }
}

// `git commit --amend` refuses while post-merge runs (the merge state is still
// on disk), so rewrite the commit with the staged tree, keeping its parents,
// message and author.
function foldIntoHead() {
  const git = (args, options = {}) =>
    execFileSync("git", args, { encoding: "utf8", ...options }).trim();
  const head = git(["rev-parse", "HEAD"]);
  const [parents, name, email, date] = git(["log", "-1", "--format=%P%n%an%n%ae%n%aD"]).split("\n");
  const message = execFileSync("git", ["log", "-1", "--format=%B"], { encoding: "utf8" });
  const commit = git(
    ["commit-tree", git(["write-tree"]), ...parents.split(" ").flatMap((parent) => ["-p", parent])],
    {
      input: message,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_AUTHOR_DATE: date,
      },
    },
  );
  git(["update-ref", "-m", "post-merge: rebuild generated files", "HEAD", commit, head]);
}
