import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabase, createServerSupabase } from "../../../lib/supabase/server";
import Stripe from "stripe";
import { Resend } from "resend";
import { sendPortalInvitation } from "../../../lib/auth-email";
import { canAccessModule, moduleForKind } from "../../../lib/permissions";

const bodySchema = z.object({ kind: z.string().min(1).max(64), data: z.record(z.string(), z.unknown()) });
const patchSchema = z.object({ id: z.string().uuid(), data: z.record(z.string(), z.unknown()), status: z.string().optional() });

function calendarPayload(data: Record<string, unknown>) {
  const start = new Date(String(data.start));
  const end = new Date(String(data.end));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const title = String(data.title || "Velora Vista meeting");
  const location = String(data.location || data.link || "");
  const details = String(data.notes || "Scheduled by Velora Vista Visuals Ltd.");
  const params = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${stamp(start)}/${stamp(end)}`, details, location });
  const escapeIcs = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Velora Vista Visuals//Studio Schedule//EN", "CALSCALE:GREGORIAN", "METHOD:REQUEST", "BEGIN:VEVENT", `UID:${crypto.randomUUID()}@veloravistavisuals.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escapeIcs(title)}`, `DESCRIPTION:${escapeIcs(details)}`, `LOCATION:${escapeIcs(location)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const googleCalendarUrl = `https://calendar.google.com/calendar/render?${params.toString()}`;
  const recipients = [String(data.email || ""), ...String(data.attendeeEmails || "").split(/[;,]/)].map((x) => x.trim()).filter(Boolean).join(",");
  const emailInvitationUrl = recipients ? `mailto:${recipients}?${new URLSearchParams({ subject: `Invitation: ${title}`, body: `${details}\n\nAdd to Google Calendar: ${googleCalendarUrl}` }).toString()}` : "";
  return { googleCalendarUrl, emailInvitationUrl, ics };
}

function toBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

async function staff() {
  const supabase = await createServerSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims?.sub;
  if (!id) return null;
  const { data: profile } = await supabase.from("profiles").select("id,email,full_name,role,status,permissions").eq("id", id).single();
  if (!profile || profile.status !== "active" || !["owner","admin","team"].includes(profile.role)) return null;
  return { supabase, profile };
}

function canUse(profile: { role: string; permissions: unknown }, kind: string) {
  const module = moduleForKind(kind);
  return Boolean(module && canAccessModule(profile.role, profile.permissions, module));
}

async function companyFor(data: Record<string, unknown>, supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
  const name = String(data.client || data.company || "").trim();
  if (!name) return null;
  const { data: clientOp } = await supabase.from("operations").select("company_id").eq("kind", "client").eq("data->>company", name).limit(1).maybeSingle();
  return clientOp?.company_id || null;
}

export async function GET() {
  const auth = await staff();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await auth.supabase.from("operations").select("id,kind,data,company_id,assigned_to,status,visible_to_client,created_at,updated_at").neq("status", "archived").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const records = auth.profile.role === "owner" ? (data || []) : (data || []).filter((record) => canUse(auth.profile, record.kind));
  return NextResponse.json({ user: auth.profile, records });
}

