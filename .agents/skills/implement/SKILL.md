---
name: implement
description: "Build the feature, fix, or rollback spec'd in blueprint/context/current-feature.md, one small reviewable step at a time on dev. It implements each step, shows the diff and explains it in plain English, tests, and iterates until it works. Type: Rollback specs use a guarded reverse patch that preserves Blueprint history. After each approved step it offers an optional commit checkpoint on dev; the work-level commit and logging are /complete's job. Use when the user runs /implement, or asks to build, implement, or start the current feature, fix, or rollback once its spec is ready."
---

# implement - build the current spec, one reviewed step at a time

## DubGrid branch override

For DubGrid, all development work stays directly on `dev`. This replaces every
other branch-creation, switching, merging, and deletion instruction in this
skill: confirm `dev` before editing, do not create a feature/fix/rollback branch,
and never develop on `main`.

**First action:** Before project inspection, preflight, or any other tool call,
publish `running` to `blueprint/.state/run.json` using the dashboard activity
contract in `AGENTS.md`.

Where this sits in the workflow:

    /feature, /fix, or /rollback  ->  [implement]  ->  /complete  ->  next
    (the spec)                         (build it,       (commit +
                                        reviewed)        merge + log)

`/feature`, `/fix`, or `/rollback` wrote the spec to
`blueprint/context/current-feature.md` and stopped.
This skill turns that spec into code, following the build loop in
`blueprint/context/ai-interaction.md`, without vibe coding: small steps, a visible diff plus
a plain-English explanation for each, testing, and iteration until it works,
using the project's configured review cadence. It builds on a branch and can
offer optional commit checkpoints when enabled; the work-level commit, merging,
and logging are `/complete`'s job.

## Before you start

Read `blueprint/config.json` before changing code. A missing file means the
built-in defaults apply. If the file exists but is invalid, stop and point the
user to `/doctor`; a mutating workflow must not guess past invalid configuration.
Configuration can change workflow behavior, but it never grants permission to
commit, merge, push, deploy, publish, or take destructive action.

Read `blueprint/context/current-feature.md`. If it has no real spec (still the stub, or its
status is already complete), stop and tell the user to run `/feature` (for a
planned feature), `/fix` (for an ad-hoc bug or change), or `/rollback` (for a
completed feature reversal) first. Pull the
conventions from `blueprint/context/coding-standards.md` and the data model from
`blueprint/context/project-overview.md` so the code matches them.

If the spec's Design reference points at `prototypes/*.html`, those mockups are
the visual target - build components to match them, and treat `prototypes/theme.css`
as the token source (the spec's first step ports it into the app's global
stylesheet before the components are built).

**Resuming?** If the spec already has some build steps checked off (`- [x]`), this
feature was started earlier and interrupted (often a cleared context). The spec and
its ticked steps are files, so pick up where it left off: read which steps are done,
check the git branch and `git status`/log to see what is committed and what is still
in the working tree, then continue from the **first unchecked step** instead of
starting over. No separate save/load is needed - the project instructions load
`current-feature.md` every session.

## Step 1 - development branch

Confirm `dev` is the current branch before making changes. If it is not, stop
and ask the user to switch to `dev`; do not create or switch to another branch.

### Type: Rollback safeguard

For a rollback spec, do not hand-delete the old feature and do not run a whole
commit `git revert`. Completed feature commits also contain Blueprint history and
plan bookkeeping, while `current-feature.md` now contains the active rollback
spec. Reversing the whole commit would damage that state.

Before the first rollback build step:

1. Read the approved spec's `Target commit` and `Target parent` fields. Stop
   unless both values match `^[0-9a-f]{40}$`. Do not accept abbreviated,
   uppercase, or otherwise malformed SHAs.
2. Resolve the archive's introducing commit and verify it has exactly one parent.
   Stop on a merge target. Resolve that single parent to a full SHA value.
   Confirm the resolved commit exactly equals `Target commit` and the resolved
   parent exactly equals `Target parent`. Stop on any mismatch.
3. Confirm the resolved target is an ancestor of `HEAD` and the only dirty path
   before applying the patch is the approved rollback spec. Stop on drift.
4. Preview the resolved target's product diff while excluding `.agents/**`, `.claude/**`,
   `blueprint/**`, `AGENTS.md`, `CLAUDE.md`, and
   `prototypes/**`. Confirm the preview is non-empty and matches the Product
   paths in the spec.
