export type InvoiceItem = { description: string; quantity: number; unitPrice: number };
export type TaxMode = "percent" | "amount";
export const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);
export const dollars = (amount: number) => amount / 100;

export function calculateInvoice(items: InvoiceItem[], taxMode: TaxMode, taxValue: number) {
  if (!items.length || items.length > 100) throw new Error("Add between 1 and 100 invoice items.");
  const normalized = items.map((item) => {
    const description = String(item.description || "").trim();
    const quantity = Number(item.quantity), unitPrice = Number(item.unitPrice);
    if (!description || description.length > 500 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000 || !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000) throw new Error("Each item needs a description, a positive quantity and a valid price.");
    return { description, quantity, unitPrice: dollars(cents(unitPrice)) };
  });
  if (!["percent", "amount"].includes(taxMode) || !Number.isFinite(taxValue) || taxValue < 0 || (taxMode === "percent" && taxValue > 100)) throw new Error("Enter a valid tax percentage or amount.");
  const subtotalCents = normalized.reduce((sum, item) => sum + Math.round(item.quantity * cents(item.unitPrice)), 0);
  const taxCents = taxMode === "amount" ? cents(taxValue) : Math.round(subtotalCents * taxValue / 100);
  if (subtotalCents <= 0 || subtotalCents + taxCents > 100000000) throw new Error("Invoice total must be greater than zero and no more than $1,000,000.");
  return { items: normalized, subtotal: dollars(subtotalCents), taxMode, taxValue, tax: taxMode === "percent" ? taxValue : 0, taxAmount: dollars(taxCents), total: dollars(subtotalCents + taxCents), description: normalized.map(item => item.description).join(" · ") };
}

export function normalizeInvoice(data: Record<string, unknown>) {
  if (!Array.isArray(data.items)) throw new Error("Add invoice line items.");
  const calculated = calculateInvoice(data.items as InvoiceItem[], (data.taxMode || "percent") as TaxMode, Number(data.taxValue ?? data.tax ?? 0));
  return { ...data, ...calculated };
}
