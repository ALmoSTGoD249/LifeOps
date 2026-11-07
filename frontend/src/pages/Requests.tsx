import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ClipboardList, ShoppingBag } from "lucide-react";
import { api } from "../lib/api";
import { fmt } from "../lib/incidents";
import { ApprovalRow, Req, RState, SCTask } from "../lib/requests";
import { Avatar, Button, Card, EmptyState, ErrorNote, Spinner, cx } from "../components/ui";
import { ApprovalCard, SCTaskTable } from "../components/RequestParts";
import { PageHeader } from "./Placeholder";

const SIZE = 25;

export default function Requests() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") ?? "mine";
  const page = Number(sp.get("page") ?? "1") || 1;
  const set = (patch: Record<string, string | null>) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); if (!("page" in patch)) n.delete("page"); return n; }, { replace: true });
  const isReq = tab === "mine" || tab === "all";
  const reqs = useQuery({ queryKey: ["requests", tab, page], enabled: isReq, placeholderData: keepPreviousData, queryFn: () => api<{ items: Req[]; total: number }>(`/requests?scope=${tab}&page=${page}&page_size=${SIZE}`) });
  const appr = useQuery({ queryKey: ["approvals", "mine"], queryFn: () => api<ApprovalRow[]>("/approvals?scope=mine&state=requested") });
  const done = useQuery({ queryKey: ["approvals", "decided"], enabled: tab === "approvals", queryFn: () => api<ApprovalRow[]>("/approvals?scope=mine&state=all") });
  const sct = useQuery({ queryKey: ["sctasks", "tab"], enabled: tab === "tasks", queryFn: () => api<{ items: SCTask[] }>("/sctasks?scope=open") });
  const total = reqs.data?.total ?? 0;
  const tabs: [string, string][] = [["mine", "My requests"], ["all", "All requests"], ["approvals", `Approvals${appr.data?.length ? ` (${appr.data.length})` : ""}`], ["tasks", "Fulfillment tasks"]];

  return (
    <div>
      <div className="flex items-start justify-between gap-3"><PageHeader title="Requests" subtitle="Track what has been asked for, who needs to approve it, and what is left to do." />
        <Link to="/catalog"><span className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-accentfg"><ShoppingBag className="size-4" />Browse catalog</span></Link></div>
      <div className="mb-4 flex gap-1 overflow-x-auto">{tabs.map(([k, l]) => <button key={k} onClick={() => set({ tab: k })} className={cx("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm", tab === k ? "bg-surface2 text-ink" : "text-muted hover:text-ink")}>{l}</button>)}</div>

      {isReq && (reqs.isError ? <ErrorNote message={(reqs.error as Error).message} /> : reqs.isLoading ? <div className="h-48"><Spinner /></div> : (
        <>
          <Card className="overflow-hidden [&>div]:p-0">{!reqs.data?.items.length ? (
            <EmptyState icon={ClipboardList} title="No requests yet" text={tab === "mine" ? "Things you request from the catalog show up here." : "Nobody has requested anything yet."}><Link to="/catalog"><span className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-accentfg">Browse the catalog</span></Link></EmptyState>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-line text-xs text-muted"><tr><th className="px-4 py-2.5 text-left font-medium">Request</th><th className="px-3 py-2.5 text-left font-medium">Items</th><th className="px-3 py-2.5 text-left font-medium">State</th><th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Requester</th><th className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">Created</th></tr></thead>
              <tbody className="divide-y divide-line">{reqs.data.items.map((r) => (
                <tr key={r.id} className="hover:bg-surface2/40"><td className="px-4 py-3 font-mono text-xs"><Link className="text-accent hover:underline" to={`/requests/${r.number}`}>{r.number}</Link></td>
                  <td className="max-w-sm px-3 py-3"><Link to={`/requests/${r.number}`} className="block truncate hover:underline">{r.short_description}</Link><span className="text-xs text-muted">{r.ritms.map((x) => x.number).join(", ")}</span></td>
                  <td className="px-3 py-3"><RState s={r.state} /></td>
                  <td className="hidden px-3 py-3 md:table-cell">{r.requester ? <span className="flex items-center gap-2"><Avatar name={r.requester.full_name} src={r.requester.avatar_url} size={22} />{r.requester.full_name}</span> : "—"}</td>
                  <td className="hidden px-3 py-3 text-xs text-muted lg:table-cell">{fmt(r.created_at)}</td></tr>))}</tbody></table></div>)}</Card>
          {total > SIZE && <div className="mt-4 flex items-center justify-between text-sm text-muted"><span>{(page - 1) * SIZE + 1}–{Math.min(page * SIZE, total)} of {total}</span><div className="flex gap-2"><Button disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>Previous</Button><Button disabled={page * SIZE >= total} onClick={() => set({ page: String(page + 1) })}>Next</Button></div></div>}
        </>))}

      {tab === "approvals" && (appr.isLoading ? <Spinner /> : (
        <div className="space-y-6">
          {appr.data?.length ? <div className="space-y-3">{appr.data.map((a) => <ApprovalCard key={a.id} a={a} />)}</div> : <Card><EmptyState icon={ClipboardList} title="Nothing waiting for your approval" text="When someone requests something that needs your sign-off, it appears here." /></Card>}
          {(done.data?.filter((a) => a.state !== "requested").length ?? 0) > 0 && <div><h2 className="mb-3 text-sm font-medium text-muted">Decided</h2><div className="space-y-3">{done.data!.filter((a) => a.state !== "requested").map((a) => <ApprovalCard key={a.id} a={a} />)}</div></div>}
        </div>))}

      {tab === "tasks" && <Card title="Open fulfillment tasks" className="[&>div]:p-0">{sct.isLoading ? <div className="h-32"><Spinner /></div> : sct.isError ? <div className="p-5"><ErrorNote message={(sct.error as Error).message} /></div> : <SCTaskTable items={sct.data?.items ?? []} empty="No open fulfillment tasks." />}</Card>}
    </div>
  );
}
