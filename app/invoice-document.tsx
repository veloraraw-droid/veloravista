"use client";

export type InvoiceData = {
  number?: string;
  invoiceNo?: string;
  client?: string;
  email?: string;
  description?: string;
  subtotal?: number | string;
  tax?: number | string;
  total?: number | string;
  due?: string;
  status?: string;
  notes?: string;
  paymentLink?: string;
};

const cad = (value: unknown) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(value || 0));

export function InvoiceDocument({ invoice }: { invoice: InvoiceData }) {
  const subtotal = Number(invoice.subtotal || invoice.total || 0);
  const total = Number(invoice.total || subtotal);
  const taxAmount = Math.max(0, total - subtotal);
  return <article className="invoice-document" id="velora-invoice-document">
    <div className="invoice-brandline"><b>VELORA VISTA VISUALS</b><span>FILM · CONTENT · PHOTOGRAPHY</span></div>
    <header>
      <div><small>FROM</small><b>VELORA VISTA VISUALS LTD.</b><p>Vancouver, British Columbia<br/>info@veloravistavisuals.com<br/>+1 778 820 0485</p></div>
      <div><small>INVOICE</small><b>{invoice.number || invoice.invoiceNo || "DRAFT"}</b><p>Issued {new Date().toLocaleDateString("en-CA", { year:"numeric", month:"long", day:"numeric" })}<br/>Due {invoice.due || "On receipt"}</p><span className={`invoice-status ${invoice.status || "draft"}`}>{invoice.status || "Draft"}</span></div>
    </header>
    <section className="invoice-billto"><small>BILL TO</small><h3>{invoice.client || "Client"}</h3><p>{invoice.email || ""}</p></section>
    <table><thead><tr><th>Service description</th><th>Amount</th></tr></thead><tbody><tr><td>{invoice.description || "Creative production services"}</td><td>{cad(subtotal)}</td></tr><tr><td>GST / tax ({Number(invoice.tax || 0)}%)</td><td>{cad(taxAmount)}</td></tr></tbody><tfoot><tr><th>Total CAD</th><th>{cad(total)}</th></tr></tfoot></table>
    {invoice.notes ? <section className="invoice-notes"><small>NOTES</small><p>{invoice.notes}</p></section> : null}
    <footer><div><b>THANK YOU FOR CREATING WITH US.</b><p>Questions about this invoice? Contact info@veloravistavisuals.com or call 778-820-0485.</p></div><span>VELORAVISTAVISUALS.COM</span></footer>
  </article>;
}

export function printInvoice(invoice: InvoiceData) {
  const node = document.getElementById("velora-invoice-document");
  if (!node) return;
  const popup = window.open("", "_blank", "width=980,height=820");
  if (!popup) { window.print(); return; }
  popup.document.write(`<!doctype html><html><head><title>${invoice.number || invoice.invoiceNo || "Velora invoice"}</title><style>${invoicePrintCss}</style></head><body>${node.outerHTML}<script>window.onload=()=>{window.print()}<\/script></body></html>`);
  popup.document.close();
}

const invoicePrintCss = `@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;color:#111;background:#fff;font-family:Arial,sans-serif}.invoice-document{min-height:255mm;border:0;padding:42px;color:#111;background:#fff}.invoice-brandline{display:flex;justify-content:space-between;align-items:center;padding-bottom:22px;border-bottom:7px solid #dfff38}.invoice-brandline b{font-size:23px}.invoice-brandline span,small{font-size:9px;letter-spacing:.14em}.invoice-document header{display:flex;justify-content:space-between;padding:34px 0;border-bottom:2px solid #111}.invoice-document header>div:last-child{text-align:right}.invoice-document header b{display:block;font-size:16px;margin:9px 0}.invoice-document p{font-size:11px;line-height:1.65}.invoice-status{display:inline-block;padding:6px 10px;background:#eee;text-transform:uppercase;font-size:9px}.invoice-billto{padding:32px 0}.invoice-billto h3{font-size:27px;margin:8px 0}.invoice-document table{width:100%;border-collapse:collapse}.invoice-document th,.invoice-document td{padding:16px 12px;border-top:1px solid #bbb;text-align:left;font-size:11px}.invoice-document th:last-child,.invoice-document td:last-child{text-align:right}.invoice-document tfoot th{font-size:15px;border-top:3px solid #111}.invoice-notes{padding:28px 0}.invoice-document footer{margin-top:50px;padding-top:18px;border-top:7px solid #111;display:flex;justify-content:space-between;align-items:end}.invoice-document footer b{font-size:12px}.invoice-document footer span{font-size:9px;letter-spacing:.1em}`;
