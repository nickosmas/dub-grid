# React Best Practices

## State & Derived Values

Prefer computing values directly in the render function over storing them in state.
If a value can be calculated from existing props or state, do not create a separate
state variable for it.

```tsx
// ❌ Unnecessary state
const [fullName, setFullName] = useState('');
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
useEffect(() => { if (submitted) sendToApi(data); }, [submitted]);

// ✅ Direct
function handleSubmit() { sendToApi(data); }
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
items.map((item, i) => <Row key={i} item={item} />)

// ✅
items.map(item => <Row key={item.id} item={item} />)
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
'use client';
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
fetch(url, { cache: 'no-store' });
```

Use `revalidatePath` or `revalidateTag` in Server Actions after mutations instead
of disabling caching globally.

---

## Server Actions

Use Server Actions for form submissions and data mutations — not API routes.

```tsx
// ✅ Server Action
async function createItem(formData: FormData) {
  'use server';
  await db.insert({ name: formData.get('name') });
  revalidatePath('/items');
}

export default function Form() {
  return <form action={createItem}><button type="submit">Add</button></form>;
}
```

Validate and sanitize all inputs inside Server Actions. Never trust raw FormData.
Use Zod or a similar schema library.

---

## Route Handlers (API Routes)

Use Route Handlers (`app/api/.../route.ts`) only when you need a public HTTP
endpoint — e.g. webhooks, third-party callbacks, or a REST API consumed externally.

For internal data mutations, prefer Server Actions. For internal data reads,
fetch directly in Server Components.

```ts
// app/api/webhook/route.ts
export async function POST(req: Request) {
  const body = await req.json();
  // validate signature, process event...
  return Response.json({ received: true });
}
```

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
  title: 'My App',
  description: '...',
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
import Image from 'next/image';
<Image src="/hero.jpg" alt="Hero" width={1200} height={600} priority />
```

Set `priority` on above-the-fold images. Provide explicit `width` and `height`
to prevent layout shift.

---

## Fonts

Use `next/font` to load fonts — never link Google Fonts via `<link>` tags.

```tsx
import { Geist } from 'next/font/google';
const geist = Geist({ subsets: ['latin'] });
```

This eliminates external network requests and prevents layout shift.

---

## Navigation

Use `next/link` for all internal navigation — never `<a href>`.
Use `next/navigation`'s `useRouter` for programmatic navigation in Client Components.

```tsx
// ✅
import Link from 'next/link';
<Link href="/dashboard">Dashboard</Link>

// ✅ Programmatic
import { useRouter } from 'next/navigation';
const router = useRouter();
router.push('/dashboard');
```

---

## Middleware

Use `middleware.ts` for cross-cutting concerns that must run on every request:
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
const HeavyChart = dynamic(() => import('./HeavyChart'), { ssr: false });
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
  (groups)/          # Route groups — no URL segment
  [param]/           # Dynamic segment
  _components/       # Co-located, non-routable components
  actions/           # Server Actions
  lib/               # Utilities, db client, helpers
  types/             # Shared TypeScript types
```

Prefix folders with `_` to co-locate components next to routes without making
them routable. Use route groups `(name)` to share layouts without affecting URLs.

---
---

# Security Best Practices

---

## Input Validation & Sanitization

Validate ALL inputs at the server boundary — Server Actions, Route Handlers,
and middleware. Never trust the client. Use Zod for schema validation.

```ts
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
});

async function createUser(formData: FormData) {
  'use server';
  const result = schema.safeParse(Object.fromEntries(formData));
  if (!result.success) throw new Error('Invalid input');
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
  'use server';
  const session = await getSession();
  if (!session) throw new Error('Unauthenticated');
  const post = await db.posts.findById(id);
  if (post.authorId !== session.user.id) throw new Error('Unauthorized');
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
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

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
const user = await db.query('SELECT * FROM users WHERE id = $1', [id]);

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
// next.config.ts
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

Set security headers in `next.config.ts` for every response:

```ts
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

export default {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
```

---

## Rate Limiting

Apply rate limiting to all public-facing Route Handlers and Server Actions,
especially auth endpoints, contact forms, and anything that sends email or
triggers side effects. Use Upstash Rate Limit, or equivalent.

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
});

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'anonymous';
  const { success } = await ratelimit.limit(ip);
  if (!success) return new Response('Too many requests', { status: 429 });
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
return Response.json({ error: 'Something went wrong' }, { status: 500 });
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
import Script from 'next/script';
<Script src="https://analytics.example.com/script.js" strategy="lazyOnload" />
```

Never paste raw third-party `<script>` tags into layouts — they bypass CSP
nonces and can't be controlled by Next.js.
