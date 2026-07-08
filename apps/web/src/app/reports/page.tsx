import ReportsPageContent from "./ReportsPageContent";

// F-4: render this authed route dynamically so the per-request CSP nonce set in
// middleware is stamped onto its scripts. A static prerender can't carry a nonce.
export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return <ReportsPageContent />;
}
