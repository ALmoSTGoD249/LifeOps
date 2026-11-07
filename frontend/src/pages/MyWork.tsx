import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { api } from "../lib/api";
import { Incident, PriorityBadge, StateBadge, fmt } from "../lib/incidents";
import { ApprovalRow, Req, RState, SCTask } from "../lib/requests";
import { Task, TaskStateBadge } from "../lib/tasks";
import { Card, EmptyState, ErrorNote, Spinner } from "../components/ui";
import { ApprovalCard, SCTaskTable } from "../components/RequestParts";
import { PageHeader } from "./Placeholder";

type Work = { incidents: Incident[]; tasks: Task[]; sctasks: SCTask[]; approvals: ApprovalRow[]; confirmations: { ritm_number: string; item_name: string; request_number: string }[]; requests: Req[] };

export default function MyWork() {
  const q = useQuery({ queryKey: ["my-work"], queryFn: () => api<Work>("/my-work"), refetchOnWindowFocus: true });
  if (q.isLoading) return <div className="h-64"><Spinner /></div>;
  if (q.isError) return <ErrorNote message={(q.error as Error).message} />;
  const w = q.data!;
  const empty = !w.incidents.length && !w.tasks.length && !w.sctasks.length && !w.approvals.length && !w.confirmations.length && !w.requests.length;
  const row = "flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface2/40";

  return (
    <div className="space-y-6">
      <PageHeader title="My Work" subtitle="Everything waiting on you, in one place." />
      {empty && <Card><EmptyState icon={CheckCheck} title="You are all caught up" text="Nothing is assigned to you and nothing needs your approval." /></Card>}
      {w.approvals.length > 0 && <section><h2 className="mb-3 text-sm font-medium">Waiting for your approval <span className="text-muted">({w.approvals.length})</span></h2><div className="space-y-3">{w.approvals.map((a) => <ApprovalCard key={a.id} a={a} />)}</div></section>}
      {w.confirmations.length > 0 && <Card title="Please confirm completion" className="[&>div]:p-0"><ul className="divide-y divide-line">{w.confirmations.map((c) => <li key={c.ritm_number}><Link to={`/requests/${c.request_number}`} className={row}><span>{c.item_name} <span className="font-mono text-xs text-muted">{c.ritm_number}</span></span><span className="text-accent">Review</span></Link></li>)}</ul></Card>}
      {w.incidents.length > 0 && <Card title={`Incidents (${w.incidents.length})`} className="[&>div]:p-0"><ul className="divide-y divide-line">{w.incidents.map((i) => <li key={i.id}><Link to={`/incidents/${i.number}`} className={row}><span className="min-w-0 truncate"><span className="mr-2 font-mono text-xs text-accent">{i.number}</span>{i.short_description}</span><span className="flex shrink-0 items-center gap-3"><PriorityBadge p={i.priority} /><StateBadge s={i.state} /></span></Link></li>)}</ul></Card>}
      {w.tasks.length > 0 && <Card title={`Tasks (${w.tasks.length})`} className="[&>div]:p-0"><ul className="divide-y divide-line">{w.tasks.map((t) => <li key={t.id}><Link to={`/tasks/${t.number}`} className={row}><span className="min-w-0 truncate"><span className="mr-2 font-mono text-xs text-accent">{t.number}</span>{t.title}</span><span className="flex shrink-0 items-center gap-3 text-xs text-muted">{t.due_date && fmt(t.due_date)}<TaskStateBadge s={t.state} /></span></Link></li>)}</ul></Card>}
      {w.sctasks.length > 0 && <Card title={`Fulfillment tasks (${w.sctasks.length})`} className="[&>div]:p-0"><SCTaskTable items={w.sctasks} empty="" /></Card>}
      {w.requests.length > 0 && <Card title="My requests in progress" className="[&>div]:p-0"><ul className="divide-y divide-line">{w.requests.map((r) => <li key={r.id}><Link to={`/requests/${r.number}`} className={row}><span className="min-w-0 truncate"><span className="mr-2 font-mono text-xs text-accent">{r.number}</span>{r.short_description}</span><RState s={r.state} /></Link></li>)}</ul></Card>}
    </div>
  );
}
