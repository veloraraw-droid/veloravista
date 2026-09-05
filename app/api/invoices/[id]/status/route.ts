import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { Resend } from "resend";
import { getAppUser } from "../../../../../lib/auth";
import { createAdminSupabase } from "../../../../../lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAppUser();
  if (!user || user.role !== "client") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Missing checkout session" }, { status: 400 });
  const admin = createAdminSupabase();
  const { data: invoice } = await admin.from("operations").select("id,data,company_id").eq("id", id).eq("kind", "invoice").single();
  if (!invoice || !user.companyId || invoice.company_id !== user.companyId) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["invoice", "payment_intent.latest_charge"] });
  if (session.metadata?.operation_id !== id) return NextResponse.json({ error: "Checkout does not match invoice" }, { status: 403 });
  const stripeInvoice = typeof session.invoice === "object" ? session.invoice as Stripe.Invoice : null;
  const paymentIntent = typeof session.payment_intent === "object" ? session.payment_intent as Stripe.PaymentIntent : null;
  const charge = paymentIntent && typeof paymentIntent.latest_charge === "object" ? paymentIntent.latest_charge as Stripe.Charge : null;
  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  const invoiceUrl = stripeInvoice?.hosted_invoice_url || null;
  const invoicePdf = stripeInvoice?.invoice_pdf || null;
  const receiptUrl = charge?.receipt_url || null;

  if (paid) {
    const paidData = { ...invoice.data, status: "paid", paidAt: invoice.data?.paidAt || new Date().toISOString(), stripeCheckoutSessionId: session.id, stripePaymentIntentId: paymentIntent?.id || String(session.payment_intent || ""), stripeInvoiceId: stripeInvoice?.id || "", stripeInvoiceUrl: invoiceUrl, stripeInvoicePdf: invoicePdf, receiptUrl };
    if (!invoice.data?.receiptEmailSentAt && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const destination = invoiceUrl || `${process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin}/client-portal?tab=billing&invoice=${id}`;
      const result = await resend.emails.send({ from: "Velora Vista Visuals <info@veloravistavisuals.com>", to: String(invoice.data?.email || user.email), subject: `Payment received for invoice ${invoice.data?.number || ""}`, html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:40px;color:#111"><h1>PAYMENT RECEIVED</h1><p>Thank you. Your payment for invoice <b>${String(invoice.data?.number || "")}</b> is complete.</p><a href="${destination}" style="display:inline-block;background:#dfff00;color:#111;padding:16px 24px;text-decoration:none;font-weight:bold">View paid invoice ↗</a></div>` });
      if (!result.error) Object.assign(paidData, { receiptEmailSentAt: new Date().toISOString(), receiptEmailId: result.data?.id });
    }
    await admin.from("operations").update({ data: paidData }).eq("id", id);
  }
  return NextResponse.json({ status: paid ? "paid" : session.payment_status, invoiceUrl, invoicePdf, receiptUrl });
}
