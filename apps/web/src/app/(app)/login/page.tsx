import { headers } from "next/headers";
import dynamic from "next/dynamic";
import { parseHost } from "@/lib/subdomain";

// Each branch is its own dynamically-imported chunk so a visit to one
// subdomain's /login never ships (or hydrates) the other two flows' JS —
// e.g. landing on an org subdomain after the domain-selector redirect only
// downloads OrgLogin, not DomainSelector or GridmasterLogin.
const DomainSelector = dynamic(() => import("./DomainSelector"));
const OrgLogin = dynamic(() => import("./OrgLogin"));
const GridmasterLogin = dynamic(() => import("./GridmasterLogin"));

// Reads the Host header server-side to pick the right flow before the first
// byte is sent, instead of deciding on the client after hydration (the
// previous version rendered nothing at all until a mount effect resolved
// window.location.host).
export default async function LoginPage() {
  const headersList = await headers();
  const { subdomain } = parseHost(headersList.get("host") ?? "");

  if (subdomain === "gridmaster") {
    return <GridmasterLogin />;
  }
  if (subdomain) {
    return <OrgLogin orgSlug={subdomain} />;
  }
  return <DomainSelector />;
}