export async function POST(request: NextRequest) {
  const auth = await staff();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid record" }, { status: 400 });
  const { kind, data } = parsed.data;
  if (!canUse(auth.profile, kind)) return NextResponse.json({ error: "You do not have permission to use this area" }, { status: 403 });
  if (kind === "booking" || kind === "meeting") {
    const calendar = calendarPayload(data);
    if (calendar) {
      data.googleCalendarUrl = calendar.googleCalendarUrl;
      data.emailInvitationUrl = calendar.emailInvitationUrl;
    }
  }
  if (kind === "invoice") {
    const { data: invoiceNumber, error: numberError } = await auth.supabase.rpc("next_velora_invoice_number");
    if (numberError) return NextResponse.json({ error: numberError.message }, { status: 400 });
    data.number = invoiceNumber;
  }
  if (kind === "subscription") {
    const price = Number(data.price);
    const billing = String(data.billing || "Monthly subscription").toLowerCase();
    if (!data.email || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "A billing email and valid subscription price are required" }, { status: 400 });
    }
    if (!billing.includes("month") && !billing.includes("quarter")) {
      return NextResponse.json({ error: "Only monthly or quarterly recurring plans can start a subscription" }, { status: 400 });
    }
  }
  let companyId = await companyFor(data, auth.supabase);

  if (kind === "client") {
    const { data: company, error } = await auth.supabase.from("companies").insert({ name: String(data.company), email: String(data.email || ""), phone: String(data.phone || ""), notes: String(data.notes || ""), status: "onboarding" }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    companyId = company.id;
  }

  const visibleKinds = new Set(["project","invoice","contract","subscription","booking","meeting","notification"]);
  const { data: record, error } = await auth.supabase.from("operations").insert({ kind, data, company_id: companyId, visible_to_client: visibleKinds.has(kind), created_by: auth.profile.id, updated_by: auth.profile.id }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (companyId && visibleKinds.has(kind)) {
    const admin = createAdminSupabase();
    const { data: recipients } = await admin.from("profiles").select("id").eq("company_id", companyId).eq("role", "client").eq("status", "active");
    if (recipients?.length) await admin.from("notifications").insert(recipients.map(({ id }) => ({
      recipient_id: id,
      title: kind === "booking" || kind === "meeting" ? "Schedule updated" : `${kind[0].toUpperCase()}${kind.slice(1)} added`,
      body: String(data.title || data.number || "A new item is available in your Velora portal."),
      destination: kind === "booking" || kind === "meeting" ? "/client-portal?schedule=1" : "/client-portal",
    })));
  }

  if ((kind === "booking" || kind === "meeting") && process.env.RESEND_API_KEY) {
    const emailList = [String(data.email || ""), ...String(data.attendeeEmails || "").split(/[;,]/)].map((x) => x.trim().toLowerCase()).filter(Boolean);
    const recipients = [...new Set(emailList)];
    const calendar = calendarPayload(data);
    if (recipients.length && calendar) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const title = String(data.title || "Velora Vista schedule invitation");
      const response = await resend.emails.send({
        from: "Velora Vista Visuals <info@veloravistavisuals.com>",
        to: recipients,
        subject: `Invitation: ${title}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:40px;color:#111"><h1>VELORA VISTA VISUALS</h1><h2>${escapeHtml(title)}</h2><p><b>${escapeHtml(new Date(String(data.start)).toLocaleString("en-CA", { timeZone: "America/Vancouver" }))}</b></p><p>${escapeHtml(data.location || data.link || "Details are in your client portal.")}</p><a href="${escapeHtml(calendar.googleCalendarUrl)}" style="display:inline-block;background:#dfff00;color:#111;padding:15px 22px;text-decoration:none;font-weight:bold">Add to Google Calendar ↗</a></div>`,
        attachments: [{ filename: "velora-vista-invitation.ics", content: toBase64(calendar.ics) }],
      });
      await auth.supabase.from("operations").update({ data: { ...data, invitationEmailStatus: response.error ? "failed" : "sent" } }).eq("id", record.id);
    }
  }

  if ((kind === "client" || kind === "team") && data.email) {
    try {
      const admin = createAdminSupabase();
      const role = kind === "client" ? "client" : String(data.role).toLowerCase() === "admin" ? "admin" : "team";
      const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      const invitation = await sendPortalInvitation({ email: String(data.email), fullName: String(data.contact || data.name || ""), role, origin });
      const userId = invitation.userId;
      if (userId) await admin.from("profiles").update({ role, company_id: kind === "client" ? companyId : null, full_name: String(data.contact || data.name || ""), permissions: kind === "team" ? { modules: String(data.permissions || "") } : {} }).eq("id", userId);
      await auth.supabase.from("operations").update({ data: { ...data, inviteStatus: "sent" }, updated_by: auth.profile.id }).eq("id", record.id);
    } catch (inviteError) {
      await auth.supabase.from("operations").update({ data: { ...data, inviteStatus: "needs_retry" }, updated_by: auth.profile.id }).eq("id", record.id);
      return NextResponse.json({ id: record.id, warning: inviteError instanceof Error ? inviteError.message : "Account saved; invitation needs retry" }, { status: 202 });
    }
  }
  if (kind === "invoice" && data.email && Number(data.total) > 0) {
    try {
      const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      const publicInvoiceUrl = `${origin}/client-portal?tab=billing&invoice=${record.id}`;
      const invoiceData = { ...data, publicInvoiceUrl, status: "sent" };
      await auth.supabase.from("operations").update({ data: invoiceData, updated_by: auth.profile.id }).eq("id", record.id);
      if (process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({ from: "Velora Vista Visuals <info@veloravistavisuals.com>", to: String(data.email), subject: `Invoice ${data.number} from Velora Vista Visuals Ltd.`, html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:40px;color:#111"><h1 style="font-size:34px">VELORA VISTA VISUALS</h1><p>Invoice <b>${escapeHtml(data.number)}</b> is ready.</p><p style="font-size:28px"><b>$${Number(data.total).toFixed(2)} CAD</b></p><p>${escapeHtml(data.description || "")}</p><a href="${escapeHtml(publicInvoiceUrl)}" style="display:inline-block;background:#dfff00;color:#111;padding:16px 24px;text-decoration:none;font-weight:bold">View invoice details ↗</a><p style="margin-top:32px">Review the invoice on our website, then choose Pay now to continue securely to Stripe.</p><p>Questions? Call 778-820-0485 or reply to this email.</p></div>` });
      }
    } catch (billingError) {
      await auth.supabase.from("operations").update({ data: { ...data, billingStatus: "needs_retry", billingError: billingError instanceof Error ? billingError.message : "Payment link failed" }, updated_by: auth.profile.id }).eq("id", record.id);
      return NextResponse.json({ id: record.id, warning: "Invoice saved; payment link or email needs retry" }, { status: 202 });
    }
  }
  if (kind === "subscription") {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      const billing = String(data.billing || "Monthly subscription").toLowerCase();
      const intervalCount = billing.includes("quarter") ? 3 : 1;
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: String(data.email),
        line_items: [{
          price_data: {
            currency: "cad",
            unit_amount: Math.round(Number(data.price) * 100),
            recurring: { interval: "month", interval_count: intervalCount },
            product_data: {
              name: String(data.plan || "Velora Vista creative partnership"),
              description: String(data.deliverables || "Recurring creative services").slice(0, 500),
            },
          },
          quantity: 1,
        }],
        metadata: { operation_id: record.id, company_id: companyId || "" },
        subscription_data: { metadata: { operation_id: record.id, company_id: companyId || "" } },
        success_url: `${origin}/client-portal?subscription=success`,
        cancel_url: `${origin}/client-portal?subscription=cancelled`,
      }, { idempotencyKey: `subscription-${record.id}` });
      await auth.supabase.from("operations").update({
        data: { ...data, status: "pending_checkout", paymentLink: session.url, stripeCheckoutSessionId: session.id },
        updated_by: auth.profile.id,
      }).eq("id", record.id);
    } catch (billingError) {
      await auth.supabase.from("operations").update({
        data: { ...data, status: "needs_retry", billingError: billingError instanceof Error ? billingError.message : "Subscription checkout failed" },
        updated_by: auth.profile.id,
      }).eq("id", record.id);
      return NextResponse.json({ id: record.id, warning: "Subscription saved; checkout link needs retry" }, { status: 202 });
    }
  }
  return NextResponse.json({ id: record.id });
}

