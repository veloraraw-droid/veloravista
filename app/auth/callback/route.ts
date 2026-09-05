import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "../../../lib/supabase/server";
export async function GET(request: NextRequest) {
  const url = new URL(request.url), supabase = await createServerSupabase();
  const code = url.searchParams.get("code"), tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as "invite"|"magiclink"|"recovery"|"email"|null;
  let error: {message:string}|null = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  else error = { message: "The sign-in link is incomplete" };
  if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims?.sub;
  const { data: profile } = id ? await supabase.from("profiles").select("role,status").eq("id", id).single() : { data: null };
  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=This%20account%20is%20not%20approved%20for%20portal%20access", url.origin));
  }
  const destination = profile.role === "client" ? "/client-portal" : ["owner", "admin", "team"].includes(profile.role) ? "/admin-portal" : "/login";
  return NextResponse.redirect(new URL(destination, url.origin));
}
