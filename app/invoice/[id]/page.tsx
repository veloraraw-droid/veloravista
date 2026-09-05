import { notFound } from "next/navigation";
import { createAdminSupabase } from "../../../lib/supabase/server";
import { verifyInvoiceToken } from "../../../lib/invoice-links";
import { InvoiceDocument } from "../../invoice-document";

export const dynamic = "force-dynamic";

export default async function PublicInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token = "" } = await searchParams;
  if (!(await verifyInvoiceToken(id, token))) notFound();

  const admin = createAdminSupabase();
  const { data: invoice } = await admin.from("operations").select("id,data,status").eq("id", id).eq("kind", "invoice").neq("status", "archived").single();
  if (!invoice) notFound();
  const paid = invoice.data?.status === "paid" || invoice.status === "paid";

  return <main className="public-invoice-page">
    <section className="public-invoice-shell">
      <InvoiceDocument invoice={invoice.data} />
      <div className="invoice-client-actions">
        {paid ? <strong className="invoice-paid-message">Payment received — thank you.</strong> : <form action={`/api/invoices/${id}/checkout`} method="post"><input type="hidden" name="token" value={token}/><button type="submit">Pay now ↗</button></form>}
      </div>
    </section>
  </main>;
}

