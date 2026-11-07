import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Search } from "lucide-react";
import { api } from "../lib/api";
import { PRIORITY_LABEL, PriorityBadge, StateBadge, STATE_LABEL, fmt, isOverdue, useMembers, type Incident } from "../lib/incidents";
import { Avatar, Button, Card, EmptyState, ErrorNote, Modal, Select, Spinner } from "../components/ui";
import IncidentForm, { payload } from "../components/IncidentForm";
import { PageHeader } from "./Placeholder";

const SIZE = 25;
type Page = { items: Incident[]; total: number };

export default function IncidentList() {
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const members = useMembers().data ?? [];
  const get = (k: string, d = "") => sp.get(k) ?? d;
  const [state, priority, assigned, sort, order] = [get("state", "open"), get("priority"), get("assigned"), get("sort", "updated_at"), get("order", "desc")];
  const page = Number(get("page", "1")) || 1;
  const overdue = get("overdue") === "1";
  const [search, setSearch] = useState(get("q"));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  const setParam = (patch: Record<string, string | null>) => setSp((prev) => {
    const n = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
    if (!("page" in patch)) n.delete("page");
    return n;
  }, { replace: true });

  useEffect(() => { const t = setTimeout(() => { if (search !== get("q")) setParam({ q: search || null }); }, 300); return () => clearTimeout(t); }); // eslint-disable-line

  const qs = new URLSearchParams({ sort, order, page: String(page), page_size: String(SIZE) });
  if (state !== "all") qs.set("state", state);
  if (priority) qs.set("priority", priority);
  if (assigned) qs.set("assigned_to", assigned);
  if (get("q")) qs.set("q", get("q"));
  if (overdue) qs.set("overdue", "true");
  const list = useQuery({ queryKey: ["incidents", qs.toString()], queryFn: () => api<Page>(`/incidents?${qs}`), placeholderData: keepPreviousData });

  const create = useMutation({
    mutationFn: (b: ReturnType<typeof payload>) => api<Incident>("/incidents", { method: "POST", body: b }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["incidents"] }); setParam({ new: null }); },
  });
  const bulk = useMutation({
    mutationFn: (b: object) => api<{ updated: string[]; failed: { number: string; error: string }[] }>("/incidents/bulk", { method: "POST", body: { numbers: [...sel], ...b } }),
    onSuccess: (r) => {
      setNote(`${r.updated.length} updated` + (r.failed.length ? `, ${r.failed.length} skipped: ${r.failed.map((f) => `${f.number} (${f.error})`).join("; ")}` : ""));
      setSel(new Set()); qc.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const allOn = items.length > 0 && items.every((i) => sel.has(i.number));
  const toggle = (n: string) => setSel((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const sortBy = (k: string) => setParam({ sort: k, order: sort === k && order === "asc" ? "desc" : "asc" });
  const Th = ({ k, children, cls = "" }: { k: string; children: string; cls?: string }) => (
    <th className={`px-3 py-2.5 text-left font-medium ${cls}`}><button onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:text-ink">{children}{sort === k && (order === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}</button></th>
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Incidents" subtitle="Things that broke or went wrong, and how they were resolved." />
        <Button variant="primary" onClick={() => setParam({ new: "1" })}><Plus className="size-4" />New incident</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number or text" className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm focus:border-accent focus:outline-none" /></div>
        <Select aria-label="State" value={state} onChange={(e) => setParam({ state: e.target.value })}>
          <option value="open">Open</option><option value="all">All states</option>{Object.entries(STATE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Select aria-label="Priority" value={priority} onChange={(e) => setParam({ priority: e.target.value || null })}>
          <option value="">Any priority</option>{[1, 2, 3, 4].map((p) => <option key={p} value={p}>P{p} {PRIORITY_LABEL[p]}</option>)}</Select>
        <Select aria-label="Assignee" value={assigned} onChange={(e) => setParam({ assigned: e.target.value || null })}>
          <option value="">Anyone</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select>
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={overdue} onChange={(e) => setParam({ overdue: e.target.checked ? "1" : null })} />Overdue</label>
      </div>

      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm">
          <span className="font-medium">{sel.size} selected</span>
          <Select aria-label="Assign selected to" value="" onChange={(e) => e.target.value && bulk.mutate({ action: "assign", assigned_to_id: e.target.value === "none" ? null : e.target.value })}>
            <option value="">Assign to…</option><option value="none">Unassign</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select>
          <Button onClick={() => bulk.mutate({ action: "transition", to: "in_progress" })}>Start progress</Button>
          <Button onClick={() => bulk.mutate({ action: "transition", to: "closed" })}>Close</Button>
          <Button onClick={() => window.confirm(`Cancel ${sel.size} incident(s)?`) && bulk.mutate({ action: "transition", to: "cancelled" })}>Cancel</Button>
          <Button variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
        </div>
      )}
      {note && <p role="status" className="mb-3 text-sm text-muted">{note}</p>}
      {bulk.isError && <div className="mb-3"><ErrorNote message={(bulk.error as Error).message} /></div>}

      <Card className="overflow-hidden [&>div]:p-0">
        {list.isLoading ? <div className="h-48"><Spinner /></div> : list.isError ? <div className="p-5"><ErrorNote message={(list.error as Error).message} /></div> : items.length === 0 ? (
          <EmptyState icon={AlertTriangle} title={get("q") || priority || assigned || state !== "open" || overdue ? "No incidents match these filters" : "No open incidents"} text={get("q") || priority || assigned || state !== "open" || overdue ? "Try widening or clearing a filter." : "Nothing is broken right now. When something is, report it here."}>
            <Button variant="primary" onClick={() => setParam({ new: "1" })}><Plus className="size-4" />Report an incident</Button></EmptyState>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b border-line text-xs text-muted"><tr>
              <th className="w-10 px-3"><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(items.map((i) => i.number)))} /></th>
              <Th k="number">Number</Th><Th k="short_description">Description</Th><Th k="priority">Priority</Th><Th k="state">State</Th>
              <th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Assigned to</th><Th k="updated_at" cls="hidden lg:table-cell">Updated</Th></tr></thead>
            <tbody className="divide-y divide-line">
              {items.map((i) => (
                <tr key={i.id} className={`hover:bg-surface2/40 ${sel.has(i.number) ? "bg-accent/5" : ""}`}>
                  <td className="px-3"><input type="checkbox" aria-label={`Select ${i.number}`} checked={sel.has(i.number)} onChange={() => toggle(i.number)} /></td>
                  <td className="px-3 py-3 font-mono text-xs"><Link to={`/incidents/${i.number}`} className="text-accent hover:underline">{i.number}</Link></td>
                  <td className="max-w-xs px-3 py-3"><Link to={`/incidents/${i.number}`} className="block truncate hover:underline">{i.short_description}</Link>
                    <span className="text-xs text-muted">{[i.category?.name, i.location].filter(Boolean).join(" · ")}{isOverdue(i) && <span className="ml-2 text-danger">Overdue</span>}</span></td>
                  <td className="px-3 py-3"><PriorityBadge p={i.priority} /></td>
                  <td className="px-3 py-3"><StateBadge s={i.state} /></td>
                  <td className="hidden px-3 py-3 md:table-cell">{i.assigned_to ? <span className="flex items-center gap-2"><Avatar name={i.assigned_to.full_name} src={i.assigned_to.avatar_url} size={22} />{i.assigned_to.full_name}</span> : <span className="text-muted">Unassigned</span>}</td>
                  <td className="hidden px-3 py-3 text-xs text-muted lg:table-cell">{fmt(i.updated_at)}</td>
                </tr>))}
            </tbody></table></div>
        )}
      </Card>

      {total > SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>{(page - 1) * SIZE + 1}–{Math.min(page * SIZE, total)} of {total}</span>
          <div className="flex gap-2"><Button disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>Previous</Button><Button disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>Next</Button></div>
        </div>)}

      {get("new") === "1" && (
        <Modal title="New incident" onClose={() => setParam({ new: null })}>
          <IncidentForm submitLabel="Create incident" busy={create.isPending} error={create.isError ? (create.error as Error).message : undefined} onSubmit={(v) => create.mutate(payload(v))} onCancel={() => setParam({ new: null })} />
        </Modal>)}
    </div>
  );
}
