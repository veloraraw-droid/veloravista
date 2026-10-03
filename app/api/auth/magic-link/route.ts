import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createAdminSupabase } from "../../../../lib/supabase/server";

const schema = z.object({
  email: z.string().email(),
  portal: z.enum(["client", "team"]),
  next: z.string().optional(),
});

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[character] || character));

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const portal = parsed.data.portal;
  const requestedNext = parsed.data.next || "";
  const safeNext = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : portal === "team" ? "/admin-portal" : "/client-portal";

  const admin = createAdminSupabase();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,status,full_name")
    .eq("email", email)
    .maybeSingle();

  const allowed = Boolean(
    !profileError &&
    profile?.status === "active" &&
    (portal === "client" ? profile.role === "client" : ["owner", "admin", "team"].includes(profile.role))
  );

  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: portal === "team" ? "This account is not approved for Velora team access." : "This account is not approved for the client portal." },
      { status: 403 }
    );
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not configured for magic-link login");
    return NextResponse.json({ ok: false, error: "Email sign-in is temporarily unavailable. Please use your password or contact Velora Vista." }, { status: 503 });
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error) {
    console.error("Could not generate magic login link", error);
    return NextResponse.json({ ok: false, error: "Could not create a secure sign-in link. Please try again." }, { status: 500 });
  }

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) {
    console.error("Supabase did not return a token hash for magic-link login");
    return NextResponse.json({ ok: false, error: "Could not create a secure sign-in link. Please try again." }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("token_hash", tokenHash);
  callback.searchParams.set("type", "magiclink");
  callback.searchParams.set("next", safeNext);

  const resend = new Resend(process.env.RESEND_API_KEY);
  const response = await resend.emails.send({
    from: "Velora Vista Visuals <info@veloravistavisuals.com>",
    to: email,
    subject: "Your secure Velora Vista sign-in link",
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:40px;color:#111"><p style="font-size:12px;font-weight:700;letter-spacing:.12em">VELORA VISTA VISUALS</p><h1 style="font-size:34px;line-height:1.05">Secure sign-in.</h1><p>Hello${profile?.full_name ? ` ${escapeHtml(profile.full_name)}` : ""}, use the secure link below to access your Velora Vista ${portal === "client" ? "client" : "team"} portal.</p><p style="margin:30px 0"><a href="${escapeHtml(callback.toString())}" style="display:inline-block;background:#dfff00;color:#111;padding:16px 24px;text-decoration:none;font-weight:bold">Sign in securely ↗</a></p><p style="font-size:13px;color:#666">This is a one-time security link. If you did not request it, you can ignore this email.</p></div>`,
  });

  if (response.error) {
    console.error("Resend magic-link email failed", response.error);
    return NextResponse.json({ ok: false, error: "We could not send the sign-in email. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
