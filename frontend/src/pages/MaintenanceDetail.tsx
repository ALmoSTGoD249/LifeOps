import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Link2, Pencil } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { FREQ_LABEL, MRecord, Schedule, ScheduleBadge, fmtDate } from "../lib/household";
import { PriorityBadge, TimelineItem, fmt } from "../lib/incidents";
import { TaskStateBadge } from "../lib/tasks";
import { Avatar, Button, Card, EmptyState, ErrorNote, Modal, Spinner } from "../components/ui";
import ScheduleForm from "../components/ScheduleForm";

const Row = ({ label, children }: { label: string; children: ReactNode }) => <div className="flex items-start justify-between gap-4 py-2 text-sm"><dt className="text-muted">{label}</dt><dd className="text-right">{children}</dd></div>;

export default function MaintenanceDetail() {
  const { number = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const q = useQuery({ queryKey: ["maintenance", "schedule", number], queryFn: () => api<Schedule & { records: MRecord[] }>(`/maintenance/schedules/${number}`) });
  const tl = useQuery({ queryKey: ["maintenance", "schedule", number, "activity"], queryFn: () => api<TimelineItem[]>(`/maintenance/schedules/${number}/activity`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["maintenance"] }); qc.invalidateQueries({ queryKey: ["tasks"] }); };
  const patch = useMutation({ mutationFn: (b: object) => api(`/maintenance/schedules/${number}`, { method: "PATCH", body: b }), onSuccess: () => { setEdit(false); refresh(); } });
  const del = useMutation({ mutationFn: () => api(`/maintenance/schedules/${number}`, { method: "DELETE" }), onSuccess: () => { refresh(); nav("/maintenance"); } });

  if (q.isLoading) return <div className="h-64"><Spinner /></div>;
  if (q.isError) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return <div><Link to="/maintenance" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Maintenance</Link>{nf ? <EmptyState icon={Link2} title="Schedule not found" text={`There is no schedule ${number}.`} /> : <ErrorNote message={(q.error as Error).message} />}</div>;
  }
  const s = q.data!;
  return (
    <div>
      <Link to="/maintenance" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Maintenance</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex flex-wrap items-center gap-3"><span className="font-mono text-sm text-muted">{s.number}</span><ScheduleBadge s={s.status} /><PriorityBadge p={s.priority} /></div><h1 className="mt-2 text-xl font-semibold tracking-tight">{s.name}</h1><p className="mt-1 text-sm text-muted">{FREQ_LABEL(s.frequency, s.interval)}{s.asset && <> · <Link className="text-accent hover:underline" to={`/assets/${s.asset.number}`}>{s.asset.name}</Link></>}</p></div>
        <div className="flex gap-2"><Button onClick={() => setEdit(true)}><Pencil className="size-4" />Edit</Button><Button onClick={() => window.confirm(`Delete ${s.number}?`) && del.mutate()}>Delete</Button></div>
      </div>
      {del.isError && <div className="mb-4"><ErrorNote message={(del.error as Error).message} /></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {s.description && <Card title="Description"><p className="whitespace-pre-wrap text-sm">{s.description}</p></Card>}
          <Card title="Current task">{s.current_task ? <Link to={`/tasks/${s.current_task.number}`} className="flex items-center justify-between gap-3 text-sm hover:underline"><span><span className="mr-2 font-mono text-xs text-accent">{s.current_task.number}</span>Due {fmtDate(s.current_task.due_date)}</span><TaskStateBadge s={s.current_task.state} /></Link>
            : <p className="text-sm text-muted">{s.is_active ? `No task yet. One is created ${s.lead_days} day${s.lead_days === 1 ? "" : "s"} before ${fmtDate(s.next_due)}.` : "This schedule is inactive."}</p>}
            {s.checklist.length > 0 && <><p className="mb-2 mt-5 text-xs font-medium text-muted">Checklist on every task</p><ul className="list-disc space-y-1 pl-5 text-sm">{s.checklist.map((c, i) => <li key={i}>{c}</li>)}</ul></>}</Card>
          <Card title="Completion history" className="[&>div]:p-0">{s.records.length ? <ul className="divide-y divide-line">{s.records.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"><span>{r.outcome === "skipped" ? "Skipped" : "Completed"}{r.notes && <span className="ml-2 text-xs text-muted">{r.notes}</span>}</span><span className="text-xs text-muted">{r.completed_by?.full_name} · {fmt(r.completed_at)}</span></li>)}</ul> : <p className="px-5 py-6 text-sm text-muted">Not completed yet.</p>}</Card>
          <Card title="Activity"><ol className="space-y-3 text-sm">{[...(tl.data ?? [])].reverse().map((t) => <li key={t.id}><b className="font-medium">{t.user_name ?? "System"}</b> <span className="text-muted">{t.action.replace(/_/g, " ")}{t.details.task ? ` ${t.details.task}` : ""}{t.details.next_due ? ` · next due ${fmtDate(t.details.next_due.to)}` : ""}</span><span className="block text-xs text-muted/70">{fmt(t.created_at)}</span></li>)}</ol></Card>
        </div>
        <Card title="Details" className="self-start"><dl className="-my-2 divide-y divide-line">
          <Row label="Next due"><span className={s.status === "overdue" ? "text-danger" : ""}>{fmtDate(s.next_due)}</span></Row><Row label="Last completed">{fmtDate(s.last_completed_at)}</Row>
          <Row label="Assigned to">{s.assigned_to ? <span className="inline-flex items-center gap-2"><Avatar name={s.assigned_to.full_name} src={s.assigned_to.avatar_url} size={20} />{s.assigned_to.full_name}</span> : "Unassigned"}</Row>
          <Row label="Task created">{s.lead_days} day{s.lead_days === 1 ? "" : "s"} before</Row><Row label="Next date counted from">{s.from_completion ? "Completion" : "Old due date"}</Row></dl></Card>
      </div>
      {edit && <Modal wide title={`Edit ${s.number}`} onClose={() => setEdit(false)}><ScheduleForm initial={s} submitLabel="Save changes" busy={patch.isPending} error={patch.isError ? (patch.error as Error).message : undefined} onSubmit={(b) => patch.mutate(b)} onCancel={() => setEdit(false)} /></Modal>}
    </div>
  );
}
