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
