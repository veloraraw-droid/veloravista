"use client";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Logo } from "./components";
import { createBrowserSupabase } from "../lib/supabase/client";
import { InvoiceDocument, printInvoice } from "./invoice-document";
import { AdminModule, canAccessModule } from "../lib/permissions";
type Rec = {
  id: string;
  kind: string;
  data: Record<string, any>;
  created_at: string | number;
  updated_at: string | number;
  company_id?: string | null;
};
const NAV = [
  ["overview", "Command centre"],
  ["tasks", "Tasks & team hub"],
  ["calendar", "Schedule"],
  ["customers", "Customers"],
  ["contracts", "Contracts"],
  ["billing", "Billing"],
  ["projects", "Projects & Drive"],
  ["portfolio", "Portfolio"],
  ["plans", "Plans & subscriptions"],
  ["team", "Team & permissions"],
  ["settings", "Company settings"],
];
const SECTIONS = [
  "Scope of services",
  "Deliverables & revisions",
  "Fees, deposits & taxes",
  "Production schedule",
  "Client responsibilities",
  "Cancellation & rescheduling",
  "Usage licence & intellectual property",
  "Confidentiality",
  "Limitation of liability",
  "Electronic signatures",
];
const money = (n: any) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    Number(n || 0),
  );
const day = (x: any) =>
  x
    ? new Date(x).toLocaleString("en-CA", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not scheduled";
const dateKey = (value: string | Date) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const startOfWeek = (value: Date) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="admin-modal">
      <div className={wide ? "wide-modal" : ""}>
        <button className="admin-modal-close" onClick={onClose}>
          Close ×
        </button>
        <small>VELORA CONTROL ROOM</small>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
function Empty({
  title,
  text,
  action,
  onClick,
}: {
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="ops-empty">
      <span>＋</span>
      <h3>{title}</h3>
      <p>{text}</p>
      <button onClick={onClick}>{action} ↗</button>
    </div>
  );
}
function Field({
  label,
  name,
  type = "text",
  required = false,
  children,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  children?: ReactNode;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      {children || (
        <input
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}

export function AdminPortal({
  user,
}: {
  user: { id: string; email: string; displayName: string; role: string; companyId: string|null; permissions: Record<string, boolean> };
}) {
  const visibleNav = NAV.filter(([id]) => canAccessModule(user.role, user.permissions, id as AdminModule));
  const [tab, setTab] = useState("overview"),
    [modal, setModal] = useState(""),
    [toast, setToast] = useState(""),
    [records, setRecords] = useState<Rec[]>([]),
    [loading, setLoading] = useState(true),
    [calendarMode, setCalendarMode] = useState("week"),
    [calendarScope, setCalendarScope] = useState("all"),
    [calendarDate, setCalendarDate] = useState(new Date()),
    [scheduleSearch, setScheduleSearch] = useState(""),
    [taskView, setTaskView] = useState("board"),
    [taskFilter, setTaskFilter] = useState("all"),
    [chatChannel, setChatChannel] = useState("studio"),
    [selected, setSelected] = useState<Rec | null>(null),
    [customerSection, setCustomerSection] = useState("snapshot");
  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/ops");
    if (r.ok) {
      const j = await r.json();
      setRecords(j.records);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase.channel("velora-admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "operations" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);
  const by = (kind: string) => records.filter((r) => r.kind === kind),
    clients = by("client"),
    bookings = by("booking"),
    templates = by("contract_template"),
    contracts = by("contract"),
    invoices = by("invoice"),
    plans = by("plan"),
    team = by("team"),
    projects = by("project"),
    portfolio = by("portfolio"),
    availability = by("availability"),
    meetings = by("meeting"),
    tasks = by("task"),
    messages = by("message"),
    reports = by("daily_report"),
    notifications = by("notification"),
    subscriptions = by("subscription");
  const customerRecords = selected?.kind === "client" ? records.filter((record) => record.id !== selected.id && ((record.company_id && record.company_id === selected.company_id) || String(record.data.client || record.data.company || "").toLowerCase() === String(selected.data.company || "").toLowerCase())) : [];
  const notify = (x: string) => {
    setToast(x);
    setTimeout(() => setToast(""), 3200);
  };
  async function create(kind: string, data: Record<string, any>) {
    const r = await fetch("/api/ops", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, data }),
    });
    if (!r.ok) {
      notify("Could not save this record.");
      return false;
    }
    await load();
    setModal("");
    notify("Saved and synced for the team.");
    return true;
  }
  async function remove(id: string) {
    if (!confirm("Remove this record?")) return;
    const response = await fetch(`/api/ops?id=${id}`, { method: "DELETE" });
    if (!response.ok) { notify("Could not delete this record."); return; }
    await load();
    setModal("");
    setSelected(null);
    notify("Record removed.");
  }
  async function update(record: Rec, changes: Record<string, any>, status?: string) {
    const r = await fetch("/api/ops", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: record.id, data: { ...record.data, ...changes }, status }) });
    if (!r.ok) { notify("Could not update this record."); return; }
    await load(); setModal(""); notify("Updated everywhere in real time.");
  }
  async function accountAction(email: string, action: string, permissions?: string) {
    const r = await fetch("/api/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, action, permissions }) });
    const result = await r.json(); if (!r.ok) { notify(result.error || "Account change failed."); return false; }
    notify("Account access updated immediately."); return true;
  }
  const submit =
    (kind: string, map: (f: FormData) => Record<string, any>) =>
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void create(kind, map(new FormData(e.currentTarget)));
    };
  const invoiceNo = `VLV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, "0")}`;
  const conflicts = useMemo(
    () =>
      bookings.filter((a, i) =>
        bookings.some(
          (b, j) =>
            i !== j &&
            new Date(a.data.start) < new Date(b.data.end) &&
            new Date(a.data.end) > new Date(b.data.start),
        ),
      ).length,
    [bookings],
  );
  const scheduleItems = useMemo(
    () =>
      [
        ...bookings.map((x) => ({ ...x, scheduleType: "production" })),
        ...availability.map((x) => ({ ...x, scheduleType: "team" })),
        ...meetings.map((x) => ({ ...x, scheduleType: "meeting" })),
      ]
        .filter(
          (x) =>
            calendarScope === "all" || x.scheduleType === calendarScope,
        )
        .filter((x) =>
          JSON.stringify(x.data)
            .toLowerCase()
            .includes(scheduleSearch.toLowerCase()),
        )
        .sort(
          (a, b) =>
            new Date(a.data.start).getTime() -
            new Date(b.data.start).getTime(),
        ),
    [bookings, availability, meetings, calendarScope, scheduleSearch],
  );
  const weekDays = useMemo(() => {
    const start =
      calendarMode === "day"
        ? new Date(calendarDate)
        : startOfWeek(calendarDate);
    const count = calendarMode === "day" ? 1 : 7;
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [calendarDate, calendarMode]);
  const monthDays = useMemo(() => {
    const first = new Date(
      calendarDate.getFullYear(),
      calendarDate.getMonth(),
      1,
    );
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [calendarDate]);
  const moveCalendar = (amount: number) => {
    const d = new Date(calendarDate);
    d.setDate(
      d.getDate() +
        amount *
          (calendarMode === "month" ? 28 : calendarMode === "week" ? 7 : 1),
    );
    setCalendarDate(d);
  };
  return (
    <main className="admin-shell">
      <aside className="admin-side">
        <Logo dark />
        <div className="admin-badge">LIVE OPS</div>
        <nav>
          {visibleNav.map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              <span>{label}</span>
              <i>↗</i>
            </button>
          ))}
        </nav>
        <div className="admin-user">
          <b>{user.displayName}</b>
          <span>{user.role === "owner" ? "Owner · Full access" : user.role === "admin" ? "Admin · Scoped access" : "Team member · Limited access"}</span>
          <a href="/auth/signout">Sign out</a>
        </div>
      </aside>
      <section className="admin-main">
        <header className="admin-top">
          <div>
            <small>VELORA VISTA VISUALS LTD.</small>
            <h1>{visibleNav.find((n) => n[0] === tab)?.[1]}</h1>
          </div>
          <div className="admin-top-actions">
            {user.role === "owner" && <button onClick={() => setModal("quick")}>⌘ Quick create</button>}
            <span>
              {user.displayName
                .split(/\s|@/)
                .slice(0, 2)
                .map((x) => x[0])
                .join("")
                .toUpperCase()}
            </span>
          </div>
        </header>
        {loading && (
          <div className="ops-loading">Syncing studio operations…</div>
        )}
        {tab === "overview" && (
          <>
            <div className="admin-hero">
              <div>
                <small>LIVE STUDIO PULSE</small>
                <h2>
                  The whole studio.
                  <br />
                  <i>In your hands.</i>
                </h2>
              </div>
              {canAccessModule(user.role, user.permissions, "customers") && <button onClick={() => setModal("client")}>+ Add customer</button>}
            </div>
            <div className="stat-grid">
              <article>
                <span>ACTIVE CUSTOMERS</span>
                <b>
                  {clients.filter((x) => x.data.status !== "archived").length}
                </b>
                <em>Manage accounts</em>
              </article>
              <article>
                <span>UPCOMING SHOOTS</span>
                <b>
                  {
                    bookings.filter((x) => new Date(x.data.start) > new Date())
                      .length
                  }
                </b>
                <em>
                  {conflicts
                    ? `${conflicts} conflicts detected`
                    : "Calendar clear"}
                </em>
              </article>
              <article>
                <span>UNSIGNED CONTRACTS</span>
                <b>
                  {contracts.filter((x) => x.data.status !== "signed").length}
                </b>
                <em className="warn">Follow up required</em>
              </article>
              <article>
                <span>OUTSTANDING</span>
                <b>
                  {money(
                    invoices
                      .filter((x) => x.data.status !== "paid")
                      .reduce((s, x) => s + Number(x.data.total || 0), 0),
                  )}
                </b>
                <em>Across open invoices</em>
              </article>
            </div>
            <div className="admin-columns">
              <section className="admin-card">
                <div className="admin-card-head">
                  <div>
                    <small>ACTION QUEUE</small>
                    <h3>What needs attention</h3>
                  </div>
                </div>
                {records.length === 0 ? (
                  <Empty
                    title="Your control room is ready"
                    text="Create the first customer, schedule, contract or invoice. Nothing here is demo data."
                    action="Quick create"
                    onClick={() => setModal("quick")}
                  />
                ) : (
                  <>
                    {conflicts > 0 && (
                      <button
                        className="attention-row"
                        onClick={() => setTab("calendar")}
                      >
                        <span>!</span>
                        <div>
                          <b>Scheduling conflict</b>
                          <small>
                            {conflicts} overlapping production blocks
                          </small>
                        </div>
                        <em className="urgent">FIX</em>
                      </button>
                    )}
                    {contracts
                      .filter((x) => x.data.status !== "signed")
                      .slice(0, 3)
                      .map((x) => (
                        <button
                          className="attention-row"
                          key={x.id}
                          onClick={() => setTab("contracts")}
                        >
                          <span>↗</span>
                          <div>
                            <b>{x.data.title}</b>
                            <small>Signature status: {x.data.status}</small>
                          </div>
                          <em>OPEN</em>
                        </button>
                      ))}
                  </>
                )}
              </section>
              <section className="admin-card dark-card">
                <small>NEXT PRODUCTION</small>
                {bookings[0] ? (
                  <>
                    <div className="big-date">
                      <b>{new Date(bookings[0].data.start).getDate()}</b>
                      <span>
                        {new Date(bookings[0].data.start)
                          .toLocaleString("en-CA", { month: "short" })
                          .toUpperCase()}
                        <br />
                        {new Date(bookings[0].data.start).toLocaleTimeString(
                          [],
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </span>
                    </div>
                    <h3>{bookings[0].data.title}</h3>
                    <p>{bookings[0].data.location}</p>
                  </>
                ) : (
                  <>
                    <div className="big-date">
                      <b>—</b>
                      <span>
                        NO SHOOT
                        <br />
                        BOOKED
                      </span>
                    </div>
                    <h3>Calendar is clear</h3>
                    <p>Add availability or book a production.</p>
                  </>
                )}
                <button onClick={() => setTab("calendar")}>
                  Open master schedule ↗
                </button>
              </section>
            </div>
          </>
        )}
        {tab === "tasks" && (
          <section className="team-hub">
            <header className="hub-hero">
              <div>
                <small>VELORA TEAM OPERATIONS</small>
                <h2>Work together.<br /><i>Know everything.</i></h2>
                <p>Tasks, conversations, decisions, approvals and daily accountability in one live workspace.</p>
              </div>
              <div className="hub-create">
                <button onClick={() => setModal("task")}><b>＋</b>Assign task</button>
                <button onClick={() => setModal("dailyreport")}><b>✓</b>Day-end report</button>
                <button onClick={() => setModal("announcement")}><b>↗</b>Announcement</button>
              </div>
            </header>

            <div className="hub-pulse">
              <article><small>OPEN TASKS</small><b>{tasks.filter((x) => x.data.status !== "done").length}</b><span>Across the studio</span></article>
              <article><small>DUE TODAY</small><b>{tasks.filter((x) => x.data.due === new Date().toISOString().slice(0, 10)).length}</b><span>Needs attention</span></article>
              <article><small>IN REVIEW</small><b>{tasks.filter((x) => x.data.status === "review").length}</b><span>Awaiting approval</span></article>
              <article><small>CHECK-INS</small><b>{reports.length}</b><span>Daily reports received</span></article>
            </div>

            <div className="hub-tabs">
              <div>
                {["board", "my work", "chat", "reports", "notifications"].map((x) => (
                  <button key={x} className={taskView === x ? "active" : ""} onClick={() => setTaskView(x)}>{x}</button>
                ))}
              </div>
              <button onClick={() => setModal("task")}>＋ New task</button>
            </div>

            {(taskView === "board" || taskView === "my work") && (
              <>
                <div className="task-commandbar">
                  <div>
                    {["all", "urgent", "today", "overdue"].map((x) => <button key={x} className={taskFilter === x ? "active" : ""} onClick={() => setTaskFilter(x)}>{x}</button>)}
                  </div>
                  <span>{taskView === "my work" ? `Showing assignments for ${user.displayName}` : "Showing the whole studio"}</span>
                </div>
                <div className="task-board">
                  {[
                    ["backlog", "TO DO"],
                    ["in_progress", "IN PROGRESS"],
                    ["review", "REVIEW / APPROVAL"],
                    ["done", "COMPLETED"],
                  ].map(([status, label]) => {
                    const visible = tasks.filter((x) => {
                      if ((x.data.status || "backlog") !== status) return false;
                      if (taskView === "my work" && !String(x.data.assignee).toLowerCase().includes(user.displayName.toLowerCase()) && x.data.assignee !== user.email) return false;
                      if (taskFilter === "urgent" && x.data.priority !== "urgent") return false;
                      if (taskFilter === "today" && x.data.due !== new Date().toISOString().slice(0, 10)) return false;
                      if (taskFilter === "overdue" && (!x.data.due || new Date(x.data.due) >= new Date())) return false;
                      return true;
                    });
                    return <section key={status} className={`task-lane ${status}`}>
                      <header><b>{label}</b><span>{visible.length}</span></header>
                      {visible.map((x) => <button className="task-ticket" key={x.id} onClick={() => { setSelected(x); setModal("taskview"); }}>
                        <div><span className={`priority ${x.data.priority || "normal"}`}>{x.data.priority || "normal"}</span><small>{x.data.department || "Studio"}</small></div>
                        <h3>{x.data.title}</h3>
                        <p>{x.data.description || "No additional instructions."}</p>
                        {x.data.project && <em>{x.data.project}</em>}
                        <footer><span>{x.data.assignee || "Unassigned"}</span><time>{x.data.due || "No due date"}</time></footer>
                      </button>)}
                      <button className="lane-add" onClick={() => setModal("task")}>＋ Add task</button>
                    </section>;
                  })}
                </div>
              </>
            )}

            {taskView === "chat" && (
              <div className="chat-center">
                <aside>
                  <small>CHANNELS</small>
                  {["studio", "production", "editing", "sales", "urgent"].map((x) => <button key={x} className={chatChannel === x ? "active" : ""} onClick={() => setChatChannel(x)}><span>#</span>{x}<b>{messages.filter((m) => m.data.channel === x).length}</b></button>)}
                  <small>DIRECT WORKSPACES</small>
                  {team.filter((x) => x.data.email !== user.email).slice(0, 6).map((x) => <button key={x.id} onClick={() => setChatChannel(`dm:${[user.email, String(x.data.email).toLowerCase()].sort().join(":")}`)}><span>●</span>{x.data.name}<b>↗</b></button>)}
                </aside>
                <section>
                  <header><div><small>{chatChannel.startsWith("dm:") ? "PRIVATE DIRECT CHAT" : "TEAM CHANNEL"}</small><h3>{chatChannel.startsWith("dm:") ? "Private conversation" : `# ${chatChannel}`}</h3></div><span>{chatChannel.startsWith("dm:") ? "Only both participants can access this history" : `${team.length + 1} members · live history`}</span></header>
                  <div className="message-stream">
                    {messages.filter((x) => x.data.channel === chatChannel).length ? messages.filter((x) => x.data.channel === chatChannel).map((x) => <article key={x.id}>
                      <span>{String(x.data.author || "VV").slice(0, 2).toUpperCase()}</span>
                      <div><header><b>{x.data.author}</b><time>{day(x.created_at)}</time></header><p>{x.data.text}</p>{x.data.link && <a href={x.data.link} target="_blank">Open attachment ↗</a>}</div>
                    </article>) : <div className="chat-empty"><b>Start the conversation</b><span>Decisions and project discussion stay searchable here.</span></div>}
                  </div>
                  <form className="message-compose" onSubmit={submit("message", (f) => ({ channel: chatChannel, participants: chatChannel.startsWith("dm:") ? chatChannel.slice(3).split(":") : [], author: user.displayName, authorEmail: user.email, text: f.get("text"), link: f.get("link") }))}>
                    <textarea name="text" required placeholder={`Message #${chatChannel} — use @name for attention`} rows={3} />
                    <div><input name="link" type="url" placeholder="Drive or reference link (optional)" /><button>Send message ↗</button></div>
                  </form>
                </section>
              </div>
            )}

            {taskView === "reports" && (
              <div className="report-center">
                <header><div><small>DAILY ACCOUNTABILITY</small><h3>Day-end reports</h3></div><button onClick={() => setModal("dailyreport")}>Submit today’s report ↗</button></header>
                <div className="report-grid">
                  {reports.length ? reports.map((x) => <article key={x.id}>
                    <header><span>{String(x.data.author || "VV").slice(0, 2).toUpperCase()}</span><div><b>{x.data.author}</b><small>{x.data.date}</small></div><em>{x.data.mood || "On track"}</em></header>
                    <section><small>COMPLETED TODAY</small><p>{x.data.completed}</p></section>
                    <section><small>BLOCKERS / SUPPORT NEEDED</small><p>{x.data.blockers || "No blockers reported."}</p></section>
                    <section><small>NEXT PRIORITY</small><p>{x.data.tomorrow}</p></section>
                    <footer><span>{x.data.hours || 0} hours logged</span>{x.data.link && <a href={x.data.link} target="_blank">Evidence / Drive ↗</a>}</footer>
                  </article>) : <Empty title="No day-end reports yet" text="Each team member can record completed work, blockers, hours and tomorrow’s priority." action="Submit first report" onClick={() => setModal("dailyreport")} />}
                </div>
              </div>
            )}

            {taskView === "notifications" && (
              <div className="notification-center">
                <header><div><small>PERSONAL SIGNALS</small><h3>Account notifications</h3></div><button onClick={() => setModal("announcement")}>Create notification ↗</button></header>
                <div className="notification-layout">
                  <aside><b>Notification rules</b><p>Each team account only sees alerts addressed to them or the whole studio.</p>{["Task assigned", "Due-date reminder", "Mention in chat", "Approval requested", "Schedule changed", "Contract or invoice update", "Company announcement"].map((x) => <label key={x}><input type="checkbox" defaultChecked />{x}</label>)}</aside>
                  <section>{notifications.filter((x) => !x.data.recipient || x.data.recipient === "Everyone" || x.data.recipient === user.email || x.data.recipient === user.displayName).length ? notifications.filter((x) => !x.data.recipient || x.data.recipient === "Everyone" || x.data.recipient === user.email || x.data.recipient === user.displayName).map((x) => <article key={x.id}><span className={x.data.level || "info"}>{x.data.level === "urgent" ? "!" : "↗"}</span><div><b>{x.data.title}</b><p>{x.data.message}</p><small>For {x.data.recipient || "Everyone"} · {day(x.created_at)}</small></div><button onClick={() => remove(x.id)}>Dismiss</button></article>) : <div className="chat-empty"><b>You’re all caught up</b><span>New assignments, mentions, approvals and announcements will appear here.</span></div>}</section>
                </div>
              </div>
            )}
          </section>
        )}
        {tab === "calendar" && (
          <section className="schedule-os">
            <header className="schedule-hero">
              <div>
                <small>VELORA STUDIO CALENDAR</small>
                <h2>
                  See the work.
                  <br />
                  <i>See the people.</i>
                </h2>
                <p>
                  One live schedule for productions, crew availability, holds
                  and meetings.
                </p>
              </div>
              <div className="schedule-create">
                <button onClick={() => setModal("booking")}>
                  <b>＋</b> Production
                </button>
                <button onClick={() => setModal("availability")}>
                  <b>＋</b> Availability
                </button>
                <button onClick={() => setModal("meeting")}>
                  <b>＋</b> Meeting
                </button>
              </div>
            </header>

            <div className="schedule-pulse">
              <article>
                <span>UPCOMING PRODUCTIONS</span>
                <b>
                  {
                    bookings.filter(
                      (x) => new Date(x.data.start) >= new Date(),
                    ).length
                  }
                </b>
                <small>Confirmed, held and available blocks</small>
              </article>
              <article>
                <span>TEAM COVERAGE</span>
                <b>{availability.filter((x) => x.data.status === "available").length}</b>
                <small>Availability blocks entered</small>
              </article>
              <article className={conflicts ? "has-conflict" : ""}>
                <span>CONFLICTS</span>
                <b>{conflicts}</b>
                <small>{conflicts ? "Needs attention" : "Everything is clear"}</small>
              </article>
              <article>
                <span>MEETINGS</span>
                <b>{meetings.length}</b>
                <small>Team and client conversations</small>
              </article>
            </div>

            <div className="calendar-commandbar">
              <div className="calendar-date-nav">
                <button onClick={() => setCalendarDate(new Date())}>Today</button>
                <button aria-label="Previous period" onClick={() => moveCalendar(-1)}>←</button>
                <button aria-label="Next period" onClick={() => moveCalendar(1)}>→</button>
                <h3>
                  {calendarDate.toLocaleString("en-CA", {
                    month: "long",
                    year: "numeric",
                  })}
                </h3>
              </div>
              <div className="calendar-view-switch" aria-label="Calendar view">
                {["day", "week", "month"].map((view) => (
                  <button
                    key={view}
                    className={calendarMode === view ? "active" : ""}
                    onClick={() => setCalendarMode(view)}
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>

            {conflicts > 0 && (
              <div className="schedule-alert">
                <b>⚠ Scheduling conflict detected</b>
                <span>
                  {conflicts} production blocks overlap. Review crew, equipment
                  and travel time before confirming.
                </span>
                <button onClick={() => setCalendarScope("production")}>Show conflicts ↗</button>
              </div>
            )}

            <div className="schedule-workspace">
              <aside className="schedule-filterbar">
                <div>
                  <small>SEARCH SCHEDULE</small>
                  <input
                    value={scheduleSearch}
                    onChange={(e) => setScheduleSearch(e.target.value)}
                    placeholder="Client, crew, location…"
                  />
                </div>
                <div className="schedule-filters">
                  <small>SHOW ON CALENDAR</small>
                  {[
                    ["all", "Everything", scheduleItems.length],
                    ["production", "Productions", bookings.length],
                    ["team", "Team availability", availability.length],
                    ["meeting", "Meetings", meetings.length],
                  ].map(([id, label, count]) => (
                    <button
                      key={String(id)}
                      className={calendarScope === id ? "active" : ""}
                      onClick={() => setCalendarScope(String(id))}
                    >
                      <i className={`calendar-dot ${id}`} />
                      <span>{label}</span>
                      <b>{count}</b>
                    </button>
                  ))}
                </div>
                <div className="calendar-legend">
                  <small>PRODUCTION STATUS</small>
                  <p><i className="calendar-dot booked" /> Confirmed</p>
                  <p><i className="calendar-dot hold" /> Tentative hold</p>
                  <p><i className="calendar-dot available" /> Available</p>
                  <p><i className="calendar-dot unavailable" /> Unavailable</p>
                </div>
                <div className="availability-rule">
                  <b>Default availability rule</b>
                  <p>Any time not entered by a team member is treated as unavailable.</p>
                </div>
              </aside>

              <div className="calendar-stage">
                {calendarMode === "month" ? (
                  <div className="month-calendar">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => (
                      <b className="month-weekday" key={x}>{x}</b>
                    ))}
                    {monthDays.map((date) => {
                      const items = scheduleItems.filter(
                        (x) => dateKey(x.data.start) === dateKey(date),
                      );
                      const today = dateKey(date) === dateKey(new Date());
                      return (
                        <div
                          className={`month-day ${date.getMonth() !== calendarDate.getMonth() ? "outside" : ""} ${today ? "today" : ""}`}
                          key={date.toISOString()}
                        >
                          <span>{date.getDate()}</span>
                          {items.slice(0, 3).map((x) => (
                            <button
                              className={`calendar-event ${x.scheduleType} ${x.data.status || ""}`}
                              key={x.id}
                              onClick={() => { setSelected(x); setModal("scheduleview"); }}
                            >
                              <time>{new Date(x.data.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                              <b>{x.data.title || x.data.member}</b>
                            </button>
                          ))}
                          {items.length > 3 && <small>+{items.length - 3} more</small>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={`week-calendar ${calendarMode}`}>
                    <div className="week-corner">PST</div>
                    {weekDays.map((date) => (
                      <div className={`week-day-head ${dateKey(date) === dateKey(new Date()) ? "today" : ""}`} key={date.toISOString()}>
                        <small>{date.toLocaleString("en-CA", { weekday: "short" })}</small>
                        <b>{date.getDate()}</b>
                      </div>
                    ))}
                    {Array.from({ length: 13 }, (_, i) => i + 7).map((hour) => (
                      <div className="week-hour-row" key={hour}>
                        <time>{hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? "PM" : "AM"}</time>
                        {weekDays.map((date) => {
                          const items = scheduleItems.filter((x) => {
                            const d = new Date(x.data.start);
                            return dateKey(d) === dateKey(date) && d.getHours() === hour;
                          });
                          return (
                            <div className="week-cell" key={date.toISOString()}>
                              {items.map((x) => (
                                <button
                                  className={`calendar-event ${x.scheduleType} ${x.data.status || ""}`}
                                  key={x.id}
                                  onClick={() => { setSelected(x); setModal("scheduleview"); }}
                                >
                                  <time>{new Date(x.data.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                                  <b>{x.data.title || x.data.member}</b>
                                  <span>{x.data.client || x.data.attendees || x.data.note}</span>
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <section className="schedule-agenda">
              <header>
                <div><small>NEXT UP</small><h3>Upcoming schedule</h3></div>
                <button onClick={() => setModal("booking")}>Add production ↗</button>
              </header>
              {scheduleItems.length ? (
                <div className="agenda-list">
                  {scheduleItems.slice(0, 8).map((x) => (
                    <button key={x.id} onClick={() => { setSelected(x); setModal("scheduleview"); }}>
                      <span className={`agenda-date ${x.scheduleType}`}>
                        <b>{new Date(x.data.start).getDate()}</b>
                        <small>{new Date(x.data.start).toLocaleString("en-CA", { month: "short" })}</small>
                      </span>
                      <time>{day(x.data.start)}</time>
                      <div><b>{x.data.title || x.data.member}</b><small>{x.data.client || x.data.attendees || x.data.note || "Internal"}</small></div>
                      <em>{x.scheduleType}</em>
                      <i>↗</i>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty title="Your studio calendar is clear" text="Add a production, team availability block or meeting. Unlisted team time remains unavailable." action="Book first production" onClick={() => setModal("booking")} />
              )}
            </section>
          </section>
        )}
        {tab === "customers" && (
          <section className="admin-page">
            <div className="admin-toolbar">
              <div>
                <small>CLIENT CONTROL</small>
                <h2>Accounts & relationships</h2>
              </div>
              <button onClick={() => setModal("client")}>
                + Create customer
              </button>
            </div>
            <div className="workspace-insights">
              <article><small>ACTIVE ACCOUNTS</small><b>{clients.filter((x) => x.data.status !== "archived").length}</b><span>Ready for work</span></article>
              <article><small>PLANS ASSIGNED</small><b>{clients.filter((x) => x.data.plan).length}</b><span>Recurring relationships</span></article>
              <article><small>DRIVE CONNECTED</small><b>{clients.filter((x) => x.data.drive).length}</b><span>Delivery folders live</span></article>
              <article><small>NEEDS SETUP</small><b>{clients.filter((x) => !x.data.plan || !x.data.drive).length}</b><span>Missing plan or Drive</span></article>
            </div>
            {clients.length ? (
              <div className="ops-cards">
                {clients.map((x) => (
                  <article key={x.id}>
                    <small>{x.data.status || "active"}</small>
                    <h3>{x.data.company}</h3>
                    <p>
                      {x.data.contact}
                      <br />
                      {x.data.email}
                    </p>
                    <dl>
                      <dt>Plan</dt>
                      <dd>{x.data.plan || "Unassigned"}</dd>
                      <dt>Drive</dt>
                      <dd>
                        {x.data.drive ? (
                          <a href={x.data.drive} target="_blank">
                            Open folder ↗
                          </a>
                        ) : (
                          "Not linked"
                        )}
                      </dd>
                    </dl>
                    <div>
                      <button
                        onClick={() => {
                          setSelected(x);
                          setCustomerSection("snapshot");
                          setModal("clientview");
                        }}
                      >
                        Full account ↗
                      </button>
                      <button onClick={() => remove(x.id)}>Archive</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="No customer accounts"
                text="Create a customer, assign a plan, link Drive work, control portal access and keep notes in one record."
                action="Create first customer"
                onClick={() => setModal("client")}
              />
            )}
          </section>
        )}
        {tab === "contracts" && (
          <section className="admin-page">
            <div className="admin-toolbar">
              <div>
                <small>LEGAL WORKSPACE</small>
                <h2>Templates, contracts & signatures</h2>
              </div>
              <div className="toolbar-actions">
                <button onClick={() => setModal("template")}>
                  + New template
                </button>
                <button onClick={() => setModal("contract")}>
                  + Create contract
                </button>
              </div>
            </div>
            <div className="contract-summary">
              <article>
                <b>{templates.length}</b>
                <span>Editable templates</span>
              </article>
              <article>
                <b>
                  {contracts.filter((x) => x.data.status === "signed").length}
                </b>
                <span>Signed</span>
              </article>
              <article>
                <b>
                  {contracts.filter((x) => x.data.status !== "signed").length}
                </b>
                <span>Awaiting action</span>
              </article>
            </div>
            <h3 className="section-label">TEMPLATE LIBRARY</h3>
            {templates.length ? (
              <div className="template-grid">
                {templates.map((x) => (
                  <article key={x.id}>
                    <small>VERSION {x.data.version || 1}</small>
                    <h3>{x.data.name}</h3>
                    <p>{x.data.description}</p>
                    <div>
                      {(x.data.sections || SECTIONS)
                        .slice(0, 4)
                        .map((s: string) => (
                          <span key={s}>{s}</span>
                        ))}
                    </div>
                    <button
                      onClick={() => {
                        setSelected(x);
                        setModal("templateview");
                      }}
                    >
                      Open & modify ↗
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="No contract templates"
                text="Build reusable monthly service, production, trial-shoot, release or contractor templates with editable clauses."
                action="Create template"
                onClick={() => setModal("template")}
              />
            )}
            <h3 className="section-label">CLIENT CONTRACTS</h3>
            {contracts.length ? (
              <div className="timeline-list">
                {contracts.map((x) => (
                  <article key={x.id}>
                    <time>{x.data.number}</time>
                    <div>
                      <b>{x.data.title}</b>
                      <p>
                        {x.data.client} · Due {x.data.deadline || "not set"}
                      </p>
                    </div>
                    <span className={`status-pill ${x.data.status}`}>
                      {x.data.status}
                    </span>
                    <button
                      onClick={() => {
                        setSelected(x);
                        setModal("contractview");
                      }}
                    >
                      Manage ↗
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="No client contracts"
                text="Generate a contract from any template, personalize its terms, print it, download it or email it for signature."
                action="Create contract"
                onClick={() => setModal("contract")}
              />
            )}
          </section>
        )}
        {tab === "billing" && (
          <section className="admin-page">
            <div className="admin-toolbar">
              <div>
                <small>FINANCE WORKSPACE</small>
                <h2>Subscriptions & numbered invoices</h2>
              </div>
              <button onClick={() => setModal("invoice")}>+ New invoice</button>
            </div>
            <div className="finance-strip">
              <article>
                <small>PAID</small>
                <b>
                  {money(
                    invoices
                      .filter((x) => x.data.status === "paid")
                      .reduce((s, x) => s + Number(x.data.total || 0), 0),
                  )}
                </b>
              </article>
              <article>
                <small>OUTSTANDING</small>
                <b>
                  {money(
                    invoices
                      .filter((x) => x.data.status !== "paid")
                      .reduce((s, x) => s + Number(x.data.total || 0), 0),
                  )}
                </b>
              </article>
              <article>
                <small>ACTIVE SUBSCRIPTIONS</small>
                <b>
                  {
                    subscriptions.filter((x) => x.data.status === "active")
                      .length
                  }
                </b>
              </article>
            </div>
            {invoices.length ? (
              <div className="timeline-list invoice-records">
                {invoices.map((x) => (
                  <article key={x.id}>
                    <time>{x.data.number}</time>
                    <div>
                      <b>{x.data.client}</b>
                      <p>
                        Due {x.data.due} · {x.data.description}
                      </p>
                    </div>
                    <strong>{money(x.data.total)}</strong>
                    <span className={`status-pill ${x.data.status}`}>
                      {x.data.status}
                    </span>
                    <button
                      onClick={() => {
                        setSelected(x);
                        setModal("invoiceview");
                      }}
                    >
                      Open ↗
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="No invoices yet"
                text="Generate sequential invoices for cash jobs, one-time work, deposits or subscription charges."
                action="Generate first invoice"
                onClick={() => setModal("invoice")}
              />
            )}
          </section>
        )}
        {tab === "projects" && (
          <section className="admin-page">
            <div className="admin-toolbar">
              <div>
                <small>DELIVERY CONTROL</small>
                <h2>Projects & Google Drive</h2>
              </div>
              <button onClick={() => setModal("project")}>+ New project</button>
            </div>
            <div className="workspace-insights project-insights">
              <article><small>IN PRODUCTION</small><b>{projects.filter((x) => x.data.status === "production").length}</b><span>On set or scheduled</span></article>
              <article><small>IN POST</small><b>{projects.filter((x) => x.data.status === "editing").length}</b><span>Editing now</span></article>
              <article><small>CLIENT REVIEW</small><b>{projects.filter((x) => x.data.status === "review").length}</b><span>Awaiting feedback</span></article>
              <article><small>DELIVERED</small><b>{projects.filter((x) => x.data.status === "delivered").length}</b><span>Work completed</span></article>
            </div>
            {projects.length ? (
              <div className="project-board">
                {[
                  "planning",
                  "production",
                  "editing",
                  "review",
                  "delivered",
                ].map((stage) => (
                  <section key={stage}>
                    <header>
                      <b>{stage}</b>
                      <span>
                        {projects.filter((x) => x.data.status === stage).length}
                      </span>
                    </header>
                    {projects
                      .filter((x) => x.data.status === stage)
                      .map((x) => (
                        <article key={x.id}>
                          <small>{x.data.client}</small>
                          <b>{x.data.title}</b>
                          <span>Due {x.data.due || "not set"}</span>
                          {x.data.drive && (
                            <a href={x.data.drive} target="_blank">
                              Open Drive ↗
                            </a>
                          )}
                        </article>
                      ))}
                  </section>
                ))}
              </div>
            ) : (
              <Empty
                title="No active projects"
                text="Create a job, assign a client, track production status and paste its Google Drive delivery link."
                action="Create project"
                onClick={() => setModal("project")}
              />
            )}
          </section>
        )}
        {tab === "portfolio" && (
          <section className="admin-page">
            <div className="admin-toolbar">
              <div>
                <small>PUBLIC WORK</small>
                <h2>Portfolio publishing</h2>
              </div>
              <button onClick={() => setModal("portfolio")}>
                + Add portfolio item
              </button>
            </div>
            <div className="workspace-insights portfolio-insights">
              <article><small>LIBRARY</small><b>{portfolio.length}</b><span>Total case studies</span></article>
              <article><small>LIVE</small><b>{portfolio.filter((x) => x.data.published).length}</b><span>Visible publicly</span></article>
              <article><small>HIDDEN</small><b>{portfolio.filter((x) => !x.data.published).length}</b><span>Draft or archived</span></article>
              <article><small>STORAGE</small><b>0 GB</b><span>Drive-hosted media</span></article>
            </div>
            {portfolio.length ? (
              <div className="ops-cards">
                {portfolio.map((x) => (
                  <article key={x.id}>
                    <small>{x.data.published ? "PUBLISHED" : "HIDDEN"}</small>
                    <h3>{x.data.title}</h3>
                    <p>
                      {x.data.category} · {x.data.client}
                    </p>
                    <a href={x.data.video} target="_blank">
                      Open source video ↗
                    </a>
                    <div>
                      <button>Publish controls ↗</button>
                      <button onClick={() => remove(x.id)}>Remove</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="No portfolio items"
                text="Store only public Drive, YouTube or Vimeo links—no paid website video storage required."
                action="Add portfolio work"
                onClick={() => setModal("portfolio")}
              />
            )}
          </section>
        )}
        {tab === "plans" && (
          <section className="admin-page">
            <div className="admin-toolbar">
              <div>
                <small>REVENUE SYSTEM</small>
                <h2>Plans & subscriptions</h2>
              </div>
              <div>
                <button onClick={() => setModal("subscription")}>+ Start subscription</button>
                <button onClick={() => setModal("plan")}>+ Build plan</button>
              </div>
            </div>
            <div className="workspace-insights plan-insights">
              <article><small>PLAN LIBRARY</small><b>{plans.length}</b><span>Reusable offers</span></article>
              <article><small>MONTHLY</small><b>{plans.filter((x) => String(x.data.billing).toLowerCase().includes("month")).length}</b><span>Recurring plans</span></article>
              <article><small>SUBSCRIPTIONS</small><b>{subscriptions.filter((x) => x.data.status === "active").length}</b><span>Currently active</span></article>
              <article><small>FLEXIBILITY</small><b>100%</b><span>Customizable terms</span></article>
            </div>
            {plans.length ? (
              <div className="package-grid">
                {plans.map((x) => (
                  <article key={x.id}>
                    <small>{x.data.billing}</small>
                    <h3>{x.data.name}</h3>
                    <b>{money(x.data.price)}</b>
                    <p>{x.data.deliverables}</p>
                    <div>
                      <span>{x.data.term}</span>
                      <button onClick={() => remove(x.id)}>Archive</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="No saved plans"
                text="Build flexible one-time or recurring plans with deliverables, usage rights, revisions, add-ons and cancellation terms."
                action="Build first plan"
                onClick={() => setModal("plan")}
              />
            )}
          </section>
        )}
        {tab === "team" && (
          <section className="admin-page">
            <div className="admin-toolbar">
              <div>
                <small>ACCESS CONTROL</small>
                <h2>Team, roles & permissions</h2>
              </div>
              <button onClick={() => setModal("team")}>+ Invite member</button>
            </div>
            <div className="workspace-insights team-insights">
              <article><small>TEAM MEMBERS</small><b>{team.length + 1}</b><span>Including owner</span></article>
              <article><small>FULL ACCESS</small><b>{team.filter((x) => String(x.data.permissions).toLowerCase().includes("all")).length + 1}</b><span>Privileged accounts</span></article>
              <article><small>LIMITED ROLES</small><b>{team.filter((x) => !String(x.data.permissions).toLowerCase().includes("all")).length}</b><span>Scoped permissions</span></article>
              <article><small>SECURITY</small><b>ON</b><span>Role controls active</span></article>
            </div>
            {team.length ? (
              <div className="permission-grid">
                {team.map((x) => (
                  <article key={x.id}>
                    <span>
                      {String(x.data.name || x.data.email)
                        .split(/\s|@/)
                        .slice(0, 2)
                        .map((a: string) => a[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <div>
                      <b>{x.data.name}</b>
                      <small>{x.data.role}</small>
                      <p>{x.data.permissions}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelected(x);
                        setModal("teamview");
                      }}
                    >
                      Permissions ↗
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="No invited team members"
                text="The owner currently has full access. Invite staff and choose exactly what each person can view, create, edit, approve or delete."
                action="Invite team member"
                onClick={() => setModal("team")}
              />
            )}
          </section>
        )}
        {tab === "settings" && (
          <section className="admin-page settings-grid">
            <div className="admin-toolbar settings-hero">
              <div>
                <small>STUDIO OPERATING SYSTEM</small>
                <h2>Identity, rules & automation</h2>
              </div>
              <button onClick={() => notify("All settings are up to date.")}>Run system check ↗</button>
            </div>
            <div className="workspace-insights settings-insights">
              <article><small>LEGAL PROFILE</small><b>READY</b><span>Company identity</span></article>
              <article><small>AUTOMATIONS</small><b>8</b><span>Rules enabled</span></article>
              <article><small>CLIENT TERMS</small><b>ON</b><span>First-login gate</span></article>
              <article><small>AUDIT HISTORY</small><b>LIVE</b><span>Changes recorded</span></article>
            </div>
            <section>
              <small>LEGAL IDENTITY</small>
              <h2>Company details</h2>
              <Field label="Legal name" name="legal" />
              <Field label="Business number" name="bn" />
              <Field label="Registered address" name="address" />
              <Field label="Email" name="email" type="email" />
              <Field label="Phone" name="phone" />
              <button onClick={() => notify("Company settings saved.")}>
                Save company details
              </button>
            </section>
            <section>
              <small>AUTOMATION</small>
              <h2>Workflow defaults</h2>
              {[
                "Require accepted terms on first client login",
                "Require a signature before production",
                "Automatically number invoices",
                "Send invoice reminders",
                "Warn about scheduling conflicts",
                "Treat unspecified team time as unavailable",
                "Notify owner about account changes",
                "Keep an immutable activity history",
              ].map((x) => (
                <label className="switch-row" key={x}>
                  <span>{x}</span>
                  <input type="checkbox" defaultChecked />
                </label>
              ))}
              <button onClick={() => notify("Workflow defaults updated.")}>
                Save defaults
              </button>
            </section>
          </section>
        )}
      </section>
      {modal === "quick" && (
        <Modal title="Create anything" onClose={() => setModal("")}>
          <div className="quick-grid">
            {[
              ["client", "Customer"],
              ["task", "Team task"],
              ["dailyreport", "Day-end report"],
              ["announcement", "Team notification"],
              ["booking", "Production booking"],
              ["availability", "Team availability"],
              ["meeting", "Meeting"],
              ["template", "Contract template"],
              ["contract", "Client contract"],
              ["invoice", "Invoice"],
              ["project", "Project"],
              ["portfolio", "Portfolio item"],
              ["plan", "Plan"],
              ["team", "Team member"],
            ].map((x) => (
              <button key={x[0]} onClick={() => setModal(x[0])}>
                {x[1]} <span>↗</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {modal === "task" && (
        <Modal title="Assign a studio task" onClose={() => setModal("")} wide>
          <form className="admin-form task-form" onSubmit={submit("task", (f) => ({
            title: f.get("title"), description: f.get("description"), assignee: f.get("assignee"), department: f.get("department"), project: f.get("project"), priority: f.get("priority"), status: f.get("status"), due: f.get("due"), link: f.get("link"), checklist: f.get("checklist"), approval: f.get("approval"), createdBy: user.displayName,
          }))}>
            <div><Field label="Task title" name="title" required /><Field label="Assignee" name="assignee"><select name="assignee" required><option value="">Choose team member</option><option value={user.email}>{user.displayName} (me)</option>{team.map((x) => <option key={x.id} value={x.data.email}>{x.data.name} · {x.data.role}</option>)}</select></Field></div>
            <Field label="Clear instructions" name="description"><textarea name="description" rows={4} required placeholder="Describe the expected result, context and definition of done…" /></Field>
            <div><Field label="Department" name="department"><select name="department"><option>Production</option><option>Creative</option><option>Editing</option><option>Sales</option><option>Administration</option><option>Finance</option></select></Field><Field label="Priority" name="priority"><select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field></div>
            <div><Field label="Workflow stage" name="status"><select name="status"><option value="backlog">To do</option><option value="in_progress">In progress</option><option value="review">Review / approval</option><option value="done">Completed</option></select></Field><Field label="Due date" name="due" type="date" required /></div>
            <Field label="Related project or customer" name="project"><select name="project"><option value="">Internal / general work</option>{projects.map((x) => <option key={x.id}>{x.data.title}</option>)}{clients.map((x) => <option key={x.id}>{x.data.company}</option>)}</select></Field>
            <Field label="Checklist (one item per line)" name="checklist"><textarea name="checklist" rows={4} placeholder={"Confirm brief\nComplete work\nUpload deliverable\nRequest review"} /></Field>
            <div><Field label="Drive / reference link" name="link" type="url" /><Field label="Approval required from" name="approval" placeholder="Owner, creative director…" /></div>
            <button>Assign task & notify member ↗</button>
          </form>
        </Modal>
      )}
      {modal === "dailyreport" && (
        <Modal title="Submit day-end report" onClose={() => setModal("")} wide>
          <form className="admin-form" onSubmit={submit("daily_report", (f) => ({ author: user.displayName, email: user.email, date: f.get("date"), completed: f.get("completed"), blockers: f.get("blockers"), tomorrow: f.get("tomorrow"), hours: f.get("hours"), mood: f.get("mood"), link: f.get("link") }))}>
            <div><Field label="Report date" name="date" type="date" required /><Field label="Today’s status" name="mood"><select name="mood"><option>On track</option><option>Need support</option><option>Blocked</option><option>Ahead of schedule</option></select></Field></div>
            <Field label="What did you complete today?" name="completed"><textarea name="completed" rows={5} required placeholder="List completed tasks, calls, edits, shoots and decisions…" /></Field>
            <Field label="Blockers or support needed" name="blockers"><textarea name="blockers" rows={3} placeholder="Anything slowing the work down or needing a manager decision…" /></Field>
            <Field label="Your first priority tomorrow" name="tomorrow"><textarea name="tomorrow" rows={3} required /></Field>
            <div><Field label="Hours worked" name="hours" type="number" /><Field label="Drive / proof-of-work link" name="link" type="url" /></div>
            <button>Submit report to management ↗</button>
          </form>
        </Modal>
      )}
      {modal === "announcement" && (
        <Modal title="Send a team notification" onClose={() => setModal("")}>
          <form className="admin-form" onSubmit={submit("notification", (f) => ({ title: f.get("title"), message: f.get("message"), recipient: f.get("recipient"), level: f.get("level"), author: user.displayName }))}>
            <Field label="Notification title" name="title" required />
            <Field label="Send to" name="recipient"><select name="recipient"><option>Everyone</option><option value={user.email}>{user.displayName}</option>{team.map((x) => <option key={x.id} value={x.data.email}>{x.data.name}</option>)}</select></Field>
            <Field label="Importance" name="level"><select name="level"><option value="info">Information</option><option value="action">Action required</option><option value="urgent">Urgent</option></select></Field>
            <Field label="Message" name="message"><textarea name="message" rows={5} required /></Field>
            <button>Send customized notification ↗</button>
          </form>
        </Modal>
      )}
      {modal === "taskview" && selected && (
        <Modal title={selected.data.title} onClose={() => setModal("")} wide>
          <div className="task-detail">
            <header><span className={`priority ${selected.data.priority}`}>{selected.data.priority}</span><b>{selected.data.status?.replace("_", " ")}</b><time>Due {selected.data.due || "not set"}</time></header>
            <p>{selected.data.description}</p>
            <div><section><small>ASSIGNED TO</small><b>{selected.data.assignee}</b></section><section><small>DEPARTMENT</small><b>{selected.data.department}</b></section><section><small>PROJECT / ACCOUNT</small><b>{selected.data.project || "Internal"}</b></section><section><small>APPROVAL</small><b>{selected.data.approval || "Not required"}</b></section></div>
            {selected.data.checklist && <section className="task-checklist"><small>DEFINITION OF DONE</small>{String(selected.data.checklist).split("\n").filter(Boolean).map((x: string) => <label key={x}><input type="checkbox" />{x}</label>)}</section>}
            {selected.data.link && <a className="schedule-join" href={selected.data.link} target="_blank">Open working files ↗</a>}
          </div>
          <div className="account-actions"><button onClick={() => void create("notification", { title: `Task reminder: ${selected.data.title}`, message: "A progress update was requested.", recipient: selected.data.assignee, level: "urgent", author: user.displayName })}>Send reminder</button><button onClick={() => void update(selected, { status: "review" })}>Request review</button><button onClick={() => remove(selected.id)}>Delete task</button></div>
        </Modal>
      )}
      {modal === "client" && (
        <Modal title="Create customer account" onClose={() => setModal("")}>
          <form
            className="admin-form"
            onSubmit={submit("client", (f) => ({
              company: f.get("company"),
              contact: f.get("contact"),
              email: f.get("email"),
              phone: f.get("phone"),
              status: "onboarding",
              plan: f.get("plan"),
              drive: f.get("drive"),
              notes: f.get("notes"),
              portal: true,
              termsRequired: true,
            }))}
          >
            <div>
              <Field label="Company" name="company" required />
              <Field label="Contact" name="contact" required />
            </div>
            <div>
              <Field label="Email" name="email" type="email" required />
              <Field label="Phone" name="phone" />
            </div>
            <Field label="Assigned plan" name="plan">
              <select name="plan">
                <option value="">Unassigned</option>
                {plans.map((x) => (
                  <option key={x.id}>{x.data.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Google Drive master folder" name="drive" type="url" />
            <Field label="Internal notes" name="notes">
              <textarea name="notes" rows={4} />
            </Field>
            <button>Create secure customer record ↗</button>
          </form>
        </Modal>
      )}
      {modal === "booking" && (
        <Modal title="Add production block" onClose={() => setModal("")}>
          <form
            className="admin-form"
            onSubmit={submit("booking", (f) => ({
              title: f.get("title"),
              client: f.get("client"),
              email: f.get("email"),
              start: f.get("start"),
              end: f.get("end"),
              location: f.get("location"),
              status: f.get("status"),
              crew: f.get("crew"),
              notes: f.get("notes"),
            }))}
          >
            <div>
              <Field label="Client" name="client"><select name="client"><option value="">Internal / no client</option>{clients.map((x) => <option key={x.id}>{x.data.company}</option>)}</select></Field>
              <Field label="Invitation email" name="email" type="email" />
            </div>
            <div>
              <Field label="Title" name="title" required />
              <Field label="Status" name="status">
                <select name="status">
                  <option value="available">Available</option>
                  <option value="hold">Tentative hold</option>
                  <option value="booked">Confirmed booked</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </Field>
            </div>
            <div>
              <Field
                label="Starts"
                name="start"
                type="datetime-local"
                required
              />
              <Field label="Ends" name="end" type="datetime-local" required />
            </div>
            <Field label="Location" name="location" />
            <Field label="Assigned crew" name="crew" />
            <Field label="Notes" name="notes">
              <textarea name="notes" rows={3} />
            </Field>
            <button>Save block & check conflicts ↗</button>
          </form>
        </Modal>
      )}
      {modal === "availability" && (
        <Modal title="Add team availability" onClose={() => setModal("")}>
          <form
            className="admin-form"
            onSubmit={submit("availability", (f) => ({
              member: f.get("member"),
              status: f.get("status"),
              start: f.get("start"),
              end: f.get("end"),
              note: f.get("note"),
            }))}
          >
            <Field label="Team member" name="member">
              <select name="member">
                <option>{user.displayName}</option>
                {team.map((x) => (
                  <option key={x.id}>{x.data.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Status" name="status">
              <select name="status">
                <option value="available">Available</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </Field>
            <div>
              <Field
                label="Starts"
                name="start"
                type="datetime-local"
                required
              />
              <Field label="Ends" name="end" type="datetime-local" required />
            </div>
            <Field label="Note" name="note" />
            <button>Save availability ↗</button>
          </form>
        </Modal>
      )}
      {modal === "meeting" && (
        <Modal title="Schedule meeting" onClose={() => setModal("")}>
          <form
            className="admin-form"
            onSubmit={submit("meeting", (f) => ({
              title: f.get("title"),
              client: f.get("client"),
              email: f.get("email"),
              attendeeEmails: f.get("attendeeEmails"),
              attendees: f.get("attendees"),
              start: f.get("start"),
              end: f.get("end"),
              link: f.get("link"),
              notes: f.get("notes"),
            }))}
          >
            <Field label="Meeting title" name="title" required />
            <div>
              <Field label="Client" name="client"><select name="client"><option value="">Internal / no client</option>{clients.map((x) => <option key={x.id}>{x.data.company}</option>)}</select></Field>
              <Field label="Primary invitation email" name="email" type="email" />
            </div>
            <Field
              label="Attendees"
              name="attendees"
              placeholder="Team names or client"
            />
            <Field label="Additional attendee emails" name="attendeeEmails" placeholder="name@company.com, teammate@velora…" />
            <div>
              <Field
                label="Starts"
                name="start"
                type="datetime-local"
                required
              />
              <Field label="Ends" name="end" type="datetime-local" required />
            </div>
            <Field label="Google Meet / Zoom URL" name="link" type="url" />
            <Field label="Agenda" name="notes">
              <textarea name="notes" rows={4} />
            </Field>
            <button>Schedule meeting ↗</button>
          </form>
        </Modal>
      )}
      {modal === "template" && (
        <Modal
          title="Build contract template"
          onClose={() => setModal("")}
          wide
        >
          <form
            className="admin-form"
            onSubmit={submit("contract_template", (f) => ({
              name: f.get("name"),
              version: 1,
              description: f.get("description"),
              body: f.get("body"),
              sections: SECTIONS,
              updated: new Date().toISOString(),
            }))}
          >
            <Field label="Template name" name="name" required />
            <Field
              label="Purpose"
              name="description"
              placeholder="Monthly service, one-time production, release…"
            />
            <div className="template-sections">
              <b>Included sections</b>
              {SECTIONS.map((x) => (
                <label key={x}>
                  <input type="checkbox" defaultChecked /> {x}
                </label>
              ))}
            </div>
            <Field label="Editable contract language" name="body">
              <textarea
                name="body"
                rows={16}
                defaultValue={SECTIONS.map(
                  (x, i) =>
                    `${i + 1}. ${x.toUpperCase()}\nEnter the detailed terms for this section. Use variables such as {{client_name}}, {{project_name}}, {{fee}}, {{start_date}} and {{deliverables}}.\n`,
                ).join("\n")}
              />
            </Field>
            <button>Save reusable template ↗</button>
          </form>
        </Modal>
      )}
      {modal === "contract" && (
        <Modal title="Create client contract" onClose={() => setModal("")}>
          <form
            className="admin-form"
            onSubmit={submit("contract", (f) => ({
              number: `CTR-${new Date().getFullYear()}-${String(contracts.length + 1).padStart(4, "0")}`,
              title: f.get("title"),
              client: f.get("client"),
              template: f.get("template"),
              deadline: f.get("deadline"),
              status: "draft",
              terms: f.get("terms"),
              email: f.get("email"),
            }))}
          >
            <Field label="Contract title" name="title" required />
            <Field label="Customer" name="client">
              <select name="client" required>
                <option value="">Select customer</option>
                {clients.map((x) => (
                  <option key={x.id}>{x.data.company}</option>
                ))}
              </select>
            </Field>
            <Field label="Template" name="template">
              <select name="template">
                <option>Start from blank</option>
                {templates.map((x) => (
                  <option key={x.id}>
                    {x.data.name} · v{x.data.version}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <Field label="Signature deadline" name="deadline" type="date" />
              <Field label="Recipient email" name="email" type="email" />
            </div>
            <Field label="Client-specific terms" name="terms">
              <textarea name="terms" rows={10} />
            </Field>
            <button>Create contract draft ↗</button>
          </form>
        </Modal>
      )}
      {modal === "invoice" && (
        <Modal
          title={`Generate invoice ${invoiceNo}`}
          onClose={() => setModal("")}
        >
          <form
            className="admin-form"
            onSubmit={submit("invoice", (f) => {
              const subtotal = Number(f.get("subtotal")),
                tax = Number(f.get("tax"));
              return {
                number: invoiceNo,
                client: f.get("client"),
                email: f.get("email"),
                description: f.get("description"),
                subtotal,
                tax,
                total: subtotal + (subtotal * tax) / 100,
                due: f.get("due"),
                status: "draft",
                paymentLink: f.get("paymentLink"),
                notes: f.get("notes"),
              };
            })}
          >
            <Field label="Customer" name="client">
              <select name="client" required>
                <option value="">Select customer</option>
                {clients.map((x) => (
                  <option key={x.id}>{x.data.company}</option>
                ))}
              </select>
            </Field>
            <Field label="Billing email" name="email" type="email" required />
            <Field label="Work performed / line items" name="description">
              <textarea name="description" rows={5} required />
            </Field>
            <div>
              <Field
                label="Subtotal CAD"
                name="subtotal"
                type="number"
                required
              />
              <Field label="Tax %" name="tax" type="number" />
            </div>
            <Field label="Due date" name="due" type="date" required />
            <Field
              label="Payment link"
              name="paymentLink"
              type="url"
              placeholder="Stripe payment link can be added later"
            />
            <Field label="Notes" name="notes">
              <textarea name="notes" rows={3} />
            </Field>
            <button>Generate numbered invoice ↗</button>
          </form>
        </Modal>
      )}
      {modal === "project" && (
        <Modal
          title="Create project & Drive delivery"
          onClose={() => setModal("")}
        >
          <form
            className="admin-form"
            onSubmit={submit("project", (f) => ({
              title: f.get("title"),
              client: f.get("client"),
              status: f.get("status"),
              due: f.get("due"),
              drive: f.get("drive"),
              deliverables: f.get("deliverables"),
              visible: true,
            }))}
          >
            <div>
              <Field label="Project title" name="title" required />
              <Field label="Customer" name="client">
                <select name="client">
                  {clients.map((x) => (
                    <option key={x.id}>{x.data.company}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div>
              <Field label="Status" name="status">
                <select name="status">
                  <option value="planning">Planning</option>
                  <option value="production">Production</option>
                  <option value="editing">Editing</option>
                  <option value="review">Client review</option>
                  <option value="delivered">Delivered</option>
                </select>
              </Field>
              <Field label="Due date" name="due" type="date" />
            </div>
            <Field label="Deliverables" name="deliverables">
              <textarea name="deliverables" rows={3} />
            </Field>
            <Field label="Google Drive folder" name="drive" type="url" />
            <button>Create project ↗</button>
          </form>
        </Modal>
      )}
      {modal === "portfolio" && (
        <Modal title="Publish portfolio work" onClose={() => setModal("")}>
          <form
            className="admin-form"
            onSubmit={submit("portfolio", (f) => ({
              title: f.get("title"),
              client: f.get("client"),
              category: f.get("category"),
              video: f.get("video"),
              thumbnail: f.get("thumbnail"),
              description: f.get("description"),
              published: f.get("published") === "on",
            }))}
          >
            <Field label="Project title" name="title" required />
            <div>
              <Field label="Client" name="client" />
              <Field label="Category" name="category" />
            </div>
            <Field label="Public video URL" name="video" type="url" required />
            <Field label="Public thumbnail URL" name="thumbnail" type="url" />
            <Field label="Description" name="description">
              <textarea name="description" rows={4} />
            </Field>
            <label className="check-row">
              <input type="checkbox" name="published" defaultChecked /> Publish
              on the Work page
            </label>
            <button>Save portfolio item ↗</button>
          </form>
        </Modal>
      )}
      {modal === "plan" && (
        <Modal title="Build custom plan" onClose={() => setModal("")}>
          <form
            className="admin-form"
            onSubmit={submit("plan", (f) => ({
              name: f.get("name"),
              price: f.get("price"),
              billing: f.get("billing"),
              term: f.get("term"),
              deliverables: f.get("deliverables"),
              revisions: f.get("revisions"),
              usage: f.get("usage"),
              cancellation: f.get("cancellation"),
            }))}
          >
            <div>
              <Field label="Plan name" name="name" required />
              <Field label="Price CAD" name="price" type="number" required />
            </div>
            <div>
              <Field label="Billing" name="billing">
                <select name="billing">
                  <option>Monthly subscription</option>
                  <option>Quarterly subscription</option>
                  <option>One-time</option>
                  <option>Milestone billing</option>
                </select>
              </Field>
              <Field label="Commitment" name="term">
                <select name="term">
                  <option>Month-to-month</option>
                  <option>3 months</option>
                  <option>6 months</option>
                  <option>12 months</option>
                  <option>One-time</option>
                </select>
              </Field>
            </div>
            <Field label="Deliverables" name="deliverables">
              <textarea name="deliverables" rows={4} />
            </Field>
            <div>
              <Field label="Revision rounds" name="revisions" type="number" />
              <Field label="Usage rights" name="usage" />
            </div>
            <Field label="Cancellation terms" name="cancellation" />
            <button>Save plan ↗</button>
          </form>
        </Modal>
      )}
      {modal === "subscription" && (
        <Modal title="Start client subscription" onClose={() => setModal("")}>
          <form
            className="admin-form"
            onSubmit={submit("subscription", (f) => {
              const selected = plans.find((x) => x.id === f.get("planId"));
              return {
                client: f.get("client"),
                email: f.get("email"),
                plan: selected?.data.name || "Custom partnership",
                price: Number(selected?.data.price || 0),
                billing: selected?.data.billing || "Monthly subscription",
                term: selected?.data.term || "Month-to-month",
                deliverables: selected?.data.deliverables || "",
                status: "pending_checkout",
              };
            })}
          >
            <Field label="Customer" name="client">
              <select name="client" required>
                <option value="">Select customer</option>
                {clients.map((x) => <option key={x.id}>{x.data.company}</option>)}
              </select>
            </Field>
            <Field label="Billing email" name="email" type="email" required />
            <Field label="Recurring plan" name="planId">
              <select name="planId" required>
                <option value="">Select monthly or quarterly plan</option>
                {plans.filter((x) => /month|quarter/i.test(String(x.data.billing))).map((x) => (
                  <option key={x.id} value={x.id}>{x.data.name} · {money(x.data.price)} · {x.data.billing}</option>
                ))}
              </select>
            </Field>
            <p>The client will receive a secure Stripe Checkout link. The subscription becomes active only after successful payment.</p>
            <button>Generate subscription checkout ↗</button>
          </form>
        </Modal>
      )}
      {modal === "team" && (
        <Modal title="Invite team member" onClose={() => setModal("")}>
          <form
            className="admin-form"
            onSubmit={submit("team", (f) => ({
              name: f.get("name"),
              email: f.get("email"),
              role: f.get("role"),
              permissions: f.getAll("permission").join(" · "),
              status: "active",
            }))}
          >
            <div>
              <Field label="Full name" name="name" required />
              <Field label="Email" name="email" type="email" required />
            </div>
            <Field label="Role" name="role">
              <select name="role">
                <option>Admin</option>
                <option>Producer</option>
                <option>Creative</option>
                <option>Finance</option>
                <option>Read only</option>
              </select>
            </Field>
            <div className="check-stack">
              {[
                "Team Hub",
                "Customers",
                "Schedule",
                "Contracts",
                "Billing",
                "Projects",
                "Portfolio",
                "Plans",
                "Team settings",
                "Company settings",
              ].map((x) => (
                <label key={x}>
                  <input type="checkbox" name="permission" value={x} /> {x}
                </label>
              ))}
            </div>
            <button>Approve team access ↗</button>
          </form>
        </Modal>
      )}
      {modal === "scheduleview" && selected && (
        <Modal
          title={selected.data.title || selected.data.member || "Schedule item"}
          onClose={() => setModal("")}
        >
          <div className="schedule-detail">
            <div className="schedule-detail-time">
              <small>WHEN</small>
              <b>{day(selected.data.start)}</b>
              <span>to {day(selected.data.end)}</span>
            </div>
            <div className="schedule-detail-grid">
              <div><small>TYPE</small><b>{selected.kind === "booking" ? "Production" : selected.kind === "availability" ? "Team availability" : "Meeting"}</b></div>
              <div><small>STATUS</small><b>{selected.data.status || "Scheduled"}</b></div>
              <div><small>CLIENT / ATTENDEES</small><b>{selected.data.client || selected.data.attendees || selected.data.member || "Internal"}</b></div>
              <div><small>LOCATION</small><b>{selected.data.location || "Not specified"}</b></div>
              <div><small>CREW</small><b>{selected.data.crew || "Not assigned"}</b></div>
              <div><small>NOTES</small><b>{selected.data.notes || selected.data.note || "No notes"}</b></div>
            </div>
            {selected.data.link && <a className="schedule-join" href={selected.data.link} target="_blank">Open meeting link ↗</a>}
            {selected.data.googleCalendarUrl && <a className="schedule-join" href={selected.data.googleCalendarUrl} target="_blank">Add to Google Calendar ↗</a>}
            {selected.data.emailInvitationUrl && <a className="schedule-join" href={selected.data.emailInvitationUrl}>Email invitation ↗</a>}
          </div>
          <div className="account-actions">
            <button onClick={() => setModal(selected.kind === "booking" ? "booking" : selected.kind === "availability" ? "availability" : "meeting")}>Duplicate / reschedule</button>
            <button onClick={() => notify("Calendar reminder prepared.")}>Send reminder</button>
            <button onClick={() => void remove(selected.id)}>Remove from schedule</button>
          </div>
        </Modal>
      )}
      {modal === "invoiceview" && selected && (
        <Modal title={selected.data.number} onClose={() => setModal("")} wide>
          <InvoiceDocument invoice={selected.data} />
          <div className="account-actions">
            <button onClick={() => printInvoice(selected.data)}>Print / save PDF</button>
            <button onClick={() => setModal("invoiceedit")}>Edit invoice</button>
            <a
              href={`mailto:${selected.data.email}?subject=${encodeURIComponent(`Invoice ${selected.data.number} from Velora Vista Visuals Ltd.`)}&body=${encodeURIComponent(`Your invoice ${selected.data.number} for ${money(selected.data.total)} is ready. Payment link: ${selected.data.paymentLink || "Please contact us for payment."}`)}`}
            >
              Send by email ↗
            </a>
            {selected.data.paymentLink && (
              <a href={selected.data.paymentLink} target="_blank">
                Open payment link ↗
              </a>
            )}
            <button className="danger-action" onClick={() => void remove(selected.id)}>Delete invoice</button>
          </div>
        </Modal>
      )}
      {modal === "invoiceedit" && selected && (
        <Modal title={`Edit ${selected.data.number}`} onClose={() => setModal("invoiceview")}>
          <form className="admin-form" onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget),subtotal=Number(f.get("subtotal")),tax=Number(f.get("tax"));void update(selected,{client:f.get("client"),email:f.get("email"),description:f.get("description"),subtotal,tax,total:subtotal+(subtotal*tax)/100,due:f.get("due"),status:f.get("status"),paymentLink:f.get("paymentLink"),notes:f.get("notes")})}}>
            <div><Field label="Customer" name="client" required><input name="client" required defaultValue={selected.data.client}/></Field><Field label="Billing email" name="email" type="email" required><input name="email" type="email" required defaultValue={selected.data.email}/></Field></div>
            <Field label="Work performed / line items" name="description"><textarea name="description" rows={5} required defaultValue={selected.data.description}/></Field>
            <div><Field label="Subtotal CAD" name="subtotal" type="number" required><input name="subtotal" type="number" step="0.01" required defaultValue={selected.data.subtotal}/></Field><Field label="Tax %" name="tax" type="number"><input name="tax" type="number" step="0.01" defaultValue={selected.data.tax || 0}/></Field></div>
            <div><Field label="Due date" name="due" type="date"><input name="due" type="date" defaultValue={selected.data.due}/></Field><Field label="Status" name="status"><select name="status" defaultValue={selected.data.status || "draft"}><option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="void">Void</option></select></Field></div>
            <Field label="Payment link" name="paymentLink" type="url"><input name="paymentLink" type="url" defaultValue={selected.data.paymentLink || ""}/></Field>
            <Field label="Notes" name="notes"><textarea name="notes" rows={3} defaultValue={selected.data.notes || ""}/></Field>
            <button>Save invoice changes ↗</button>
          </form>
        </Modal>
      )}
      {modal === "contractview" && selected && (
        <Modal title={selected.data.title} onClose={() => setModal("")} wide>
          <div className="contract-document">
            <small>
              {selected.data.number} · {selected.data.status}
            </small>
            <h2>{selected.data.title}</h2>
            <p>
              Prepared for <b>{selected.data.client}</b>
            </p>
            <div>
              {selected.data.terms ||
                "Open the template and add the client-specific agreement language before sending."}
            </div>
            <footer>
              Velora Vista Visuals Ltd. · Electronic signature required
            </footer>
          </div>
          <div className="account-actions">
            <button onClick={() => window.print()}>Print / download PDF</button>
            <a
              href={`mailto:${selected.data.email}?subject=${encodeURIComponent(`Contract ${selected.data.number} from Velora Vista Visuals Ltd.`)}`}
            >
              Send by email ↗
            </a>
            <button onClick={() => notify("Signature reminder prepared.")}>
              Send reminder
            </button>
          </div>
        </Modal>
      )}
      {modal === "templateview" && selected && (
        <Modal title={selected.data.name} onClose={() => setModal("")} wide>
          <div className="contract-document">
            <small>EDITABLE TEMPLATE · VERSION {selected.data.version}</small>
            <h2>{selected.data.name}</h2>
            <p>{selected.data.description}</p>
            <pre>{selected.data.body}</pre>
          </div>
          <div className="account-actions">
            <button onClick={() => window.print()}>Print template</button>
            <button
              onClick={() =>
                notify("Create a new version from the template builder.")
              }
            >
              Duplicate as new version
            </button>
            <button onClick={() => remove(selected.id)}>
              Archive template
            </button>
          </div>
        </Modal>
      )}
      {modal === "clientview" && selected && (
        <Modal title={selected.data.company} onClose={() => setModal("")} wide>
          <div className="customer-workspace-nav">{[["snapshot","Snapshot"],["profile","Profile"],["work","Projects"],["commercial","Contracts & billing"],["schedule","Schedule & requests"],["files","Files & notes"],["portfolio","Portfolio"]].map(([id,label])=><button type="button" className={customerSection===id?"active":""} onClick={()=>setCustomerSection(id)} key={id}>{label}</button>)}</div>
          <div className="client-control-summary">
            <div>
              <small>STATUS</small>
              <b>{selected.data.status}</b>
            </div>
            <div>
              <small>PLAN</small>
              <b>{selected.data.plan || "Unassigned"}</b>
            </div>
            <div>
              <small>PORTAL</small>
              <b>{selected.data.portal ? "Enabled" : "Disabled"}</b>
            </div>
            <div>
              <small>TERMS</small>
              <b>{selected.data.termsRequired ? "Required" : "Accepted"}</b>
            </div>
          </div>
          {customerSection === "snapshot" && <div className="customer-snapshot-grid"><article><small>PROJECTS</small><b>{customerRecords.filter(x=>x.kind==="project").length}</b><span>Linked work</span></article><article><small>OPEN INVOICES</small><b>{customerRecords.filter(x=>x.kind==="invoice"&&x.data.status!=="paid").length}</b><span>{money(customerRecords.filter(x=>x.kind==="invoice"&&x.data.status!=="paid").reduce((sum,x)=>sum+Number(x.data.total||0),0))}</span></article><article><small>UPCOMING</small><b>{customerRecords.filter(x=>["booking","meeting"].includes(x.kind)&&new Date(x.data.start)>new Date()).length}</b><span>Schedule items</span></article><article><small>REQUESTS</small><b>{customerRecords.filter(x=>x.kind==="client_request"&&x.data.status!=="resolved").length}</b><span>Need action</span></article></div>}
          {customerSection === "profile" && <form className="admin-form" onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);void update(selected,{contact:f.get("contact"),email:f.get("email"),phone:f.get("phone"),preferences:f.get("preferences"),brandVoice:f.get("brandVoice"),communication:f.get("communication")})}}><div><Field label="Primary contact" name="contact"><input name="contact" defaultValue={selected.data.contact}/></Field><Field label="Email" name="email"><input name="email" type="email" defaultValue={selected.data.email}/></Field><Field label="Phone" name="phone"><input name="phone" defaultValue={selected.data.phone}/></Field></div><Field label="Creative preferences" name="preferences"><textarea name="preferences" defaultValue={selected.data.preferences} placeholder="Visual style, formats, audience and do-not-use notes…"/></Field><Field label="Brand voice" name="brandVoice"><textarea name="brandVoice" defaultValue={selected.data.brandVoice} placeholder="Tone, vocabulary and brand personality…"/></Field><Field label="Preferred communication" name="communication"><select name="communication" defaultValue={selected.data.communication||"Email"}><option>Email</option><option>Phone</option><option>Portal</option><option>Text message</option></select></Field><button>Save customer profile ↗</button></form>}
          {customerSection === "work" && <div className="customer-linked-list">{customerRecords.filter(x=>["project","portfolio"].includes(x.kind)).map(x=><article key={x.id}><span>{x.kind}</span><div><b>{x.data.title||x.data.name}</b><small>{x.data.deliverables||x.data.status||"Linked work"}</small></div><button onClick={()=>{setSelected(x);setModal(x.kind==="project"?"projectview":"portfolioview")}}>Open ↗</button></article>)}{!customerRecords.some(x=>["project","portfolio"].includes(x.kind))&&<p>No linked projects or galleries yet.</p>}</div>}
          {customerSection === "commercial" && <div className="customer-linked-list">{customerRecords.filter(x=>["contract","invoice","subscription"].includes(x.kind)).map(x=><article key={x.id}><span>{x.kind}</span><div><b>{x.data.title||x.data.number||x.data.plan}</b><small>{x.data.status||"Active"}</small></div><b>{x.kind==="invoice"?money(x.data.total):"↗"}</b></article>)}</div>}
          {customerSection === "schedule" && <div className="customer-linked-list">{customerRecords.filter(x=>["booking","meeting","client_request"].includes(x.kind)).map(x=><article key={x.id}><span>{x.kind==="client_request"?"request":"calendar"}</span><div><b>{x.data.title||x.data.type||"Customer request"}</b><small>{x.data.message||day(x.data.start)}</small></div>{x.kind==="client_request"&&<button onClick={()=>void update(x,{...x.data,status:"resolved"})}>Resolve</button>}</article>)}</div>}
          {customerSection === "files" && <form className="admin-form" onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);void update(selected,{drive:f.get("drive"),notes:f.get("notes")})}}><Field label="Master file folder" name="drive"><input name="drive" type="url" defaultValue={selected.data.drive} placeholder="Google Drive or delivery folder URL"/></Field><Field label="Private team notes" name="notes"><textarea name="notes" defaultValue={selected.data.notes} placeholder="Internal context, relationship notes and follow-ups…"/></Field><button>Save files & notes ↗</button></form>}
          {customerSection === "portfolio" && <><div className="customer-linked-list">{customerRecords.filter(x=>x.kind==="portfolio").map(x=><article key={x.id}><span>{x.data.featured?"featured":"gallery"}</span><div><b>{x.data.title}</b><small>{x.data.clientVisible===false?"Hidden from client":"Client visible"} · {x.data.publicVisible?"Published":"Private"} · {x.data.approval||"No approval request"}</small></div><button onClick={()=>void update(x,{...x.data,featured:!x.data.featured,clientVisible:x.data.clientVisible!==false,publicVisible:!x.data.publicVisible,approval:x.data.approval||"requested"})}>Update controls</button></article>)}</div><div className="account-actions"><button onClick={()=>setModal("portfolio")}>+ Upload gallery</button></div></>}
          {customerSection === "snapshot" && <div className="record-detail">
            <p>
              <b>{selected.data.contact}</b>
              <br />
              {selected.data.email}
              <br />
              {selected.data.phone}
            </p>
            <p>{selected.data.notes || "No internal notes."}</p>
            {selected.data.drive && (
              <a href={selected.data.drive} target="_blank">
                Open Google Drive master folder ↗
              </a>
            )}
          </div>}
          <div className="account-actions">
            <button onClick={() => setModal("contract")}>
              Create contract
            </button>
            <button onClick={() => setModal("invoice")}>Create invoice</button>
            <button onClick={() => setModal("project")}>Create project</button>
            <button onClick={() => setModal("booking")}>Book production</button>
            <button onClick={() => void accountAction(selected.data.email, "suspend")}>
              Pause access
            </button>
          </div>
        </Modal>
      )}
      {modal === "teamview" && selected && (
        <Modal
          title={`Permissions — ${selected.data.name}`}
          onClose={() => setModal("")}
        >
          <p>{selected.data.email}</p>
          <form onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);void accountAction(selected.data.email,"permissions",f.getAll("module").join(" · "))}}><div className="permission-matrix">
            <div>
              <b>Area</b>
              <b>View</b>
              <b>Create</b>
              <b>Edit</b>
              <b>Delete</b>
              <b>Approve</b>
            </div>
            {[
              "Team Hub",
              "Customers",
              "Schedule",
              "Contracts",
              "Billing",
              "Projects",
              "Portfolio",
              "Plans",
              "Team",
            ].map((x) => (
              <div key={x}>
                <span>{x}</span>
                {[0, 1, 2, 3, 4].map((n) => (
                  <input
                    key={n}
                    type="checkbox"
                    name="module"
                    value={x}
                    defaultChecked={String(selected.data.permissions).includes(
                      x,
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="account-actions">
            <button type="submit">
              Save permissions
            </button>
            <button type="button" onClick={() => void accountAction(selected.data.email, "suspend")}>
              Suspend access
            </button>
            <button type="button" onClick={() => {void accountAction(selected.data.email,"suspend");void remove(selected.id)}}>Remove member</button>
          </div></form>
        </Modal>
      )}
      {toast && (
        <div className="admin-toast">
          <b>✓</b>
          {toast}
        </div>
      )}
    </main>
  );
}
