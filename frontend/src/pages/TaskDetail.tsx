import { useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Link2, Paperclip, Pencil, Repeat, Trash2, X } from "lucide-react";
import { api, apiUpload, ApiError } from "../lib/api";
import { PriorityBadge, fmt, useMembers, type Attach, type TimelineItem } from "../lib/incidents";
import { TSTATE_LABEL, TaskStateBadge, isTaskOverdue, type TaskDetail } from "../lib/tasks";
import { Avatar, Button, Card, EmptyState, ErrorNote, Modal, Select, Spinner, TextArea } from "../components/ui";
import TaskForm, { taskPayload } from "../components/TaskForm";

function describe(t: TimelineItem): ReactNode {
  const d = t.details;
  switch (t.action) {
    case "created": return d.recurred_from ? `created this task (recurrence of ${d.recurred_from})` : "created this task";
    case "updated": return <>updated {Object.entries(d).map(([k, c]: [string, any]) => <span key={k} className="mr-2 inline-block"><b className="font-medium">{k.replace(/_/g, " ")}</b>: {String(c.from ?? "none")} → {String(c.to ?? "none")}</span>)}</>;
    case "assigned": return <>assigned to <b className="font-medium">{d.assigned_to?.to}</b></>;
    case "unassigned": return `unassigned (was ${d.assigned_to?.from})`;
    case "state_changed": return <>changed state from {TSTATE_LABEL[d.state.from]} to <b className="font-medium">{TSTATE_LABEL[d.state.to]}</b>{d.blocked_reason && <> ({d.blocked_reason})</>}</>;
    case "completed": return "completed this task";
    case "cancelled": return "cancelled this task";
    case "reopened": return "reopened this task";
    case "recurrence_generated": return <>created the next occurrence <b className="font-medium">{d.next}</b></>;
    case "commented": return "added a comment";
    case "checklist_added": return `added checklist item "${d.item}"`;
    case "checklist_done": return `checked off "${d.item}"`;
    case "checklist_undone": return `unchecked "${d.item}"`;
    case "checklist_removed": return `removed checklist item "${d.item}"`;
    case "dependency_added": return <>now depends on <b className="font-medium">{d.depends_on}</b></>;
    case "dependency_removed": return `no longer depends on ${d.depends_on}`;
    case "attachment_added": return <>attached <b className="font-medium">{d.file}</b></>;
    default: return t.action;
  }
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => <div className="flex items-start justify-between gap-4 py-2 text-sm"><dt className="text-muted">{label}</dt><dd className="text-right">{children}</dd></div>;

export default function TaskDetailPage() {
  const { number = "" } = useParams();
  const qc = useQueryClient();
  const members = useMembers().data ?? [];
  const [edit, setEdit] = useState(false);
  const [body, setBody] = useState("");
  const [item, setItem] = useState("");
  const [dep, setDep] = useState("");
  const [msg, setMsg] = useState("");
  const [uploadErr, setUploadErr] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const base = ["task", number];

  const task = useQuery({ queryKey: base, queryFn: () => api<TaskDetail>(`/tasks/${number}`) });
  const tl = useQuery({ queryKey: [...base, "activity"], queryFn: () => api<TimelineItem[]>(`/tasks/${number}/activity`) });
  const att = useQuery({ queryKey: [...base, "attachments"], queryFn: () => api<Attach[]>(`/tasks/${number}/attachments`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: base }); qc.invalidateQueries({ queryKey: ["tasks"] }); };
  const fail = (e: unknown) => setMsg(e instanceof Error ? e.message : "Something went wrong");
  const ok = () => { setMsg(""); refresh(); };

  const patch = useMutation({ mutationFn: (b: object) => api(`/tasks/${number}`, { method: "PATCH", body: b }), onSuccess: () => { setEdit(false); ok(); }, onError: fail });
  const move = useMutation({
    mutationFn: (v: { to: string; blocked_reason?: string }) => api<{ follow_up: string | null }>(`/tasks/${number}/transition`, { method: "POST", body: v }),
    onSuccess: (r) => { ok(); if (r.follow_up) setMsg(`Next occurrence created: ${r.follow_up}`); }, onError: fail,
  });
  const comment = useMutation({ mutationFn: () => api(`/tasks/${number}/comments`, { method: "POST", body: { body } }), onSuccess: () => { setBody(""); ok(); }, onError: fail });
  const addItem = useMutation({ mutationFn: () => api(`/tasks/${number}/checklist`, { method: "POST", body: { text: item } }), onSuccess: () => { setItem(""); ok(); }, onError: fail });
  const toggle = useMutation({ mutationFn: (v: { id: string; done: boolean }) => api(`/tasks/${number}/checklist/${v.id}`, { method: "PATCH", body: { done: v.done } }), onSuccess: ok, onError: fail });
  const delItem = useMutation({ mutationFn: (id: string) => api(`/tasks/${number}/checklist/${id}`, { method: "DELETE" }), onSuccess: ok, onError: fail });
  const addDep = useMutation({ mutationFn: () => api(`/tasks/${number}/dependencies`, { method: "POST", body: { depends_on: dep.trim() } }), onSuccess: () => { setDep(""); ok(); }, onError: fail });
  const delDep = useMutation({ mutationFn: (n: string) => api(`/tasks/${number}/dependencies/${n}`, { method: "DELETE" }), onSuccess: ok, onError: fail });
  const upload = useMutation({ mutationFn: (f: File) => apiUpload(`/tasks/${number}/attachments`, f), onSuccess: () => { setUploadErr(""); ok(); }, onError: (e) => setUploadErr((e as Error).message) });

  if (task.isLoading) return <div className="h-64"><Spinner /></div>;
  if (task.isError) {
    const nf = task.error instanceof ApiError && task.error.status === 404;
    return <div><Link to="/tasks" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Tasks</Link>{nf ? <EmptyState icon={Link2} title="Task not found" text={`There is no task ${number}.`} /> : <ErrorNote message={(task.error as Error).message} />}</div>;
  }
  const t = task.data!;
  const done = t.state === "completed" || t.state === "cancelled";
  const go = (to: string) => {
    if (to === "blocked") { const r = window.prompt("What is blocking this task?"); if (r === null) return; return move.mutate({ to, blocked_reason: r }); }
    if (to === "cancelled" && !window.confirm(`Cancel ${t.number}?`)) return;
    move.mutate({ to });
  };
  const actions: [string, string, boolean][] = done ? [["open", "Reopen", false]] : [
    ...(t.state !== "in_progress" ? [["in_progress", "Start", false] as [string, string, boolean]] : []),
    ...(t.state !== "blocked" ? [["blocked", "Block", false] as [string, string, boolean]] : []),
    ["completed", "Complete", true], ["cancelled", "Cancel", false]];
  const pct = t.checklist_total ? Math.round((t.checklist_done / t.checklist_total) * 100) : 0;

  return (
    <div>
      <Link to="/tasks" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Tasks</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-sm text-muted">{t.number}</span><TaskStateBadge s={t.state} /><PriorityBadge p={t.priority} />{isTaskOverdue(t) && <span className="text-xs text-danger">Overdue</span>}{t.recurrence && <span className="inline-flex items-center gap-1 text-xs text-muted"><Repeat className="size-3" />Every {t.recurrence.interval > 1 ? `${t.recurrence.interval} ` : ""}{t.recurrence.frequency.replace("ly", t.recurrence.interval > 1 ? "ly" : "")}</span>}</div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{t.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">{!done && <Button onClick={() => setEdit(true)}><Pencil className="size-4" />Edit</Button>}{actions.map(([to, label, primary]) => <Button key={to} variant={primary ? "primary" : "subtle"} busy={move.isPending} onClick={() => go(to)}>{label}</Button>)}</div>
      </div>
      {msg && <div className="mb-4"><ErrorNote message={msg} /></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Description"><p className="whitespace-pre-wrap text-sm">{t.description || <span className="text-muted">No description.</span>}</p>{t.blocked_reason && <p className="mt-4 rounded-lg border border-line bg-surface2 px-3 py-2 text-sm"><span className="text-muted">Blocked: </span>{t.blocked_reason}</p>}</Card>
          <Card title={`Checklist${t.checklist_total ? ` (${t.checklist_done}/${t.checklist_total})` : ""}`}>
            {t.checklist_total > 0 && <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface2"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>}
            <ul className="space-y-1">{t.checklist.map((c) => (
              <li key={c.id} className="group flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-surface2/50">
                <input type="checkbox" checked={c.done} disabled={done} onChange={(e) => toggle.mutate({ id: c.id, done: e.target.checked })} aria-label={c.text} />
                <span className={`flex-1 text-sm ${c.done ? "text-muted line-through" : ""}`}>{c.text}</span>
                {!done && <button aria-label={`Remove ${c.text}`} onClick={() => delItem.mutate(c.id)} className="text-muted opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100"><Trash2 className="size-4" /></button>}
              </li>))}</ul>
            {!t.checklist.length && <p className="text-sm text-muted">No checklist items.</p>}
            {!done && <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (item.trim()) addItem.mutate(); }}><input value={item} onChange={(e) => setItem(e.target.value)} maxLength={200} placeholder="Add an item" aria-label="New checklist item" className="h-9 flex-1 rounded-lg border border-line bg-surface2 px-3 text-sm focus:border-accent focus:outline-none" /><Button type="submit" disabled={!item.trim()}>Add</Button></form>}
            {t.state !== "completed" && t.checklist_total > t.checklist_done && t.checklist_done > 0 && <p className="mt-3 text-xs text-muted">Completing is allowed with unchecked items.</p>}
          </Card>
          <Card title="Activity">
            <div className="mb-6"><TextArea label="Add a comment" value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} /><div className="mt-2"><Button variant="primary" disabled={!body.trim()} busy={comment.isPending} onClick={() => comment.mutate()}>Post</Button></div></div>
            {tl.isLoading ? <div className="h-16"><Spinner /></div> : (
              <ol className="space-y-[18px]">{[...(tl.data ?? [])].reverse().map((x) => (
                <li key={x.id} className="relative pl-6 before:absolute before:left-[5px] before:top-2 before:size-2 before:rounded-full before:bg-line after:absolute after:bottom-[-18px] after:left-[8.5px] after:top-5 after:w-px after:bg-line last:after:hidden">
                  <p className="text-sm"><b className="font-medium">{x.user_name ?? "System"}</b> <span className="text-muted">{describe(x)}</span></p><p className="text-xs text-muted/70">{fmt(x.created_at)}</p>
                  {x.comment && <div className="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-surface2 px-3 py-2 text-sm">{x.comment.body}</div>}
                </li>))}</ol>)}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details"><dl className="-my-2 divide-y divide-line">
            <Row label="Assigned to"><Select aria-label="Assigned to" disabled={done || patch.isPending} value={t.assigned_to?.id ?? ""} onChange={(e) => patch.mutate({ assigned_to_id: e.target.value || null })}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select></Row>
            <Row label="Created by">{t.created_by ? <span className="inline-flex items-center gap-2"><Avatar name={t.created_by.full_name} src={t.created_by.avatar_url} size={20} />{t.created_by.full_name}</span> : "—"}</Row>
            <Row label="Due"><span className={isTaskOverdue(t) ? "text-danger" : ""}>{fmt(t.due_date)}</span></Row><Row label="Category">{t.category || "—"}</Row>
            <Row label="Parent">{t.parent ? <Link className="text-accent hover:underline" to={`/${t.parent.type === "maintenance" ? "maintenance" : "incidents"}/${t.parent.number}`} title={t.parent.title}>{t.parent.number}</Link> : "—"}</Row>
            <Row label="Created">{fmt(t.created_at)}</Row>{t.completed_at && <Row label="Completed">{fmt(t.completed_at)}</Row>}
          </dl></Card>
          <Card title="Dependencies">
            <p className="mb-2 text-xs font-medium text-muted">Depends on</p>
            <ul className="space-y-1.5">{t.blocked_by.map((d) => <li key={d.number} className="flex items-center justify-between gap-2 text-sm"><Link to={`/tasks/${d.number}`} className="truncate hover:underline"><span className="font-mono text-xs text-accent">{d.number}</span> {d.title}</Link><span className="flex items-center gap-2"><TaskStateBadge s={d.state} />{!done && <button aria-label={`Remove dependency ${d.number}`} onClick={() => delDep.mutate(d.number)} className="text-muted hover:text-danger"><X className="size-4" /></button>}</span></li>)}</ul>
            {!t.blocked_by.length && <p className="text-sm text-muted">Nothing blocks this task.</p>}
            {!done && <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (dep.trim()) addDep.mutate(); }}><input value={dep} onChange={(e) => setDep(e.target.value)} placeholder="TASK000001" aria-label="Depends on task number" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface2 px-3 font-mono text-sm focus:border-accent focus:outline-none" /><Button type="submit" disabled={!dep.trim()}>Add</Button></form>}
            {t.blocks.length > 0 && <><p className="mb-2 mt-5 text-xs font-medium text-muted">Blocks</p><ul className="space-y-1.5">{t.blocks.map((d) => <li key={d.number} className="text-sm"><Link to={`/tasks/${d.number}`} className="hover:underline"><span className="font-mono text-xs text-accent">{d.number}</span> {d.title}</Link></li>)}</ul></>}
          </Card>
          <Card title="Attachments" action={!done && <><input ref={file} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} /><Button variant="ghost" busy={upload.isPending} onClick={() => file.current?.click()}><Paperclip className="size-4" />Add</Button></>}>
            {uploadErr && <div className="mb-3"><ErrorNote message={uploadErr} /></div>}
            {att.data?.length ? <ul className="space-y-2">{att.data.map((a) => <li key={a.id}><a href={`/api/attachments/${a.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:border-muted/60"><span className="truncate">{a.name}</span><Download className="size-3.5 shrink-0 text-muted" /></a></li>)}</ul> : <p className="text-sm text-muted">No files attached.</p>}
          </Card>
        </div>
      </div>
      {edit && <Modal title={`Edit ${t.number}`} onClose={() => setEdit(false)}><TaskForm initial={t} submitLabel="Save changes" busy={patch.isPending} error={patch.isError ? (patch.error as Error).message : undefined} onSubmit={(v) => patch.mutate(taskPayload(v, false))} onCancel={() => setEdit(false)} /></Modal>}
    </div>
  );
}