5. Apply that resolved product diff in reverse with three-way conflict detection
   and stage it. Use only the resolved full SHA values before running:

       git diff --binary <target-parent> <target-commit> -- . \
         ':(exclude).agents/**' \
         ':(exclude).claude/**' ':(exclude)blueprint/**' \
         ':(exclude)AGENTS.md' ':(exclude)CLAUDE.md' \
         ':(exclude)prototypes/**' |
         git apply --reverse --3way --index

   Never omit the protected pathspec exclusions for convenience.

6. Show both `git diff --cached` and `git status`. Confirm no protected path is
   staged or modified before presenting the step for review.

If the reverse patch conflicts, stop and report the exact paths and later commit
that appears involved. Do not auto-resolve, discard, stash, reset, or switch to a
broad checkout. Ask whether to resolve only the conflict allowed by the approved
spec or abandon the attempt. A cascade into another completed feature needs a
new rollback plan.

## Step 2 - build one step, review, iterate, checkpoint

Before the first product edit in this run, set the spec's `**Status:**` to `in
progress`. This invalidates any older verification state. Do the same whenever
implementation resumes after a passing check and changes product code again.

Work through the spec's build steps in order, one at a time. For each step:

- With `workflow.stepReview: "every"`, use the review and approval gate below
  after every step.
- With `workflow.stepReview: "feature"`, still implement, explain, and verify
  small steps, but collect them into one final review packet. Stop early for a
  failed check, a decision, a conflict, unsafe work, or scope drift. Do not make
  a checkpoint commit before the final review is approved.

1. Implement just that step: the smallest change that satisfies its "done when."
2. Show the **diff**, not whole files.
3. **Explain it, and prove it.** Give a short summary: what the step delivered,
   one line per changed file on what it does and why, then confirm the step's
   "done when" is met with evidence (build output, a screenshot, a passing
   assertion). This summary is the comprehension gate, so keep it concrete, not
   ceremonial. Include a short **How to try it** note when the step has a manual
   path: the command, URL, click, endpoint, or output the user can check.
4. **Verify the step.** If `AGENTS.md` declares a `Verify` command, run that exact
   command as the automated gate. It is only an umbrella for checks the project
   actually has, so do not invent tests or other checks to satisfy it. With
   `verification.logicTests: "required"`, a logic change without a configured
   test runner stops and points to `/tests`; `when-configured` uses the existing
   testing gate. If no
   `Verify` command exists, run the documented build command and the test command
   when the project declares one. A step that adds logic must ship a passing test
   in the same diff when the test gate is on, and the suite must be green before
   the step is approved (see the Testing gate in `coding-standards.md`). UI and
   integration-only steps ride on screenshot plus build evidence. With
   `verification.uiEvidence: "required"`, a UI done-when cannot pass on build
   output alone. Run a focused
   test separately when it gives faster feedback, then use `Verify` as the final
   automated gate. For UI or integration done-whens, prefer Playwright when it is
   already installed or declared in `AGENTS.md`; do not add it silently for an
   unrelated feature. Create focused test files next to the source they cover,
   per `coding-standards.md`. Never install a runner mid-step unless the current
   spec is explicitly the unit-testing setup itself (for example `/fix "add unit
testing"`). If a step surfaces non-trivial logic the spec did not foresee, add
   a focused test then, or note why not. Apply the regular check gate from
   `qualityGates.regular`: `manual` runs `/check` only when explicitly requested,
   `when-behavioral` runs it when a done-when needs observed runtime behavior,
   and `always` runs it for every work item. A click, download, request, CLI
   command, background job, or flow across screens is behavioral. When the gate
   runs, prove it against the real app or command rather than eyeballing it.
5. **Iterate until it works.** If it fails or the user wants changes, revise the
   step (re-prompt or hand-edit the code), show the updated diff, and re-test.
   With per-step review, repeat until the user approves. With feature review,
   repeat until the step passes self-review and hold all commit activity for the
   final approval gate.
