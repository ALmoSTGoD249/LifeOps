import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckSquare, ChevronLeft, ChevronRight, KanbanSquare, ListTodo, Plus, Repeat } from "lucide-react";
import { api } from "../lib/api";
import { PriorityBadge, fmt, useMembers } from "../lib/incidents";
import { TSTATE_LABEL, TaskStateBadge, isTaskOverdue, type Task } from "../lib/tasks";
import { Avatar, Button, Card, EmptyState, ErrorNote, Modal, Select, Spinner, cx } from "../components/ui";
import TaskForm, { taskPayload } from "../components/TaskForm";
import { PageHeader } from "./Placeholder";

const SCOPES: [string, string][] = [["mine", "My tasks"], ["by_me", "Assigned by me"], ["upcoming", "Upcoming"], ["overdue", "Overdue"], ["unassigned", "Unassigned"], ["all", "All"]];
const COLS = ["open", "in_progress", "blocked", "completed"];
const SIZE = 25;
type Page = { items: Task[]; total: number };

function Meta({ t }: { t: Task }) {
  return <span className="text-xs text-muted">{[t.parent?.number, t.category].filter(Boolean).join(" · ")}{t.recurrence && <Repeat className="ml-1.5 inline size-3" aria-label="Recurring" />}{isTaskOverdue(t) && <span className="ml-2 text-danger">Overdue</span>}{t.is_blocked_by_dependency && <span className="ml-2 text-[#f5a15a]">Waiting on dependency</span>}</span>;
}

