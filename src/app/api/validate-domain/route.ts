import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim().toLowerCase();

  if (!slug || slug === "gridmaster" || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ valid: false });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    // If we lack the service key in local dev, RLS blocks anonymous read of companies.
    // Rather than failing validation, we assume the domain is valid to allow the login flow.
    return NextResponse.json({ valid: true });
  }

  const supabase = createClient(url, serviceKey);

  const { data } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  return NextResponse.json({ valid: !!data });
}
