import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Link2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmt, useMembers } from "../lib/incidents";
import { Req, ReqEvent, Ritm, RState, SCTask, showVal, stateLabel } from "../lib/requests";
import { Avatar, Button, Card, EmptyState, ErrorNote, Select, Spinner, TextArea } from "../components/ui";
import { ApprovalCard, SCTaskActions, useRefreshRequests } from "../components/RequestParts";

type Full = Omit<Req, "ritms"> & { ritms: Ritm[] };

function describe(e: ReqEvent): ReactNode {
  const d = e.details;
  switch (e.action) {
    case "created": return e.record_type === "request" ? "submitted this request" : e.record_type === "ritm" ? <>created <b className="font-medium">{d.item}</b></> : <>created task <b className="font-medium">{d.number}</b></>;
    case "state_changed": return <>changed state from {stateLabel(d.state.from)} to <b className="font-medium">{stateLabel(d.state.to)}</b></>;
    case "approval_requested": return <>asked <b className="font-medium">{d.approver}</b> for approval</>;
    case "approved": return "approved" + (d.comment ? `: ${d.comment}` : "");
    case "rejected": return "rejected" + (d.comment ? `: ${d.comment}` : "");
    case "fulfillment_started": return `started fulfillment (${d.tasks} task${d.tasks === 1 ? "" : "s"})`;
    case "completed": return "completed this task";
    case "cancelled": return "cancelled" + (d.reason ? ` (${d.reason})` : "");
    case "awaiting_confirmation": return "marked as fulfilled, waiting for confirmation";
    case "confirmed": return "confirmed completion";
    case "confirmation_declined": return `said it is not done yet: ${d.comment}`;
    case "assigned": return <>assigned to <b className="font-medium">{d.assigned_to?.to}</b></>;
    case "unassigned": return `unassigned (was ${d.assigned_to?.from})`;
    case "updated": return "updated due date";
    case "commented": return "commented";
    default: return e.action;
  }
}

function RitmCard({ r, req, canConfirm }: { r: Ritm; req: Full; canConfirm: boolean }) {
  const { user } = useAuth();
  const members = useMembers().data ?? [];
  const refresh = useRefreshRequests();
  const [err, setErr] = useState("");
  const done = ["completed", "cancelled", "rejected"].includes(r.state);
  const onErr = (e: unknown) => setErr((e as Error).message);
  const assign = useMutation({ mutationFn: (id: string) => api(`/ritms/${r.number}`, { method: "PATCH", body: { assigned_to_id: id || null } }), onSuccess: () => { setErr(""); refresh(); }, onError: onErr });
  const fulfill = useMutation({ mutationFn: () => api(`/ritms/${r.number}/fulfill`, { method: "POST" }), onSuccess: () => { setErr(""); refresh(); }, onError: onErr });
  const confirm = useMutation({ mutationFn: (v: { accepted: boolean; comment?: string }) => api(`/ritms/${r.number}/confirm`, { method: "POST", body: v }), onSuccess: () => { setErr(""); refresh(); }, onError: onErr });
  const assignTask = useMutation({ mutationFn: (v: { n: string; id: string }) => api(`/sctasks/${v.n}`, { method: "PATCH", body: { assigned_to_id: v.id || null } }), onSuccess: () => { setErr(""); refresh(); }, onError: onErr });
  const canFulfill = (r.state === "open" || r.state === "in_progress") && r.tasks.every((t) => t.state === "completed" || t.state === "cancelled");
  const pendingApproval = r.approvals.find((a) => a.state === "requested");
  const notDone = () => { const c = window.prompt("What still needs doing?"); if (c && c.trim()) confirm.mutate({ accepted: false, comment: c }); };

  return (
    <Card title={`${r.number} · ${r.item_name}`} action={<RState s={r.state} />}>
      {r.form.length > 0 && <dl className="mb-5 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">{r.form.map((f) => <div key={f.label} className="flex gap-2"><dt className="shrink-0 text-muted">{f.label}:</dt><dd className="min-w-0 break-words">{showVal(f.value)}</dd></div>)}</dl>}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2 text-muted">Owner<Select aria-label="Item owner" disabled={done} value={r.assigned_to?.id ?? ""} onChange={(e) => assign.mutate(e.target.value)}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select></label>
        {r.due_date && <span className="text-muted">Target: {fmt(r.due_date)}</span>}
      </div>
      {r.approvals.length > 0 && <div className="mb-4 space-y-2">{r.approvals.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface2/40 px-3 py-2 text-sm"><span className="text-muted">Approval</span><RState s={a.state} /><span>{a.approver?.full_name}</span>{a.comment && <span className="text-muted">“{a.comment}”</span>}</div>))}</div>}
      {pendingApproval && (user?.id === pendingApproval.approver?.id || user?.role === "admin") && <div className="mb-4"><ApprovalCard a={{ id: pendingApproval.id, state: pendingApproval.state, comment: pendingApproval.comment, created_at: req.created_at, decided_at: null, approver: pendingApproval.approver, ritm_number: r.number, item_name: r.item_name, request_number: req.number, requester: req.requester, justification: req.justification ?? "", form: [] }} /></div>}
      {r.tasks.length > 0 && <ol className="divide-y divide-line rounded-xl border border-line">{r.tasks.map((t: SCTask, n) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0"><p className="text-sm"><span className="mr-2 text-xs text-muted">{n + 1}.</span>{t.title} <span className="ml-1 font-mono text-xs text-muted">{t.number}</span></p>{t.due_date && <p className="ml-5 text-xs text-muted">Due {fmt(t.due_date)}</p>}</div>
          <div className="flex flex-wrap items-center gap-2"><RState s={t.state} />
            <Select aria-label={`Assignee for ${t.number}`} className="h-8 text-xs" disabled={t.state === "completed" || t.state === "cancelled"} value={t.assigned_to?.id ?? ""} onChange={(e) => assignTask.mutate({ n: t.number, id: e.target.value })}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select>
            <SCTaskActions t={t} /></div>
        </li>))}</ol>}
      {r.state === "awaiting_confirmation" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm"><span>All work is done. Is it complete?</span>
          {canConfirm ? <span className="flex gap-2"><Button variant="primary" busy={confirm.isPending} onClick={() => confirm.mutate({ accepted: true })}>Confirm completed</Button><Button busy={confirm.isPending} onClick={notDone}>Not done yet</Button></span> : <span className="text-muted">Waiting for {req.requester?.full_name ?? "the requester"} to confirm.</span>}</div>)}
      {canFulfill && <div className="mt-4"><Button busy={fulfill.isPending} onClick={() => fulfill.mutate()}>Mark fulfilled</Button></div>}
      {err && <div className="mt-3"><ErrorNote message={err} /></div>}
    </Card>
  );
}