export default function TaskList() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const members = useMembers().data ?? [];
  const get = (k: string, d = "") => sp.get(k) ?? d;
  const scope = get("scope", "mine"), view = get("view", "table"), page = Number(get("page", "1")) || 1, assignee = get("assigned");
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [err, setErr] = useState("");
  const setParam = (patch: Record<string, string | null>) => setSp((prev) => {
    const n = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
    if (!("page" in patch)) n.delete("page");
    return n;
  }, { replace: true });

  const gridStart = new Date(cursor); gridStart.setDate(1 - ((cursor.getDay() + 6) % 7));
  const gridEnd = new Date(gridStart); gridEnd.setDate(gridEnd.getDate() + 42);

  const qs = new URLSearchParams({ scope });
  if (assignee) qs.set("assigned_to", assignee);
  if (view === "table") { qs.set("page", String(page)); qs.set("page_size", String(SIZE)); }
  else { qs.set("page_size", "200"); qs.set("sort", view === "board" ? "updated_at" : "due_date"); if (view === "board") { qs.set("order", "desc"); qs.set("state", "open,in_progress,blocked,completed"); } }
  if (view === "calendar") { qs.set("due_from", gridStart.toISOString()); qs.set("due_to", gridEnd.toISOString()); }
  const list = useQuery({ queryKey: ["tasks", qs.toString()], queryFn: () => api<Page>(`/tasks?${qs}`), placeholderData: keepPreviousData });
  const items = list.data?.items ?? [];

  const create = useMutation({
    mutationFn: (b: object) => api<Task>("/tasks", { method: "POST", body: b }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); setParam({ new: null, incident: null }); },
  });
  const move = useMutation({
    mutationFn: (v: { number: string; to: string; blocked_reason?: string }) => api(`/tasks/${v.number}/transition`, { method: "POST", body: { to: v.to, blocked_reason: v.blocked_reason } }),
    onSuccess: () => { setErr(""); qc.invalidateQueries({ queryKey: ["tasks"] }); }, onError: (e) => setErr((e as Error).message),
  });
  const moveTo = (t: Task, to: string) => {
    if (t.state === to) return;
    const reason = to === "blocked" ? window.prompt("What is blocking this task?") ?? undefined : undefined;
    if (to === "blocked" && reason === undefined) return;
    move.mutate({ number: t.number, to, blocked_reason: reason });
  };

  const empty = <EmptyState icon={CheckSquare} title="Nothing here" text={scope === "mine" ? "You have no open tasks. Enjoy it, or create one." : "No tasks match this view."}><Button variant="primary" onClick={() => setParam({ new: "1" })}><Plus className="size-4" />New task</Button></EmptyState>;
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const days = Array.from({ length: 42 }, (_, n) => { const d = new Date(gridStart); d.setDate(d.getDate() + n); return d; });
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const byDay = new Map<string, Task[]>();
  for (const t of items) if (t.due_date) { const k = key(new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t.due_date) ? t.due_date : t.due_date + "Z")); byDay.set(k, [...(byDay.get(k) ?? []), t]); }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Tasks" subtitle="Everything that needs doing, from incidents, requests, maintenance or just life." />
        <Button variant="primary" onClick={() => setParam({ new: "1" })}><Plus className="size-4" />New task</Button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto">{SCOPES.map(([k, l]) => <button key={k} onClick={() => setParam({ scope: k })} className={cx("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm", scope === k ? "bg-surface2 text-ink" : "text-muted hover:text-ink")}>{l}</button>)}</div>
        <Select aria-label="Assignee" className="ml-auto" value={assignee} onChange={(e) => setParam({ assigned: e.target.value || null })}><option value="">Anyone</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select>
        <div className="flex rounded-lg border border-line p-0.5">{([["table", ListTodo, "Table"], ["board", KanbanSquare, "Board"], ["calendar", CalendarDays, "Calendar"]] as const).map(([k, I, l]) => <button key={k} aria-label={`${l} view`} title={l} onClick={() => setParam({ view: k })} className={cx("grid size-8 place-items-center rounded-md", view === k ? "bg-surface2 text-ink" : "text-muted hover:text-ink")}><I className="size-4" /></button>)}</div>
      </div>
      {err && <div className="mb-3"><ErrorNote message={err} /></div>}
      {list.isError ? <ErrorNote message={(list.error as Error).message} /> : list.isLoading ? <div className="h-48"><Spinner /></div> : view === "table" ? (
        <>
          <Card className="overflow-hidden [&>div]:p-0">{items.length === 0 ? empty : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b border-line text-xs text-muted"><tr><th className="px-3 py-2.5 text-left font-medium">Number</th><th className="px-3 py-2.5 text-left font-medium">Title</th><th className="px-3 py-2.5 text-left font-medium">Priority</th><th className="px-3 py-2.5 text-left font-medium">State</th><th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Assigned to</th><th className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">Due</th></tr></thead>
              <tbody className="divide-y divide-line">{items.map((t) => (
                <tr key={t.id} className="hover:bg-surface2/40">
                  <td className="px-3 py-3 font-mono text-xs"><Link to={`/tasks/${t.number}`} className="text-accent hover:underline">{t.number}</Link></td>
                  <td className="max-w-sm px-3 py-3"><Link to={`/tasks/${t.number}`} className="block truncate hover:underline">{t.title}</Link><Meta t={t} />{t.checklist_total > 0 && <span className="ml-2 text-xs text-muted">{t.checklist_done}/{t.checklist_total}</span>}</td>
                  <td className="px-3 py-3"><PriorityBadge p={t.priority} /></td><td className="px-3 py-3"><TaskStateBadge s={t.state} /></td>
                  <td className="hidden px-3 py-3 md:table-cell">{t.assigned_to ? <span className="flex items-center gap-2"><Avatar name={t.assigned_to.full_name} src={t.assigned_to.avatar_url} size={22} />{t.assigned_to.full_name}</span> : <span className="text-muted">Unassigned</span>}</td>
                  <td className={cx("hidden px-3 py-3 text-xs lg:table-cell", isTaskOverdue(t) ? "text-danger" : "text-muted")}>{fmt(t.due_date)}</td>
                </tr>))}</tbody></table></div>)}</Card>
          {total > SIZE && <div className="mt-4 flex items-center justify-between text-sm text-muted"><span>{(page - 1) * SIZE + 1}–{Math.min(page * SIZE, total)} of {total}</span><div className="flex gap-2"><Button disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>Previous</Button><Button disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>Next</Button></div></div>}
        </>
      ) : view === "board" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLS.map((c) => { const col = items.filter((t) => t.state === c); return (
            <div key={c} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const t = items.find((x) => x.number === e.dataTransfer.getData("text/plain")); if (t) moveTo(t, c); }} className="min-h-40 rounded-xl border border-line bg-surface/50 p-3">
              <h3 className="mb-3 flex items-center justify-between px-1 text-xs font-medium text-muted">{TSTATE_LABEL[c]}<span className="font-mono">{col.length}</span></h3>
              <ul className="space-y-2">{col.map((t) => (
                <li key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", t.number)} className="cursor-grab rounded-lg border border-line bg-surface p-3 active:cursor-grabbing">
                  <Link to={`/tasks/${t.number}`} className="block text-sm hover:underline">{t.title}</Link>
                  <div className="mt-1"><Meta t={t} /></div>
                  <div className="mt-2 flex items-center justify-between gap-2"><PriorityBadge p={t.priority} />{t.assigned_to && <Avatar name={t.assigned_to.full_name} src={t.assigned_to.avatar_url} size={20} />}</div>
                  <Select aria-label={`Move ${t.number}`} className="mt-2 h-8 w-full text-xs" value={t.state} onChange={(e) => moveTo(t, e.target.value)}>{["open", "in_progress", "blocked", "completed", "cancelled"].map((s) => <option key={s} value={s}>{TSTATE_LABEL[s]}</option>)}</Select>
                </li>))}</ul>
              {!col.length && <p className="px-1 py-4 text-center text-xs text-muted/70">No tasks</p>}
            </div>); })}
        </div>
      ) : (
        <Card className="[&>div]:p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-sm font-medium">{monthLabel}</h2>
            <div className="flex gap-1"><Button variant="ghost" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="size-4" /></Button><Button variant="ghost" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button><Button variant="ghost" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="size-4" /></Button></div></div>
          <div className="grid grid-cols-7 border-b border-line text-center text-xs text-muted">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">{days.map((d) => { const ts = byDay.get(key(d)) ?? []; const today = key(d) === key(new Date()); return (
            <div key={key(d)} className={cx("min-h-20 border-b border-r border-line p-1.5 text-xs sm:min-h-24", d.getMonth() !== cursor.getMonth() && "bg-surface2/30 text-muted/60")}>
              <span className={cx("mb-1 inline-grid size-5 place-items-center rounded-full", today && "bg-accent text-accentfg")}>{d.getDate()}</span>
              {ts.slice(0, 3).map((t) => <button key={t.id} onClick={() => nav(`/tasks/${t.number}`)} title={t.title} className={cx("mb-0.5 block w-full truncate rounded bg-surface2 px-1.5 py-0.5 text-left", t.state === "completed" && "line-through opacity-60", isTaskOverdue(t) && "text-danger")}>{t.title}</button>)}
              {ts.length > 3 && <span className="text-muted">+{ts.length - 3} more</span>}
            </div>); })}</div>
          {!items.length && <p className="p-4 text-center text-sm text-muted">No tasks with a due date in this view.</p>}
        </Card>
      )}
      {get("new") === "1" && <Modal title="New task" onClose={() => setParam({ new: null, incident: null })}>
        <TaskForm incident={get("incident")} submitLabel="Create task" busy={create.isPending} error={create.isError ? (create.error as Error).message : undefined} onSubmit={(v) => create.mutate(taskPayload(v, true))} onCancel={() => setParam({ new: null, incident: null })} /></Modal>}
    </div>
  );
}
