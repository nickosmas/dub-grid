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

The loop we use for every feature. The spec for the feature being built lives in
@blueprint/context/current-feature.md.

Run `/feature` (or `/fix` for a bug or change that isn't a planned feature) to
write the spec, `/implement` to build it on a branch, and `/complete` to log it
and merge. The numbered loop below is what those skills follow.

The skills are the structured path, not a requirement. You can also just describe
a feature, fix, or change in chat at any time and we'll build it the same way; the
rules below still apply (small steps, you approve each diff, the conventions in
`coding-standards.md`), because they're always in context. Use the skills when you
want the repeatable loop and the logging; prompt directly when you just want
something done.

1. **Spec** - Optionally run `/brief` first for a read-only preview of the next
   feature (scope, dependencies, size); it writes nothing. Then run `/feature`
   (no number = the next unchecked item in `build-plan.md`) to generate
   @blueprint/context/current-feature.md, then review it together before any code.
2. **Branch** - Create a new branch for the feature/fix.
3. **Implement** - Build one small step from the spec at a time, not the whole
   feature at once.
4. **Review** - Show the diff (not full files), with a short summary: what the
   step delivered, one line per file on the why, and the done-when shown true. I
   read and approve each step before moving to the next.
5. **Test** - Verify the done-when with evidence. If `AGENTS.md` declares a
   `Verify` command, run that exact command as the final automated gate. It wraps
   only the checks the project actually has. If no Verify command exists, run the
   documented build command and the test command when configured. A step that
   adds logic must ship a passing test when the test gate is on; UI and
   integration steps ride on browser, screenshot, API, and build evidence. Run
   `/tests` first if the project needs a stack-native unit test runner added or
   normalized. See the Testing section of `coding-standards.md` for the gate.
   Run `/ci` separately when you want one Verify command and matching automatic
   GitHub checks; CI setup is not part of this feature loop.
6. **Try manually (optional)** - Run `/try` when you want a human walkthrough:
   what to start, where to go, what to click or run, what to expect, and what
   would count as wrong. `/check` proves behavior from the agent side; `/try`
   gives you the manual review path.
7. **Audit (optional)** - Run `/audit` when you want a read-only code quality pass
   before closing a feature or after a larger automated run. It checks for
   duplication, dead code, missing tests for logic, standards drift, and
   maintainability risks. Fixes still happen through `/implement` or `/fix`.
8. **Iterate** - If it doesn't work or needs changes, re-prompt or hand-edit and
   re-test; repeat until it works, before moving on.
9. **Checkpoint (optional)** - after an approved step `/implement` offers a quick
   choice (continue / commit a checkpoint / walk me through it / stop here) as a
   selectable popup, or in plain text when there's a lot to read first so it doesn't
   cover what you're reading. Checkpoints are optional cheap rollback points; "walk
   me through it" gives a deeper code explanation and loops back; `/complete` makes
   the real feature-level commit. Verify, or the fallback checks, must pass first.
   When implementation is done, end with a compact review packet: changed files,
   checks run, manual try path, risks, and next action.
10. **Safety + log** - `/complete` first checks the active spec, branch, changed
    files, Verify or fallback check evidence, manual try path, and adapter sync when
    workflow files changed. Then it archives the spec to `blueprint/history/features/NN-name.md` (or
    `blueprint/history/fixes/`), checks the feature off in `blueprint/build-plan.md`, and
    resets `blueprint/context/current-feature.md` to its stub.
11. **Feature commit** - `/complete` stages everything on the branch (step work
    plus the logging changes) into one conventional feature commit.
12. **Squash-merge** - `/complete` squash-merges the branch to main (explicit yes)
    and deletes it, so the feature lands as one commit. Then it must ask
    separately before pushing main; merge approval does not approve a push.
13. **Release prep (optional)** - run `/release render` or `/release vercel`
    after a completed feature or milestone when you want local provider config,
    env var review, build/start checks, and a smoke-test path. `/release` must
    stop before deploy, remote service creation, remote env changes, push, or
    publish unless the user gives a separate yes in the current chat.

**Resuming after a context clear.** Progress lives in files, not the chat:
`current-feature.md` holds the spec with each step checked off as it's done, and git
holds the code (branch, commits, working tree). A fresh session auto-loads
`current-feature.md` through the project instructions (`AGENTS.md`, and
`CLAUDE.md` for Claude Code), so `/implement` or `$implement` just continues from
the first unchecked step - no separate save/load needed.

Do NOT commit without permission or until Verify, or the fallback build and tests,
passes. If a required check fails, fix the issue first.

Autopilot exists only as an explicit opt-in command: `/autopilot` or
`$autopilot`. Do not suggest it as the default next action. When invoked, it runs
one bounded pass without pausing after each passing implementation step. It may
create checkpoint commits on the feature or fix branch after passing steps. It
stops before `/complete`, merge, push, deploy, publish, destructive actions, or
hiding failing checks.

Continuous Mode also exists only as an explicit opt-in command: `/continuous`
or `$continuous`. Do not suggest it as the default next action. Its explicit
invocation authorizes the local per-feature lifecycle defined by that skill:
configured checkpoint commits, one local default-branch commit per completed
feature, local squash merges, branch deletion, and repetition through the
configured limit or end of the build plan. It never authorizes push, deploy,
publish, send, remote changes, destructive actions, finding waivers, or product
decisions.

## Branching

A new branch for every feature, fix, or rollback, using the prefixes in
`blueprint/config.json`. Ask to delete the branch once merged. Continuous Mode's
explicit invocation already authorizes deletion of each locally merged feature
branch.

## Commits

- Ask before committing, except for checkpoint and feature-lifecycle commits
  explicitly authorized by `/autopilot` or `/continuous`
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
