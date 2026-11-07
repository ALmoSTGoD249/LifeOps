import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Article } from "../lib/household";
import { Button, ErrorNote, Field, SelectField, Spinner } from "../components/ui";
import MarkdownEditor from "../components/MarkdownEditor";
import { PageHeader } from "./Placeholder";

export default function ArticleEditor() {
  const { number } = useParams();
  const editing = !!number;
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["kb-categories"], queryFn: () => api<{ id: string; name: string }[]>("/kb/categories") });
  const existing = useQuery({ queryKey: ["article", number], enabled: editing, queryFn: () => api<Article>(`/kb/articles/${number}`) });
  const [v, setV] = useState({ title: "", body: "", category_id: "", tags: "", status: "draft", admins_only: false });
  const [secrets, setSecrets] = useState<{ label: string; value: string }[]>([]);
  const [touched, setTouched] = useState(false);
  useEffect(() => { const a = existing.data; if (a) setV({ title: a.title, body: a.body ?? "", category_id: a.category?.id ?? "", tags: a.tags.join(", "), status: a.status, admins_only: a.admins_only }); }, [existing.data]);

  const save = useMutation({
    mutationFn: () => {
      const body = { title: v.title.trim(), body: v.body, category_id: v.category_id || null, status: v.status, tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean), ...(user?.role === "admin" ? { admins_only: v.admins_only } : {}) };
      return editing ? api<Article>(`/kb/articles/${number}`, { method: "PATCH", body }) : api<Article>("/kb/articles", { method: "POST", body: { ...body, secrets: secrets.filter((s) => s.label.trim() && s.value).map((s) => ({ label: s.label.trim(), value: s.value })) } });
    },
    onSuccess: (a) => { qc.invalidateQueries({ queryKey: ["kb"] }); qc.invalidateQueries({ queryKey: ["article"] }); nav(`/knowledge/${a.number}`); },
  });
  const titleErr = touched && v.title.trim().length < 3 ? "Enter at least 3 characters" : undefined;
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (v.title.trim().length >= 3) save.mutate(); };
  if (editing && existing.isLoading) return <div className="h-64"><Spinner /></div>;
  if (editing && existing.isError) return <ErrorNote message={(existing.error as Error).message} />;

  return (
    <div className="max-w-3xl">
      <Link to={editing ? `/knowledge/${number}` : "/knowledge"} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Back</Link>
      <PageHeader title={editing ? `Edit ${number}` : "New article"} />
      <form onSubmit={submit} className="space-y-5">
        <Field label="Title" required maxLength={200} autoFocus value={v.title} error={titleErr} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Category" value={v.category_id} onChange={(e) => setV({ ...v, category_id: e.target.value })}><option value="">None</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
          <Field label="Tags (comma separated)" value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} placeholder="router, wifi" />
        </div>
        <div><span className="mb-1.5 block text-xs font-medium text-muted">Content</span><MarkdownEditor value={v.body} onChange={(b) => setV({ ...v, body: b })} /></div>
        {!editing && (
          <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-muted">Protected details (encrypted, never shown in lists)</span><Button type="button" variant="ghost" onClick={() => setSecrets([...secrets, { label: "", value: "" }])}><Plus className="size-4" />Add</Button></div>
            <ul className="space-y-2">{secrets.map((s, i) => (
              <li key={i} className="flex gap-2"><input value={s.label} onChange={(e) => setSecrets(secrets.map((x, n) => n === i ? { ...x, label: e.target.value } : x))} placeholder="Label" aria-label="Secret label" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface2 px-3 text-sm focus:border-accent focus:outline-none" />
                <input value={s.value} type="password" autoComplete="new-password" onChange={(e) => setSecrets(secrets.map((x, n) => n === i ? { ...x, value: e.target.value } : x))} placeholder="Value" aria-label="Secret value" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface2 px-3 text-sm focus:border-accent focus:outline-none" />
                <button type="button" aria-label="Remove" onClick={() => setSecrets(secrets.filter((_, n) => n !== i))} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-danger"><Trash2 className="size-4" /></button></li>))}</ul></div>)}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><span className="text-muted">Status</span><select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })} className="h-9 rounded-lg border border-line bg-surface2 px-2"><option value="draft">Draft (only you and admins)</option><option value="published">Published</option></select></label>
          {user?.role === "admin" && <label className="flex items-center gap-2"><input type="checkbox" checked={v.admins_only} onChange={(e) => setV({ ...v, admins_only: e.target.checked })} />Administrators only</label>}
        </div>
        {save.isError && <ErrorNote message={(save.error as Error).message} />}
        <div className="flex gap-2"><Button type="submit" variant="primary" busy={save.isPending}>{editing ? "Save changes" : "Create article"}</Button><Button type="button" variant="ghost" onClick={() => nav(-1)}>Cancel</Button></div>
      </form>
    </div>
  );
}
