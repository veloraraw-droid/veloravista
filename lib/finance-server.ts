import Stripe from "stripe";
import { sendInternalCustomerUpdate, sendTransactionalEmail } from "./transactional-email";
import { createAdminSupabase } from "./supabase/server";

async function receiptId(stripeInvoiceId: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`velora:stripe-invoice:${stripeInvoiceId}`));
  const hex = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,"0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

async function stripeIncomeRow(invoice: Stripe.Invoice) {
  if (invoice.status !== "paid" || invoice.amount_paid <= 0 || invoice.currency !== "cad" || !invoice.livemode) return;
  const taxAmount = (invoice.total_taxes || []).reduce((sum, tax) => sum + tax.amount, 0) / 100;
  const firstPayment = invoice.payments?.data?.find(payment => payment.status === "paid");
  const intent = firstPayment?.payment?.payment_intent;
  const id = await receiptId(invoice.id);
  return { id, kind:"financial_income", visible_to_client:false, data:{ source:"stripe", stripeInvoiceId:invoice.id, stripePaymentIntentId:typeof intent === "string" ? intent : intent?.id, amount:invoice.amount_paid/100, taxAmount:Math.min(taxAmount,invoice.amount_paid/100), currency:invoice.currency, date:new Date((invoice.status_transitions.paid_at || invoice.created)*1000).toISOString(), description:invoice.number || invoice.description || "Website payment", party:invoice.customer_name || invoice.customer_email || "", method:"stripe", category:invoice.parent?.subscription_details ? "Subscription payment" : "Website payment", receiptUrl:invoice.hosted_invoice_url } };
}

async function reconcileStripeInvoice(invoice: Stripe.Invoice, stripe: Stripe) {
  if (!invoice.livemode || invoice.status !== "paid" || invoice.currency !== "cad" || invoice.amount_paid <= 0) return;
  const first = invoice.payments?.data?.find(payment => payment.status === "paid");
  const rawIntent = first?.payment.payment_intent;
  const intentId = typeof rawIntent === "string" ? rawIntent : rawIntent?.id;
  let operationId = invoice.metadata?.operation_id;
  if (!operationId && intentId) {
    const sessions = await stripe.checkout.sessions.list({payment_intent:intentId,limit:1});
    operationId = sessions.data[0]?.metadata?.operation_id;
  }
  if (!operationId || !/^[0-9a-f-]{36}$/i.test(operationId)) return;
  const admin = createAdminSupabase();
  const { data: current } = await admin.from("operations").select("id,data,company_id,updated_at").eq("id",operationId).eq("kind","invoice").neq("status","archived").maybeSingle();
  if (!current || current.data.status === "paid" || current.data.status === "void" || Math.round(Number(current.data.total)*100) !== invoice.amount_paid) return;
  const now = new Date().toISOString();
  const data = {...current.data,status:"paid",paidAt:new Date((invoice.status_transitions.paid_at || invoice.created)*1000).toISOString(),paymentMethod:"stripe",stripeLivemode:true,stripeInvoiceId:invoice.id,stripePaymentIntentId:intentId || "",stripeInvoiceUrl:invoice.hosted_invoice_url,stripeInvoicePdf:invoice.invoice_pdf};
  const {data:saved,error} = await admin.from("operations").update({data,updated_at:now}).eq("id",current.id).eq("updated_at",current.updated_at).select("id").maybeSingle();
  if (error) throw new Error("Could not reconcile paid invoice.");
  if (!saved) return;
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://www.veloravistavisuals.com";
  const details: Array<[string,unknown]> = [["Invoice",data.number||current.id],["Amount",`$${(invoice.amount_paid/100).toFixed(2)} CAD`],["Payment method","Stripe"],["Status","Paid"]];
  await Promise.all([
    sendInternalCustomerUpdate({subject:`Payment completed — ${data.number||current.id}`,heading:"Customer payment confirmed",details,actionUrl:`${origin}/admin-portal`}),
    data.email ? sendTransactionalEmail({to:data.email,subject:`Payment received — ${data.number||current.id}`,heading:"Your payment is confirmed",details,actionUrl:`${origin}/client-portal?tab=billing&invoice=${current.id}`,actionLabel:"View paid invoice"}) : Promise.resolve(true),
  ]);
}

export async function recordStripeIncome(invoice: Stripe.Invoice) {
  const row = await stripeIncomeRow(invoice);
  if (!row) return;
  const { error } = await createAdminSupabase().from("operations").upsert(row,{onConflict:"id",ignoreDuplicates:true});
  if (error) throw new Error("Could not record Stripe payment in finance.");
}

export async function syncStripeIncome() {
  if (!process.env.STRIPE_SECRET_KEY) return { warning:"Stripe is not configured. Paid invoices and manual entries are still shown." };
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let startingAfter: string | undefined;
  let count = 0;
  // Bound each sync to 1,000 invoices to keep a dashboard request within runtime limits.
  for (let page = 0; page < 10; page++) {
    const invoices = await stripe.invoices.list({ status:"paid", limit:100, ...(startingAfter ? {starting_after:startingAfter} : {}), expand:["data.payments"] });
    for (const invoice of invoices.data) await reconcileStripeInvoice(invoice,stripe);
    const rows = (await Promise.all(invoices.data.map(stripeIncomeRow))).filter((row): row is NonNullable<typeof row> => Boolean(row));
    if (rows.length) {
      const { error } = await createAdminSupabase().from("operations").upsert(rows,{onConflict:"id",ignoreDuplicates:true});
      if (error) throw new Error("Could not sync Stripe payments.");
      count += rows.length;
    }
    if (!invoices.has_more || !invoices.data.length) return {count};
    startingAfter = invoices.data[invoices.data.length-1].id;
  }
  return {count,warning:"The most recent 1,000 Stripe invoices were synced. Older payments may not be included."};
}
