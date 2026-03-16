export interface ParsedHost {
  subdomain: string | null;
  rootDomain: string;
  port: string;
  hostname: string;
}

export function parseHost(hostWithPort: string): ParsedHost {
  const [hostnamePart, portPart] = hostWithPort.split(":");
  const hostname = (hostnamePart || "").toLowerCase();
  const port = portPart ? `:${portPart}` : "";

  if (!hostname) {
    return { subdomain: null, rootDomain: "", port, hostname };
  }

  const labels = hostname.split(".").filter(Boolean);

  // 1. Anchor with NEXT_PUBLIC_BASE_DOMAIN if available
  const baseDomain = (process.env.NEXT_PUBLIC_BASE_DOMAIN || "").toLowerCase();
  if (baseDomain && (hostname === baseDomain || hostname.endsWith("." + baseDomain))) {
    const subdomainPart = hostname === baseDomain ? null : hostname.slice(0, -(baseDomain.length + 1));
    const isReserved = subdomainPart === "www" || subdomainPart === "login";

    return {
      subdomain: isReserved ? null : subdomainPart,
      rootDomain: baseDomain,
      port,
      hostname,
    };
  }

  // 2. Fallback to Localhost logic
  if (hostname === "localhost") {
    return { subdomain: null, rootDomain: "localhost", port, hostname };
  }

  // Local development subdomains like ardenwood.localhost
  if (labels.length === 2 && labels[1] === "localhost") {
    const isReserved = labels[0] === "www" || labels[0] === "login";
    return {
      subdomain: isReserved ? null : labels[0],
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
  const isReserved = labels[0] === "www" || labels[0] === "login";
  if (labels.length === 3 && isReserved) {
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
