# AI Interaction Guidelines

> **This blueprint is an overlay layer**, added on top of an already-scaffolded
> app. Never run a framework scaffolder (create-next-app, etc.) inside this
> directory. For a new project, scaffold the app first, then overlay these files.

## Communication

- Be concise and direct
- Explain non-obvious decisions briefly
- Ask before large refactors or architectural changes
- Don't add features not in the project spec
- Never delete files without clarification

## Output formatting

Format every response for fast scanning, in whatever tool renders it. The skills
point at this file for formatting, so tune this to taste and the change applies
everywhere.

- **Real markdown, not prose walls** - bold field labels, short lines, a blank line between blocks.
- **Enumerations are lists** - a sequence of steps, options, or findings is a numbered or bulleted list, never an inline `(1)... (2)... (3)...` run crammed into a paragraph.
- **Tables for matrices** - comparing things across the same fields (status per item, option tradeoffs) goes in a table, not stacked bullets.
- **Backticks for code things** - identifiers, paths, commands, filenames.
- **Lead with the answer** - state the result or the state first, supporting detail after.
- **Don't over-format** - no deep bullet nests or decorative headers on a two-line reply. Concise still wins.

## Workflow

The loop we use for every feature, fix and rollback. The skills hold the full
steps; this is the shape and the rules that apply however a step is invoked.
The spec being built lives in @blueprint/context/current-feature.md.

You can also just describe a change in chat. The rules below still apply:
small steps, you approve each diff, the conventions in `coding-standards.md`.

1. **Spec** - `/brief` (optional, read-only), then `/feature` (no number = the
   next unchecked build-plan item) or `/fix` writes `current-feature.md`. We
   review it together before any code.
2. **Work branch** - cut from `dev` with the configured prefix (`feature/`,
   `fix/`, `rollback/`) and a short name from the spec.
3. **Implement** - `/implement` builds one small step at a time.
4. **Review** - show the diff, not full files, with what the step delivered,
   one line per file on the why, and the done-when shown true. I approve each
   step before the next.
5. **Test** - verify the done-when with evidence. Run the `Verify` command from
   `AGENTS.md` if one exists, otherwise the documented build and tests. Logic
   ships with a passing test (the gate in `coding-standards.md`); UI and
   integration steps ride on browser, screenshot, API and build evidence.
6. **Optional passes** - `/check` proves behavior against the running app,
   `/try` writes a manual walkthrough, `/audit` reviews quality. Fixes go
   through `/implement` or `/fix`. `blueprint/config.json` `qualityGates` can
   run them automatically.
7. **Checkpoint** - after an approved step, `/implement` offers continue,
   commit a checkpoint, walk me through it, or stop. Verify (or the fallback
   checks) must pass first. When implementation is done, end with a compact
   review packet: changed files, checks run, manual try path, risks, next
   action.
8. **Complete** - `/complete` runs the safety pass, archives the spec under
   `blueprint/history/`, checks off the build plan, resets `current-feature.md`,
   then pushes the branch and opens a pull request into `dev`, which
   squash-merges as one conventional commit once every check is green.
9. **Release** - after a merge into `dev`, open or update the release PR from
   `dev` to `main`, audit it, and merge it once every check is green, under
   "DubGrid Git policy" in `AGENTS.md` (including its migration stop).
   `/release` (optional) prepares provider config and a smoke test and stops
   before any deploy, remote change, push or publish without a separate yes.

**Resuming after a context clear.** Progress lives in files, not the chat:
`current-feature.md` holds the spec with each step checked off, and git holds
the code. A fresh session loads `current-feature.md`, so `/implement` continues
from the first unchecked step.

Do NOT commit without permission or until Verify, or the fallback build and
tests, passes. If a required check fails, fix the issue first.

`/autopilot` and `/continuous` are explicit opt-in commands only; never suggest
them as the default next action. Their limits are in `AGENTS.md` and their
skills.

## Branching

Follow "DubGrid Git policy" and "Several agents share this checkout" in
`AGENTS.md`: one branch per work item cut from `origin/dev`, its own worktree,
landed through a pull request into `dev`, updated by merging `origin/dev`
(never rebasing a pushed branch), and the shared checkout never switched off
`dev`. Where a Blueprint skill names `main` or the default branch as the merge
target, read `dev`.

## Commits

- Ask before committing, except for checkpoint and feature-lifecycle commits
  explicitly authorized by `/autopilot` or `/continuous`
- Commit from the worktree, whose index is yours alone. If you ever commit from
  the shared checkout instead, stage and commit in a single invocation and
  assert the staged file count first: another session can mutate the index
  between a `git add` and a `git commit`, taking files you did not stage and
  dropping ones you did
- Use conventional commit messages (feat:, fix:, chore:, etc.)
- Keep commits focused (one feature/fix per commit)
- Never put "Generated with Claude" or any AI attribution in commit messages

## When Stuck

- If something isn't working after 2-3 attempts, stop and explain the issue
- Don't keep trying random fixes
- Ask for clarification if requirements are unclear

## Code Changes

- Make minimal changes to accomplish the task
- Don't refactor unrelated code unless asked
- Don't add "nice to have" features
- Preserve existing patterns in the codebase
- For visual or replication features (recreating a design, matching a mockup),
  work from a reference image stored in `blueprint/reference/`, not a prose
  description. Ask for the image if it's missing; building a visual target from
  words alone yields an approximation that costs rework.

## Code Review

Review AI-generated code periodically, especially for:

- Security (auth checks, input validation)
- Performance (unnecessary re-renders, N+1 queries)
- Logic errors (edge cases)
- Patterns (matches existing codebase?)
