/** Subdomains that cannot be used as org slugs. */
export const RESERVED_SUBDOMAINS = new Set([
  "www", "login", "gridmaster", "api", "admin", "status", "app",
]);

/**
 * Subdomains treated as apex (invisible to the router).
 * "gridmaster" is intentionally excluded — it's a routable subdomain
 * with its own portal, login, and middleware guards.
 */
const APEX_ALIAS_SUBDOMAINS = new Set([
  "www", "login", "api", "admin", "status", "app",
]);

/** Validates a port number and returns the formatted port string (":port") or empty string if invalid. */
export function getValidPort(portStr: string | number | null | undefined): string {
  if (!portStr) return "";

  const portNum = typeof portStr === "string" ? parseInt(portStr, 10) : portStr;

  // Valid port range: 0-65535
  if (Number.isInteger(portNum) && portNum >= 0 && portNum <= 65535) {
    return `:${portNum}`;
  }

  return "";
}

export interface ParsedHost {
  subdomain: string | null;
  rootDomain: string;
  port: string;
  hostname: string;
}

export function parseHost(hostWithPort: string): ParsedHost {
  const [hostnamePart, portPart] = hostWithPort.split(":");
  const hostname = (hostnamePart || "").toLowerCase();
  const port = getValidPort(portPart);

  if (!hostname) {
    return { subdomain: null, rootDomain: "", port, hostname };
  }

  const labels = hostname.split(".").filter(Boolean);

  // 1. Anchor with NEXT_PUBLIC_BASE_DOMAIN if available
  const baseDomain = (process.env.NEXT_PUBLIC_BASE_DOMAIN || "").toLowerCase();
  if (baseDomain && (hostname === baseDomain || hostname.endsWith("." + baseDomain))) {
    const subdomainPart = hostname === baseDomain ? null : hostname.slice(0, -(baseDomain.length + 1));
    // Org slugs are single-label only — reject multi-part subdomains like "a.b"
    if (subdomainPart && subdomainPart.includes(".")) {
      return { subdomain: null, rootDomain: baseDomain, port, hostname };
    }
    const isApexAlias = !!subdomainPart && APEX_ALIAS_SUBDOMAINS.has(subdomainPart);

    return {
      subdomain: isApexAlias ? null : subdomainPart,
      rootDomain: baseDomain,
      port,
      hostname,
    };
  }

  // 2. Fallback to Localhost logic
  if (hostname === "localhost") {
    return { subdomain: null, rootDomain: "localhost", port, hostname };
  }

  // Local development subdomains like calmhaven.localhost
  if (labels.length === 2 && labels[1] === "localhost") {
    const isApexAlias = APEX_ALIAS_SUBDOMAINS.has(labels[0]);
    return {
      subdomain: isApexAlias ? null : labels[0],
      rootDomain: "localhost",
      port,
      hostname,
    };
  }

  // 3. Fallback to Vercel logic (for non-anchored previews)
  const isVercelApp = labels.length >= 2 && labels[labels.length - 2] === "vercel" && labels[labels.length - 1] === "app";
  if (isVercelApp) {
    if (labels.length === 3) {
      return {
        subdomain: null,
        rootDomain: hostname,
        port,
        hostname,
      };
    }

    if (labels.length >= 4) {
      return {
        subdomain: labels[0],
        rootDomain: labels.slice(1).join("."),
        port,
        hostname,
      };
    }
  }

  // 4. General heuristic (last resort)
  const isApexAlias = APEX_ALIAS_SUBDOMAINS.has(labels[0]);
  if (labels.length === 3 && isApexAlias) {
    return {
      subdomain: null,
      rootDomain: labels.slice(1).join("."),
      port,
      hostname,
    };
  }

  if (labels.length >= 3) {
    return {
      subdomain: labels[0],
      rootDomain: labels.slice(1).join("."),
      port,
      hostname,
    };
  }

  return { subdomain: null, rootDomain: hostname, port, hostname };
}

export function buildSubdomainHost(subdomain: string, parsed: ParsedHost): string {
  return `${subdomain}.${parsed.rootDomain}${parsed.port}`;
}

export function isApexHost(parsed: ParsedHost): boolean {
  return !parsed.subdomain;
}
