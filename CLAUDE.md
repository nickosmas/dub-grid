# Workflow & Behavioral Rules

---

## 1. Plan Before Building

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

---

## 2. Subagent Strategy

- Use subagents to keep the main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One focused task per subagent — but related questions can share one explore agent

---

## 3. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

---

## 4. Simplicity First (with Taste)

- Make every change as simple as possible. Impact minimal code
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky and the code is read/maintained frequently, implement the clean solution
- For simple, obvious fixes — don't over-engineer. Simplicity wins by default
- Challenge your own work before presenting it

---

## 5. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## 6. Core Principles

- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs
- **Self-Improvement**: After corrections that reveal a pattern or misunderstanding,
  record the lesson in memory files for future sessions

---

## 7. Project-Specific Constraints

- **Monorepo**: npm workspaces + Turborepo. The web app lives in `apps/web`, the Expo
  mobile app in `apps/mobile`, and shared logic in 10 `packages/*` workspaces. Keep
  `packages/*` platform-neutral — no Next.js, Expo, React Native, DOM, or Node-only
  imports. A shared-package change affects both apps; verify both
- **Migrations**: All schema lives in exactly 4 files (001-004). NEVER create new migration files
- **Routes**: All routes must be simple (`apps/web/src/app/people/page.tsx`), NOT catch-all.
  Catch-all routes break static prerendering on Vercel
- **Naming**: `gridmaster` = platform_role (route: `/gridmaster`). `admin` = org_role.
  Never call the gridmaster portal "admin portal"
- **Tenant terminology**: The customer tenant is an **"Organization"** in ALL user-facing
  copy (web + mobile, authed + public). Do NOT use "workspace" in copy. In code it's the
  `org`/`organization` convention: DB `organizations` + `org_*` columns, JWT `org_*` claims,
  `x-dubgrid-org-*` headers, TS `Organization` types + short `orgId`/`orgSlug` vars/fields.
  The URL identifier is the **"subdomain"** in user-facing copy (e.g. "Enter your subdomain"),
  which equals `organizations.slug` (`org_slug`); never call it a "domain" in copy. Two
  deliberate exceptions keep "workspace": the DB column `organizations.workspace_kind`
  (+ its `WorkspaceKind`/`workspaceKind` TS mapping — the real-vs-sandbox flavor; renaming
  needs a migration) and the marketing landing line. The generic word for a UI area
  (e.g. "the People section") is not the tenant — reword, don't call it "organization".
- **No decorative "AI" iconography** anywhere in either app. The four-point sparkle
  (Ionicons `sparkles*`, lucide `Sparkle`/`Sparkles`/`Wand*`, the ✨ and 🪄 emoji)
  reads as "AI feature" and makes the product look generated rather than designed.
  Nothing here is AI-powered, so an icon must name what it stands for. Enforced by
  `design/no-decorative-ai-icons` (`eslint-rules/no-decorative-ai-icons.mjs`).
  Stars and the word "magic" are fine — a star is a real favorite affordance, and
  `MagicLinkEmail` is the standard Supabase term for passwordless sign-in
- **Testing**: Run `npm test` (vitest) after changes. Tests use jsdom + Testing Library
- **`next build` catches what nothing else does.** A directive like
  `"use client"` stops being one the moment anything precedes it — the file
  still type-checks and still passes vitest, and only the production build
  rejects it. The pre-push hook runs type-check and tests, not the build, so
  run `npx next build` in `apps/web` after any codemod that touches the top of
  files. `design/no-misplaced-use-client` guards that specific failure cheaply,
  but it is not a substitute for the build
- **Cookie consent version**: When adding/removing cookies, changing analytics providers,
  or updating the cookie/privacy policy, bump `CONSENT_VERSION` in
  `apps/web/src/components/CookieConsent.tsx`. This re-prompts all users to re-consent on next visit

---

## 8. Design-System Conventions (Web)

> Mobile has its own system — see **Section 9** below. The `dg-*` classes here
> are web-only and have no mobile equivalent.

Buttons are unified on **`dg-btn-*`** everywhere — the authenticated app, the
public auth flows (login, forgot-password, reset-password, accept-invite,
verify-email), and the landing page all use `<button className="dg-btn dg-btn-primary">`
/ `dg-btn-secondary` / etc. There is no separate auth-only button class; the old
`dg-auth-submit` pill was retired in favor of this.

