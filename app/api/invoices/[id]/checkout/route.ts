import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminSupabase } from "../../../../../lib/supabase/server";
import { getAppUser } from "../../../../../lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAppUser();
  if (!user || user.role !== "client") return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/client-portal?tab=billing&invoice=${id}`)}`, request.url), 303);

  const admin = createAdminSupabase();
  const { data: invoice } = await admin.from("operations").select("id,data,company_id,status").eq("id", id).eq("kind", "invoice").neq("status", "archived").single();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!user.companyId || invoice.company_id !== user.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (invoice.data?.status === "paid" || invoice.status === "paid") return NextResponse.redirect(new URL(`/client-portal?tab=billing&invoice=${id}&payment=success`, request.url), 303);

  const total = Number(invoice.data?.total);
  if (!Number.isFinite(total) || total <= 0) return NextResponse.json({ error: "Invoice total is invalid" }, { status: 400 });
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: String(invoice.data?.email || "") || undefined,
    line_items: [{ price_data: { currency: "cad", unit_amount: Math.round(total * 100), product_data: { name: String(invoice.data?.number || "Velora Vista invoice"), description: String(invoice.data?.description || "Creative services").slice(0, 500) } }, quantity: 1 }],
    metadata: { operation_id: invoice.id, company_id: invoice.company_id || "", invoice_number: String(invoice.data?.number || "") },
    invoice_creation: { enabled: true },
    payment_intent_data: { receipt_email: String(invoice.data?.email || user.email) },
    success_url: `${origin}/client-portal?tab=billing&invoice=${id}&payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/client-portal?tab=billing&invoice=${id}&payment=cancelled`,
  });
  await admin.from("operations").update({ data: { ...invoice.data, paymentLink: session.url, stripeCheckoutSessionId: session.id } }).eq("id", id);
  return NextResponse.redirect(session.url!, 303);
}