export default function RequestDetail() {
  const { number = "" } = useParams();
  const { user } = useAuth();
  const refresh = useRefreshRequests();
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("");
  const req = useQuery({ queryKey: ["request", number], queryFn: () => api<Full>(`/requests/${number}`) });
  const tl = useQuery({ queryKey: ["request", number, "activity"], queryFn: () => api<ReqEvent[]>(`/requests/${number}/activity`) });
  const cancel = useMutation({ mutationFn: () => api(`/requests/${number}/cancel`, { method: "POST" }), onSuccess: refresh });
  const comment = useMutation({ mutationFn: () => { const [t, n] = (target || `request:${number}`).split(":"); return api(`/records/${t}/${n}/comments`, { method: "POST", body: { body } }); }, onSuccess: () => { setBody(""); refresh(); } });

  if (req.isLoading) return <div className="h-64"><Spinner /></div>;
  if (req.isError) {
    const nf = req.error instanceof ApiError && req.error.status === 404;
    return <div><Link to="/requests" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Requests</Link>{nf ? <EmptyState icon={Link2} title="Request not found" text={`There is no request ${number}.`} /> : <ErrorNote message={(req.error as Error).message} />}</div>;
  }
  const r = req.data!;
  const mine = r.requester?.id === user?.id || user?.role === "admin";
  const open = !["completed", "rejected", "cancelled"].includes(r.state);
  const targets = [[`request:${r.number}`, `${r.number} (whole request)`], ...r.ritms.flatMap((x) => [[`ritm:${x.number}`, `${x.number} ${x.item_name}`], ...x.tasks.map((t) => [`sctask:${t.number}`, `${t.number} ${t.title}`])])];

  return (
    <div>
      <Link to="/requests" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Requests</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><span className="font-mono text-sm text-muted">{r.number}</span><RState s={r.state} /></div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{r.short_description}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">{r.requester && <Avatar name={r.requester.full_name} src={r.requester.avatar_url} size={20} />}Requested by {r.requester?.full_name ?? "someone"} · {fmt(r.created_at)}{r.closed_at && <> · closed {fmt(r.closed_at)}</>}</p></div>
        {open && mine && <Button busy={cancel.isPending} onClick={() => window.confirm(`Cancel ${r.number}? Open tasks will be cancelled.`) && cancel.mutate()}>Cancel request</Button>}
      </div>
      {cancel.isError && <div className="mb-4"><ErrorNote message={(cancel.error as Error).message} /></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {r.justification && <Card title="Justification"><p className="whitespace-pre-wrap text-sm">{r.justification}</p></Card>}
          {r.ritms.map((x) => <RitmCard key={x.id} r={x} req={r} canConfirm={mine} />)}
        </div>
        <Card title="Activity" className="self-start">
          <TextArea label="Add a comment" value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} />
          <div className="mt-2 flex flex-wrap items-center gap-2"><Select aria-label="Comment on" value={target} onChange={(e) => setTarget(e.target.value)} className="max-w-48 text-xs">{targets.map(([v, l]) => <option key={v} value={v === `request:${r.number}` ? "" : v}>{l}</option>)}</Select><Button variant="primary" disabled={!body.trim()} busy={comment.isPending} onClick={() => comment.mutate()}>Post</Button></div>
          {comment.isError && <div className="mt-2"><ErrorNote message={(comment.error as Error).message} /></div>}
          <ol className="mt-6 space-y-[18px]">{[...(tl.data ?? [])].reverse().map((e) => (
            <li key={e.id} className="relative pl-6 before:absolute before:left-[5px] before:top-2 before:size-2 before:rounded-full before:bg-line after:absolute after:bottom-[-18px] after:left-[8.5px] after:top-5 after:w-px after:bg-line last:after:hidden">
              <p className="text-sm"><b className="font-medium">{e.user_name ?? "System"}</b> <span className="text-muted">{describe(e)}</span> <span className="font-mono text-[11px] text-muted/70">{e.record_number}</span></p><p className="text-xs text-muted/70">{fmt(e.created_at)}</p>
              {e.comment && <div className="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-surface2 px-3 py-2 text-sm">{e.comment.body}</div>}</li>))}</ol>
        </Card>
      </div>
    </div>
  );
}
