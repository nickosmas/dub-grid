# Fix: Concurrent sessions land work through pull requests, and generated files merge themselves

**Type:** Fix
**Status:** verified

## The problem

Several agent sessions work against `dev` at once, and two things kept
costing rounds:

- Sessions landed work two ways: some pushed a local squash straight to `dev`
  (`HEAD:dev`), others merged a pull request. A direct push skips CI and moves
  the base under every open pull request.
- `internal/documentation/accuracy-manifest.json` changed 35 times on `dev` in
  three days. Two branches that touch code behind the same docs page both
  rewrite that page's `evidenceFingerprint`, and git can't merge two hashes,
  so #419 needed `dev` merged in by hand each time another session changed the
  manifest. The right value is a new hash of the merged code, which no text
  merge can produce.

## The fix

- `dev` on GitHub changes only through a merged pull request (owner,
  2026-11-08). AGENTS.md, `ai-interaction.md`, `CONTRIBUTING.md` and the
  `complete` and `continuous` skills (both adapters) say so; the worktree
  recipe pushes the branch, opens a pull request, watches the checks and
  squash-merges. Branches catch up by merging `origin/dev`, never by rebasing
  once pushed.
- `.gitattributes` gives the manifest and the generated inventory a
  `dubgrid-generated` merge driver (`scripts/git/merge-generated.mjs`). It
  three-way merges the manifest as JSON by page id. Where both sides changed a
  fingerprint it keeps this side's and records the page; any other overlap is
  left as an ordinary conflict. A conflicting inventory is kept and marked for
  rebuilding.
- `scripts/git/rebuild-generated.mjs` rebuilds what was marked from the merged
  tree: the `post-merge` hook folds it into the merge commit, and `pre-commit`
  does it when other conflicts were resolved by hand. `post-merge` rather than
  `pre-merge-commit`, because git has already written the merge tree when that
  hook runs, and with plumbing rather than `--amend`, which git refuses while
  the merge state is still on disk.
- `npm run hooks:install` now also registers the driver, falling back to a
  plain text merge on a branch that predates it.
- A repeated migration number already failed the web tests (the contiguity
  check in `loadMigrationInventory`), but as "expected 129, found 128". It now
  names both files and the number to move to.

## Verification

- Unit tests for the JSON merge, plus a real `git merge` in a temporary
  repository that ends with the page marked and no conflict.
- End to end in a scratch worktree of this repository: two branches each
  re-recorded the `reports` page. The merge made no conflict, the merge
  commit held the rebuilt hash with a clean tree, and `docs:check:closed`
  passed on it. The same with a second, hand-resolved conflict, through
  `pre-commit`.
- A test for the duplicate migration message; type-check, lint, Prettier and
  the docs contract pass.

## Not covered

- GitHub's Update branch button doesn't run local drivers; update branches
  locally.
- A rebase uses the driver but runs neither hook, so the rebuilt values wait
  for a later commit; rebasing pushed branches is now ruled out anyway.
- `blueprint/context/findings.md` is the next most edited file, but its edits
  are prose, so it gets no driver.
