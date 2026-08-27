---
name: status
description: "Show where the project stands: build-plan progress, the current feature's checked and unchecked steps, git state, drift warnings, and the exact next action. Read-only. Use when the user runs /status, asks where things stand, what's next, what's in progress, or is picking work back up after a break or a context clear."
---

# status - where the project stands right now

Where this sits in the workflow:

    any time  ->  [status]  ->  reads build-plan + current-feature + git
                  (read-only)   prints a short "you are here"

This skill answers one question: _where am I?_ It reads the files that already
track progress and prints a short orientation. It is the fast way back in after a
break, a context clear, or a day away. It never changes anything: no edits, no
commits, no installs, no builds, no branch changes.

Progress in this workflow lives in files, not the chat, so everything this skill
reports comes from disk and git. That is the point: a fresh session can run
`/status` and know exactly as much as the last one did.

For setup problems, missing files, placeholder plans, adapter drift, or questions
about whether the Blueprint is installed correctly, run `/doctor` instead.

## Input

None. `/status` takes no argument.

## What it reads

Gather these, then summarize. Don't dump file contents; report the distilled
state.

1. **Project configuration** - read `blueprint/config.json` when present. Report
   `project settings`, `built-in defaults`, or `invalid, using defaults`. A
   missing file is healthy and means defaults. Invalid JSON, schema versions,
   keys, values, non-file paths, or symbolic links are a warning and make
   `/doctor` the next action before any mutating workflow command. Report the
   effective regular and Continuous audit, check, and try-guide policies.
   Before recommending `/overview`, check whether `AGENTS.md` still contains
   the shipped `For a standard Next.js project` command marker. When it does,
   onboarding is incomplete and `/onboard` is the next action.
2. **Build plan** - `blueprint/build-plan.md`. Count checked vs unchecked leaf
   items. Name the next unchecked leaf, the same target `/feature` would pick,
   and note if a parent item was split into sub-items (`4a`, `4b`, ...).
3. **Current work** - `blueprint/context/current-feature.md`. Is something in
   progress, or is it the reset stub? If a feature, fix, or rollback spec is
   present, report its type and name, which build steps are checked, and the
   first unchecked step where `/implement` resumes.
4. **Findings** - `blueprint/context/findings.md`. Count findings by status and
   report open and fixed counts next to build-plan progress. Call out any P0 or
   P1 still `open` or `fixed` by ID, since those block `/complete`. A missing
   file means no findings.
5. **Overview freshness** - if `blueprint/context/project-overview.md` is missing,
   or if `project-plan.md` or `build-plan.md` appears newer than it by filesystem
   time, mention that `/overview` should run before new feature work.
6. **Git** - current branch, whether the working tree is clean or has uncommitted
   changes, roughly how many files changed, last commit subject, and whether the
   branch is ahead of its remote. If the directory is not a git repo, say so and
   skip this part rather than failing.
7. **Progress drift** - flag active spec on `main`, a spec in progress but no
   branch matching the configured feature, fix, or rollback prefix, all spec steps checked but
   not completed, or disagreement between `build-plan.md` and
   `current-feature.md`. A rollback legitimately targets a checked build-plan
   item until `/complete` unchecks it, so do not compare it to the next unchecked
   feature.
8. **Dashboard activity** - read `blueprint/.state/run.json` when it exists.
   Report the command, mode, status, progress, boundary, and safe resume command.
   A missing file simply means no activity has been recorded. Invalid activity
   state is a warning, not a blocker for the underlying workflow.

## Output

A short, scannable summary, not a wall of text. Aim for something like:

    Status: Building feature 4 - PDF export
    Config: Project settings.
    Gates: regular audit manual, check when-behavioral, try guide manual;
           Continuous audit always, check always, try guide when-user-facing.
    Plans: Overview current. Build plan 3 of 9 complete.
    Current work: Step 2 of 3 done. Next step: Download PDF button.
    Activity: /autopilot ready, 3/3 build steps, reviewed boundary.
    Findings: 1 open P2 (F-04), 1 fixed P1 awaiting re-review (F-02).
    Git: branch feature/pdf-export, 3 uncommitted files, last commit "feat: widen export helper".
    Watch: F-02 is fixed but not re-reviewed; it blocks /complete until /audit closes it.

    Next action: run /implement for Step 3.

End with a single suggested next action, chosen in this order:

- The project configuration is invalid -> `/doctor`.
- The overview is missing or stale and no feature is in progress -> `/overview`.
- A spec is in progress with unchecked steps -> `/implement` and name the step.
- A spec is in progress and all implementation steps are checked -> `/check` if
  proof is not recorded, `/try` if the user wants a manual review path,
  `/implement` when a P0 or P1 finding is still `open` (the repair is an extra
  reviewed step), `/audit` when one is `fixed` and awaiting re-review (both
  block `/complete`), otherwise `/complete`.
- `current-feature.md` is the reset stub and a P0 or P1 finding is `open` ->
  `/fix <finding id>`; when one is `fixed`, `/audit` to re-review and close it.
- `current-feature.md` is the reset stub and unchecked build-plan items remain ->
  `/feature` and name the next build-plan item.
- All build-plan items are checked -> say the current milestone is complete;
  suggest hardening, release, or docs when appropriate, or
  `/feature "new capability"` to propose an addition to the living build plan.
  Do not suggest creating a second build plan.

If something is off, include a `Watch:` line before the next action. Catching
drift is half the value of the command.

## Rules

- **Read-only, always.** This skill never writes a file, never commits, never runs
  installs, never runs builds or tests, and never switches branches. If the user
  wants to act on what it reports, they run the relevant skill next.
- **Prefer exact next actions.** Do not end with vague advice like "continue the
  workflow". Name the command and, when useful, the file or step.
- **Distill, don't dump.** Report the state in a few lines. Do not paste file
  contents back unless the user asks for them.
- **Be honest about gaps.** If a file is missing or the repo is not initialized,
  say that plainly instead of guessing.

## Formatting

Format the output to match the project's conventions in
`blueprint/context/ai-interaction.md`: concise, scannable markdown, with lists for
enumerations and tables for matrices rather than dense paragraphs.
