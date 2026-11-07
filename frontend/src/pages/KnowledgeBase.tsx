import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, KeyRound, Lock, Plus, Search } from "lucide-react";
import { api } from "../lib/api";
import { Article } from "../lib/household";
import { fmt } from "../lib/incidents";
import { Button, Card, EmptyState, ErrorNote, Select, Spinner, cx } from "../components/ui";
import { PageHeader } from "./Placeholder";

const SIZE = 25;

export default function KnowledgeBase() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const get = (k: string) => sp.get(k) ?? "";
  const page = Number(get("page") || "1") || 1;
  const [search, setSearch] = useState(get("q"));
  const set = (patch: Record<string, string | null>) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); if (!("page" in patch)) n.delete("page"); return n; }, { replace: true });
  useEffect(() => { const t = setTimeout(() => { if (search !== get("q")) set({ q: search || null }); }, 300); return () => clearTimeout(t); }); // eslint-disable-line
  const cats = useQuery({ queryKey: ["kb-categories"], queryFn: () => api<{ id: string; name: string }[]>("/kb/categories") });
  const tags = useQuery({ queryKey: ["kb-tags"], queryFn: () => api<{ tag: string; count: number }[]>("/kb/tags") });
  const qs = new URLSearchParams({ page: String(page), page_size: String(SIZE) });
  for (const k of ["q", "category_id", "tag", "status"]) if (get(k)) qs.set(k, get(k));
  const list = useQuery({ queryKey: ["kb", qs.toString()], queryFn: () => api<{ items: Article[]; total: number }>(`/kb/articles?${qs}`), placeholderData: keepPreviousData });
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtered = ["q", "category_id", "tag", "status"].some(get);

  return (
    <div>
      <div className="flex items-start justify-between gap-3"><PageHeader title="Knowledge Base" subtitle="Procedures, contacts and the things only we know how to do." /><Button variant="primary" onClick={() => nav("/knowledge/new")}><Plus className="size-4" />New article</Button></div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search articles" className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm focus:border-accent focus:outline-none" /></div>
        <Select aria-label="Category" value={get("category_id")} onChange={(e) => set({ category_id: e.target.value || null })}><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select aria-label="Status" value={get("status")} onChange={(e) => set({ status: e.target.value || null })}><option value="">Published and drafts</option><option value="published">Published</option><option value="draft">Drafts</option></Select>
      </div>
      {(tags.data?.length ?? 0) > 0 && <div className="mb-4 flex flex-wrap gap-1.5">{tags.data!.map((t) => <button key={t.tag} onClick={() => set({ tag: get("tag") === t.tag ? null : t.tag })} className={cx("rounded-full border px-2.5 py-0.5 text-xs", get("tag") === t.tag ? "border-accent text-accent" : "border-line text-muted hover:text-ink")}>#{t.tag} <span className="opacity-60">{t.count}</span></button>)}</div>}
      {list.isLoading ? <div className="h-48"><Spinner /></div> : list.isError ? <ErrorNote message={(list.error as Error).message} /> : !items.length ? (
        <Card><EmptyState icon={BookOpen} title={filtered ? "No articles match" : "No articles yet"} text={filtered ? "Try a different search or clear a filter." : "Write down router fixes, appliance instructions, emergency contacts and how-tos."}><Button variant="primary" onClick={() => nav("/knowledge/new")}><Plus className="size-4" />Write the first article</Button></EmptyState></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">{items.map((a) => (
          <Link key={a.id} to={`/knowledge/${a.number}`} className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/60">
            <div className="flex items-start justify-between gap-3"><h2 className="text-sm font-medium">{a.title}</h2><span className="flex shrink-0 items-center gap-2 text-muted">{a.secret_count > 0 && <KeyRound className="size-3.5" aria-label="Contains secrets" />}{a.admins_only && <Lock className="size-3.5" aria-label="Administrators only" />}{a.status === "draft" && <span className="rounded border border-line px-1.5 text-[10px]">Draft</span>}</span></div>
            <p className="mt-1.5 line-clamp-2 text-sm text-muted">{a.excerpt || "No content yet."}</p>
            <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted/80"><span className="font-mono">{a.number}</span>{a.category && <span>{a.category.name}</span>}<span>Updated {fmt(a.updated_at)}</span>{a.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}</p>
          </Link>))}</div>)}
      {total > SIZE && <div className="mt-4 flex items-center justify-between text-sm text-muted"><span>{(page - 1) * SIZE + 1}–{Math.min(page * SIZE, total)} of {total}</span><div className="flex gap-2"><Button disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>Previous</Button><Button disabled={page * SIZE >= total} onClick={() => set({ page: String(page + 1) })}>Next</Button></div></div>}
    </div>
  );
}
