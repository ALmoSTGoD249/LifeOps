import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Wrench } from "lucide-react";
import { api } from "../lib/api";
import { FREQ_LABEL, MRecord, Schedule, ScheduleBadge, fmtDate } from "../lib/household";
import { fmt } from "../lib/incidents";
import { Avatar, Button, Card, EmptyState, ErrorNote, Modal, Spinner, cx } from "../components/ui";
import ScheduleForm from "../components/ScheduleForm";
import { TaskStateBadge } from "../lib/tasks";
import { PageHeader } from "./Placeholder";

const TABS: [string, string][] = [["active", "Active"], ["overdue", "Overdue"], ["upcoming", "Upcoming"], ["inactive", "Inactive"], ["history", "History"]];

export default function Maintenance() {
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const tab = sp.get("tab") ?? "active";
  const set = (patch: Record<string, string | null>) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); return n; }, { replace: true });
  const list = useQuery({ queryKey: ["maintenance", "schedules", tab], enabled: tab !== "history", queryFn: () => api<Schedule[]>(`/maintenance/schedules?status=${tab}`) });
  const overdue = useQuery({ queryKey: ["maintenance", "schedules", "overdue"], queryFn: () => api<Schedule[]>("/maintenance/schedules?status=overdue") });
  const hist = useQuery({ queryKey: ["maintenance", "records"], enabled: tab === "history", queryFn: () => api<MRecord[]>("/maintenance/records?days=365") });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["maintenance"] }); qc.invalidateQueries({ queryKey: ["tasks"] }); };
  const create = useMutation({ mutationFn: (b: object) => api<Schedule>("/maintenance/schedules", { method: "POST", body: b }), onSuccess: () => { refresh(); set({ new: null, asset: null }); } });
  const run = useMutation({ mutationFn: () => api<{ created: string[] }>("/maintenance/generate", { method: "POST" }), onSuccess: refresh });

  return (
    <div>
      <div className="flex items-start justify-between gap-3"><PageHeader title="Maintenance" subtitle="Recurring upkeep that turns itself into tasks, so nothing gets forgotten." />
        <div className="flex gap-2"><Button busy={run.isPending} onClick={() => run.mutate()} title="Create any tasks that are due"><RefreshCw className="size-4" />Check now</Button><Button variant="primary" onClick={() => set({ new: "1" })}><Plus className="size-4" />New schedule</Button></div></div>
      {run.isSuccess && <p role="status" className="mb-3 text-sm text-muted">{run.data.created.length ? `Created ${run.data.created.length} task(s): ${run.data.created.join(", ")}` : "Nothing new was due."}</p>}
      {(overdue.data?.length ?? 0) > 0 && tab !== "overdue" && <button onClick={() => set({ tab: "overdue" })} className="mb-4 flex w-full items-center justify-between rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-left text-sm text-danger"><span>{overdue.data!.length} maintenance item{overdue.data!.length === 1 ? " is" : "s are"} overdue</span><span className="underline">Review</span></button>}
      <div className="mb-4 flex gap-1 overflow-x-auto">{TABS.map(([k, l]) => <button key={k} onClick={() => set({ tab: k })} className={cx("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm", tab === k ? "bg-surface2 text-ink" : "text-muted hover:text-ink")}>{l}</button>)}</div>

      {tab !== "history" ? (
        <Card className="overflow-hidden [&>div]:p-0">{list.isLoading ? <div className="h-40"><Spinner /></div> : list.isError ? <div className="p-5"><ErrorNote message={(list.error as Error).message} /></div> : !list.data?.length ? (
          <EmptyState icon={Wrench} title={tab === "overdue" ? "Nothing is overdue" : "No schedules here"} text={tab === "overdue" ? "Everything is on track." : "Add recurring upkeep like servicing the AC, changing filters or cleaning schedules."}><Button variant="primary" onClick={() => set({ new: "1" })}><Plus className="size-4" />New schedule</Button></EmptyState>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-line text-xs text-muted"><tr><th className="px-4 py-2.5 text-left font-medium">Schedule</th><th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Repeats</th><th className="px-3 py-2.5 text-left font-medium">Next due</th><th className="px-3 py-2.5 text-left font-medium">Status</th><th className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">Assigned</th></tr></thead>
            <tbody className="divide-y divide-line">{list.data.map((s) => (
              <tr key={s.id} className="hover:bg-surface2/40"><td className="px-4 py-3"><Link to={`/maintenance/${s.number}`} className="hover:underline"><span className="mr-2 font-mono text-xs text-accent">{s.number}</span>{s.name}</Link>{s.asset && <span className="block text-xs text-muted">{s.asset.number} · {s.asset.name}</span>}</td>
                <td className="hidden px-3 py-3 text-muted md:table-cell">{FREQ_LABEL(s.frequency, s.interval)}</td>
                <td className="px-3 py-3"><span className={s.status === "overdue" ? "text-danger" : ""}>{fmtDate(s.next_due)}</span>{s.current_task && <Link to={`/tasks/${s.current_task.number}`} className="mt-0.5 flex items-center gap-2 text-xs text-muted hover:text-ink"><span className="font-mono">{s.current_task.number}</span><TaskStateBadge s={s.current_task.state} /></Link>}</td>
                <td className="px-3 py-3"><ScheduleBadge s={s.status} /></td>
                <td className="hidden px-3 py-3 lg:table-cell">{s.assigned_to ? <span className="flex items-center gap-2"><Avatar name={s.assigned_to.full_name} src={s.assigned_to.avatar_url} size={22} />{s.assigned_to.full_name}</span> : <span className="text-muted">Unassigned</span>}</td></tr>))}</tbody></table></div>)}</Card>
      ) : (
        <Card title="Completed in the last year" className="[&>div]:p-0">{hist.isLoading ? <div className="h-32"><Spinner /></div> : !hist.data?.length ? <p className="px-5 py-8 text-center text-sm text-muted">Nothing has been completed yet.</p> : (
          <ul className="divide-y divide-line">{hist.data.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"><span><Link to={`/maintenance/${r.schedule_number}`} className="hover:underline">{r.schedule_name}</Link>{r.asset && <span className="ml-2 text-xs text-muted">{r.asset.name}</span>}<span className="ml-2 text-xs text-muted">{r.outcome === "skipped" ? "skipped" : r.notes}</span></span><span className="text-xs text-muted">{r.completed_by?.full_name} · {fmt(r.completed_at)}</span></li>)}</ul>)}</Card>)}

      {sp.get("new") === "1" && <Modal wide title="New maintenance schedule" onClose={() => set({ new: null, asset: null })}><ScheduleForm presetAsset={sp.get("asset") ?? undefined} submitLabel="Create schedule" busy={create.isPending} error={create.isError ? (create.error as Error).message : undefined} onSubmit={(b) => create.mutate(b)} onCancel={() => set({ new: null, asset: null })} /></Modal>}
    </div>
  );
}
