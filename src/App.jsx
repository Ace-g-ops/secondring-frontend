import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Check, ChevronRight,
  CircleAlert, Headphones, LayoutDashboard, Menu, Phone, PhoneCall, RefreshCw, Search, X,
} from "lucide-react";
import { getBookings, getCallbackResult, getMissedCalls, triggerCallback } from "./api/client.js";
import { useLiveData } from "./hooks/useLiveData.js";
import { reconcileMissedCall } from "./utils/callback-status.js";
import { customerPhone } from "./utils/customer-phone.js";

const field = (item, ...names) => {
  for (const name of names) {
    const value = item?.[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
};
const display = (value, fallback = "—") => value === undefined || value === null || value === "" ? fallback : String(value);
const dateValue = (item, ...names) => field(item, ...names);
function relativeDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return display(value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
function normalizedStatus(status) {
  return String(status || "unknown").toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
}
function statusLabel(status) {
  return String(status || "Unknown").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
const missedStatusClass = (status) => ({
  pending_callback: "yellow", callback_in_progress: "blue", callback_completed: "green", failed: "red",
}[normalizedStatus(status)] || "neutral");
const bookingStatusClass = (status) => ({
  confirmed: "green", needs_follow_up: "yellow", cancelled: "red",
}[normalizedStatus(status)] || "neutral");
const missedId = (item) => field(item, "missed_call_id", "id", "call_id");
const customerName = (item) => field(item, "customer_name", "name", "caller_name", "contact_name");
const missedAt = (item) => dateValue(item, "missed_at", "created_at", "timestamp", "call_timestamp", "received_at");
const bookingTime = (item) => dateValue(item, "slot", "appointment_slot", "booking_slot", "starts_at", "scheduled_at");
const bookingCreated = (item) => dateValue(item, "created_at", "created", "timestamp");
const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

function usePageTitle(title) {
  useEffect(() => { document.title = `${title} · SecondRing`; }, [title]);
}
function LoadingState({ rows = 3, label = "Loading information" }) {
  return <div className="state-card" aria-label={label} data-testid="loading-state">
    <div style={{ display: "grid", gap: 9, maxWidth: 580, margin: "0 auto" }}>
      {Array.from({ length: rows }, (_, index) => <div className="skeleton" key={index} />)}
    </div>
  </div>;
}
function ErrorState({ error, onRetry }) {
  return <div className="empty-state" data-testid="status-error">
    <div className="state-icon"><CircleAlert size={19} /></div>
    <div className="state-title">We couldn’t load this information</div>
    <p className="state-copy" data-testid="text-error-message">{error || "Something went wrong while contacting the backend."}</p>
    {onRetry && <button className="button" style={{ marginTop: 14 }} onClick={onRetry} data-testid="button-retry"><RefreshCw size={13} /> Try again</button>}
  </div>;
}
function EmptyState({ title, copy, icon: Icon = Phone }) {
  return <div className="empty-state" data-testid="empty-state">
    <div className="state-icon"><Icon size={19} /></div>
    <div className="state-title">{title}</div><p className="state-copy">{copy}</p>
  </div>;
}
function Badge({ status, kind = "missed" }) {
  const tone = kind === "booking" ? bookingStatusClass(status) : missedStatusClass(status);
  return <span className={`badge badge-${tone}`} data-testid={`status-${normalizedStatus(status)}`}>{statusLabel(status)}</span>;
}
function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(timeout);
  }, [toast, onDismiss]);
  if (!toast) return null;
  return <div className="toast-region" role="status" aria-live="polite" data-testid="toast-region">
    <div className={`toast ${toast.type === "error" ? "error" : ""}`}>
      {toast.type === "error" ? <CircleAlert size={16} /> : <Check size={16} />}
      <span>{toast.message}</span>
      <button className="icon-button" onClick={onDismiss} aria-label="Dismiss notification" data-testid="button-dismiss-toast"><X size={14} /></button>
    </div>
  </div>;
}

function Shell({ children }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]);
  const navLinks = [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard, match: (path) => path === "/dashboard" },
    { to: "/dashboard/missed-calls", label: "Missed calls", icon: PhoneCall, match: (path) => path.includes("missed-calls") || path.includes("/calls/") },
    { to: "/dashboard/bookings", label: "Bookings", icon: CalendarDays, match: (path) => path.includes("bookings") },
  ];
  return <div className="app-shell">
    <button className={`mobile-overlay ${menuOpen ? "visible" : ""}`} onClick={() => setMenuOpen(false)} aria-label="Close navigation menu" data-testid="button-close-menu" />
    <aside className={`sidebar ${menuOpen ? "open" : ""}`} aria-label="Main navigation">
      <Link className="brand" to="/dashboard" data-testid="link-brand">
        <span className="brand-mark"><Phone size={19} strokeWidth={2.5} /></span>
        <span><span className="brand-name" style={{ display: "block" }}>SecondRing</span><span className="brand-tagline" style={{ display: "block" }}>Every missed call isn't a customer lost</span></span>
      </Link>
      <div className="nav-label">Workspace</div>
      <nav className="nav-list" aria-label="Workspace">
        {navLinks.map(({ to, label, icon: Icon, match }) => <Link
          key={to} to={to} className={`nav-link ${match(location.pathname) ? "active" : ""}`}
          aria-current={match(location.pathname) ? "page" : undefined} data-testid={`link-nav-${label.toLowerCase().replaceAll(" ", "-")}`}
        ><Icon size={17} strokeWidth={1.8} /><span>{label}</span></Link>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="workspace-chip"><div className="workspace-avatar">SR</div><div><div className="workspace-title">Salon workspace</div><div className="workspace-sub">Callback activity</div></div></div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation menu" aria-expanded={menuOpen} data-testid="button-open-menu"><Menu size={20} /></button>
        <div className="topbar-context"><span>Workspace</span><ChevronRight size={13} /><strong>{location.pathname.includes("missed-calls") || location.pathname.includes("/calls/") ? "Missed calls" : location.pathname.includes("bookings") ? "Bookings" : location.pathname === "/dashboard" ? "Overview" : "Page not found"}</strong></div>
        <div className="topbar-right"><span className="topbar-date">{new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span><div className="avatar" aria-label="Salon workspace profile">SW</div></div>
      </header>
      <div className="page-content">{children}</div>
    </main>
  </div>;
}

function PageHeading({ eyebrow = "CALLBACK OPERATIONS", title, subtitle, children }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1>{subtitle && <p className="page-subtitle">{subtitle}</p>}</div>{children && <div className="heading-actions">{children}</div>}</div>;
}
function useToastState() {
  const [toast, setToast] = useState(null);
  return { toast, notify: (type, message) => setToast({ type, message, id: Date.now() }), clear: () => setToast(null), view: <Toast toast={toast} onDismiss={() => setToast(null)} /> };
}
function sortLatest(items, timestamp) {
  return [...items].sort((left, right) => {
    const a = new Date(timestamp(left) || 0).getTime();
    const b = new Date(timestamp(right) || 0).getTime();
    return (Number.isNaN(b) ? 0 : b) - (Number.isNaN(a) ? 0 : a);
  });
}

function StatCard({ title, value, foot, icon: Icon, color, tint, testId }) {
  return <div className="stat-card" style={{ "--stat-color": color, "--stat-tint": tint }} data-testid={testId}>
    <div className="stat-top"><span>{title}</span><span className="stat-icon"><Icon size={15} /></span></div>
    <div className="stat-value" data-testid={`value-${testId}`}>{value}</div><div className="stat-foot">{foot}</div>
  </div>;
}
function MiniCall({ item, index }) {
  const id = missedId(item) ?? index;
  const name = customerName(item);
  const status = field(item, "status", "callback_status");
  return <div className="mini-row" data-testid={`row-latest-missed-${id}`}>
    <div className="mini-main"><div className="person-mark">{initials(name)}</div><div style={{ minWidth: 0 }}><div className="mini-name">{display(name, "Unknown caller")}</div><div className="mini-phone">{display(customerPhone(item))}</div></div></div>
    <div className="mini-meta"><Badge status={status} /><div className="mini-time" style={{ marginTop: 6 }}>{relativeDate(missedAt(item))}</div></div>
  </div>;
}
function MiniBooking({ item, index }) {
  const id = field(item, "booking_id", "id") ?? index;
  const name = customerName(item);
  return <div className="mini-row" data-testid={`row-latest-booking-${id}`}>
    <div className="mini-main"><div className="person-mark">{initials(name)}</div><div style={{ minWidth: 0 }}><div className="mini-name">{display(name, "Unknown customer")}</div><div className="mini-phone">{display(customerPhone(item))}</div></div></div>
    <div className="mini-meta"><div className="mini-service">{display(field(item, "service", "service_name"))}</div><div className="mini-time" style={{ marginTop: 5 }}>{relativeDate(bookingTime(item) || bookingCreated(item))}</div></div>
  </div>;
}

function SyncWarning({ calls }) {
  const failures = calls.filter((call) => call.synchronization_error);
  if (!failures.length) return null;
  return <div className="notice" role="status" data-testid="status-sync-warning">
    Live status could not be checked for {failures.length} {failures.length === 1 ? "call" : "calls"}. Showing the last reported status. {failures[0].synchronization_error}
  </div>;
}

async function loadDashboard() {
  const [calls, bookings] = await Promise.all([getMissedCalls(), getBookings()]);
  return { calls, bookings };
}

function DashboardPage() {
  usePageTitle("Overview");
  const { data, loading, error, refreshing, refresh } = useLiveData(loadDashboard);
  const state = { calls: data?.calls ?? [], bookings: data?.bookings ?? [], loading, error };
  const latestCalls = sortLatest(state.calls, missedAt).slice(0, 5);
  const latestBookings = sortLatest(state.bookings, bookingCreated).slice(0, 5);
  return <div data-testid="page-dashboard">
    <PageHeading title="Overview" subtitle="A clear view of the calls and bookings your salon has recovered.">
      <button className="button" onClick={refresh} disabled={refreshing} data-testid="button-refresh-dashboard"><RefreshCw size={14} className={refreshing ? "spin" : ""} /> Refresh</button>
    </PageHeading>
    {state.error ? <div className="table-panel"><ErrorState error={state.error} onRetry={refresh} /></div> : <>
      <SyncWarning calls={state.calls} />
      <div className="stats-grid">
        <StatCard title="Total missed calls" value={state.loading ? "—" : state.calls.length} foot="Calls received by your salon" icon={Phone} color="#586ed9" tint="#eef0ff" testId="stat-total-missed" />
        <StatCard title="Callback in progress" value={state.loading ? "—" : state.calls.filter((call) => normalizedStatus(field(call, "status", "callback_status")) === "callback_in_progress").length} foot="Bimpe is reaching out now" icon={Activity} color="#3972c5" tint="#eaf2ff" testId="stat-callback-progress" />
        <StatCard title="Callbacks completed" value={state.loading ? "—" : state.calls.filter((call) => normalizedStatus(field(call, "status", "callback_status")) === "callback_completed").length} foot="Conversations successfully completed" icon={Check} color="#27815c" tint="#e8f6ef" testId="stat-callback-completed" />
        <StatCard title="Confirmed bookings" value={state.loading ? "—" : state.bookings.filter((booking) => normalizedStatus(field(booking, "status", "booking_status")) === "confirmed").length} foot="Appointments confirmed from callbacks" icon={CalendarDays} color="#a6791d" tint="#fff5dc" testId="stat-confirmed-bookings" />
      </div>
      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="latest-calls-title">
          <div className="panel-head"><div><h2 className="panel-title" id="latest-calls-title">Latest missed calls</h2><div className="panel-hint">Most recently received by your salon</div></div><Link className="text-link" to="/dashboard/missed-calls" data-testid="link-all-missed">View all <ArrowRight size={13} /></Link></div>
          {state.loading ? <LoadingState rows={4} /> : state.calls.length === 0 ? <EmptyState title="No missed calls yet" copy="When a call goes unanswered, it will appear here with its callback progress." /> : <div className="mini-list">{latestCalls.map((item, index) => <MiniCall key={missedId(item) ?? index} item={item} index={index} />)}</div>}
        </section>
        <section className="panel" aria-labelledby="latest-bookings-title">
          <div className="panel-head"><div><h2 className="panel-title" id="latest-bookings-title">Latest bookings</h2><div className="panel-hint">Appointments created from recovered calls</div></div><Link className="text-link" to="/dashboard/bookings" data-testid="link-all-bookings">View all <ArrowRight size={13} /></Link></div>
          {state.loading ? <LoadingState rows={4} /> : state.bookings.length === 0 ? <EmptyState title="No bookings yet" copy="Any appointments created after a callback will show up here." icon={CalendarDays} /> : <div className="mini-list">{latestBookings.map((item, index) => <MiniBooking key={field(item, "booking_id", "id") ?? index} item={item} index={index} />)}</div>}
        </section>
      </div>
    </>}
  </div>;
}

function SortableHeader({ label, fieldName, sort, onSort }) {
  const isCurrent = sort.key === fieldName;
  return <th><button className="sort-button" onClick={() => onSort(fieldName)} data-testid={`sort-${fieldName}`}>{label}{isCurrent ? sort.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : <ArrowDown size={11} style={{ opacity: .32 }} />}</button></th>;
}
function sortValue(row, key) {
  if (key === "phone_number") return customerPhone(row) ?? "";
  const aliases = {
    customer_name: ["customer_name", "name", "caller_name", "contact_name"],
    missed_at: ["missed_at", "created_at", "timestamp", "call_timestamp", "received_at"],
    status: ["status", "callback_status", "booking_status"],
    booking_id: ["booking_id", "id"],
    service: ["service", "service_name"],
    slot: ["slot", "appointment_slot", "booking_slot", "starts_at", "scheduled_at"],
    created_at: ["created_at", "created", "timestamp"],
  };
  const value = field(row, ...(aliases[key] || [key]));
  if (value === null) return "";
  const maybeDate = new Date(value);
  return typeof value === "string" && !Number.isNaN(maybeDate.getTime()) && /\d{4}-\d\d-\d\d/.test(value) ? maybeDate.getTime() : String(value).toLowerCase();
}
function useFilterSort(rows, search, sort) {
  return useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    const av = sortValue(a, sort.key); const bv = sortValue(b, sort.key);
    const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sort.direction === "asc" ? result : -result;
  }), [rows, search, sort]);
}
function SearchToolbar({ search, setSearch, count, label, refresh, loading }) {
  return <div className="table-toolbar">
    <label className="search-box"><Search size={15} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()}…`} aria-label={`Search ${label.toLowerCase()}`} data-testid={`input-search-${label.toLowerCase().replaceAll(" ", "-")}`} /></label>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}><span className="table-count" data-testid={`text-${label.toLowerCase().replaceAll(" ", "-")}-count`}>{count} {count === 1 ? "record" : "records"}</span><button className="button button-quiet" onClick={refresh} disabled={loading} data-testid={`button-refresh-${label.toLowerCase().replaceAll(" ", "-")}`}><RefreshCw size={13} /> Refresh</button></div>
  </div>;
}
function MissedCallsPage({ notify }) {
  usePageTitle("Missed calls");
  const { data, loading, error, refreshing, refresh, setData: setCalls } = useLiveData(getMissedCalls);
  const calls = data ?? [];
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "missed_at", direction: "desc" });
  const [pending, setPending] = useState({});
  const [refreshingIds, setRefreshingIds] = useState({});
  const navigate = useNavigate();
  const visible = useFilterSort(calls, search, sort);
  const toggleSort = (key) => setSort((old) => ({ key, direction: old.key === key && old.direction === "desc" ? "asc" : "desc" }));
  async function callBack(item) {
    const id = missedId(item);
    if (id === null || id === undefined) { notify("error", "This missed call has no ID, so the callback cannot be started."); return; }
    setPending((old) => ({ ...old, [id]: true }));
    try {
      await triggerCallback(id);
      notify("success", "Callback requested. Bimpe will attempt to reach this customer.");
      refresh();
    } catch (err) { notify("error", err.message); }
    finally { setPending((old) => ({ ...old, [id]: false })); }
  }
  async function refreshOne(item) {
    const id = missedId(item);
    if (id === null || id === undefined) return;
    setRefreshingIds((old) => ({ ...old, [id]: true }));
    try {
      const latest = await getCallbackResult(id);
      setCalls((old) => (old ?? []).map((call) => String(missedId(call)) === String(id) ? reconcileMissedCall(call, latest) : call));
      notify("success", "Call details refreshed.");
    } catch (err) { notify("error", err.message); }
    finally { setRefreshingIds((old) => ({ ...old, [id]: false })); }
  }
  return <div data-testid="page-missed-calls">
    <PageHeading title="Missed calls" subtitle="Every missed ring, with its callback status in one place.">
      <button className="button" onClick={refresh} disabled={refreshing} data-testid="button-refresh-missed-calls"><RefreshCw size={14} /> Refresh list</button>
    </PageHeading>
    {error ? <div className="table-panel"><ErrorState error={error} onRetry={refresh} /></div> : <section className="table-panel" aria-label="Missed calls table">
      <SyncWarning calls={calls} />
      <SearchToolbar search={search} setSearch={setSearch} count={visible.length} label="Missed calls" refresh={refresh} loading={refreshing} />
      {loading ? <LoadingState rows={5} /> : calls.length === 0 ? <EmptyState title="No missed calls to show" copy="Once your salon misses a call, it will appear here for follow-up." /> : visible.length === 0 ? <EmptyState title="No matches found" copy="Try a different name, phone number, status, or call ID." icon={Search} /> : <div className="table-wrap"><table className="data-table">
        <thead><tr>
          <SortableHeader label="Customer Name" fieldName="customer_name" sort={sort} onSort={toggleSort} />
          <SortableHeader label="Phone Number" fieldName="phone_number" sort={sort} onSort={toggleSort} />
          <SortableHeader label="Missed At" fieldName="missed_at" sort={sort} onSort={toggleSort} />
          <SortableHeader label="Status" fieldName="status" sort={sort} onSort={toggleSort} />
          <th>Bimpe Call ID</th><th>Actions</th>
        </tr></thead>
        <tbody>{visible.map((item, index) => {
          const id = missedId(item); const key = id ?? `row-${index}`;
          return <tr key={key} data-testid={`row-missed-call-${key}`}>
            <td><div className="customer-cell"><div className="table-avatar">{initials(customerName(item))}</div><span className="customer-name">{display(customerName(item), "Unknown caller")}</span></div></td>
            <td>{display(customerPhone(item))}</td><td>{relativeDate(missedAt(item))}</td>
            <td><Badge status={field(item, "status", "callback_status")} /></td>
            <td className="mono">{display(field(item, "bimpe_call_id", "bimpeCallId", "call_id"))}</td>
            <td><div className="row-actions">
              <button className="button button-primary button-quiet" onClick={() => callBack(item)} disabled={Boolean(pending[id]) || !id} data-testid={`button-callback-${key}`}><PhoneCall size={12} />{pending[id] ? "Starting…" : "Call back"}</button>
              <button className="icon-button" onClick={() => refreshOne(item)} disabled={Boolean(refreshingIds[id]) || !id} title="Refresh callback result" aria-label={`Refresh callback result for ${display(customerName(item), "caller")}`} data-testid={`button-refresh-call-${key}`}><RefreshCw size={13} /></button>
              <button className="icon-button" onClick={() => navigate(`/dashboard/calls/${encodeURIComponent(id)}`)} disabled={!id} title="View call details" aria-label={`View call details for ${display(customerName(item), "caller")}`} data-testid={`button-view-call-${key}`}><ChevronRight size={15} /></button>
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </section>}
  </div>;
}

function BookingsPage() {
  usePageTitle("Bookings");
  const { data, loading, error, refreshing, refresh } = useLiveData(getBookings);
  const bookings = data ?? [];
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "created_at", direction: "desc" });
  const visible = useFilterSort(bookings, search, sort);
  const toggleSort = (key) => setSort((old) => ({ key, direction: old.key === key && old.direction === "desc" ? "asc" : "desc" }));
  return <div data-testid="page-bookings">
    <PageHeading title="Bookings" subtitle="Appointments created after a callback, ready for your team to follow through.">
      <button className="button" onClick={refresh} disabled={refreshing} data-testid="button-refresh-bookings"><RefreshCw size={14} /> Refresh list</button>
    </PageHeading>
    {error ? <div className="table-panel"><ErrorState error={error} onRetry={refresh} /></div> : <section className="table-panel" aria-label="Bookings table">
      <SearchToolbar search={search} setSearch={setSearch} count={visible.length} label="Bookings" refresh={refresh} loading={refreshing} />
      {loading ? <LoadingState rows={5} /> : bookings.length === 0 ? <EmptyState title="No bookings yet" copy="Bookings created from completed callbacks will appear here." icon={CalendarDays} /> : visible.length === 0 ? <EmptyState title="No matches found" copy="Try another customer, service, slot, or booking ID." icon={Search} /> : <div className="table-wrap"><table className="data-table">
        <thead><tr>
          <SortableHeader label="Booking ID" fieldName="booking_id" sort={sort} onSort={toggleSort} />
          <SortableHeader label="Customer Name" fieldName="customer_name" sort={sort} onSort={toggleSort} />
          <SortableHeader label="Phone Number" fieldName="phone_number" sort={sort} onSort={toggleSort} />
          <SortableHeader label="Service" fieldName="service" sort={sort} onSort={toggleSort} />
          <SortableHeader label="Slot" fieldName="slot" sort={sort} onSort={toggleSort} />
          <SortableHeader label="Status" fieldName="status" sort={sort} onSort={toggleSort} />
          <SortableHeader label="Created At" fieldName="created_at" sort={sort} onSort={toggleSort} />
        </tr></thead><tbody>{visible.map((item, index) => {
          const id = field(item, "booking_id", "id") ?? `row-${index}`;
          return <tr key={id} data-testid={`row-booking-${id}`}>
            <td className="mono">{display(field(item, "booking_id", "id"))}</td>
            <td><div className="customer-cell"><div className="table-avatar">{initials(customerName(item))}</div><span className="customer-name">{display(customerName(item), "Unknown customer")}</span></div></td>
            <td>{display(customerPhone(item))}</td>
            <td>{display(field(item, "service", "service_name"))}</td>
            <td>{relativeDate(bookingTime(item))}</td>
            <td><Badge status={field(item, "status", "booking_status")} kind="booking" /></td>
            <td>{relativeDate(bookingCreated(item))}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    </section>}
  </div>;
}

function DetailField({ label, value, mono = false }) {
  return <div className="detail-field"><label>{label}</label><div className={mono ? "mono" : ""} data-testid={`detail-${label.toLowerCase().replaceAll(" ", "-")}`}>{display(value)}</div></div>;
}
function CallbackDetailPage() {
  const { missedCallId } = useParams();
  const navigate = useNavigate();
  usePageTitle("Call details");
  const loadResult = useCallback(() => getCallbackResult(missedCallId), [missedCallId]);
  const { data: record, loading, error, refreshing, refresh } = useLiveData(loadResult);

  const missed = record?.missed_call || record?.missedCall || record?.call?.missed_call || record?.call || record || {};
  const callback = record?.callback || record?.callback_result || record?.bimpe_call || record || {};
  const booking = record?.extracted_booking_details || record?.booking_details || record?.extracted_booking || record?.booking || null;
  const transcript = field(record, "transcript", "messages", "conversation", "transcript_messages") || field(callback, "transcript", "messages", "conversation") || [];
  const messages = Array.isArray(transcript) ? transcript : Array.isArray(transcript?.messages) ? transcript.messages : [];
  const msgContent = (message) => field(message, "content", "text", "message", "body");
  const time = (value) => relativeDate(value);
  return <div data-testid="page-call-details">
    <button className="detail-back" onClick={() => navigate("/dashboard/missed-calls")} data-testid="button-back-missed-calls"><ArrowLeft size={14} /> Back to missed calls</button>
    <PageHeading title="Callback details" subtitle="Call outcome and conversation transcript." >
      <button className="button" onClick={refresh} disabled={refreshing} data-testid="button-refresh-callback-result"><RefreshCw size={14} /> Refresh</button>
    </PageHeading>
    {error ? <div className="table-panel"><ErrorState error={error} onRetry={refresh} /></div> : loading ? <div className="detail-grid"><div className="detail-card"><LoadingState rows={5} /></div><div className="detail-card"><LoadingState rows={4} /></div></div> : <div className="detail-grid">
      <section className="detail-card" aria-labelledby="call-summary-heading">
        <div className="detail-card-head"><div><h2 id="call-summary-heading">Call summary</h2><p>Missed call {display(field(missed, "missed_call_id", "id"), missedCallId)}</p></div><Badge status={field(missed, "status", "callback_status")} /></div>
        <div className="detail-fields">
          <DetailField label="Customer name" value={customerName(missed) || field(record, "customer_name")} />
          <DetailField label="Phone number" value={customerPhone(missed) || customerPhone(record) || customerPhone(booking)} />
          <DetailField label="Bimpe call ID" value={field(callback, "bimpe_call_id", "call_id", "id") || field(missed, "bimpe_call_id") || field(record, "bimpe_call_id")} mono />
          <DetailField label="Call status" value={field(callback, "call_status", "status") || field(record, "call_status")} />
          <DetailField label="Answered at" value={time(field(callback, "answered_at", "call_answered_at") || field(record, "answered_at"))} />
          <DetailField label="Ended at" value={time(field(callback, "ended_at", "call_ended_at") || field(record, "ended_at"))} />
        </div>
        {(field(callback, "error_reason", "error", "failure_reason") || field(record, "error_reason")) && <div className="notice" style={{ marginTop: 18, marginBottom: 0 }} data-testid="text-error-reason"><strong>Error reason:</strong> {display(field(callback, "error_reason", "error", "failure_reason") || field(record, "error_reason"))}</div>}
        {booking && typeof booking === "object" && <div className="booking-extract" data-testid="booking-extracted-details"><h3>Extracted booking details</h3><div className="detail-fields">
          <DetailField label="Service" value={field(booking, "service", "service_name")} />
          <DetailField label="Slot" value={relativeDate(field(booking, "slot", "appointment_slot", "starts_at", "scheduled_at"))} />
          <DetailField label="Booking status" value={field(booking, "status", "booking_status")} />
          <DetailField label="Booking ID" value={field(booking, "booking_id", "id")} mono />
        </div></div>}
      </section>
      <section className="detail-card transcript-card" aria-labelledby="transcript-heading">
        <div className="detail-card-head"><div><h2 id="transcript-heading">Conversation transcript</h2><p>{messages.length ? `${messages.length} messages` : "Conversation messages from this callback"}</p></div><Headphones size={16} color="#7180cd" /></div>
        {messages.length === 0 ? <div className="empty-state" data-testid="empty-transcript">No transcript available yet.</div> : <div className="transcript-list" data-testid="transcript-list">
          {messages.map((message, index) => {
            const role = String(field(message, "role", "speaker", "sender", "author") || "assistant").toLowerCase();
            const isUser = ["user", "customer", "caller", "human"].includes(role);
            const created = field(message, "created_at", "timestamp", "time");
            return <div className={`transcript-message ${isUser ? "user" : "assistant"}`} key={field(message, "id") || index} data-testid={`transcript-message-${index}`}>
              <div className="transcript-speaker">{isUser ? "Customer" : role === "assistant" || role === "bimpe" ? "Bimpe" : statusLabel(role)}</div>
              <div className="transcript-bubble">{display(msgContent(message), "Message unavailable")}</div>
              <div className="transcript-time">{time(created)}</div>
            </div>;
          })}
        </div>}
      </section>
    </div>}
  </div>;
}
function NotFoundPage() {
  usePageTitle("Page not found");
  return <div className="state-card" data-testid="page-not-found"><div className="state-icon"><CircleAlert size={19} /></div><div className="state-title">This page isn’t in the call log</div><p className="state-copy">The address may be out of date. Head back to your overview to keep an eye on callbacks.</p><Link className="button button-primary" to="/dashboard" style={{ marginTop: 16 }} data-testid="link-not-found-dashboard">Go to overview <ArrowRight size={14} /></Link></div>;
}

function RoutedApp() {
  const notifyState = useToastState();
  return <>
    <Shell><Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/dashboard/missed-calls" element={<MissedCallsPage notify={notifyState.notify} />} />
      <Route path="/dashboard/bookings" element={<BookingsPage />} />
      <Route path="/dashboard/calls/:missedCallId" element={<CallbackDetailPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes></Shell>
    {notifyState.view}
  </>;
}
function App() {
  return <BrowserRouter><RoutedApp /></BrowserRouter>;
}

export default App;
