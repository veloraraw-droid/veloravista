"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "./components";
import { createBrowserSupabase } from "../lib/supabase/client";
import { InvoiceDocument, printInvoice } from "./invoice-document";
type RecordItem = {
  id: string;
  kind: string;
  data: Record<string, any>;
  status: string;
  updated_at: string;
};
export function ClientWorkspace({ initialTab, initialInvoiceId, paymentResult, sessionId }: { initialTab?: string; initialInvoiceId?: string; paymentResult?: string; sessionId?: string }) {
  const [tab, setTab] = useState(initialTab === "billing" ? "billing" : "overview"),
    [payload, setPayload] = useState<any>(null),
    [busy, setBusy] = useState(true),
    [selectedInvoice, setSelectedInvoice] = useState<RecordItem|null>(null),
    [paymentNotice, setPaymentNotice] = useState(paymentResult === "cancelled" ? "Payment was not completed or was declined. Please try again." : ""),
    [paymentLinks, setPaymentLinks] = useState<{invoiceUrl?:string;invoicePdf?:string;receiptUrl?:string}>({});
  const load = useCallback(async () => {
    const r = await fetch("/api/client");
    if (r.ok) setPayload(await r.json());
    setBusy(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const s = createBrowserSupabase();
    const c = s
      .channel("velora-client-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "operations" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void s.removeChannel(c);
    };
  }, [load]);
  const by = useCallback(
    (kind: string) =>
      (payload?.records || []).filter((x: RecordItem) => x.kind === kind),
    [payload],
  );
  const projects = by("project"),
    invoices = by("invoice"),
    contracts = by("contract"),
    bookings = by("booking"),
    meetings = by("meeting"),
    subscriptions = by("subscription"),
    schedule = [...bookings, ...meetings].sort(
      (a, b) =>
        new Date(a.data.start).getTime() - new Date(b.data.start).getTime(),
    );
  const latest = useMemo(() => projects[0], [projects]);
  useEffect(() => {
    if (!initialInvoiceId || !payload?.records) return;
    const invoice = payload.records.find((item: RecordItem) => item.kind === "invoice" && item.id === initialInvoiceId);
    if (invoice) { setTab("billing"); setSelectedInvoice(invoice); }
  }, [initialInvoiceId, payload]);
  useEffect(() => {
    if (paymentResult !== "success" || !initialInvoiceId || !sessionId) return;
    void fetch(`/api/invoices/${initialInvoiceId}/status?session_id=${encodeURIComponent(sessionId)}`)
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then(({ ok, body }) => {
        if (!ok || body.status !== "paid") { setPaymentNotice("Payment could not be confirmed. Please contact us if your card was charged."); return; }
        setPaymentNotice("Payment completed successfully. Your paid invoice and receipt are ready.");
        setPaymentLinks({ invoiceUrl: body.invoiceUrl, invoicePdf: body.invoicePdf, receiptUrl: body.receiptUrl });
        void load();
      })
      .catch(() => setPaymentNotice("Payment confirmation is taking longer than expected. Please refresh shortly."));
  }, [paymentResult, initialInvoiceId, sessionId, load]);
  async function accept(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "accept_terms",
        signature: f.get("signature"),
      }),
    });
    if (r.ok) void load();
  }
  async function signContract(x: RecordItem) {
    const signature = prompt(
      "Type your full legal name to sign this agreement",
    );
    if (!signature) return;
    const r = await fetch("/api/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sign_contract", id: x.id, signature }),
    });
    if (r.ok) void load();
    else alert((await r.json()).error || "Could not sign this agreement");
  }
  async function readNotification(id: string) {
    await fetch("/api/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read_notification", id }),
    });
    void load();
  }
  async function sendRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: f.get("action"),
        message: f.get("message"),
        recordId: f.get("recordId"),
      }),
    });
    if (r.ok) {
      e.currentTarget.reset();
      void load();
      alert("Sent to your Velora team.");
    } else alert((await r.json()).error || "Could not send your request");
  }
  if (busy)
    return (
      <main className="portal-loading">Opening your secure workspace…</main>
    );
  if (!payload)
    return (
      <main className="portal-loading">
        We could not open your workspace. Please sign in again.
      </main>
    );
  if (!payload.terms?.length)
    return (
      <main className="terms-gate">
        <Logo dark />
        <section>
          <small>FIRST-TIME ACCOUNT SETUP</small>
          <h1>One final step.</h1>
          <p>
            By entering your name, you agree to use this private portal only for
            your company’s authorized work, protect your login, and accept
            Velora Vista Visuals Ltd.’s service, billing, privacy, and
            electronic-signature terms.
          </p>
          <form onSubmit={accept}>
            <label>
              Full legal name
              <input
                name="signature"
                required
                placeholder="Type your full name"
              />
            </label>
            <button>Agree & enter workspace ↗</button>
          </form>
          <a href="mailto:info@veloravistavisuals.com">
            Questions? Contact us before accepting.
          </a>
        </section>
      </main>
    );
  return (
    <main className="portal">
      <aside className="portal-side">
        <Logo dark />
        <nav>
          {[
            ["overview", "Overview"],
            ["projects", "My work & Drive"],
            ["billing", "Billing & invoices"],
            ["contracts", "Contracts"],
            ["schedule", "Schedule"],
            ["requests", "Requests & approvals"],
            [
              "notifications",
              `Notifications${payload.notifications?.filter((x: any) => !x.read_at).length ? ` (${payload.notifications.filter((x: any) => !x.read_at).length})` : ""}`,
            ],
            ["account", "Account & privacy"],
          ].map(([id, label]) => (
            <button
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
              key={id}
            >
              {label}
              <span>↗</span>
            </button>
          ))}
        </nav>
        <div className="portal-help">
          <p>Need help?</p>
          <a href="tel:+17788200485">Call 778-820-0485</a>
          <a href="mailto:info@veloravistavisuals.com">Email support</a>
        </div>
        <a className="sign-out" href="/auth/signout">
          Sign out
        </a>
      </aside>
      <section className="portal-main">
        <header>
          <div>
            <p>VELORA CLIENT PORTAL</p>
            <h1>
              Welcome,
              <br />
              {payload.company?.name || payload.user.displayName}.
            </h1>
          </div>
          <span className="status">● Live & secure</span>
        </header>
        {tab === "overview" && (
          <>
            <div className="portal-alert">
              <span>●</span>
              <div>
                <b>
                  {latest
                    ? `${latest.data.title || "Your project"} was updated`
                    : "Your account is connected"}
                </b>
                <p>
                  {latest
                    ? `Status: ${latest.data.status || latest.status}`
                    : "New work will appear here automatically."}
                </p>
              </div>
              {latest?.data.drive && (
                <a href={latest.data.drive} target="_blank" rel="noreferrer">
                  Open Drive ↗
                </a>
              )}
            </div>
            <div className="portal-grid">
              <article className="plan-card">
                <div>
                  <p>CURRENT PLAN</p>
                  <span className="status">
                    ● {subscriptions[0]?.data.status || "Active"}
                  </span>
                </div>
                <h2>{subscriptions[0]?.data.plan || "Custom partnership"}</h2>
                <p>
                  Plan changes and cancellations are confirmed by phone for
                  account security.
                </p>
                <a href="tel:+17788200485">Call the studio ↗</a>
              </article>
              <article className="next-shoot">
                <p>NEXT BOOKING</p>
                <h3>{bookings[0]?.data.title || "Not scheduled"}</h3>
                <span>
                  {bookings[0]?.data.start
                    ? new Date(bookings[0].data.start).toLocaleString("en-CA")
                    : "Your producer will add the next date here."}
                </span>
              </article>
            </div>
          </>
        )}
        {tab === "projects" && (
          <section className="portal-section">
            <div className="portal-title">
              <div>
                <p>MY WORK</p>
                <h2>Projects & deliveries</h2>
              </div>
            </div>
            {projects.length ? (
              projects.map((x: RecordItem) => (
                <div className="file-project" key={x.id}>
                  <span>●</span>
                  <div>
                    <h3>{x.data.title}</h3>
                    <p>{x.data.deliverables || x.data.status}</p>
                  </div>
                  <b>{x.data.status}</b>
                  {x.data.drive ? (
                    <a href={x.data.drive} target="_blank" rel="noreferrer">
                      Open Google Drive ↗
                    </a>
                  ) : (
                    <span>Files pending</span>
                  )}
                </div>
              ))
            ) : (
              <p>No projects have been shared yet.</p>
            )}
          </section>
        )}
        {tab === "billing" && (
          <section className="portal-section">
            <div className="portal-title">
              <div>
                <p>BILLING</p>
                <h2>Invoices & subscription</h2>
              </div>
            </div>
            {paymentNotice && <div className={`payment-result ${paymentNotice.startsWith("Payment completed") ? "success" : "warning"}`} role="status"><b>{paymentNotice}</b>{paymentLinks.invoiceUrl&&<a href={paymentLinks.invoiceUrl} target="_blank" rel="noreferrer">View Stripe invoice ↗</a>}{paymentLinks.invoicePdf&&<a href={paymentLinks.invoicePdf} target="_blank" rel="noreferrer">Download invoice PDF ↓</a>}{paymentLinks.receiptUrl&&<a href={paymentLinks.receiptUrl} target="_blank" rel="noreferrer">View receipt ↗</a>}</div>}
            {invoices.map((x: RecordItem) => (
              <div className="file-project" key={x.id}>
                <span>INV</span>
                <div>
                  <h3>{x.data.number || x.data.invoiceNo}</h3>
                  <p>{x.data.notes}</p>
                </div>
                <b>${x.data.total || x.data.amount || 0}</b>
                {x.data.publicInvoiceUrl ? (
                  <a href={x.data.publicInvoiceUrl}>View & pay ↗</a>
                ) : x.data.paymentLink ? (
                  <a href={x.data.paymentLink}>Pay securely ↗</a>
                ) : (
                  <span>{x.data.status}</span>
                )}
                <button className="invoice-view-button" onClick={()=>setSelectedInvoice(x)}>View invoice ↗</button>
              </div>
            ))}
            <div className="cancel-note">
              <b>Card, plan changes, and cancellations</b>
              <p>
                Use the secure Stripe billing link on your active invoice, or
                call <a href="tel:+17788200485">778-820-0485</a>.
              </p>
            </div>
          </section>
        )}
        {tab === "contracts" && (
          <section className="portal-section">
            <div className="portal-title">
              <div>
                <p>AGREEMENTS</p>
                <h2>Contracts</h2>
              </div>
            </div>
            {contracts.map((x: RecordItem) => (
              <div className="file-project" key={x.id}>
                <span>DOC</span>
                <div>
                  <h3>{x.data.title}</h3>
                  <p>
                    {x.data.status}
                    {x.data.signedAt
                      ? ` · Signed ${new Date(x.data.signedAt).toLocaleDateString("en-CA")}`
                      : ""}
                  </p>
                </div>
                {x.data.status === "signed" ? (
                  <b>Signed ✓</b>
                ) : (
                  <button onClick={() => void signContract(x)}>
                    Review & sign ↗
                  </button>
                )}
              </div>
            ))}
          </section>
        )}
        {tab === "schedule" && (
          <section className="portal-section">
            <div className="portal-title">
              <div>
                <p>SCHEDULE</p>
                <h2>Productions & meetings</h2>
              </div>
            </div>
            {schedule.length ? (
              schedule.map((x: RecordItem) => (
                <div className="file-project" key={x.id}>
                  <span>CAL</span>
                  <div>
                    <h3>{x.data.title}</h3>
                    <p>
                      {x.data.start &&
                        new Date(x.data.start).toLocaleString("en-CA")}{" "}
                      · {x.data.location || x.data.link || "Online"}
                    </p>
                  </div>
                  {x.data.googleCalendarUrl ? (
                    <a href={x.data.googleCalendarUrl} target="_blank">
                      Add to calendar ↗
                    </a>
                  ) : (
                    <b>{x.data.status || "Scheduled"}</b>
                  )}
                </div>
              ))
            ) : (
              <p>No productions or meetings are scheduled yet.</p>
            )}
          </section>
        )}
        {tab === "requests" && (
          <section className="portal-section">
            <div className="portal-title"><div><p>COLLABORATION</p><h2>Requests & approvals</h2></div></div>
            <form className="client-request-form" onSubmit={sendRequest}>
              <label>What would you like to do?<select name="action"><option value="comment">Send a comment</option><option value="approve">Approve work</option><option value="request_change">Request changes</option><option value="request_meeting">Request a meeting</option></select></label>
              <label>Related project<select name="recordId"><option value="">General account request</option>{projects.map((x:RecordItem)=><option value={x.id} key={x.id}>{x.data.title}</option>)}</select></label>
              <label>Message<textarea name="message" required placeholder="Add clear details for your team…"/></label>
              <button>Send to Velora team ↗</button>
            </form>
            {by("client_request").map((x:RecordItem)=><div className="file-project" key={x.id}><span>↗</span><div><h3>{x.data.title}</h3><p>{x.data.message}</p></div><b>{x.data.status}</b></div>)}
          </section>
        )}
        {tab === "notifications" && (
          <section className="portal-section">
            <div className="portal-title">
              <div>
                <p>NOTIFICATIONS</p>
                <h2>Account updates</h2>
              </div>
            </div>
            {payload.notifications?.length ? (
              payload.notifications.map((x: any) => (
                <div className="file-project" key={x.id}>
                  <span>{x.read_at ? "✓" : "●"}</span>
                  <div>
                    <h3>{x.title}</h3>
                    <p>{x.body || "Open your portal for details."}</p>
                  </div>
                  {x.read_at ? (
                    <b>Read</b>
                  ) : (
                    <button onClick={() => void readNotification(x.id)}>
                      Mark read ↗
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p>You have no notifications.</p>
            )}
          </section>
        )}
        {tab === "account" && (
          <section className="portal-section account-panel">
            <div className="portal-title">
              <div>
                <p>ACCOUNT & PRIVACY</p>
                <h2>Company details</h2>
              </div>
            </div>
            <label>
              Company
              <input value={payload.company?.name || ""} readOnly />
            </label>
            <label>
              Email
              <input
                value={payload.company?.email || payload.user.email}
                readOnly
              />
            </label>
            <p>
              To protect your account, contact the studio to change legal
              company or access details.
            </p>
            <a href="mailto:info@veloravistavisuals.com">
              Request an account change ↗
            </a>
          </section>
        )}
      </section>
      {selectedInvoice&&<div className="portal-modal invoice-portal-modal" role="dialog" aria-modal="true" aria-label={`Invoice ${selectedInvoice.data.number}`}><section><button className="modal-close" onClick={()=>setSelectedInvoice(null)}>Close ×</button><InvoiceDocument invoice={selectedInvoice.data}/><div className="invoice-client-actions"><button onClick={()=>printInvoice(selectedInvoice.data)}>Print / save PDF</button>{selectedInvoice.data.status==="paid"?<>{selectedInvoice.data.stripeInvoiceUrl&&<a href={selectedInvoice.data.stripeInvoiceUrl} target="_blank" rel="noreferrer">View paid invoice ↗</a>}{selectedInvoice.data.receiptUrl&&<a href={selectedInvoice.data.receiptUrl} target="_blank" rel="noreferrer">View receipt ↗</a>}</>:<form action={`/api/invoices/${selectedInvoice.id}/checkout`} method="post"><button type="submit">Pay now ↗</button></form>}</div></section></div>}
    </main>
  );
}
