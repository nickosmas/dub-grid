import { connection } from "next/server";
import { NotFoundBoundary } from "@/components/RouteBoundary";

// Rendered per request rather than prerendered at build: an unknown path under
// the authenticated app is served with the nonce + 'strict-dynamic' CSP, and a
// static 404 document carries no nonce, so every script on it was blocked.
export default async function NotFound() {
  await connection();
  return (
    <NotFoundBoundary
      title="Page not found"
      message="Check the address, or go back home."
      backHref="/"
      backLabel="Go home"
    />
  );
}
