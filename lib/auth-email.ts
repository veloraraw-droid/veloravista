import { Resend } from "resend";
import { createAdminSupabase } from "./supabase/server";

type PortalRole = "client" | "team" | "admin";

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[character] || character));

export async function sendPortalInvitation({ email, fullName, role, origin }: {
  email: string;
  fullName?: string;
  role: PortalRole;
  origin: string;
}) {
  if (!process.env.RESEND_API_KEY) throw new Error("Invitation email service is not configured");
  const admin = createAdminSupabase();
  const normalizedEmail = email.trim().toLowerCase();
  let type: "invite" | "recovery" = "invite";
  let result = await admin.auth.admin.generateLink({
    type,
    email: normalizedEmail,
    options: { data: { full_name: fullName || "" } },
  });
  if (result.error && /already|registered|exists/i.test(result.error.message)) {
    type = "recovery";
    result = await admin.auth.admin.generateLink({ type, email: normalizedEmail });
  }
  if (result.error) throw result.error;
  const tokenHash = result.data.properties?.hashed_token;
  if (!tokenHash) throw new Error("Supabase did not return an invitation token");
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("token_hash", tokenHash);
  callback.searchParams.set("type", type);
  callback.searchParams.set("next", "/reset-password");
  const destination = role === "client" ? "client portal" : "team portal";
  const resend = new Resend(process.env.RESEND_API_KEY);
  const response = await resend.emails.send({
    from: "Velora Vista Visuals <info@veloravistavisuals.com>",
    to: normalizedEmail,
    subject: `Your Velora Vista ${destination} invitation`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:40px;color:#111"><p style="font-size:12px;font-weight:700;letter-spacing:.12em">VELORA VISTA VISUALS</p><h1 style="font-size:34px;line-height:1.05">Welcome${fullName ? `, ${escapeHtml(fullName)}` : ""}.</h1><p>You have been invited to the Velora Vista Visuals ${destination}. Use the secure link below to choose your password and activate your access.</p><p style="margin:30px 0"><a href="${escapeHtml(callback.toString())}" style="display:inline-block;background:#dfff00;color:#111;padding:16px 24px;text-decoration:none;font-weight:bold">Set up your account ↗</a></p><p style="font-size:13px;color:#666">This is a one-time security link. If you did not expect this invitation, you can ignore this email.</p></div>`,
  });
  if (response.error) throw new Error(response.error.message);
  return { userId: result.data.user?.id, emailId: response.data?.id };
}