export async function PATCH(request: NextRequest) {
  const auth = await staff();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const { data: current } = await auth.supabase.from("operations").select("kind,company_id").eq("id", parsed.data.id).single();
  if (!current || !canUse(auth.profile, current.kind)) return NextResponse.json({ error: "You do not have permission to update this area" }, { status: 403 });
  const { error } = await auth.supabase.from("operations").update({ data: parsed.data.data, status: parsed.data.status || "active", updated_by: auth.profile.id }).eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (current?.company_id && ["project","invoice","contract","subscription","booking","meeting"].includes(current.kind)) {
    const admin = createAdminSupabase();
    const { data: recipients } = await admin.from("profiles").select("id").eq("company_id", current.company_id).eq("role", "client").eq("status", "active");
    if (recipients?.length) await admin.from("notifications").insert(recipients.map(({ id }) => ({ recipient_id: id, title: "Your Velora portal was updated", body: String(parsed.data.data.title || parsed.data.data.number || "Open your portal to view the latest update."), destination: "/client-portal" })));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await staff();
  if (!auth || !["owner","admin"].includes(auth.profile.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { data: current } = await auth.supabase.from("operations").select("kind").eq("id", id).single();
  if (!current || !canUse(auth.profile, current.kind)) return NextResponse.json({ error: "You do not have permission to delete this record" }, { status: 403 });
  const { error } = await auth.supabase.from("operations").update({ status: "archived", updated_by: auth.profile.id }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
