import { serverEnv } from "@/lib/env.server";

/**
 * Registers a hostname as a domain on the Vercel project so it gets its own
 * auto-renewing HTTP-01 SSL cert. Used instead of relying on the *.dubgrid.com
 * wildcard domain, whose cert can only auto-renew (DNS-01) if Vercel controls
 * the zone's nameservers — this project keeps Cloudflare authoritative, so the
 * wildcard cert silently expires every ~90 days instead.
 */
export async function registerOrgDomain(domain: string): Promise<void> {
  const token = serverEnv?.VERCEL_API_TOKEN;
  const projectId = serverEnv?.VERCEL_PROJECT_ID;
  if (!token || !projectId) return;

  const teamQuery = serverEnv?.VERCEL_TEAM_ID
    ? `?teamId=${encodeURIComponent(serverEnv.VERCEL_TEAM_ID)}`
    : "";

  const response = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/domains${teamQuery}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    },
  );

  // 409 means the domain is already registered on this project — not an error.
  if (response.ok || response.status === 409) return;

  const body = await response.text().catch(() => "(could not read response body)");
  throw new Error(`Vercel domain registration failed (${response.status}): ${body}`);
}
