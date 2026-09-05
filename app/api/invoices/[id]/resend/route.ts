import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminSupabase, createServerSupabase } from "../../../../../lib/supabase/server";
import { signInvoiceId } from "../../../../../lib/invoice-links";
import { canAccessModule } from "../../../../../lib/permissions";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role,status,permissions").eq("id", userId).single();
  if (!profile || profile.status !== "active" || !canAccessModule(profile.role, profile.permissions, "billing")) return NextResponse.json({ error: "You do not have billing permission" }, { status: 403 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Email service is not configured" }, { status: 503 });

  const { id } = await params;
  const admin = createAdminSupabase();
  const { data: invoice } = await admin.from("operations").select("id,data,status").eq("id", id).eq("kind", "invoice").neq("status", "archived").single();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const email = String(invoice.data?.email || "").trim();
  if (!email) return NextResponse.json({ error: "This invoice has no customer email" }, { status: 400 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const token = await signInvoiceId(id);
  const publicInvoiceUrl = `${origin}/invoice/${id}?token=${token}`;
  const total = Number(invoice.data?.total || 0);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: "Velora Vista Visuals <info@veloravistavisuals.com>", to: email,
    subject: `Invoice ${invoice.data?.number || ""} from Velora Vista Visuals Ltd.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:40px;color:#111"><h1 style="font-size:34px">VELORA VISTA VISUALS</h1><p>Invoice <b>${escapeHtml(invoice.data?.number)}</b> is ready.</p><p style="font-size:28px"><b>$${total.toFixed(2)} CAD</b></p><p>${escapeHtml(invoice.data?.description || "")}</p><a href="${escapeHtml(publicInvoiceUrl)}" style="display:inline-block;background:#dfff00;color:#111;padding:16px 24px;text-decoration:none;font-weight:bold">View invoice details ↗</a><p style="margin-top:32px">Review the invoice on our website, then choose Pay now to continue securely to Stripe.</p><p>Questions? Call 778-820-0485 or reply to this email.</p></div>`,
  });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 502 });
  await admin.from("operations").update({ data: { ...invoice.data, publicInvoiceUrl, status: invoice.data?.status || "sent", lastInvoiceEmailSentAt: new Date().toISOString(), lastInvoiceEmailId: result.data?.id } }).eq("id", id);
  return NextResponse.json({ ok: true, email });
}
