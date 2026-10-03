"use client";
import { useRef, useState } from "react";
import { INTERAC_EMAIL } from "../lib/interac";

export function InteracPayment({ id, invoice, onUpdated }: { id: string; invoice: Record<string, any>; onUpdated: (invoice: Record<string, any>) => void }) {
  const [open, setOpen] = useState(invoice.status === "etransfer_pending");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const pending = invoice.status === "etransfer_pending";
  async function report() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/invoices/${id}/interac`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "report" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit. Please try again.");
      setNotice(result.warning || "Your e-Transfer is pending confirmation. Please do not send it again.");
      onUpdated(result.invoice);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Please try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="interac-payment">
    <p><b>Preferred payment method</b></p>
    {!open ? <button type="button" onClick={() => setOpen(true)}>Pay by Interac e-Transfer</button> : <>
      <h3>Interac e-Transfer</h3>
      <p>Send the exact invoice total from your banking app. Include your invoice number in the transfer message.</p>
      <dl><dt>Send to</dt><dd>{INTERAC_EMAIL}</dd><dt>Amount</dt><dd>{new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(invoice.total))}</dd><dt>Message / reference</dt><dd>{invoice.number || invoice.invoiceNo}</dd></dl>
      <button type="button" onClick={() => { void navigator.clipboard.writeText(INTERAC_EMAIL).then(() => setNotice("Email copied.")).catch(() => setNotice("Select and copy the email above.")); }}>Copy email</button>
      {pending ? <p role="status"><b>Pending confirmation.</b> Your invoice will show paid after our team receives and confirms the funds. Please do not send another transfer.</p> : <><p>After sending the transfer, let us know below. This does not mark the invoice paid.</p><button type="button" disabled={busy} onClick={() => void report()}>{busy ? "Submitting…" : "I’ve sent the e-Transfer"}</button></>}
      {notice && <p role="status">{notice}</p>}
    </>}
  </section>;
}
