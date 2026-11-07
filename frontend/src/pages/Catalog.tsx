import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock, Search, ShieldCheck, ShoppingBag, SlidersHorizontal } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { CatCategory, CatItem, Req, eta, iconFor } from "../lib/requests";
import { Button, Card, EmptyState, ErrorNote, Modal, Spinner, TextArea, cx } from "../components/ui";
import DynamicForm, { formPayload, type FormValues } from "../components/DynamicForm";
import { PageHeader } from "./Placeholder";

function RequestModal({ id, onClose }: { id: string; onClose: () => void }) {
  const nav = useNavigate();
  const item = useQuery({ queryKey: ["catalog-item", id], queryFn: () => api<CatItem>(`/catalog/items/${id}`) });
  const [vals, setVals] = useState<FormValues>({});
  const [just, setJust] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const submit = useMutation({
    mutationFn: () => api<Req>("/requests", { method: "POST", body: { items: [{ item_id: id, form_data: formPayload(item.data!.fields ?? [], vals) }], justification: just } }),
    onSuccess: (r) => nav(`/requests/${r.number}`),
    onError: (e) => setErrs(e instanceof ApiError && e.fields ? e.fields : {}),
  });
  const i = item.data;
  const Icon = iconFor(i?.icon ?? "");
  return (
    <Modal title={i?.name ?? "Request a service"} onClose={onClose}>
      {!i ? (item.isError ? <ErrorNote message={(item.error as Error).message} /> : <div className="h-32"><Spinner /></div>) : (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); setErrs({}); submit.mutate(); }}>
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface2 text-accent"><Icon className="size-5" /></span>
            <div><p className="text-sm">{i.description}</p><p className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">{i.estimated_hours && <span>{eta(i.estimated_hours)}</span>}{i.approval_required && <span>Needs approval first</span>}</p></div></div>
          <DynamicForm fields={i.fields ?? []} values={vals} errors={errs} onChange={setVals} />
          {i.approval_required && <TextArea label="Why do you need this? (shown to the approver)" value={just} onChange={(e) => setJust(e.target.value)} />}
          {(i.tasks?.length ?? 0) > 0 && <div className="rounded-xl border border-line bg-surface2/40 p-4"><p className="mb-2 text-xs font-medium text-muted">What happens next</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">{i.approval_required && <li>Approval</li>}{i.tasks!.map((t, n) => <li key={n}>{t.title}</li>)}</ol></div>}
          {submit.isError && <ErrorNote message={(submit.error as Error).message} />}
          <div className="flex gap-2"><Button type="submit" variant="primary" busy={submit.isPending}>Submit request</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
        </form>)}
    </Modal>
  );
}

export default function Catalog() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState("");
  const cat = sp.get("category") ?? "";
  const open = sp.get("item");
  const cats = useQuery({ queryKey: ["catalog-categories"], queryFn: () => api<CatCategory[]>("/catalog/categories") });
  const items = useQuery({ queryKey: ["catalog-items", cat, q], queryFn: () => api<CatItem[]>(`/catalog/items?${new URLSearchParams({ ...(cat ? { category_id: cat } : {}), ...(q ? { q } : {}) })}`) });
  const setParam = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); return n; }, { replace: true });

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Service Catalog" subtitle="Ask for something and we will track it from request to done." />
        {user?.role === "admin" && <Button onClick={() => nav("/catalog/manage")}><SlidersHorizontal className="size-4" />Manage catalog</Button>}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services" className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm focus:border-accent focus:outline-none" /></div>
        <div className="flex gap-1 overflow-x-auto">{[{ id: "", name: "All" }, ...(cats.data ?? [])].map((c) => <button key={c.id} onClick={() => setParam("category", c.id || null)} className={cx("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm", cat === c.id ? "bg-surface2 text-ink" : "text-muted hover:text-ink")}>{c.name}</button>)}</div>
      </div>
      {items.isLoading ? <div className="h-48"><Spinner /></div> : items.isError ? <ErrorNote message={(items.error as Error).message} /> : !items.data?.length ? (
        <Card><EmptyState icon={ShoppingBag} title="No services found" text={q ? "Nothing matches your search." : "This category has no active services yet."} /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.data.map((i) => { const Icon = iconFor(i.icon); return (
            <button key={i.id} onClick={() => setParam("item", i.id)} className="group rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent/60">
              <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-surface2 text-accent"><Icon className="size-[18px]" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{i.name}</p><p className="text-xs text-muted">{i.category.name}</p></div></div>
              <p className="mt-3 line-clamp-2 text-sm text-muted">{i.description}</p>
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{i.estimated_hours && <span className="inline-flex items-center gap-1"><Clock className="size-3" />{eta(i.estimated_hours)}</span>}{i.approval_required && <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3" />Approval</span>}</p>
            </button>); })}
        </div>)}
      {open && <RequestModal id={open} onClose={() => setParam("item", null)} />}
    </div>
  );
}