Inputs/labels still have two parallel vocabularies by design — they are not
interchangeable:

- **`dg-input` / `dg-label` / `dg-form-error`** — used everywhere inside the
  authenticated app (settings, profile, schedule, people, dashboard, reports).
  Form fields should always use `<input className="dg-input" />` plus
  `<label className="dg-label" />`; never re-derive these via inline styles or
  bespoke Tailwind chains.

- **`dg-auth-input` / `dg-auth-link` / `dg-auth-heading`** — used only by the
  public auth flows listed above. They render at a larger size for the auth
  card and pair with the `<PageShell>` / `<Card>` primitives in
  `components/auth/AuthCard.tsx`. These stay auth-specific; only the button
  class converged.

Shared primitives to reach for before inventing a layout:

- `<PageContainer>` — canonical authed-page wrapper (responsive padding +
  centered max-width). Skip it for pages that own their full viewport (the
  schedule grid) or that intentionally go full-width (reports tables).
- `<Switch>` — replaces hand-rolled 44×24 toggle buttons.
- `<ButtonLoading>` (`components/ButtonSpinner.tsx`) — the only loading-button
  treatment. A busy button shows **a spinner and its label**, with the label in
  the progressive form of its own verb and no ellipsis (`[spinner] Saving`, not
  `Saving…` and not a spinner with the label hidden), so it still says which
  action is running. `loadingLabel` is required for that reason; a button with a
  leading icon passes it as `icon={...}` and the spinner takes its place.
  `<ConfirmDialog>` takes the same wording as `confirmPendingLabel`.
- **`useAsyncAction`** (`hooks/useAsyncAction.ts`) — how an async button stops
  double-executing. A `useState` busy flag is not enough on its own: it only
  reaches the DOM after React re-renders, and a second click lands inside that
  window and sails past a `disabled` that has not applied yet. This hook's
  latch is a **ref**, checked synchronously on the first click, so the second
  is already too late; its `isRunning` only drives the spinner. It is a no-op
  for a synchronous handler, so wrapping a plain click costs nothing.
  `<ConfirmDialog>` already wraps `onConfirm` in it — a dialog whose handler
  is async is covered with no flag threaded, and `isLoading` is only for a
  pending state that lives outside the dialog. Elsewhere:
  `const save = useAsyncAction(handleSave)`, then `onClick={save.run}` +
  `disabled={save.isRunning}` + `<ButtonLoading loading={save.isRunning}>`.
  Enforced by `design/require-busy-button`
  (`eslint-rules/require-busy-button.mjs`).
