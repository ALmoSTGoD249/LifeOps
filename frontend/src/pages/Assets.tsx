import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Plus, Search } from "lucide-react";
import { api } from "../lib/api";
import { ASSET_STATUS, Asset, WarrantyBadge, fmtDate, useAssetCategories } from "../lib/household";
import { useMembers } from "../lib/incidents";
import { Avatar, Button, Card, EmptyState, ErrorNote, Modal, Select, Spinner } from "../components/ui";
import AssetForm from "../components/AssetForm";
import { PageHeader } from "./Placeholder";

const SIZE = 25;

export default function Assets() {
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const cats = useAssetCategories().data ?? [];
  const members = useMembers().data ?? [];
  const get = (k: string) => sp.get(k) ?? "";
  const page = Number(get("page") || "1") || 1;
  const [search, setSearch] = useState(get("q"));
  const set = (patch: Record<string, string | null>) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); if (!("page" in patch)) n.delete("page"); return n; }, { replace: true });
  useEffect(() => { const t = setTimeout(() => { if (search !== get("q")) set({ q: search || null }); }, 300); return () => clearTimeout(t); }); // eslint-disable-line

  const qs = new URLSearchParams({ page: String(page), page_size: String(SIZE) });
  for (const k of ["q", "category_id", "status", "owner", "warranty", "sort", "order"]) if (get(k)) qs.set(k, get(k));
  const list = useQuery({ queryKey: ["assets", qs.toString()], queryFn: () => api<{ items: Asset[]; total: number }>(`/assets?${qs}`), placeholderData: keepPreviousData });
  const create = useMutation({ mutationFn: (b: object) => api<Asset>("/assets", { method: "POST", body: b }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); set({ new: null }); } });
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtered = ["q", "category_id", "status", "owner", "warranty"].some(get);

  return (
    <div>
      <div className="flex items-start justify-between gap-3"><PageHeader title="Assets" subtitle="Appliances, devices, vehicles and furniture, with warranty and full history." /><Button variant="primary" onClick={() => set({ new: "1" })}><Plus className="size-4" />Add asset</Button></div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, model, serial" className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm focus:border-accent focus:outline-none" /></div>
        <Select aria-label="Category" value={get("category_id")} onChange={(e) => set({ category_id: e.target.value || null })}><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select aria-label="Status" value={get("status")} onChange={(e) => set({ status: e.target.value || null })}><option value="">Any status</option>{Object.entries(ASSET_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Select aria-label="Owner" value={get("owner")} onChange={(e) => set({ owner: e.target.value || null })}><option value="">Any owner</option><option value="shared">Shared</option><option value="me">Mine</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select>
        <Select aria-label="Warranty" value={get("warranty")} onChange={(e) => set({ warranty: e.target.value || null })}><option value="">Any warranty</option><option value="active">In warranty</option><option value="expiring">Expiring in 60 days</option><option value="expired">Expired</option></Select>
      </div>
      <Card className="overflow-hidden [&>div]:p-0">
        {list.isLoading ? <div className="h-48"><Spinner /></div> : list.isError ? <div className="p-5"><ErrorNote message={(list.error as Error).message} /></div> : !items.length ? (
          <EmptyState icon={Boxes} title={filtered ? "No assets match these filters" : "No assets yet"} text={filtered ? "Try clearing a filter." : "Add the things you own so incidents and maintenance can be tied to them."}><Button variant="primary" onClick={() => set({ new: "1" })}><Plus className="size-4" />Add your first asset</Button></EmptyState>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-line text-xs text-muted"><tr>
            {[["number", "Asset"], ["name", "Name"]].map(([k, l]) => <th key={k} className="px-3 py-2.5 text-left font-medium"><button onClick={() => set({ sort: k, order: get("sort") === k && get("order") !== "desc" ? "desc" : "asc" })} className="hover:text-ink">{l}{get("sort") === k && (get("order") === "desc" ? " ↓" : " ↑")}</button></th>)}
            <th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Category</th><th className="px-3 py-2.5 text-left font-medium">Status</th><th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Owner</th>
            <th className="px-3 py-2.5 text-left font-medium"><button onClick={() => set({ sort: "warranty_expires", order: get("order") === "desc" ? "asc" : "desc" })} className="hover:text-ink">Warranty</button></th></tr></thead>
            <tbody className="divide-y divide-line">{items.map((a) => (
              <tr key={a.id} className="hover:bg-surface2/40"><td className="px-3 py-3 font-mono text-xs"><Link to={`/assets/${a.number}`} className="text-accent hover:underline">{a.number}</Link></td>
                <td className="max-w-xs px-3 py-3"><Link to={`/assets/${a.number}`} className="block truncate hover:underline">{a.name}</Link><span className="text-xs text-muted">{[a.manufacturer, a.model, a.location].filter(Boolean).join(" · ")}</span></td>
                <td className="hidden px-3 py-3 text-muted md:table-cell">{a.category?.name ?? "—"}</td><td className="px-3 py-3">{ASSET_STATUS[a.status]}</td>
                <td className="hidden px-3 py-3 md:table-cell">{a.owner ? <span className="flex items-center gap-2"><Avatar name={a.owner.full_name} src={a.owner.avatar_url} size={22} />{a.owner.full_name}</span> : <span className="text-muted">Shared</span>}</td>
                <td className="px-3 py-3"><WarrantyBadge a={a} />{a.warranty_expires && <span className="block text-xs text-muted">{fmtDate(a.warranty_expires)}</span>}</td></tr>))}</tbody></table></div>)}
      </Card>
      {total > SIZE && <div className="mt-4 flex items-center justify-between text-sm text-muted"><span>{(page - 1) * SIZE + 1}–{Math.min(page * SIZE, total)} of {total}</span><div className="flex gap-2"><Button disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>Previous</Button><Button disabled={page * SIZE >= total} onClick={() => set({ page: String(page + 1) })}>Next</Button></div></div>}
      {get("new") === "1" && <Modal wide title="Add asset" onClose={() => set({ new: null })}><AssetForm submitLabel="Add asset" busy={create.isPending} error={create.isError ? (create.error as Error).message : undefined} onSubmit={(b) => create.mutate(b)} onCancel={() => set({ new: null })} /></Modal>}
    </div>
  );
}
