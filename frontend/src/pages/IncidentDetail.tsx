import { useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Link2, Paperclip, Pencil } from "lucide-react";
import { api, apiUpload, ApiError } from "../lib/api";
import { CODE_LABEL, LEVEL_LABEL, PriorityBadge, STATE_LABEL, StateBadge, fmt, isOverdue, useMembers, useMeta, type Attach, type Incident, type TimelineItem } from "../lib/incidents";
import { Avatar, Button, Card, EmptyState, ErrorNote, Modal, Spinner, SelectField, TextArea, Select } from "../components/ui";
import IncidentForm, { payload } from "../components/IncidentForm";
import { TaskStateBadge, type Task } from "../lib/tasks";

const FIELD: Record<string, string> = { short_description: "Short description", description: "Details", impact: "Impact", urgency: "Urgency", priority: "Priority", location: "Location", due_date: "Due date", category: "Category" };
function val(k: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "none";
  if (k === "impact" || k === "urgency") return LEVEL_LABEL[v as number] ?? String(v);
  if (k === "priority") return `P${v}`;
  if (k === "due_date") return fmt(String(v));
  if (k === "description") return "(edited)";
  return String(v);
}

function actionLabel(from: string, to: string) {
  if (from === "resolved" && to === "in_progress") return "Reopen";
  if (to === "in_progress") return from === "on_hold" ? "Resume" : "Start progress";
  return { on_hold: "Put on hold", resolved: "Resolve", closed: "Close", cancelled: "Cancel" }[to] ?? to;
}