- **`<Button>`** (`components/Button.tsx`) and **`<Form>`**
  (`components/Form.tsx`) — a `<button>` and a `<form>` that carry the latch,
  and the spinner too. **A running latch spins on its own** — no button can
  sit there looking dead during a slow request, and nothing has to be
  remembered per call site. That default is load-bearing: most handlers arrive
  as props typed `=> void` (`onConfirmDraft`, `onBulk`, `onSync`), where
  nothing local tells you whether the work is async, so an opt-in spinner gets
  missed. `loadingLabel` upgrades the wording to the same verb in progress
  (`[spinner] Confirming`, not `[spinner] Confirm`) and is always worth adding.
  `loading` feeds the same spinner from a pending flag living outside the
  button (a mutation's `isPending`, a confirmation step that finishes later).
  `spinner={false}` opts out, for a button whose children are a whole row of
  content — `NotificationBell`'s row, `OrganizationLocationFields`' address
  option — where a spinner beside the text reads as breakage. A button that
  already wires its own `<ButtonLoading>` needs no opt-out: `<Button>` looks
  through its children and defers to a spinner that is actually spinning, so
  the hand-wired one stays the only one. That check reads the child's `loading`
  prop rather than just spotting the element, because a flag covering a shorter
  span than the latch would otherwise leave the button showing nothing. Never write `{busy ? "…" : "Delete"}` — that is the
  banned ellipsis, and `loadingLabel="Deleting"` is the replacement. Mobile's
  `<Button>` works the same way (`Boolean(loading) || action.isRunning`).
  Both are plain passthroughs (same `className`, same children, same
  attributes), so a call site becomes safe by changing only the tag name,
  keeping whatever `<ButtonLoading>` and `disabled` it already had.
  **Every `<button onClick>` and every `<form onSubmit>` in `apps/web` uses
  them** — do not reach for a raw `<button>`/`<form>` with a handler, even one
  that looks synchronous today. `<Form>` is not redundant with `<Button>`: a
  `type="submit"` button has no `onClick`, so the work starts from the form's
  own submit event and only `<Form>` can hold it. The two raw `<button>`s left
  are `Button.tsx` itself and the sidebar rail's pure toggle.
  On mobile the same job is done by `shared/components/Pressable.tsx`, a
  drop-in for React Native's `Pressable` — **swap the import, not the call
  sites**. It is not usable with `Animated.createAnimatedComponent`, which
  needs RN's own component; those wrappers latch the `onPress` they receive
  instead (`Chip`, `SearchBar`, `ExpandButton`, `AppearanceSheet`,
  `PeopleScreen`'s `AddPersonButton`).
- **A handler must _return_ its promise**, or none of the above works. The
  latch holds for exactly as long as the promise it is handed, so
  `onConfirm={() => { setOpen(false); handlePublish(); }}` releases on the
  next microtask and the second press publishes again — the button looks
  guarded, `disabled={isPublishing}` and all, and is not. Write
  `return handlePublish()`, or make the handler `async`. Never fire the work
  into a `void` call the primitive cannot await. Enforced by
  `design/no-floating-async-handler`
  (`eslint-rules/no-floating-async-handler.mjs`). The same rule applies on
  mobile, where `<Button>`/`<ConfirmationModal>`/`<PressableRow>` latch the
  same way; a React Query mutation returns its promise from `mutateAsync`,
  not `mutate`.
- **A handler prop typed `=> void` hides all of this.** `onConfirmDraft?:
(scope?: SeriesScope) => void` was wired to an `async` handler, so nothing
  in the type said the promise mattered, and the Confirm button that created a
  shift ran twice. Type a handler prop `=> unknown` (or `=> void |
Promise<unknown>`) whenever a caller might hand it async work, and never
  conclude a button is safe because its prop type says `void`.
- `<EditorActionRow>` — dirty-state save/discard footer used by every
  settings panel; the primary button always sits on the right.
- `<SectionCard>` (`components/settings/shared.tsx`) — bordered/padded card
  for single-section settings panels.
- `<EmptyState>` — the only empty-state primitive. Use the `size` prop:
  `"default"` for full-page/hero empties, `"compact"` for cards and settings
  panels, `"inline"` for tight dashboard tiles. Never hand-roll an empty
  state with raw divs or a parallel component (the old `DashboardEmptyState`
  fork was removed in favor of `size="inline"` / `size="compact"`).
- `<ConfirmDialog>` — destructive-action confirmation (Cancel left, primary
  right, danger-filled by default). `<Modal>` is for info dialogs only.
- `<ErrorBoundary>` and `<NotFoundBoundary>` (`components/RouteBoundary.tsx`)
  — every segment `error.tsx` and `not-found.tsx` should delegate to these
  rather than re-render the chrome.
- **Unsaved input is never discarded silently**, by one of two guards. A modal
  wires `useUnsavedChangesPrompt`'s `requestClose` into `<Modal onRequestClose>`
  (the single veto for Escape, backdrop and X). A page-level editor calls
  `useNavigationGuard(id, { isDirty })`, which asks before an in-app link click
  and before tab close. Never hand-roll a `beforeunload` — `NavigationGuardProvider`
  owns it, and a second one prompts twice. Full detail in `apps/web/AGENTS.md`.

---

## 9. Design-System Conventions (Mobile)

Tokens live in `packages/design-tokens` with a `mobile*` prefix and reach screens
through `apps/mobile/src/shared/theme/tokens.ts`. That adapter is the only import
path. **The package is shared with the web app** — add `mobile*` groups, never
change existing tokens.

Reach for the shared primitive before inventing one:

- **`<AppText variant tone>`** — all text. Carries a theme-correct color, so no
  screen re-specifies it.
- **`<Button>`** — all buttons. Solid fill, zero border, pill, sizes
  `sm`/`md`/`lg`, plus `iconOnly`. Every tone is solid; do not add borders back.
  `loading` renders a spinner **beside** the label, never over it, and swaps the
  label to `loadingLabel` — the same verb in progress ("Saving", not "Save"), no
  ellipsis. `<ConfirmationModal>` takes it as `confirmPendingLabel`. A
  `disabled` that repeats the loading condition is redundant; `loading` already
  disables. An **`onPress` returning a promise needs no `loading` at all**:
  `<Button>` awaits it and spins on its own, so pass `loading` only when the
  pending flag lives outside the button. Do pass `loadingLabel` — enforced by
  `design/require-busy-button`.
- **`useAsyncAction()`** (`shared/hooks/useAsyncAction.ts`) is what makes that
  work, and is how any press stops double-executing. A `useState` busy flag is
  not enough on its own: it only disables the pressable after React
  re-renders, and a second tap lands inside that window. The latch is a
  **ref**, checked synchronously on the first press, so the second is already
  too late. `<Button>`, `<PressableRow>` and `<ConfirmationModal>` all wrap
  their handler in it, so a screen usually needs nothing beyond returning its
  promise instead of firing it into a `void` call the primitive can't await.
- **`<PressableRow>`** for pressable list rows, **`usePressAnimation()`** for
  anything else pressable. iOS scales on press, Android gets a ripple and **no**
  scale — its ripple is already the state layer.
- **`<Chip>`**, **`<SegmentedControl>`**, **`<ScrollableTabStrip>`**,
  **`<GradientBackdrop>`**, **`<AnimatedListItem>`**, **`<Collapsible>`**,
  **`<BottomSheetModal>`** (its `header` slot renders in the drag region).
- **`<BottomSheetModal>` is the only modal design** — there is no full-screen
  modal, no centred alert card and no ✕ close button. Titles go in the `header`
  slot via **`<SheetHeader>`**; stacked actions go in **`<SheetActions>`**,
  primary first; confirmations use **`<ConfirmationModal>`**. A sheet holding
  unsaved input routes `onDismiss` into a discard confirmation rather than
  closing. Every sheet keeps its grabber and moves when dragged, blocking ones
  included: they resist and settle back instead of refusing to move, and an
  upward drag resists on every sheet. Never size anything inside a `<Modal>`
  from window metrics.
- **`useUnsavedChangesGuard()`** is that discard confirmation, and the only
  implementation of it — never hand-roll a `hasUnsavedChanges` +
  `showDiscardConfirmation` + `close()` triad. A sheet points both `onDismiss`
  and its Cancel button at `guard.requestClose`; a screen with an inline editor
  adds **`useNavigationDiscardGuard(guard)`** so header back, Android back and
  the iOS back swipe ask through that same one confirmation. Keep `isDirty`
  tight (`editing && hasChanges`), compute dirtiness once at module scope, and
  never route a Cancel that navigates through `onClose` — it re-enters the guard
  and asks twice.
- **`<AuthShell>` / `<AuthField>`** — every public auth screen.
- **`<EmptyStateCard>`** for every empty state. Always **centred**, and the icon
  badge is always a **circle** — the rounded square stays the card _header's_
  shape (`cardIconFrame`). A full-page empty gets a 60pt `brandSoft`/`brandBorder`
  badge with a brand glyph; inside a card it is a 48pt badge in the card's own
  `surface`, lifted with `mobileElevation("raised")` and carrying a muted glyph.
  `iconName` is **required** — it used to default to `sparkles-outline`, which is
  how the AI sparkle reached every screen that forgot one. `compact` renders
  inside a card or `ProfileSection` and wraps itself in a `surfaceSecondary`
  panel; that panel is load-bearing, since centred copy loose under a card's
  left-aligned header reads as misaligned. Full-page variants own the viewport and
  take no panel. `actionVariant="link"` gives the action a trailing arrow instead
  of a filled pill, for an empty state pointing at a fuller view of the same thing.
- **`shared/components/skeleton`** primitives (`SkeletonBlock`, `SkeletonLine`,
  `SkeletonCardSurface`, `SkeletonGroup`) for loading placeholders. Skeletons
  are per screen and colocated with it, and they **reuse that screen's own
  style objects** rather than restating its numbers. One skeleton per screen,
  shown once: fold every query the first paint needs into that screen's single
  `useMobileContentState` and render on `showSkeleton`. Whatever appears in
  `isLoading` must appear in `hasData` too, or the gate clears with that
  query's data still missing and the screen paints a wrong terminal state
  ("Person not found") for a frame. Never branch on a raw `isLoading`, never
  nest a skeleton inside a section (a second wave after the first clears), and
  never let a render branch depend on state synced in an effect.
- **`mobileElevation(level, isDark)`** for shadows; there is no other shadow
  vocabulary. Cards are borderless in light mode and keep the hairline in dark.
- **`useMotionPreference()`** for every duration, spring and easing. Its `d()`
  returns 0 under OS reduce-motion, which is what makes that setting apply
  app-wide from one place. Never hardcode a duration.

Two rules that are easy to get wrong and silent when you do:

- **Weight is carried by `fontFamily`, never by `fontWeight`.** DM Sans loads as
  four single-weight files registered one family name each, so a style that
  names both (`DMSans_700Bold` + `fontWeight: "700"`) makes Android hunt for a
  bold face that family hasn't got and fall back to Roboto, while iOS renders it
  correctly — and a bare `fontWeight` with no family is Roboto everywhere. Use a
  `mobileText` token, `mobileTextWeighted(variant, weight)`, or
  `mobileTypography.fontFamily.*`. `<TextInput>` is the one exception.
- **`expo-blur` is iOS-only**, and Android `elevation` needs an opaque
  background and reorders sibling z order.
- **Never put `flex: 1` on a child of an auto-width row.** Yoga collapses it to
  zero width and the control renders empty; measure with `onLayout` instead.
- **Soft control fills use `controlNeutralBg`/`controlSecondaryBg`**, not the
  shared `surfaceSecondary`/`brandSoft`, which are invisible against the page.

Password strength and match rules are shared with web via
`@dubgrid/domain` — never re-derive them per app.

Full detail, including the test-harness traps, lives in `apps/mobile/AGENTS.md`.

---

---

# React Best Practices

## State & Derived Values

Prefer computing values directly in the render function over storing them in state.
If a value can be calculated from existing props or state, do not create a separate
state variable for it.

```tsx
// ❌ Unnecessary state
const [fullName, setFullName] = useState("");
useEffect(() => setFullName(`${first} ${last}`), [first, last]);

// ✅ Derived inline
const fullName = `${first} ${last}`;
```

For expensive derivations, use `useMemo` — not `useEffect` + `useState`.

---

## useEffect: When to Use It

Only use `useEffect` to synchronize with something **external** to React:

- Browser APIs (timers, event listeners, IntersectionObserver, ResizeObserver)
- WebSockets or EventEmitters
- Third-party library initialization (maps, charts, players)
- Network requests (though prefer React Query / SWR for data fetching)

**Do not use `useEffect` to:**

- Sync one state variable to another
- Transform or filter data from props
- Respond to user events (use event handlers instead)
- Reset state when a prop changes (use a `key` prop or inline check instead)

---

## Responding to Events

Derived logic that runs because of a user interaction belongs in the **event handler**,
not in an effect.

```tsx
// ❌ Roundabout
const [submitted, setSubmitted] = useState(false);
useEffect(() => {
  if (submitted) sendToApi(data);
}, [submitted]);

// ✅ Direct
function handleSubmit() {
  sendToApi(data);
}
```

---

## Resetting or Adjusting State on Prop Change

If a component needs to reset when a prop changes, pass a `key` — don't use an effect.

```tsx
// ✅ Forces fresh mount when userId changes
<UserProfile key={userId} userId={userId} />
```

If only part of the state needs to change based on a prop, compute it inline or use
the `[prev, setPrev]` pattern to detect changes during render — not in an effect.

---

## Data Fetching

Use React Query, SWR, or your framework's built-in loader (Next.js `loader`, Remix
`loader`) for server data. Avoid raw `useEffect` + `fetch` patterns — they don't
handle race conditions, caching, or loading/error states well.

---

## Memoization

Apply `useMemo` and `useCallback` intentionally, not by default.

Use them when:

- A computation is provably expensive and re-runs frequently
- A callback is passed as a prop to a memoized child (`React.memo`)
- A value is used as a dependency of another hook and causes excessive re-renders

Do not wrap every value or function — it adds overhead and obscures intent.

---

## Component Patterns

- Prefer **composition** over deeply nested props or prop-drilling
- Use **controlled components** for forms
- Keep components focused: if a component does too many things, split it
- Avoid anonymous components inline — name everything for readable DevTools traces

---

## Keys

Always use stable, unique keys in lists — never array index unless the list is
static and never reordered.

```tsx
// ❌
items.map((item, i) => <Row key={i} item={item} />);

// ✅
items.map((item) => <Row key={item.id} item={item} />);
```

---

---

# Next.js Best Practices

---

## Server vs Client Components

Default to **Server Components**. Only add `'use client'` when the component
requires browser APIs, event handlers, or React hooks (useState, useEffect, etc.).

```tsx
// ❌ Unnecessary client component
"use client";
export default function UserCard({ name }: { name: string }) {
  return <div>{name}</div>;
}

// ✅ Server component — no directive needed
export default function UserCard({ name }: { name: string }) {
  return <div>{name}</div>;
}
```

Push `'use client'` to the **leaves** of the component tree. Keep data fetching,
auth checks, and DB queries in Server Components.

---

## Data Fetching

Fetch data directly in Server Components — do not use `useEffect` + `fetch` for
server data. Use `async/await` at the component level.

```tsx
// ✅ Fetch in a Server Component
export default async function Page() {
  const data = await db.query(...);
  return <List items={data} />;
}
```

For client-side data fetching (user-specific, real-time, or post-interaction),
use **React Query** or **SWR** — not raw `useEffect` + `fetch`.

Avoid prop-drilling fetched data through many layers. Fetch as close to where
the data is used as possible — Next.js deduplicates `fetch` calls automatically.

---

## Caching & Revalidation

Understand the four caching layers in Next.js (Request Memoization, Data Cache,
Full Route Cache, Router Cache) and opt out deliberately, not by default.

```tsx
// Cache indefinitely (default for fetch)
fetch(url);

// Revalidate every 60 seconds
fetch(url, { next: { revalidate: 60 } });

// No cache — always fresh
fetch(url, { cache: "no-store" });
```

Use `revalidatePath` or `revalidateTag` in Route Handlers after mutations instead
of disabling caching globally.

---

## Route Handlers (API Routes)

This codebase uses Route Handlers (`app/api/.../route.ts`) for **all** mutations
and data access — internal and external alike. There are no Server Actions
anywhere in `apps/web` (no `'use server'` directives); every write goes through
a typed Route Handler, called from the client via the feature's `client/api.ts`
adapter (React Query mutations) rather than a `<form action={...}>`.

```ts
// app/api/webhook/route.ts
export async function POST(req: Request) {
  const body = await req.json();
  // validate signature, process event...
  return Response.json({ received: true });
}
```

Validate and sanitize all inputs inside Route Handlers. Never trust raw request
bodies. Use Zod or a similar schema library.

---

## Routing & Layouts

- Use **layout.tsx** for UI shared across routes (nav, shell, providers)
- Use **loading.tsx** for Suspense-based loading states per segment
- Use **error.tsx** for error boundaries per segment
- Use **not-found.tsx** for 404 handling per segment

Keep layouts lean. Don't fetch data in a root layout that only a subset of
routes need — fetch it in the specific page or nested layout instead.

---

## Metadata

Define metadata using the `metadata` export or `generateMetadata` function —
never via `<Head>` tags (pages router pattern).

```tsx
// Static
export const metadata: Metadata = {
  title: "My App",
  description: "...",
};

// Dynamic
export async function generateMetadata({ params }): Promise<Metadata> {
  const item = await getItem(params.id);
  return { title: item.name };
}
```

---

## Environment Variables

- `NEXT_PUBLIC_` prefix exposes variables to the browser — use this only for
  non-sensitive config (e.g. public API URLs, analytics IDs)
- All other env vars are server-only — never reference them in Client Components
- Validate all env vars at startup with a schema (e.g. `zod` + `@t3-oss/env-nextjs`)

---

## Images

Always use `next/image` for images. Never use a raw `<img>` tag for content images.

```tsx
import Image from "next/image";
<Image src="/hero.jpg" alt="Hero" width={1200} height={600} priority />;
```

Set `priority` on above-the-fold images. Provide explicit `width` and `height`
to prevent layout shift.

---

## Fonts

Use `next/font` to load fonts — never link Google Fonts via `<link>` tags.

```tsx
import { Geist } from "next/font/google";
const geist = Geist({ subsets: ["latin"] });
```

This eliminates external network requests and prevents layout shift.

---

## Navigation

Use `next/link` for all internal navigation — never `<a href>`.
Use `next/navigation`'s `useRouter` for programmatic navigation in Client Components.

```tsx
// ✅
import Link from "next/link";
<Link href="/dashboard">Dashboard</Link>;

// ✅ Programmatic
import { useRouter } from "next/navigation";
const router = useRouter();
router.push("/dashboard");
```

---

## Middleware

Use `apps/web/src/middleware.ts` for cross-cutting concerns that must run on every request:
auth guards, redirects, locale detection, A/B flags.

Keep middleware fast and dependency-light — it runs on the Edge runtime.
Never import heavy Node.js modules or ORMs into middleware.

---

## Performance

- Lazy-load heavy Client Components with `dynamic()` and `ssr: false` when they
  use browser-only APIs or aren't needed on initial render
- Use `Suspense` boundaries to stream in slow data without blocking the whole page
- Avoid `export const dynamic = 'force-dynamic'` unless truly necessary — it opts
  the entire route out of static rendering

```tsx
const HeavyChart = dynamic(() => import("./HeavyChart"), { ssr: false });
```

---

## File & Folder Conventions

```
app/
  layout.tsx         # Root layout
  page.tsx           # Route page
  loading.tsx        # Loading UI
  error.tsx          # Error boundary
  not-found.tsx      # 404
  [param]/           # Dynamic segment (never catch-all — see Routes above)
  <route>/
    <Route>PageContent.tsx  # Route's client component, flat next to page.tsx
    _components/           # Escape hatch when a route needs multiple
                            # co-located pieces (rare — used by schedule/ today)
  api/**/route.ts    # Route Handlers — the only mutation pattern (see below)

features/<domain>/   # Dominant organizational unit: hooks, client API
  client/             adapters (React Query), and (for a handful of
  server/              domains — mobile, notifications, account,
                        permissions) server-side logic, grouped per
                        business domain rather than per route

lib/                # Flat shared utilities, db client, helpers
types/               # Shared TypeScript types (apps/web/src/types/index.ts)
```

Most routes put their client component directly in the route directory as a
single flat file (e.g. `app/people/PeoplePageContent.tsx`) rather than a
`_components/` folder — reserve `_components/` for routes that genuinely need
multiple co-located, non-routable pieces. Prefix folders with `_` to co-locate
without making them routable. Route groups `(name)` are available for sharing
layouts without affecting URLs but aren't currently used.

Business logic, hooks, and client API wrappers belong in
`features/<domain>/`, not scattered under `app/`. This is the primary
organizational layer for anything beyond a route's own presentation.

---

---

# Security Best Practices

---

## Input Validation & Sanitization

Validate ALL inputs at the server boundary — Server Actions, Route Handlers,
and middleware. Never trust the client. Use Zod for schema validation.

```ts
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["admin", "member"]),
});

async function createUser(formData: FormData) {
  "use server";
  const result = schema.safeParse(Object.fromEntries(formData));
  if (!result.success) throw new Error("Invalid input");
  // proceed with result.data
}
```

Never pass raw user input to database queries, shell commands, or file paths.

---

## Authentication & Authorization

- Never implement auth from scratch — use an established library (Clerk, Auth.js,
  Better Auth, Supabase Auth)
- Check authentication **and** authorization on every Server Action and Route Handler —
  not just in middleware
- Never rely on the client to determine what a user is allowed to see or do
- Treat middleware as a first filter, not the sole auth gate

```ts
// ✅ Check auth inside the action, not just at the route level
async function deletePost(id: string) {
  "use server";
  const session = await getSession();
  if (!session) throw new Error("Unauthenticated");
  const post = await db.posts.findById(id);
  if (post.authorId !== session.user.id) throw new Error("Unauthorized");
  await db.posts.delete(id);
}
```

---

## Secrets & Environment Variables

- Never hardcode secrets, API keys, or credentials in source code
- Never expose server secrets to the client — do not prefix them with `NEXT_PUBLIC_`
- Validate all required env vars at startup (e.g. `@t3-oss/env-nextjs` + Zod)
- Rotate secrets immediately if they are ever committed to version control
- Use separate secret values per environment (dev / staging / production)

```ts
// env.ts — validates on startup, throws if misconfigured
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  runtimeEnv: process.env,
});
```

---

## SQL Injection & Database Safety

Always use parameterized queries or a query builder / ORM. Never interpolate
user input directly into query strings.

```ts
// ❌ Vulnerable
const user = await db.query(`SELECT * FROM users WHERE id = '${id}'`);

// ✅ Parameterized
const user = await db.query("SELECT * FROM users WHERE id = $1", [id]);

// ✅ ORM
const user = await prisma.user.findUnique({ where: { id } });
```

---

## Cross-Site Scripting (XSS)

React escapes JSX output by default. Never bypass this:

- Do not use `dangerouslySetInnerHTML` unless absolutely necessary, and always
  sanitize the input with DOMPurify first
- Never insert raw user content into `<script>` tags or event handler attributes
- Set a strict Content Security Policy (CSP) header

```ts
// apps/web/next.config.ts
const cspHeader = `
  default-src 'self';
  script-src 'self' 'nonce-{NONCE}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  connect-src 'self';
  frame-ancestors 'none';
`;
```

Use nonce-based CSP with middleware for dynamic pages.

---

## Cross-Site Request Forgery (CSRF)

Next.js Server Actions include built-in CSRF protection via origin checking.
For Route Handlers that mutate state, validate the `Origin` header or use
a CSRF token library.

- Do not expose mutation endpoints as plain GET handlers
- Do not disable the built-in CSRF protections in Server Actions

---

## Security Headers

Set security headers in `apps/web/next.config.ts` for every response:

```ts
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

export default {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
```

---

## Rate Limiting

Apply rate limiting to all public-facing Route Handlers and Server Actions,
especially auth endpoints, contact forms, and anything that sends email or
triggers side effects. Use Upstash Rate Limit, or equivalent.

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  const { success } = await ratelimit.limit(ip);
  if (!success) return new Response("Too many requests", { status: 429 });
  // ...
}
```

---

## File Uploads

- Validate file type by inspecting magic bytes, not just the extension or MIME
  type provided by the client
- Enforce file size limits before processing
- Never store uploaded files in a publicly accessible path without access control
- Scan uploads for malware if they are user-generated content
- Use a dedicated service (S3, Cloudflare R2, Uploadthing) rather than saving
  files to the server filesystem

---

## Dependency Security

- Run `npm audit` regularly and address high/critical findings
- Pin dependency versions in production; use lockfiles (`package-lock.json` /
  `yarn.lock`) and commit them
- Review new dependencies before installing — check download counts, last publish
  date, and whether the package has a known owner
- Use Dependabot or Renovate to automate dependency update PRs

---

## Error Handling & Information Leakage

Never expose stack traces, internal paths, database errors, or system information
to the client.

```ts
// ❌ Leaks implementation details
return Response.json({ error: err.message }, { status: 500 });

// ✅ Generic client message, full error logged server-side
console.error(err);
return Response.json({ error: "Something went wrong" }, { status: 500 });
```

Use `error.tsx` boundaries to show safe fallback UI. Log full errors to a
server-side observability tool (Sentry, Axiom, Datadog).

---

## Sensitive Data Handling

- Never log passwords, tokens, SSNs, payment details, or PII
- Never return full user objects from queries — select only the fields needed
- Mask sensitive values in logs (e.g. show only last 4 digits of a card)
- Store passwords only as salted hashes (bcrypt, Argon2) — never plaintext
- Encrypt sensitive fields at rest if your auth library doesn't handle it

---

## Third-Party Scripts

Load third-party scripts with `next/script` using an appropriate `strategy`.
Audit what data each script sends and whether it needs access to the full page.
Prefer `strategy="lazyOnload"` for non-critical analytics/marketing scripts.

```tsx
import Script from "next/script";
<Script src="https://analytics.example.com/script.js" strategy="lazyOnload" />;
```

Never paste raw third-party `<script>` tags into layouts — they bypass CSP
nonces and can't be controlled by Next.js.
