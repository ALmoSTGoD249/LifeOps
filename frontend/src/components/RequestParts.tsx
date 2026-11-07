import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmt } from "../lib/incidents";
import { ApprovalRow, RState, SCTask, showVal } from "../lib/requests";
import { Avatar, Button, ErrorNote } from "./ui";

const KEYS = ["requests", "request", "sctasks", "approvals", "my-work", "count"];
export function useRefreshRequests() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => KEYS.includes(q.queryKey[0] as string) });
}

export function SCTaskActions({ t }: { t: SCTask }) {
  const refresh = useRefreshRequests();
  const move = useMutation({ mutationFn: (to: string) => api(`/sctasks/${t.number}/transition`, { method: "POST", body: { to } }), onSuccess: refresh });
  if (t.state === "pending") return <span className="text-xs text-muted">Waiting for the previous step</span>;
  if (t.state === "completed" || t.state === "cancelled") return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {t.state === "open" && <Button busy={move.isPending} onClick={() => move.mutate("in_progress")}>Start</Button>}
      <Button variant="primary" busy={move.isPending} onClick={() => move.mutate("completed")}>Complete</Button>
      {move.isError && <span className="text-xs text-danger">{(move.error as Error).message}</span>}
    </span>
  );
}

export function ApprovalCard({ a }: { a: ApprovalRow }) {
  const refresh = useRefreshRequests();
  const decide = useMutation({ mutationFn: (v: { decision: string; comment?: string }) => api(`/approvals/${a.id}/decision`, { method: "POST", body: v }), onSuccess: refresh });
  const reject = () => { const c = window.prompt("Why are you rejecting this?"); if (c && c.trim()) decide.mutate({ decision: "reject", comment: c }); };
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-medium">{a.item_name}</p>
          <p className="mt-0.5 text-xs text-muted"><Link to={`/requests/${a.request_number}`} className="font-mono text-accent hover:underline">{a.request_number}</Link> · requested by {a.requester?.full_name ?? "someone"} · {fmt(a.created_at)}</p></div>
        <RState s={a.state} />
      </div>
      {a.justification && <p className="mt-3 text-sm"><span className="text-muted">Reason: </span>{a.justification}</p>}
      {a.form.length > 0 && <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{a.form.map((f) => <div key={f.label} className="flex gap-2"><dt className="text-muted">{f.label}:</dt><dd>{showVal(f.value)}</dd></div>)}</dl>}
      {a.state === "requested" && <div className="mt-4 flex gap-2"><Button variant="primary" busy={decide.isPending} onClick={() => decide.mutate({ decision: "approve" })}>Approve</Button><Button busy={decide.isPending} onClick={reject}>Reject</Button></div>}
      {a.comment && <p className="mt-3 text-xs text-muted">Comment: {a.comment}</p>}
      {decide.isError && <div className="mt-3"><ErrorNote message={(decide.error as Error).message} /></div>}
    </div>
  );
}

export function SCTaskTable({ items, empty }: { items: SCTask[]; empty: string }) {
  if (!items.length) return <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">{items.map((t) => (
      <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="min-w-0"><p className="text-sm"><span className="mr-2 font-mono text-xs text-muted">{t.number}</span>{t.title}</p>
          <p className="mt-0.5 text-xs text-muted">{t.item_name} · <Link to={`/requests/${t.request_number}`} className="font-mono text-accent hover:underline">{t.request_number}</Link>{t.due_date && <> · due {fmt(t.due_date)}</>}</p></div>
        <div className="flex items-center gap-3">{t.assigned_to && <Avatar name={t.assigned_to.full_name} src={t.assigned_to.avatar_url} size={22} />}<RState s={t.state} /><SCTaskActions t={t} /></div>
      </li>))}</ul>
  );
}
