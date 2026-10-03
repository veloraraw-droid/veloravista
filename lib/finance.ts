import { cents, dollars } from "./invoice-math";
export type FinanceRecord = { id: string; kind: string; data: Record<string, any>; status?: string; updated_at?: string; created_at?: string };
export type FinanceEntry = { id: string; type: "income" | "expense"; date: string; description: string; party: string; amount: number; taxAmount: number; method: string; source: string; category: string; invoiceId?: string; editable: boolean; estimatedDate?: boolean; notes?: string; reference?: string };
export function localDate(value: string | Date = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function validFinanceDate(value: unknown) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(new Date(`${date}T12:00:00Z`).getTime()) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date || date < "2000-01-01" || date > localDate()) throw new Error("Choose a valid received / expense date, up to today.");
  return date;
}
export function normalizeFinanceEntry(data: Record<string, unknown>) {
  const amount = Number(data.amount), taxAmount = Number(data.taxAmount || 0);
  const description = String(data.description || "").trim();
  if (!description || description.length > 500 || !Number.isFinite(amount) || amount <= 0 || amount > 1000000 || !Number.isFinite(taxAmount) || taxAmount < 0 || taxAmount > amount) throw new Error("Enter a description, a positive amount and tax no greater than the total.");
  const method = String(data.method || "other");
  if (!["cash", "interac_etransfer", "personal_etransfer", "bank_transfer", "cheque", "other"].includes(method)) throw new Error("Choose a valid payment method.");
  return { amount: dollars(cents(amount)), taxAmount: dollars(cents(taxAmount)), date: validFinanceDate(data.date), description, party: String(data.party || "").trim().slice(0, 200), category: String(data.category || "Other").slice(0, 100), method, notes: String(data.notes || "").slice(0, 2000), reference: String(data.reference || "").slice(0, 200), source: "manual" };
}
export function financeEntries(records: FinanceRecord[]): FinanceEntry[] {
  const active = records.filter(record => record.status !== "archived");
  const invoices = active.filter(record => record.kind === "invoice" && record.data.status === "paid" && record.data.stripeLivemode !== false);
  const stripeInvoices = new Set(invoices.map(record => record.data.stripeInvoiceId).filter(Boolean));
  const paymentIntents = new Set(invoices.map(record => record.data.stripePaymentIntentId).filter(Boolean));
  const ownInvoiceIds = new Set(invoices.map(record => record.id));
  const entries: FinanceEntry[] = invoices.map(record => {
    const d = record.data;
    return { id: record.id, invoiceId: record.id, type: "income", date: localDate(d.paidDate || d.paidAt || record.updated_at || record.created_at || ""), description: `${d.number || "Invoice"} · ${d.description || "Creative services"}`, party: d.client || "", amount: Number(d.total || 0), taxAmount: Number(d.taxAmount ?? Math.max(0, Number(d.total || 0) - Number(d.subtotal ?? d.total ?? 0))), method: d.paymentMethod || (d.stripePaymentIntentId ? "stripe" : "other"), source: "invoice", category: "Invoice payment", editable: false, estimatedDate: !d.paidDate && !d.paidAt, reference: d.paymentReference };
  });
  for (const record of active) {
    if (!["financial_income", "financial_expense"].includes(record.kind)) continue;
    const d = record.data;
    if (record.kind === "financial_income" && (ownInvoiceIds.has(d.invoiceId) || stripeInvoices.has(d.stripeInvoiceId) || paymentIntents.has(d.stripePaymentIntentId))) continue;
    if (d.currency && d.currency !== "cad") continue;
    entries.push({ id: record.id, type: record.kind === "financial_income" ? "income" : "expense", date: localDate(d.date), description: d.description || "", party: d.party || "", amount: Number(d.amount || 0), taxAmount: Number(d.taxAmount || 0), method: d.method || "other", source: d.source || "manual", category: d.category || "Other", invoiceId: d.invoiceId, editable: d.source === "manual", notes: d.notes, reference: d.reference });
  }
  return entries.filter(entry => entry.date && Number.isFinite(entry.amount) && entry.amount > 0).sort((a,b) => b.date.localeCompare(a.date));
}
export function monthTotals(entries: FinanceEntry[], month: string) {
  let income = 0, expenses = 0, tax = 0;
  for (const entry of entries) if (entry.date.slice(0, 7) === month) {
    if (entry.type === "income") { income += cents(entry.amount); tax += cents(entry.taxAmount); } else expenses += cents(entry.amount);
  }
  return { month, income: dollars(income), expenses: dollars(expenses), tax: dollars(tax), net: dollars(income - expenses), revenue: dollars(income - tax) };
}
export function previousMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return `${value === 1 ? year - 1 : year}-${String(value === 1 ? 12 : value - 1).padStart(2, "0")}`;
}