6. **Mark it done, then prompt when required.** After the applicable gate is
   satisfied, check the step off (`- [x]`) in
   `blueprint/context/current-feature.md` so progress survives a context
   clear. If the step repaired a finding tracked in
   `blueprint/context/findings.md`, set that finding's status to `fixed` now too
   and note the repair in its **Resolution** line. Never set `closed`: a repair
   is re-reviewed by `/audit` before it clears, because a fix can introduce a
   worse defect than the one it removed. With feature review, continue to the
   next step without prompting. With
   per-step review and `workflow.checkpointCommits: "disabled"`, continue
   without offering or making
   a checkpoint commit. With `enabled`, offer a short choice, noting that
   checkpoints are optional since `/complete` makes the real feature-level
   commit. Use the current tool's short
   user-input prompt when available; when you've just produced a long block to
   read (a deep explanation, a big
   walk-through), ask in plain text instead, so the prompt doesn't cover what the
   user is still reading:
   - **Continue** (default) - roll into the next step without committing.
   - **Commit checkpoint** - commit just this step on the branch with a
     conventional message (a cheap rollback point).
   - **Walk me through it** - give a deeper, line-level explanation of the new or
     changed code (why this approach, what each part does, any gotchas), then
     re-ask this checkpoint prompt. A loop-back, not a terminal choice.
   - **Stop here** - pause the loop so the user can review or come back later.

   On **Continue** or after **Commit checkpoint**, go to the next step. On **Walk
   me through it**, explain in depth and then re-ask this prompt in plain text (the
   explanation is long, so a modal would cover it). On **Stop here**, stop and say
   where things stand: the branch is intact; run `/implement` again to resume, or
   `/complete` to wrap up what's built so far.

Never batch the whole thing into one diff. If a step's diff is too big to read,
split it. The documented `Verify` command, or the fallback build and tests, must
pass before any commit.

## Step 3 - hand off to /complete

Before handing off, check `blueprint/context/findings.md`. A P0 or P1 finding
still `open` or `fixed` there means `/complete` will refuse the merge, so close
the loop now:

- Repair each `open` P0 or P1 as an extra reviewed step. First append it to the
  spec's build steps in `current-feature.md` (`- [ ] Repair F-03 - <title>`) so
  the repair is on the record and survives a context clear, then run the same
  loop as Step 2: smallest change, diff, plain-English explanation, evidence.
  Check the step off and mark the finding `fixed` together.
- Then run `/audit` so the repairs are re-reviewed and can move to `closed`.
  A repair this skill made never closes itself.
- If the user decides a finding should not be fixed, only they can set
  `accepted` (reason recorded). A finding that looks wrong goes back to
  `/audit` to invalidate with recorded evidence; this skill never sets
  `accepted` or `invalid`.

When every step is built and `Verify`, or the fallback build and tests, passes
(committed as checkpoints or not), stop with a compact review packet:

Set the spec's `**Status:**` to `verified` immediately before that packet. This
is durable workflow evidence for `/status` and the dashboard. Do not set it when
a required command, observable done-when, or configured gate failed or could not
run.

- branch name
- what changed, grouped by file or area
- checks run, with the exact command or proof used
- how to try it manually, or a pointer to `/try`
- ledger state: any findings still `open` or `fixed`, by ID
- known risks, skipped checks, or follow-up notes
- next action, usually `/complete`

Name the effective regular audit, check, and try-guide policies in the packet so
the user knows which gates `/complete` will run automatically.

Then tell the user `/complete` makes the one work-level commit, logs it (archive,
update the build plan for a feature or rollback, reset), and merges with
approval. This skill does not touch main.

## Rules

- One small step per diff. Follow the configured review cadence, and never commit
  before its current review gate is approved.
- Explain every change in plain English. Understanding the code is the point.
- Iterate on the branch until each step works; never commit code the user hasn't
  approved.
- Follow `blueprint/context/coding-standards.md` (server vs client, scope user-owned queries
  by the authenticated user id, validate inputs, and so on).
- Build only what the spec says. If the spec is wrong or thin, stop and fix the
  spec first, do not improvise.
- Per-step commits are optional checkpoints only when enabled in project config.
  The work-level commit, the merge, and any push are `/complete`'s job.
- For Type: Rollback, reverse only the approved product diff and preserve all
  protected Blueprint paths.

## Formatting

Format the output to match the project's conventions in
`blueprint/context/ai-interaction.md`: concise, scannable markdown, with lists for
enumerations and tables for matrices rather than dense paragraphs.
