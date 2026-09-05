import { notFound, redirect } from "next/navigation";
import { verifyInvoiceToken } from "../../../lib/invoice-links";

export const dynamic = "force-dynamic";

export default async function PublicInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token = "" } = await searchParams;
  if (!(await verifyInvoiceToken(id, token))) notFound();

  redirect(`/client-portal?tab=billing&invoice=${encodeURIComponent(id)}`);
}
