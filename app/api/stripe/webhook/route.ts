import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminSupabase } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const signature = request.headers.get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({error:"Webhook is not configured"},{status:503});
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), signature, process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return NextResponse.json({error:"Invalid signature"},{status:400}); }
  const admin = createAdminSupabase();
  const existing = await admin.from("billing_events").select("id").eq("stripe_event_id",event.id).maybeSingle();
  if (existing.data) return NextResponse.json({received:true,duplicate:true});
  const object = event.data.object as Stripe.Checkout.Session | Stripe.Subscription;
  const operationId = object.metadata?.operation_id;
  if (operationId && (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded")) {
    const session = object as Stripe.Checkout.Session;
    const current = await admin.from("operations").select("kind,data,company_id").eq("id",operationId).single();
    if (current.data) {
      const isSubscription = current.data.kind === "subscription" || session.mode === "subscription";
      await admin.from("operations").update({ data: {
        ...current.data.data,
        status: isSubscription ? "active" : "paid",
        paidAt: new Date().toISOString(),
        stripeCustomerId: String(session.customer || ""),
        stripeSubscriptionId: String(session.subscription || ""),
        stripePaymentIntentId: String(session.payment_intent || ""),
      } }).eq("id",operationId);
    }
  }
  if (operationId && (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted")) {
    const subscription = object as Stripe.Subscription;
    const current = await admin.from("operations").select("data").eq("id",operationId).single();
    if (current.data) await admin.from("operations").update({ data: {
      ...current.data.data,
      status: event.type === "customer.subscription.deleted" ? "cancelled" : subscription.status,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: String(subscription.customer || ""),
    } }).eq("id",operationId);
  }
  await admin.from("billing_events").insert({stripe_event_id:event.id,event_type:event.type,company_id:object.metadata?.company_id||null,payload:{livemode:event.livemode,object_id:object.id}});
  return NextResponse.json({received:true});
}
