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

  if (hostname === "localhost") {
    return { subdomain: null, rootDomain: "localhost", port, hostname };
  }

  // Local development subdomains like ardenwood.localhost
  if (labels.length === 2 && labels[1] === "localhost") {
    return {
      subdomain: labels[0],
      rootDomain: "localhost",
      port,
      hostname,
    };
  }

  // Vercel project domains (e.g. dub-grid.vercel.app) should be treated as apex.
  // Tenant hosts on Vercel can still use a leading label (e.g. tenant.dub-grid.vercel.app).
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

  // "www" and "login" are corporate/platform subdomains, not tenant subdomains.
  // e.g. www.dubgrid.com → rootDomain: dubgrid.com, subdomain: null
  // e.g. login.dubgrid.com → rootDomain: dubgrid.com, subdomain: null
  if (labels.length === 3 && (labels[0] === "www" || labels[0] === "login")) {
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