function Entry({ t }: { t: TimelineItem }) {
  const d = t.details;
  let text: ReactNode = t.action;
  switch (t.action) {
    case "created": text = "created this incident"; break;
    case "updated": text = <>updated {Object.entries(d).map(([k, c]: [string, any]) => <span key={k} className="mr-2 inline-block"><b className="font-medium">{FIELD[k] ?? k}</b>: {val(k, c.from)} → {val(k, c.to)}</span>)}</>; break;
    case "assigned": text = <>assigned to <b className="font-medium">{d.assigned_to?.to}</b></>; break;
    case "unassigned": text = <>unassigned (was {d.assigned_to?.from})</>; break;
    case "state_changed": text = <>changed state from {STATE_LABEL[d.state.from]} to <b className="font-medium">{STATE_LABEL[d.state.to]}</b>{d.hold_reason && <> ({d.hold_reason})</>}</>; break;
    case "resolved": text = <>resolved this incident ({CODE_LABEL(d.resolution_code ?? "")})</>; break;
    case "reopened": text = "reopened this incident"; break;
    case "closed": text = "closed this incident"; break;
    case "cancelled": text = "cancelled this incident"; break;
    case "commented": text = "added a comment"; break;
    case "work_note": text = "added a work note"; break;
    case "attachment_added": text = <>attached <b className="font-medium">{d.file}</b></>; break;
  }
  return (
    <li className="relative pl-6 before:absolute before:left-[5px] before:top-2 before:size-2 before:rounded-full before:bg-line after:absolute after:left-[8.5px] after:top-5 after:bottom-[-18px] after:w-px after:bg-line last:after:hidden">
      <p className="text-sm"><b className="font-medium">{t.user_name ?? "System"}</b> <span className="text-muted">{text}</span></p>
      <p className="text-xs text-muted/70">{fmt(t.created_at)}</p>
      {t.comment && <div className={`mt-2 whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm ${t.comment.kind === "work_note" ? "border-dashed border-line bg-surface2/40" : "border-line bg-surface2"}`}>
        {t.comment.kind === "work_note" && <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Work note</span>}{t.comment.body}</div>}
    </li>
  );
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => <div className="flex items-start justify-between gap-4 py-2 text-sm"><dt className="text-muted">{label}</dt><dd className="text-right">{children}</dd></div>;

export default function IncidentDetail() {
  const { number = "" } = useParams();
  const qc = useQueryClient();
  const meta = useMeta().data;
  const members = useMembers().data ?? [];
  const [modal, setModal] = useState<null | "edit" | "resolve" | "hold">(null);
  const [kind, setKind] = useState<"comment" | "work_note">("comment");
  const [body, setBody] = useState("");
  const [rc, setRc] = useState({ code: "fixed", notes: "" });
  const [reason, setReason] = useState("");
  const [uploadErr, setUploadErr] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const inc = useQuery({ queryKey: ["incident", number], queryFn: () => api<Incident>(`/incidents/${number}`) });
  const tl = useQuery({ queryKey: ["incident", number, "activity"], queryFn: () => api<TimelineItem[]>(`/incidents/${number}/activity`) });
  const att = useQuery({ queryKey: ["incident", number, "attachments"], queryFn: () => api<Attach[]>(`/incidents/${number}/attachments`) });
  const related = useQuery({ queryKey: ["tasks", "incident", number], queryFn: () => api<{ items: Task[] }>(`/tasks?incident=${number}&page_size=50`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["incident", number] }); qc.invalidateQueries({ queryKey: ["incidents"] }); };

  const patch = useMutation({ mutationFn: (b: object) => api<Incident>(`/incidents/${number}`, { method: "PATCH", body: b }), onSuccess: () => { setModal(null); refresh(); } });
  const move = useMutation({
    mutationFn: (b: object) => api<Incident>(`/incidents/${number}/transition`, { method: "POST", body: b }),
    onSuccess: () => { setModal(null); setReason(""); setRc({ code: "fixed", notes: "" }); refresh(); },
  });
  const comment = useMutation({ mutationFn: () => api(`/incidents/${number}/comments`, { method: "POST", body: { kind, body } }), onSuccess: () => { setBody(""); refresh(); } });
  const upload = useMutation({
    mutationFn: (f: File) => apiUpload(`/incidents/${number}/attachments`, f),
    onSuccess: () => { setUploadErr(""); refresh(); }, onError: (e) => setUploadErr(e instanceof Error ? e.message : "Upload failed"),
  });

  if (inc.isLoading) return <div className="h-64"><Spinner /></div>;
  if (inc.isError) {
    const nf = inc.error instanceof ApiError && inc.error.status === 404;
    return <div><Link to="/incidents" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Incidents</Link>
      {nf ? <EmptyState icon={Link2} title="Incident not found" text={`There is no incident ${number}.`} /> : <ErrorNote message={(inc.error as Error).message} />}</div>;
  }
  const i = inc.data!;
  const done = i.state === "closed" || i.state === "cancelled";
  const next = meta?.transitions[i.state] ?? [];
  const act = (to: string) => {
    if (to === "resolved") return setModal("resolve");
    if (to === "on_hold") return setModal("hold");
    if (to === "cancelled" && !window.confirm(`Cancel ${i.number}? This cannot be undone.`)) return;
    move.mutate({ to });
  };

  return (
    <div>
      <Link to="/incidents" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Incidents</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-sm text-muted">{i.number}</span><StateBadge s={i.state} /><PriorityBadge p={i.priority} />{isOverdue(i) && <span className="text-xs text-danger">Overdue</span>}</div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{i.short_description}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {!done && <Button onClick={() => setModal("edit")}><Pencil className="size-4" />Edit</Button>}
          {next.map((to) => <Button key={to} variant={to === "resolved" || to === "closed" ? "primary" : "subtle"} busy={move.isPending} onClick={() => act(to)}>{actionLabel(i.state, to)}</Button>)}
        </div>
      </div>
      {move.isError && !modal && <div className="mb-4"><ErrorNote message={(move.error as Error).message} /></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Description"><p className="whitespace-pre-wrap text-sm">{i.description || <span className="text-muted">No details provided.</span>}</p>
            {i.hold_reason && <p className="mt-4 rounded-lg border border-line bg-surface2 px-3 py-2 text-sm"><span className="text-muted">On hold: </span>{i.hold_reason}</p>}</Card>
          {i.resolution_code && <Card title="Resolution"><dl className="divide-y divide-line"><Row label="Code">{CODE_LABEL(i.resolution_code)}</Row><Row label="Resolved">{fmt(i.resolved_at)}</Row></dl><p className="mt-3 whitespace-pre-wrap text-sm">{i.resolution_notes}</p></Card>}
          <Card title="Activity">
            {(
              <div className="mb-6">
                <div className="mb-2 flex gap-1">{(["comment", "work_note"] as const).map((k) => <button key={k} onClick={() => setKind(k)} className={`rounded-lg px-3 py-1 text-xs ${kind === k ? "bg-surface2 text-ink" : "text-muted hover:text-ink"}`}>{k === "comment" ? "Comment" : "Work note"}</button>)}</div>
                <TextArea label={kind === "comment" ? "Add a comment" : "Add a work note"} value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} />
                {comment.isError && <div className="mt-2"><ErrorNote message={(comment.error as Error).message} /></div>}
                <div className="mt-2"><Button variant="primary" disabled={!body.trim()} busy={comment.isPending} onClick={() => comment.mutate()}>Post</Button></div>
              </div>)}
            {tl.isLoading ? <div className="h-16"><Spinner /></div> : tl.isError ? <ErrorNote message="Could not load activity" /> : (
              <ol className="space-y-[18px]">{[...(tl.data ?? [])].reverse().map((t) => <Entry key={t.id} t={t} />)}</ol>)}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details"><dl className="-my-2 divide-y divide-line">
            <Row label="Assigned to">
              <Select aria-label="Assigned to" disabled={done || patch.isPending} value={i.assigned_to?.id ?? ""} onChange={(e) => patch.mutate({ assigned_to_id: e.target.value || null })}>
                <option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select></Row>
            <Row label="Reported by">{i.reported_by ? <span className="inline-flex items-center gap-2"><Avatar name={i.reported_by.full_name} src={i.reported_by.avatar_url} size={20} />{i.reported_by.full_name}</span> : "—"}</Row>
            <Row label="Category">{[i.category?.name, i.subcategory?.name].filter(Boolean).join(" / ") || "—"}</Row>
            <Row label="Impact">{LEVEL_LABEL[i.impact]}</Row><Row label="Urgency">{LEVEL_LABEL[i.urgency]}</Row>
            <Row label="Asset">{i.asset ? <Link className="text-accent hover:underline" to={`/assets/${i.asset.number}`}>{i.asset.name}</Link> : "—"}</Row><Row label="Location">{i.location || "—"}</Row><Row label="Due">{fmt(i.due_date)}</Row>
            <Row label="Created">{fmt(i.created_at)}</Row><Row label="Updated">{fmt(i.updated_at)}</Row>{i.closed_at && <Row label="Closed">{fmt(i.closed_at)}</Row>}
          </dl>{patch.isError && !modal && <div className="mt-3"><ErrorNote message={(patch.error as Error).message} /></div>}</Card>

          <Card title="Attachments" action={!done && <><input ref={file} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} /><Button variant="ghost" busy={upload.isPending} onClick={() => file.current?.click()}><Paperclip className="size-4" />Add</Button></>}>
            {uploadErr && <div className="mb-3"><ErrorNote message={uploadErr} /></div>}
            {att.data?.length ? <ul className="space-y-2">{att.data.map((a) => <li key={a.id}><a href={`/api/attachments/${a.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:border-muted/60"><span className="truncate">{a.name}</span><span className="flex shrink-0 items-center gap-2 text-xs text-muted">{(a.size / 1024).toFixed(a.size < 10240 ? 1 : 0)} KB<Download className="size-3.5" /></span></a></li>)}</ul>
              : <p className="text-sm text-muted">No files attached. Photos, PDFs and text files up to 10 MB.</p>}
          </Card>

          <Card title="Related records" action={!done && <Link to={`/tasks?new=1&incident=${i.number}`}><span className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-muted hover:bg-surface2 hover:text-ink">Add task</span></Link>}>
            {related.data?.items.length ? <ul className="space-y-2">{related.data.items.map((t) => <li key={t.id} className="flex items-center justify-between gap-2 text-sm"><Link to={`/tasks/${t.number}`} className="truncate hover:underline"><span className="font-mono text-xs text-accent">{t.number}</span> {t.title}</Link><TaskStateBadge s={t.state} /></li>)}</ul> : <p className="text-sm text-muted">No linked tasks.</p>}
          </Card>
        </div>
      </div>

      {modal === "edit" && <Modal title={`Edit ${i.number}`} onClose={() => setModal(null)}>
        <IncidentForm initial={i} submitLabel="Save changes" busy={patch.isPending} error={patch.isError ? (patch.error as Error).message : undefined} onSubmit={(v) => patch.mutate(payload(v))} onCancel={() => setModal(null)} /></Modal>}
      {modal === "hold" && <Modal title="Put on hold" onClose={() => setModal(null)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); move.mutate({ to: "on_hold", hold_reason: reason }); }}>
          <TextArea label="Reason" required maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Waiting for the technician on Friday" />
          {move.isError && <ErrorNote message={(move.error as Error).message} />}
          <div className="flex gap-2"><Button type="submit" variant="primary" busy={move.isPending} disabled={!reason.trim()}>Put on hold</Button><Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button></div></form></Modal>}
      {modal === "resolve" && <Modal title={`Resolve ${i.number}`} onClose={() => setModal(null)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); move.mutate({ to: "resolved", resolution_code: rc.code, resolution_notes: rc.notes }); }}>
          <SelectField label="Resolution code" value={rc.code} onChange={(e) => setRc({ ...rc, code: e.target.value })}>{(meta?.resolution_codes ?? []).map((c) => <option key={c} value={c}>{CODE_LABEL(c)}</option>)}</SelectField>
          <TextArea label="Resolution notes" required maxLength={10000} value={rc.notes} onChange={(e) => setRc({ ...rc, notes: e.target.value })} placeholder="What fixed it?" />
          {move.isError && <ErrorNote message={(move.error as Error).message} />}
          <div className="flex gap-2"><Button type="submit" variant="primary" busy={move.isPending} disabled={!rc.notes.trim()}>Resolve</Button><Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button></div></form></Modal>}
    </div>
  );
}
