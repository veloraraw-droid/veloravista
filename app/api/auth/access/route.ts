import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabase } from "../../../../lib/supabase/server";

const schema = z.object({ email: z.string().email(), portal: z.enum(["client", "team"]) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ allowed: false });
  const { email, portal } = parsed.data;
  const admin = createAdminSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("role,status")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  const allowed = Boolean(
    profile?.status === "active" &&
    (portal === "client" ? profile.role === "client" : ["owner", "admin", "team"].includes(profile.role))
  );
  return NextResponse.json({ allowed });
}
