import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAppUser } from "../../../../../lib/auth";
import { canAccessModule } from "../../../../../lib/permissions";
import { createAdminSupabase } from "../../../../../lib/supabase/server";
import { validFinanceDate } from "../../../../../lib/finance";
import { PAYMENT_METHODS } from "../../../../../lib/interac";
import { sendInternalCustomerUpdate, sendTransactionalEmail } from "../../../../../lib/transactional-email";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAppUser();
  if (!user || user.role === "client" || !canAccessModule(user.role, user.permissions, "billing")) return NextResponse.json({error:"Billing access required."},{status:403});
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({error:"Invalid request origin."},{status:403});
  const body = await request.json().catch(() => null);
  const method = String(body?.method || "");
  let paidDate: string;
  try { paidDate = validFinanceDate(body?.paidDate); } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "Invalid date."},{status:400}); }
  if (!["cash", "interac_etransfer", "personal_etransfer", "bank_transfer", "cheque", "other"].includes(method)) return NextResponse.json({error:"Select the payment method."},{status:400});
  const { id } = await params;
  const admin = createAdminSupabase();
  const { data: invoice } = await admin.from("operations").select("id,data,status,company_id,updated_at").eq("id",id).eq("kind","invoice").neq("status","archived").single();
  if (!invoice) return NextResponse.json({error:"Invoice not found."},{status:404});
  if (invoice.data.status === "paid" || invoice.status === "paid") return NextResponse.json({ok:true,invoice:invoice.data});
  if (invoice.data.status === "void" || !Number.isFinite(Number(invoice.data.total)) || Number(invoice.data.total) <= 0) return NextResponse.json({error:"This invoice cannot be cleared."},{status:400});
  if (invoice.data.stripeCheckoutSessionId) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const session = await stripe.checkout.sessions.retrieve(invoice.data.stripeCheckoutSessionId);
      if (session.status === "complete" || session.payment_status === "paid") return NextResponse.json({error:"A Stripe payment was already submitted. Let its confirmation complete before recording another payment."},{status:409});
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
    } catch { return NextResponse.json({error:"Could not verify the existing card checkout. Please retry."},{status:503}); }
  }
  const now = new Date().toISOString();
  const updated = { ...invoice.data, status:"paid", paymentMethod:method, paidDate, paidAt:`${paidDate}T12:00:00-07:00`, paymentRecordedAt:now, paymentRecordedBy:user.id, paymentReference:String(body?.reference || "").slice(0,200), paymentNotes:String(body?.notes || "").slice(0,2000) };
  const { data: saved, error } = await admin.from("operations").update({data:updated,updated_by:user.id,updated_at:now}).eq("id",id).eq("updated_at",invoice.updated_at).select("id").maybeSingle();
  if (error) return NextResponse.json({error:"Could not save payment."},{status:500});
  if (!saved) return NextResponse.json({error:"Invoice changed. Refresh and try again."},{status:409});
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const details: Array<[string,unknown]> = [["Invoice",updated.number || id],["Amount",`$${Number(updated.total).toFixed(2)} CAD`],["Payment method",PAYMENT_METHODS[method]],["Date received",paidDate],["Status","Paid"]];
  const results = await Promise.all([
    sendInternalCustomerUpdate({subject:`Invoice cleared — ${updated.number || id}`,heading:"Invoice payment recorded",details:[...details,["Recorded by",user.email]],actionUrl:`${origin}/admin-portal`}),
    updated.email ? sendTransactionalEmail({to:String(updated.email),subject:`Payment received — ${updated.number || id}`,heading:"Your payment is confirmed",details,actionUrl:`${origin}/client-portal?tab=billing&invoice=${id}`,actionLabel:"View paid invoice"}) : Promise.resolve(true),
  ]);
  if (invoice.company_id) {
    const { data: recipients } = await admin.from("profiles").select("id").eq("company_id",invoice.company_id).eq("role","client").eq("status","active");
    if (recipients?.length) await admin.from("notifications").insert(recipients.map(({id:recipient_id}) => ({recipient_id,title:"Invoice payment received",body:`${updated.number || id} is paid.`,destination:`/client-portal?tab=billing&invoice=${id}`})));
  }
  return NextResponse.json({ok:true,invoice:updated,warning:results.some(sent => !sent) ? "Invoice cleared and payment recorded. A confirmation email could not be delivered." : undefined});
}
