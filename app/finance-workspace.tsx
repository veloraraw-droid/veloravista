"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { FinanceEntry, localDate, monthTotals, previousMonth } from "../lib/finance";
import { createBrowserSupabase } from "../lib/supabase/client";
import { PAYMENT_METHODS } from "../lib/interac";

const cad = (amount: number) => new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(amount);
const monthName = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-CA",{month:"long",year:"numeric",timeZone:"America/Vancouver"});
const expenseCategories = ["Equipment","Software & subscriptions","Editing","Freelancers & crew","Travel & transport","Studio & rent","Marketing","Insurance","Meals","Other"];

export function FinanceWorkspace({ onInvoice }: { onInvoice: (id: string) => void }) {
  const [entries,setEntries] = useState<FinanceEntry[]>([]), [outstanding,setOutstanding] = useState(0);
  const [loading,setLoading] = useState(true), [notice,setNotice] = useState(""), [busy,setBusy] = useState(false);
  const [month,setMonth] = useState(localDate().slice(0,7)), [year,setYear] = useState(localDate().slice(0,4));
  const [filter,setFilter] = useState("all"), [search,setSearch] = useState(""), [allDates,setAllDates] = useState(false);
  const [editor,setEditor] = useState<{type:"income"|"expense";id:string;entry?:FinanceEntry}|null>(null);
  const lock = useRef(false), autoSynced = useRef(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/finance",{cache:"no-store"});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load finance.");
    setEntries(result.entries); setOutstanding(result.outstanding); setLoading(false);
  },[]);
  const sync = useCallback(async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const response = await fetch("/api/finance",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"sync"})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not sync website payments.");
      await load(); setNotice(result.warning || "Website payments are up to date.");
    } catch(error) { setNotice(error instanceof Error ? error.message : "Could not sync."); }
    finally { lock.current = false; setBusy(false); }
  },[load]);
  useEffect(() => {
    void load().catch(error => {setLoading(false);setNotice(error.message);});
    if (!autoSynced.current) { autoSynced.current = true; void sync(); }
  },[load,sync]);
  useEffect(() => {
    const supabase = createBrowserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel("velora-finance-live").on("postgres_changes", {event:"*",schema:"public",table:"operations"}, () => {
      clearTimeout(timer); timer = setTimeout(() => { void load().catch(error => setNotice(error.message)); }, 250);
    }).subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(channel); };
  },[load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editor || lock.current) return;
    const current = editor, form = new FormData(event.currentTarget);
    lock.current = true; setBusy(true); setNotice("Saving finance entry…");
    try {
      const response = await fetch("/api/finance",{method:current.entry ? "PATCH" : "POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:current.id,type:current.type,data:Object.fromEntries(form.entries())})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save entry.");
      setEditor(null); await load(); setNotice("Entry saved. Monthly totals updated.");
    } catch(error) {setNotice(error instanceof Error ? error.message : "Could not save entry.");}
    finally {lock.current = false;setBusy(false);}
  }
  async function remove(entry: FinanceEntry) {
    if (lock.current || !confirm(`Remove ${entry.description} (${cad(entry.amount)})?`)) return;
    lock.current = true; setBusy(true);
    try {
      const response = await fetch(`/api/finance?id=${entry.id}`,{method:"DELETE"});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not remove entry.");
      await load();setNotice("Entry removed. Totals updated.");
    } catch(error) {setNotice(error instanceof Error ? error.message : "Could not remove entry.");}
    finally {lock.current = false;setBusy(false);}
  }
  const current = monthTotals(entries,month), last = monthTotals(entries,previousMonth(month));
  const change = last.income > 0 ? `${(Math.abs(current.income-last.income)/last.income*100).toFixed(1)}% ${current.income >= last.income ? "up" : "down"}` : "No payments in previous month";
  const months = Array.from({length:12},(_,i)=>monthTotals(entries,`${year}-${String(i+1).padStart(2,"0")}`));
  const scale = Math.max(1,...months.flatMap(item => [item.income,item.expenses]));
  const years = [...new Set([localDate().slice(0,4),...entries.map(entry=>entry.date.slice(0,4))])].sort().reverse();
  const shown = entries.filter(entry => (allDates || entry.date.slice(0,7) === month) && (filter === "all" || entry.type === filter) && `${entry.description} ${entry.party} ${entry.category} ${entry.reference || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="admin-page finance-workspace">
    <div className="admin-toolbar"><div><small>COMPANY FINANCE · CAD</small><h2>Income & expenses</h2></div><div className="finance-toolbar-actions"><button disabled={busy} onClick={()=>setEditor({type:"income",id:crypto.randomUUID()})}>+ Payment received</button><button disabled={busy} onClick={()=>setEditor({type:"expense",id:crypto.randomUUID()})}>+ Expense</button></div></div>
    <div className="finance-controls"><label>Report month<input type="month" value={month} onChange={e=>{if(e.target.value){setMonth(e.target.value);setYear(e.target.value.slice(0,4));}}}/></label><button disabled={busy} onClick={()=>void sync()}>{busy ? "Updating…" : "Sync website payments"}</button><button disabled={busy} onClick={()=>void load().catch(error=>setNotice(error.message))}>Refresh records</button></div>
    {notice && <p className="finance-notice" role="status">{notice}</p>}
    {loading ? <p>Loading finance records…</p> : <>
      <p className="finance-period">{monthName(month)}{month === localDate().slice(0,7) ? " · month so far" : ""}. Comparison: {monthName(previousMonth(month))}, full month.</p>
      <div className="finance-summary-grid">
        <article><small>PAYMENTS RECEIVED</small><b>{cad(current.income)}</b><span>{change}</span></article>
        <article><small>RECORDED EXPENSES</small><b>{cad(current.expenses)}</b><span>Previous month {cad(last.expenses)}</span></article>
        <article><small>NET CASH FLOW</small><b className={current.net < 0 ? "finance-negative" : ""}>{cad(current.net)}</b><span>Received minus recorded expenses</span></article>
        <article><small>SALES REVENUE</small><b>{cad(current.revenue)}</b><span>Payments excluding {cad(current.tax)} sales tax</span></article>
      </div>
      <div className="finance-comparison"><span>Last month received <b>{cad(last.income)}</b></span><span>Last month net cash flow <b>{cad(last.net)}</b></span><span>All unpaid invoices <b>{cad(outstanding)}</b></span></div>
      <section className="finance-chart"><div className="finance-chart-heading"><div><h3>Monthly money in & out</h3><p><span className="finance-legend income"/> Payments received <span className="finance-legend expense"/> Expenses</p></div><label>Year<select value={year} onChange={e=>setYear(e.target.value)}>{years.map(value=><option key={value}>{value}</option>)}</select></label></div>
        <div className="finance-chart-scroll"><div className="finance-chart-bars" role="group" aria-label={`Monthly payments and expenses for ${year}`}>
          {months.map((item,index)=><button type="button" key={item.month} className={month===item.month ? "active" : ""} onClick={()=>{setMonth(item.month);setAllDates(false);}} aria-label={`${monthName(item.month)}: received ${cad(item.income)}, expenses ${cad(item.expenses)}, net ${cad(item.net)}`} title={`${monthName(item.month)}\nReceived ${cad(item.income)}\nExpenses ${cad(item.expenses)}\nNet ${cad(item.net)}`}><span className="finance-bar-pair"><span className="finance-income-bar" style={{height:`${item.income/scale*100}%`}}/><span className="finance-expense-bar" style={{height:`${item.expenses/scale*100}%`}}/></span><small>{new Date(2026,index,15).toLocaleDateString("en-CA",{month:"short"})}</small></button>)}
        </div></div>
        <details><summary>View monthly figures</summary><div className="finance-table-wrap"><table><thead><tr><th>Month</th><th>Received</th><th>Expenses</th><th>Net cash flow</th></tr></thead><tbody>{months.map(item=><tr key={item.month}><td>{monthName(item.month)}</td><td>{cad(item.income)}</td><td>{cad(item.expenses)}</td><td>{cad(item.net)}</td></tr>)}</tbody></table></div></details>
      </section>
      <section className="finance-transactions"><h3>Transactions</h3><div className="finance-transaction-filters"><label>Type<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All transactions</option><option value="income">Payments received</option><option value="expense">Expenses</option></select></label><label>Search<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Customer, item or reference"/></label><label className="finance-all-dates"><input type="checkbox" checked={allDates} onChange={e=>setAllDates(e.target.checked)}/> All dates</label></div>
        {shown.length ? <div className="finance-entry-list">{shown.map(entry=><article key={`${entry.source}-${entry.id}`}><div><span className={`finance-entry-type ${entry.type}`}>{entry.type === "income" ? "Received" : "Expense"}</span><time>{entry.date}</time>{entry.estimatedDate && <small>Payment date estimated</small>}</div><div><b>{entry.description}</b><p>{entry.party}{entry.party ? " · " : ""}{entry.category}</p><small>{PAYMENT_METHODS[entry.method] || entry.method} · {entry.source === "invoice" ? "Cleared invoice" : entry.source === "stripe" ? "Website payment" : "Manual entry"}{entry.reference ? ` · ${entry.reference}` : ""}</small>{entry.notes && <p>{entry.notes}</p>}</div><strong className={entry.type === "expense" ? "finance-negative" : ""}>{entry.type === "expense" ? "−" : "+"}{cad(entry.amount)}</strong><div className="finance-entry-actions">{entry.invoiceId && <button onClick={()=>onInvoice(entry.invoiceId!)}>View invoice</button>}{entry.editable && <><button disabled={busy} onClick={()=>setEditor({type:entry.type,id:entry.id,entry})}>Edit</button><button disabled={busy} onClick={()=>void remove(entry)}>Remove</button></>}</div></article>)}</div> : <p className="finance-empty">No matching transactions. Cleared invoices appear automatically; add other payments and expenses above.</p>}
      </section>
      <p className="finance-footnote">All figures are CAD and use Vancouver dates. Net cash flow includes sales tax and reflects recorded expenses. Record Stripe fees and refunds as expenses if they are not yet included. Test Stripe invoices are excluded from syncing.</p>
    </>}
    {editor && <div className="portal-modal finance-entry-modal" role="dialog" aria-modal="true" aria-label={editor.type === "income" ? "Record payment received" : "Record expense"}><section><div className="finance-editor-heading"><h3>{editor.entry ? "Edit" : "Add"} {editor.type === "income" ? "payment received" : "expense"}</h3><button disabled={busy} onClick={()=>setEditor(null)}>Close</button></div>{editor.type === "income" && <p>For a payment against an existing invoice, use Billing → Mark invoice paid. Add payments here only when they have no invoice.</p>}<form className="admin-form finance-entry-form" onSubmit={save}>
      <label>Description<input name="description" required maxLength={500} defaultValue={editor.entry?.description}/></label>
      <label>{editor.type === "income" ? "Customer / payer" : "Vendor / paid to"}<input name="party" maxLength={200} defaultValue={editor.entry?.party}/></label>
      <div><label>Date {editor.type === "income" ? "received" : "paid"}<input name="date" type="date" required max={localDate()} defaultValue={editor.entry?.date || localDate()}/></label><label>Total CAD (including tax)<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required defaultValue={editor.entry?.amount}/></label></div>
      <div><label>Tax included CAD<input name="taxAmount" type="number" min="0" step="0.01" defaultValue={editor.entry?.taxAmount || 0}/></label><label>Category<select name="category" defaultValue={editor.entry?.category || (editor.type === "income" ? "Other income" : "Other")}>{(editor.type === "income" ? ["Services","Prints","Other income"] : expenseCategories).map(category=><option key={category}>{category}</option>)}</select></label></div>
      <label>Payment method<select name="method" defaultValue={editor.entry?.method || "cash"}>{Object.entries(PAYMENT_METHODS).filter(([key])=>key!=="stripe").map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>Reference (optional)<input name="reference" defaultValue={editor.entry?.reference}/></label><label>Notes<textarea name="notes" rows={3} defaultValue={editor.entry?.notes}/></label><button disabled={busy} type="submit">{busy ? "Saving…" : "Save entry"}</button>
      {notice && <p role="status">{notice}</p>}
    </form></section></div>}
  </section>;
}
