"use client";
import { useState } from "react";
import { calculateInvoice, cents, dollars, InvoiceItem, TaxMode } from "../lib/invoice-math";

const cad = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
export function InvoiceEditor({ initial = {} }: { initial?: Record<string, any> }) {
  const [items, setItems] = useState<InvoiceItem[]>(() => initial.items?.length ? initial.items : [{ description: initial.description || "", quantity: 1, unitPrice: Number(initial.subtotal ?? initial.total ?? 0) }]);
  const [taxMode, setTaxMode] = useState<TaxMode>(initial.taxMode || "percent");
  const [taxValue, setTaxValue] = useState(String(initial.taxValue ?? initial.tax ?? 0));
  const subtotal = dollars(items.reduce((sum, item) => sum + Math.round((Number(item.quantity) || 0) * cents(Number(item.unitPrice) || 0)), 0));
  let calculated: ReturnType<typeof calculateInvoice> | null = null;
  try { calculated = calculateInvoice(items, taxMode, Number(taxValue)); } catch {}
  const taxAmount = taxMode === "amount" ? Number(taxValue) || 0 : dollars(Math.round(cents(subtotal) * (Number(taxValue) || 0) / 100));
  const change = (index: number, patch: Partial<InvoiceItem>) => setItems(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  return <section className="invoice-editor">
    <input type="hidden" name="items" value={JSON.stringify(items)} />
    <input type="hidden" name="taxMode" value={taxMode} />
    <input type="hidden" name="taxValue" value={taxValue} />
    <div className="invoice-editor-heading"><b>Invoice items</b><button type="button" disabled={items.length >= 100} onClick={() => setItems(current => [...current, { description: "", quantity: 1, unitPrice: 0 }])}>+ Add item</button></div>
    {items.map((item, index) => <div className="invoice-item-editor" key={index}>
      <label>Item / service<input aria-label={`Item ${index + 1} description`} value={item.description} required maxLength={500} onChange={e => change(index, { description: e.target.value })} placeholder="e.g. Property reel" /></label>
      <label>Qty<input aria-label={`Item ${index + 1} quantity`} type="number" min="0.01" max="100000" step="0.01" value={item.quantity || ""} required onChange={e => change(index, { quantity: Number(e.target.value) })} /></label>
      <label>Unit price CAD<input aria-label={`Item ${index + 1} unit price`} type="number" min="0" max="1000000" step="0.01" value={item.unitPrice} required onChange={e => change(index, { unitPrice: Number(e.target.value) })} /></label>
      <div className="invoice-item-amount"><small>Amount</small><b>{cad(dollars(Math.round(item.quantity * cents(item.unitPrice))))}</b></div>
      <button type="button" className="invoice-item-remove" aria-label={`Remove item ${index + 1}`} disabled={items.length === 1} onClick={() => setItems(current => current.filter((_, i) => i !== index))}>Remove</button>
    </div>)}
    <div className="invoice-tax-editor"><label>Tax calculation<select value={taxMode} onChange={e => setTaxMode(e.target.value as TaxMode)}><option value="percent">Percentage (%)</option><option value="amount">Fixed amount (CAD)</option></select></label><label>{taxMode === "percent" ? "Tax %" : "Tax amount CAD"}<input type="number" min="0" max={taxMode === "percent" ? 100 : 1000000} step="0.01" value={taxValue} required onChange={e => setTaxValue(e.target.value)} /></label></div>
    <dl className="invoice-editor-totals"><dt>Subtotal</dt><dd>{cad(subtotal)}</dd><dt>Tax</dt><dd>{cad(taxAmount)}</dd><dt>Total CAD</dt><dd>{cad(subtotal + taxAmount)}</dd></dl>
    {!calculated && <p className="invoice-editor-hint">Complete every item and enter a total greater than zero.</p>}
  </section>;
}

export function invoiceFields(form: FormData) {
  return calculateInvoice(JSON.parse(String(form.get("items") || "[]")), String(form.get("taxMode")) as TaxMode, Number(form.get("taxValue")));
}
