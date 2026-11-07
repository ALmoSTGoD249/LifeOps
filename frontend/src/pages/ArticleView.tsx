import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Download, Eye, EyeOff, KeyRound, Link2, Lock, Paperclip, Pencil, Trash2 } from "lucide-react";
import { api, apiUpload, ApiError } from "../lib/api";
import { Article } from "../lib/household";
import { Attach, fmt } from "../lib/incidents";
import { Button, Card, EmptyState, ErrorNote, Spinner } from "../components/ui";
import Markdown from "../components/Markdown";

function SecretRow({ number, s, onChange }: { number: string; s: { id: string; label: string }; onChange: () => void }) {
  const [value, setValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const hide = () => { setValue(null); window.clearTimeout(timer.current); };
  const reveal = useMutation({
    mutationFn: () => api<{ value: string }>(`/kb/articles/${number}/secrets/${s.id}/reveal`, { method: "POST" }),
    onSuccess: (r) => { setValue(r.value); timer.current = window.setTimeout(hide, 30_000); },   // auto-hide after 30 seconds
  });
  const del = useMutation({ mutationFn: () => api(`/kb/articles/${number}/secrets/${s.id}`, { method: "DELETE" }), onSuccess: onChange });
  const change = useMutation({ mutationFn: (v: string) => api(`/kb/articles/${number}/secrets/${s.id}`, { method: "PATCH", body: { value: v } }), onSuccess: () => { hide(); onChange(); } });
  const copy = async () => { if (value) { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } } };
  return (
    <li className="rounded-lg border border-line px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm"><KeyRound className="size-3.5 text-muted" />{s.label}</span>
        <span className="flex items-center gap-1">
          <Button variant="ghost" busy={reveal.isPending} onClick={() => (value === null ? reveal.mutate() : hide())}>{value === null ? <><Eye className="size-4" />Reveal</> : <><EyeOff className="size-4" />Hide</>}</Button>
          <Button variant="ghost" onClick={() => { const v = window.prompt(`New value for “${s.label}”`); if (v) change.mutate(v); }}>Change</Button>
          <button aria-label={`Remove ${s.label}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-danger" onClick={() => window.confirm(`Remove “${s.label}”?`) && del.mutate()}><Trash2 className="size-4" /></button></span></div>
      {value !== null && <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-surface2 px-3 py-2"><code className="break-all font-mono text-sm">{value}</code><Button variant="ghost" onClick={copy}><Copy className="size-4" />{copied ? "Copied" : "Copy"}</Button></div>}
      {(reveal.isError || del.isError || change.isError) && <p className="mt-2 text-xs text-danger">{((reveal.error ?? del.error ?? change.error) as Error).message}</p>}
    </li>
  );
}

export default function ArticleView() {
  const { number = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [uploadErr, setUploadErr] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ["article", number], queryFn: () => api<Article>(`/kb/articles/${number}`) });
  const att = useQuery({ queryKey: ["article", number, "attachments"], queryFn: () => api<Attach[]>(`/kb/articles/${number}/attachments`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["article", number] }); qc.invalidateQueries({ queryKey: ["kb"] }); };
  const addSecret = useMutation({ mutationFn: () => api(`/kb/articles/${number}/secrets`, { method: "POST", body: { label, value: secret } }), onSuccess: () => { setLabel(""); setSecret(""); refresh(); } });
  const del = useMutation({ mutationFn: () => api(`/kb/articles/${number}`, { method: "DELETE" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb"] }); nav("/knowledge"); } });
  const publish = useMutation({ mutationFn: () => api(`/kb/articles/${number}`, { method: "PATCH", body: { status: "published" } }), onSuccess: refresh });
  const upload = useMutation({ mutationFn: (f: File) => apiUpload(`/kb/articles/${number}/attachments`, f), onSuccess: () => { setUploadErr(""); refresh(); }, onError: (e) => setUploadErr((e as Error).message) });

  if (q.isLoading) return <div className="h-64"><Spinner /></div>;
  if (q.isError) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return <div><Link to="/knowledge" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Knowledge Base</Link>{nf ? <EmptyState icon={Link2} title="Article not found" text="It may not exist, or you may not have access to it." /> : <ErrorNote message={(q.error as Error).message} />}</div>;
  }
  const a = q.data!;
  return (
    <div>
      <Link to="/knowledge" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Knowledge Base</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><span className="font-mono text-sm text-muted">{a.number}</span>{a.status === "draft" ? <span className="rounded-full border border-line px-2 py-0.5 text-xs">Draft</span> : <span className="rounded-full border border-line px-2 py-0.5 text-xs">Published</span>}{a.admins_only && <span className="inline-flex items-center gap-1 text-xs text-muted"><Lock className="size-3" />Administrators only</span>}</div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{a.title}</h1>
          <p className="mt-1 text-sm text-muted">{[a.category?.name, `Updated ${fmt(a.updated_at)}`, a.updated_by && `by ${a.updated_by.full_name}`].filter(Boolean).join(" · ")}</p>
          {a.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{a.tags.map((t) => <Link key={t} to={`/knowledge?tag=${t}`} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:text-ink">#{t}</Link>)}</div>}</div>
        <div className="flex flex-wrap gap-2">{a.status === "draft" && <Button variant="primary" busy={publish.isPending} onClick={() => publish.mutate()}>Publish</Button>}<Button onClick={() => nav(`/knowledge/${a.number}/edit`)}><Pencil className="size-4" />Edit</Button><Button onClick={() => window.confirm(`Delete ${a.number}?`) && del.mutate()}>Delete</Button></div>
      </div>
      {(del.isError || publish.isError) && <div className="mb-4"><ErrorNote message={((del.error ?? publish.error) as Error).message} /></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">{a.body?.trim() ? <Markdown>{a.body}</Markdown> : <p className="text-sm text-muted">This article has no content yet.</p>}</Card>
        <div className="space-y-6">
          <Card title="Protected details">
            <p className="mb-3 text-xs text-muted">Stored encrypted. Hidden until you reveal them, and every reveal is logged.</p>
            {a.secrets?.length ? <ul className="space-y-2">{a.secrets.map((s) => <SecretRow key={s.id} number={a.number} s={s} onChange={refresh} />)}</ul> : <p className="text-sm text-muted">Nothing protected on this article.</p>}
            <form className="mt-4 space-y-2 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); if (label.trim() && secret) addSecret.mutate(); }} autoComplete="off">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Wi-Fi password" aria-label="Secret label" maxLength={80} className="h-9 w-full rounded-lg border border-line bg-surface2 px-3 text-sm focus:border-accent focus:outline-none" />
              <input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" placeholder="Value" aria-label="Secret value" maxLength={2000} autoComplete="new-password" className="h-9 w-full rounded-lg border border-line bg-surface2 px-3 text-sm focus:border-accent focus:outline-none" />
              {addSecret.isError && <ErrorNote message={(addSecret.error as Error).message} />}
              <Button type="submit" disabled={!label.trim() || !secret} busy={addSecret.isPending}>Add protected detail</Button></form>
          </Card>
          <Card title="Attachments" action={<><input ref={file} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} /><Button variant="ghost" busy={upload.isPending} onClick={() => file.current?.click()}><Paperclip className="size-4" />Add</Button></>}>
            {uploadErr && <div className="mb-3"><ErrorNote message={uploadErr} /></div>}
            {att.data?.length ? <ul className="space-y-2">{att.data.map((f) => <li key={f.id}><a href={`/api/attachments/${f.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:border-muted/60"><span className="truncate">{f.name}</span><Download className="size-3.5 shrink-0 text-muted" /></a></li>)}</ul> : <p className="text-sm text-muted">No attachments.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
