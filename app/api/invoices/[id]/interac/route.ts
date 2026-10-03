import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAppUser } from "../../../../../lib/auth";
import { canAccessModule } from "../../../../../lib/permissions";
import { createAdminSupabase } from "../../../../../lib/supabase/server";
import { sendInternalCustomerUpdate, sendTransactionalEmail } from "../../../../../lib/transactional-email";
import { INTERAC_EMAIL } from "../../../../../lib/interac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (!["report", "confirm"].includes(action)) return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  if (action === "report" && user.role !== "client") return NextResponse.json({ error: "Client access required." }, { status: 403 });
  if (action === "confirm" && (user.role === "client" || !canAccessModule(user.role, user.permissions, "billing"))) return NextResponse.json({ error: "Billing access required." }, { status: 403 });
  const { id } = await params;
  const admin = createAdminSupabase();
  const { data: invoice, error: readError } = await admin.from("operations").select("id,data,company_id,status,updated_at").eq("id", id).eq("kind", "invoice").neq("status", "archived").single();
  if (readError || !invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (action === "report" && (!user.companyId || invoice.company_id !== user.companyId)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (invoice.data.status === "paid" || invoice.status === "paid") return NextResponse.json({ ok: true, invoice: invoice.data });
  if (invoice.data.status === "void" || !Number.isFinite(Number(invoice.data.total)) || Number(invoice.data.total) <= 0) return NextResponse.json({ error: "This invoice cannot accept payment." }, { status: 400 });
  if (action === "report" && invoice.data.status === "etransfer_pending") return NextResponse.json({ ok: true, invoice: invoice.data });
  if (action === "confirm" && invoice.data.status !== "etransfer_pending") return NextResponse.json({ error: "No e-Transfer is awaiting confirmation." }, { status: 409 });
  // Close the current card checkout so a previously opened tab cannot charge again.
  if (invoice.data.stripeCheckoutSessionId) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const session = await stripe.checkout.sessions.retrieve(invoice.data.stripeCheckoutSessionId);
      if (session.status === "complete" || session.payment_status === "paid") return NextResponse.json({ error: "A card payment was already submitted. Contact the studio before recording an e-Transfer." }, { status: 409 });
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
    } catch {
      return NextResponse.json({ error: "Could not verify the existing card payment. Please try again or contact the studio." }, { status: 503 });
    }
  }
  const now = new Date().toISOString();
  const updated = action === "report"
    ? { ...invoice.data, status: "etransfer_pending", interacReportedAt: now, interacReportedBy: user.id, interacEmail: INTERAC_EMAIL }
    : { ...invoice.data, status: "paid", paymentMethod: "interac_etransfer", paidAt: now, interacConfirmedAt: now, interacConfirmedBy: user.id };
  const { data: saved, error } = await admin.from("operations").update({ data: updated, updated_by: user.id, updated_at: now }).eq("id", id).eq("updated_at", invoice.updated_at).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save payment status. Please try again." }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "Invoice changed. Refresh and try again." }, { status: 409 });
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const details: Array<[string, unknown]> = [["Invoice", updated.number || id], ["Customer", updated.client || user.displayName], ["Amount", `$${Number(updated.total).toFixed(2)} CAD`], ["Payment method", "Interac e-Transfer"], ["Status", action === "report" ? "Pending — verify funds in your bank before confirming" : "Paid"], ["Transfer email", INTERAC_EMAIL], [action === "report" ? "Reported at" : "Confirmed at", now]];
  const internalSent = await sendInternalCustomerUpdate({ subject: `${action === "report" ? "e-Transfer pending" : "e-Transfer received"} — ${updated.number || id}`, heading: action === "report" ? "Customer reported an e-Transfer" : "e-Transfer payment confirmed", details, actionUrl: `${origin}/admin-portal` });
  let customerSent = true;
  if (action === "confirm") {
    const { data: recipients } = await admin.from("profiles").select("id,email").eq("company_id", invoice.company_id).eq("role", "client").eq("status", "active");
    if (recipients?.length) await admin.from("notifications").insert(recipients.map(({ id: recipientId }) => ({ recipient_id: recipientId, title: "e-Transfer payment received", body: `Invoice ${updated.number || id} is paid by Interac e-Transfer.`, destination: `/client-portal?tab=billing&invoice=${id}` })));
    const email = String(updated.email || recipients?.[0]?.email || "");
    customerSent = Boolean(email) && await sendTransactionalEmail({ to: email, subject: `Payment received — ${updated.number || id}`, heading: "Your e-Transfer payment is confirmed", details, actionUrl: `${origin}/client-portal?tab=billing&invoice=${id}`, actionLabel: "View paid invoice" });
  }
  return NextResponse.json({ ok: true, invoice: updated, warning: !internalSent || !customerSent ? "Payment status saved. An email could not be delivered; please contact the studio if needed." : undefined });
}
