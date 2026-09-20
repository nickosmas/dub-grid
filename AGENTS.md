# AGENTS.md

Instructions for AI coding agents working in this project. This is the cross-tool
entry point: Codex, OpenCode, Cursor, GitHub Copilot, Gemini CLI, Aider, Zed,
Windsurf, and others read `AGENTS.md`. Claude Code reads `CLAUDE.md`, which imports
this file, so there is a single source of truth.

## What this is

DubGrid is a multi-tenant employee scheduling platform for care facilities.
It replaces spreadsheet scheduling with connected Next.js web and Expo mobile
apps, shared domain packages, Supabase-backed real-time collaboration, and
role-based organization access.

This project is built with the **AI Blueprint**, a workflow layer, not an
app skeleton. To start a new project, scaffold the app first in an empty folder
(create-next-app, Vite, etc.), then overlay these files on top. Never run a
framework scaffolder inside a directory that already holds the blueprint files
(`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `blueprint/`); it fails
because the directory isn't empty.

The workflow is defined by the local skills and context files below.

## Read these for full context

- `blueprint/config.json` - deterministic project workflow settings
- `blueprint/context/project-overview.md` - the project's source of truth
- `blueprint/context/coding-standards.md` - conventions to follow
- `blueprint/context/ai-interaction.md` - how to work with the user on this project
- `blueprint/context/current-feature.md` - the one feature, fix, or rollback being built right now

## Project configuration

## DubGrid Git policy

All development work happens directly on `dev`. Do not create, switch to, or
work on feature, fix, rollback, or other development branches. Do not develop
on `main`. Keep `main` for an explicitly requested release PR whose head is
`dev`; preparing that PR does not authorize a checkout, merge, rewrite, or push
of `main`.

A release PR merges only once every GitHub check on it is green: no pending,
no failing, no skipped-by-cancel. A merge authorization given before the
checks finish takes effect when they finish, and is withdrawn by any failure.
Never merge past a red or still-running check, and never merge with the
`--admin` override. This is a convention standing in for required status
checks: the repository is private on the free plan, so branch protection,
rulesets, and auto-merge are unavailable (GitHub reports 403 / leaves
`allow_auto_merge` false). Never use `gh pr merge --auto` here: with no
required checks it merges immediately (#94 merged with Playwright still
running). Watch with `gh pr checks <n> --watch --fail-fast`, confirm every
check reads pass, then `gh pr merge <n> --merge`, as the release PRs before it. If the repository
moves to GitHub Pro or becomes public, replace this paragraph with required
checks on `main` and enable auto-merge.

This governs agent sessions working in this checkout, where several share one
working tree and branches would collide. Branch-based contributions still
exist and still merge into `dev` through a pull request: Claude Code cloud
sessions push `claude/*` branches, Dependabot pushes its own, and
`CONTRIBUTING.md` documents the naming for anyone working in their own clone.

### Several agents share this checkout

Claude Code, Codex and others frequently run against this working tree at the
same time, and they share its files _and_ its git index. Two rules follow, one
for everyone and one for the sessions that can take it.

**Everyone: never leave a gap between staging and committing.** Another session
can change the index in that gap. On 2026-09-07 one did: a commit took 8 files
instead of the 13 staged, dropping five and sweeping in two unrelated ones, and
left `dev` failing to type-check. So stage exact paths rather than `-A` or `.`,
run the staging and the commit in one shell invocation, and assert the staged
file count before committing. Expect files to change under you mid-edit, and
re-read before assuming your edit is still there. When a check fails, confirm
it is yours before chasing it: `git show HEAD:<path>` reads the committed
version without touching the tree, and another session's half-written file can
fail your run.

**Terminal sessions: work in a throwaway worktree.** If nobody is watching an
editor window on this checkout, take the stronger option and isolate yourself
completely, so neither your files nor your index can be touched:

```bash
R=$(git rev-parse --show-toplevel); W=/tmp/dg-$(date +%s)
git worktree add --detach -q "$W" dev
ln -s "$R/node_modules" "$W/node_modules"
ln -s "$R/apps/web/node_modules" "$W/apps/web/node_modules"
ln -s "$R/apps/mobile/node_modules" "$W/apps/mobile/node_modules"
# edit, type-check and test inside $W
git -C "$W" add -- <exact paths> && git -C "$W" commit
git -C "$W" fetch -q origin && git -C "$W" rebase origin/dev   # commit first: rebase
git -C "$W" push origin HEAD:dev                               # refuses a dirty tree
git merge --ff-only origin/dev                  # in the repo root: keep it current
git worktree remove --force "$W" && git worktree prune
```

Do not do this from an editor-embedded agent (Cursor, Copilot, Zed, Windsurf,
the Codex and Claude Code VS Code extensions). The user is watching this
workspace, and files you change under `/tmp` are invisible to them. Nor from a
cloud session in its own container: you are already isolated and you push a
branch instead, per `CONTRIBUTING.md`. Those sessions follow the first rule
only.

`--detach` is required: git allows a branch in one worktree only, and `dev` is
already checked out at the repo root. Detaching creates no branch, so the
dev-only policy above still holds, and pushing `HEAD:dev` keeps every commit on
`dev`.

Base the worktree on local `dev` rather than `origin/dev`: other sessions
often hold unpushed commits there. Rebase onto `origin/dev` before pushing and
never force-push. A rebase conflict means another session touched the same
files, so resolve it deliberately; in the shared checkout that edit would have
overwritten your work silently.

Symlink `node_modules` per workspace and never run `npm install` inside the
worktree. Hooks run there normally, so the pre-commit and pre-push gates still
apply.

Verify a commit from inside the worktree, never from the main checkout. That
tree carries other sessions' uncommitted changes, so it can pass while the
commit on its own does not.

Fast-forward the main checkout after pushing. The Blueprint reads its state
from there, not from your worktree: `blueprint/context/current-feature.md` is
loaded into every session by `CLAUDE.md`, and `blueprint/build-plan.md` and
`blueprint/history/` drive the next step. Skipping the merge leaves the next
session working from a stale spec. Check first whether it will be refused, and
report it rather than leaving the tree behind if so:

```bash
git -C "$W" diff --name-only dev..HEAD > /tmp/mine.lst
git diff --name-only | grep -Fxf /tmp/mine.lst   # any hit blocks --ff-only
```

`blueprint/.state/run.json` is the exception: it is gitignored, so it cannot
travel through a commit at all. Write it in the main checkout, which is where
the dashboard reads it.

`blueprint/config.json` is the user-owned, machine-readable workflow policy for
this project. Workflow skills read the relevant settings before acting. A
missing file means built-in defaults. An invalid file falls back to defaults for
read-only status reporting, but mutating workflow commands stop and point to
`/doctor` instead of guessing.

Configuration can make review or verification stricter and can tune local
branch names and automated-mode limits. It never grants permission to commit,
merge, push, deploy, publish, send, delete data, waive a failing check, or accept
a finding. Those approval and safety boundaries are not configurable.

`qualityGates.regular` controls automatic audit, check, and try-guide behavior
for the normal workflow and Autopilot. `qualityGates.continuous` controls the
same per-feature gates for Continuous Mode. Every gate defaults to `manual`, so
the named skill runs only when explicitly requested. The conditional modes are
`when-sensitive` for audit, `when-behavioral` for check, and `when-user-facing`
for try guides. `always` runs the gate for every work item in that workflow.

## Workflow

Build one feature, fix, or rollback at a time, behind review gates. Each step's instructions
are plain markdown skills any capable agent can read and follow. The workflow is
exposed through tool-specific adapters:

- Codex: `.agents/skills/<skill>/SKILL.md`
- Claude Code: `.claude/skills/<skill>/SKILL.md`
- GitHub Copilot: `AGENTS.md` plus `.agents/skills/<skill>/SKILL.md`
- OpenCode: `AGENTS.md` plus the compatible `.agents/skills/` or
  `.claude/skills/` tree already installed for the selected tools

Unused adapters can be removed. Codex, GitHub Copilot, and OpenCode can share
`.agents/`. OpenCode can also reuse `.claude/` when Claude Code is selected.
Codex-only, Copilot-only, or OpenCode-only projects can delete `CLAUDE.md` and
`.claude/`. Claude Code-only projects can delete `.agents/`, but should keep
`AGENTS.md` because `CLAUDE.md` imports it. Do not duplicate the same Blueprint
skills under `.opencode/skills/`; OpenCode already discovers the compatible
trees.

When changing shared workflow behavior, update the matching skill in both
adapter folders so Codex, Claude Code, GitHub Copilot, and OpenCode stay aligned.

Core skills:

- `onboard` - tune commands, standards, visibility, ignore rules, and tool adapters after overlaying the Blueprint onto a freshly scaffolded or early project
- `discovery` - optional deep, multi-turn planning conversation that drafts the two user-owned plans only after review and approval; direct plan writing remains fully supported
- `doctor` - read-only Blueprint health check for setup, adapters, plans, overview freshness, and workflow drift
- `adopt` - bootstrap the Blueprint into an existing brownfield app with shipped features
- `overview` - distill the two planning docs into `blueprint/context/project-overview.md`
- `brief` - read-only briefing on an upcoming build-plan feature (scope, dependencies, size) before you spec it
- `feature` - turn a build-plan item into a spec, or propose a reviewed plan addition for a genuinely new feature
- `debug` - reproduce and isolate a failure without editing code, then hand the evidence to `fix` or `implement`
- `fix` - document an ad-hoc bug or change into `blueprint/context/current-feature.md`
- `tests` - add or normalize unit testing and turn on the test gate
- `ci` - explicitly set up one project-specific Verify command and matching automatic GitHub checks
- `implement` - build the current spec one small, reviewed step at a time
- `check` - prove the current spec against the running app
- `try` - read-only manual review guide: where to go, what to click, what to expect
- `audit` - branch-aware or full-project review across all concerns or a focused quality, security, performance, or tests lens; records findings with durable IDs and statuses in `blueprint/context/findings.md`, where open or fixed P0/P1 findings block `complete`
- `rollback` - plan a safe reversal of a completed feature from its archive and exact git commit, with later-dependency review before code changes
- `complete` - run the final safety pass, log features, fixes, or rollbacks under `blueprint/history/`, then merge with approval
- `release` - optional Render or Vercel deployment readiness, local config, env review, and smoke-test planning
- `prototype` - optional, pre-build static mockups to lock the look
- `status` - read-only progress summary, workflow drift warning, and suggested next action

In Codex, invoke these as skills (`$onboard`, `$discovery`, `$overview`, `$feature`,
`$implement`, and so on) or ask naturally, such as "run the overview." In Claude
Code, use the slash commands (`/onboard`, `/discovery`, `/overview`, `/feature`,
and so on). In OpenCode or other tools without a dedicated invocation syntax,
ask the agent to run the matching skill or follow its `SKILL.md` manually. The
conventions in `blueprint/context/` apply however a step is invoked. `/discovery`
is never required: users may write detailed plans directly or develop them
through any conversation before running `/overview`.

Optional explicit-only skill: `autopilot` can run one bounded spec/build pass
when directly invoked, including the configured regular quality gates. It may
create checkpoint commits on `dev` after passing steps and
repair confirmed P0/P1 findings when its audit gate runs. It stops before
`/complete`, merge, push, deploy, or destructive actions.

Optional explicit-only skill: `continuous` can resume or select the next planned
feature and repeat the complete local feature lifecycle on `dev` through the
configured limit or end of the build plan. It creates one local `dev` commit
per feature, applies the Continuous quality gates and archives work serially,
and stops on decisions or failed safety gates. It never pushes, deploys,
publishes, sends, or performs destructive actions.

Deployment is also explicit. `/release` can prepare local Render or Vercel config
and run readiness checks, but it must stop before deploy, remote service changes,
push, or publish unless the user gives a separate yes in the current chat.

## Dashboard activity

The dashboard can show the active or most recent substantial Blueprint command
from `blueprint/.state/run.json`. This file is generated local state, ignored by
Git, and never part of a feature commit.

Commands with meaningful progress or a durable handoff should write it when the
state directory exists: `onboard`, `adopt`, `discovery`, `overview`, `feature`,
`fix`, `rollback`, `implement`, `debug`, `check`, `audit`, `tests`, `ci`,
`prototype`, `autopilot`, `continuous`, `complete`, and `release`. Short
read-only orientation commands such as `brief`, `try`, `status`, and `doctor`
do not need activity state.

Writing the initial activity record is the first action of a tracked command,
before project inspection, preflight, or other tool calls. This one generated
state write does not authorize product changes or bypass any safety check. Set
status to `running`, use the command name and a truthful initial summary, then
replace the record at meaningful milestones. On a preflight stop or another
blocker, set it to `blocked` with the exact recovery command. Leave the final
state in place for the next session; the next tracked command replaces it. Use
this schema:

```json
{
  "schemaVersion": 1,
  "command": "continuous",
  "status": "running",
  "summary": "Completing the remaining build plan",
  "detail": "Implementing feature 3.",
  "boundary": "local-only",
  "startedAt": "<ISO-8601 timestamp>",
  "updatedAt": "<ISO-8601 timestamp>",
  "resumeCommand": "/continuous resume",
  "progress": { "current": 2, "total": 5, "label": "features" },
  "feature": { "id": "3", "title": "Export reports" }
}
```

`status` must be `running`, `blocked`, `ready`, or `completed`. Use `ready` when
the command reached its intended review handoff, such as Autopilot waiting for
review before `/complete`. Use `blocked` with the exact recovery command when
work can resume. `boundary` must be `read-only`, `reviewed`, or `local-only`.
The progress, feature, detail, boundary, and resume fields are optional. Never
put secrets, raw logs, prompts, or user content in this file. Activity tracking
must not change a command's approval boundaries or turn a reporting failure into
a workflow failure.

## Automatic verification

Automatic GitHub checks are a separate explicit setup. `/onboard` and `/adopt`
only report existing checks and point to `/ci` or `$ci` when none exist. Running
`/ci` inspects the real project and defines one `Verify` command from checks that
already exist. Use this order when available: typecheck, tests, then build. Never
invent a test runner or another check just to fill the command.

For JavaScript and TypeScript projects, prefer a package script such as `verify`
and use the detected package manager. For other stacks, use the native task
runner or exact combined command. Record the exact command under Commands below.

The optional `.github/workflows/verify.yml` must run that same command for pull
requests and pushes to the default branch. Preserve existing workflows, use the
project's real runtime and install command, and grant only `contents: read` by
default. This setup does not add local git hooks, coverage, browser tests,
security scans, or version matrices. Those remain later project choices.

GitHub branch protection or a ruleset can require the check after the repository
is pushed, but that is a separate remote setting. Missing automatic GitHub
checks do not make the Blueprint unusable.

## Commands

Current DubGrid commands (root, npm workspaces + Turborepo):

- Dev server (web): `npm run dev` (http://localhost:3000)
- Dev server (mobile): `npm run dev:mobile`
- Build: `npm run build`
- Production server: `npm run start`
- Lint: `npm run lint`
- Lint rule tests: `npm run lint:rules` (the custom rules under `eslint-rules/`)
- Type check: `npm run type-check`
- Test (unit/integration, all workspaces): `npm run test`
- Test (web only): `npm run test:web`
- Test (mobile + shared packages): `npm run test:mobile`
- Test (E2E, Playwright): `npm run test:e2e`

Testing is already configured (Vitest + Testing Library, Playwright for E2E),
so the testing gate described in `coding-standards.md` is on. GitHub Actions
already run CI (`ci.yml`, `e2e.yml`, `dependency-audit.yml`,
`cron-expire-requests.yml`). No single documented `Verify` command exists yet;
run `/ci` or `$ci` if you want one combined command and a matching workflow
instead of running type-check/test/build separately.
