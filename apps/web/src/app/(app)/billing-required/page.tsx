import { OrganizationGateScreen } from "./OrganizationGateScreen";

// H-2: this authed page receives the nonce CSP from middleware, so it must render
// dynamically (a static prerender can't carry the per-request nonce → broken
// hydration). Mirrors the other authed routes. See SECURITY_AUDIT.md F-4.
export const dynamic = "force-dynamic";

export default function BillingRequiredPage() {
  return <OrganizationGateScreen />;
}
