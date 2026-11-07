import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useMembers } from "../lib/incidents";
import { CatCategory, CatItem, Field as FieldDef, ICONS, Tpl, iconFor } from "../lib/requests";
import { Button, Card, ErrorNote, Field, Modal, SelectField, Spinner, TextArea } from "../components/ui";
import { PageHeader } from "./Placeholder";

type FRow = { key: string; label: string; field_type: FieldDef["field_type"]; required: boolean; options: string; help_text: string; keyTouched: boolean };
type TRow = { title: string; description: string; assignee_mode: Tpl["assignee_mode"]; assignee_id: string; due_offset_days: string };
type Draft = { id?: string; category_id: string; name: string; description: string; icon: string; estimated_hours: string; is_active: boolean; approval_required: boolean;
  approver_id: string; default_assignee_id: string; sequential: boolean; fields: FRow[]; tasks: TRow[] };

const TYPES: [FieldDef["field_type"], string][] = [["text", "Short text"], ["textarea", "Long text"], ["number", "Number"], ["date", "Date"], ["select", "Dropdown"], ["checkbox", "Checkbox"]];
const MODES: [Tpl["assignee_mode"], string][] = [["requester", "The requester"], ["other_member", "The other person"], ["item_default", "Item default assignee"], ["user", "A specific person"]];
const slug = (s: string) => { const b = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40); return /^[a-z]/.test(b) ? b : b ? `f_${b}`.slice(0, 40) : ""; };

const blank = (category_id: string): Draft => ({ category_id, name: "", description: "", icon: "package", estimated_hours: "", is_active: true, approval_required: false, approver_id: "", default_assignee_id: "", sequential: true, fields: [], tasks: [] });
const fromItem = (i: CatItem): Draft => ({ id: i.id, category_id: i.category.id, name: i.name, description: i.description, icon: i.icon, estimated_hours: i.estimated_hours ? String(i.estimated_hours) : "", is_active: i.is_active,
  approval_required: i.approval_required, approver_id: i.approver_id ?? "", default_assignee_id: i.default_assignee_id ?? "", sequential: i.sequential,
  fields: (i.fields ?? []).map((f) => ({ ...f, options: f.options.join("\n"), keyTouched: true })),
  tasks: (i.tasks ?? []).map((t) => ({ title: t.title, description: t.description, assignee_mode: t.assignee_mode, assignee_id: t.assignee_id ?? "", due_offset_days: t.due_offset_days === null ? "" : String(t.due_offset_days) })) });
const toBody = (d: Draft) => ({
  category_id: d.category_id, name: d.name.trim(), description: d.description, icon: d.icon, estimated_hours: d.estimated_hours ? Number(d.estimated_hours) : null, is_active: d.is_active,
  approval_required: d.approval_required, approver_id: d.approval_required && d.approver_id ? d.approver_id : null, default_assignee_id: d.default_assignee_id || null, sequential: d.sequential,
  fields: d.fields.map((f) => ({ key: f.key, label: f.label.trim(), field_type: f.field_type, required: f.required, help_text: f.help_text, options: f.field_type === "select" ? f.options.split(/[\n,]/).map((o) => o.trim()).filter(Boolean) : [] })),
  tasks: d.tasks.map((t) => ({ title: t.title.trim(), description: t.description, assignee_mode: t.assignee_mode, assignee_id: t.assignee_mode === "user" ? t.assignee_id || null : null, due_offset_days: t.due_offset_days === "" ? null : Number(t.due_offset_days) })),
});
function move<T>(arr: T[], i: number, d: number): T[] { const j = i + d; if (j < 0 || j >= arr.length) return arr; const c = [...arr]; [c[i], c[j]] = [c[j], c[i]]; return c; }

function Editor({ initial, categories, onClose, onSaved }: { initial: Draft; categories: CatCategory[]; onClose: () => void; onSaved: () => void }) {
  const members = useMembers().data ?? [];
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const save = useMutation({ mutationFn: () => d.id ? api(`/catalog/items/${d.id}`, { method: "PUT", body: toBody(d) }) : api("/catalog/items", { method: "POST", body: toBody(d) }), onSuccess: onSaved });
  const setField = (i: number, patch: Partial<FRow>) => set("fields", d.fields.map((f, n) => n === i ? { ...f, ...patch } : f));
  const setTask = (i: number, patch: Partial<TRow>) => set("tasks", d.tasks.map((t, n) => n === i ? { ...t, ...patch } : t));
  const ic = "grid size-8 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-ink disabled:opacity-30";
  const addField = () => set("fields", [...d.fields, { key: "", label: "", field_type: "text", required: false, options: "", help_text: "", keyTouched: false }]);

  return (
    <Modal wide title={d.id ? `Edit service` : "New service"} onClose={onClose}>
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required minLength={2} maxLength={120} value={d.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          <SelectField label="Category" value={d.category_id} onChange={(e) => set("category_id", e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
          <div className="sm:col-span-2"><TextArea label="Description" value={d.description} onChange={(e) => set("description", e.target.value)} /></div>
          <SelectField label="Icon" value={d.icon} onChange={(e) => set("icon", e.target.value)}>{Object.keys(ICONS).map((k) => <option key={k} value={k}>{k}</option>)}</SelectField>
          <Field label="Estimated fulfillment (hours)" type="number" min={1} value={d.estimated_hours} onChange={(e) => set("estimated_hours", e.target.value)} />
          <SelectField label="Default assignee (for tasks set to item default)" value={d.default_assignee_id} onChange={(e) => set("default_assignee_id", e.target.value)}><option value="">None</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</SelectField>
          <div className="flex flex-col justify-end gap-2.5 pb-1 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.is_active} onChange={(e) => set("is_active", e.target.checked)} />Active (visible in the catalog)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.approval_required} onChange={(e) => set("approval_required", e.target.checked)} />Requires approval</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.sequential} onChange={(e) => set("sequential", e.target.checked)} />Fulfillment steps run one after another</label>
          </div>
          {d.approval_required && <SelectField label="Approver (blank = the other person)" value={d.approver_id} onChange={(e) => set("approver_id", e.target.value)}><option value="">The other person</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</SelectField>}
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-medium">Request form</h3><Button type="button" onClick={addField}><Plus className="size-4" />Add field</Button></div>
          {!d.fields.length && <p className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-sm text-muted">No fields. Requesters will only add a justification.</p>}
          <ul className="space-y-3">{d.fields.map((f, i) => (
            <li key={i} className="rounded-xl border border-line p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem_auto]">
                <Field label="Label" value={f.label} onChange={(e) => setField(i, { label: e.target.value, ...(f.keyTouched ? {} : { key: slug(e.target.value) }) })} />
                <SelectField label="Type" value={f.field_type} onChange={(e) => setField(i, { field_type: e.target.value as FieldDef["field_type"] })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
                <div className="flex items-end gap-1 pb-0.5"><button type="button" aria-label="Move up" className={ic} disabled={i === 0} onClick={() => set("fields", move(d.fields, i, -1))}><ArrowUp className="size-4" /></button><button type="button" aria-label="Move down" className={ic} disabled={i === d.fields.length - 1} onClick={() => set("fields", move(d.fields, i, 1))}><ArrowDown className="size-4" /></button><button type="button" aria-label="Remove field" className={ic} onClick={() => set("fields", d.fields.filter((_, n) => n !== i))}><Trash2 className="size-4" /></button></div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Key (internal)" value={f.key} pattern="[a-z][a-z0-9_]{0,39}" title="Lowercase letters, digits and underscores, starting with a letter" onChange={(e) => setField(i, { key: e.target.value, keyTouched: true })} />
                <div className="sm:col-span-2"><Field label="Help text" value={f.help_text} onChange={(e) => setField(i, { help_text: e.target.value })} /></div>
              </div>
              {f.field_type === "select" && <div className="mt-3"><TextArea label="Options (one per line)" value={f.options} onChange={(e) => setField(i, { options: e.target.value })} /></div>}
              <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />Required</label>
            </li>))}</ul>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-medium">Fulfillment steps</h3><Button type="button" onClick={() => set("tasks", [...d.tasks, { title: "", description: "", assignee_mode: "requester", assignee_id: "", due_offset_days: "" }])}><Plus className="size-4" />Add step</Button></div>
          {!d.tasks.length && <p className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-sm text-muted">No steps. The request is fulfilled manually with "Mark fulfilled".</p>}
          <ol className="space-y-3">{d.tasks.map((t, i) => (
            <li key={i} className="rounded-xl border border-line p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><Field label={`Step ${i + 1}`} value={t.title} onChange={(e) => setTask(i, { title: e.target.value })} />
                <div className="flex items-end gap-1 pb-0.5"><button type="button" aria-label="Move up" className={ic} disabled={i === 0} onClick={() => set("tasks", move(d.tasks, i, -1))}><ArrowUp className="size-4" /></button><button type="button" aria-label="Move down" className={ic} disabled={i === d.tasks.length - 1} onClick={() => set("tasks", move(d.tasks, i, 1))}><ArrowDown className="size-4" /></button><button type="button" aria-label="Remove step" className={ic} onClick={() => set("tasks", d.tasks.filter((_, n) => n !== i))}><Trash2 className="size-4" /></button></div></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <SelectField label="Assign to" value={t.assignee_mode} onChange={(e) => setTask(i, { assignee_mode: e.target.value as Tpl["assignee_mode"] })}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
                {t.assignee_mode === "user" ? <SelectField label="Person" value={t.assignee_id} onChange={(e) => setTask(i, { assignee_id: e.target.value })}><option value="">Choose…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</SelectField> : <div />}
                <Field label="Due after (days)" type="number" min={0} max={365} value={t.due_offset_days} onChange={(e) => setTask(i, { due_offset_days: e.target.value })} />
              </div>
            </li>))}</ol>
        </section>
        {save.isError && <ErrorNote message={(save.error as Error).message} />}
        <div className="flex gap-2"><Button type="submit" variant="primary" busy={save.isPending}>{d.id ? "Save changes" : "Create service"}</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
      </form>
    </Modal>
  );
}

export default function CatalogManage() {
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["catalog-categories"], queryFn: () => api<CatCategory[]>("/catalog/categories") });
  const items = useQuery({ queryKey: ["catalog-items", "all"], queryFn: () => api<CatItem[]>("/catalog/items?include_inactive=true") });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newCat, setNewCat] = useState("");
  const [msg, setMsg] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["catalog-categories"] }); qc.invalidateQueries({ queryKey: ["catalog-items"] }); };
  const fail = (e: unknown) => setMsg((e as Error).message);
  const edit = useMutation({ mutationFn: async (id: string) => fromItem(await api<CatItem>(`/catalog/items/${id}`)), onSuccess: setDraft, onError: fail });
  const toggle = useMutation({ mutationFn: async (id: string) => { const d = fromItem(await api<CatItem>(`/catalog/items/${id}`)); return api(`/catalog/items/${id}`, { method: "PUT", body: toBody({ ...d, is_active: !d.is_active }) }); }, onSuccess: () => { setMsg(""); refresh(); }, onError: fail });
  const del = useMutation({ mutationFn: (id: string) => api(`/catalog/items/${id}`, { method: "DELETE" }), onSuccess: () => { setMsg(""); refresh(); }, onError: fail });
  const addCat = useMutation({ mutationFn: () => api("/catalog/categories", { method: "POST", body: { name: newCat.trim(), sort_order: (cats.data?.length ?? 0) } }), onSuccess: () => { setNewCat(""); setMsg(""); refresh(); }, onError: fail });
  const delCat = useMutation({ mutationFn: (id: string) => api(`/catalog/categories/${id}`, { method: "DELETE" }), onSuccess: () => { setMsg(""); refresh(); }, onError: fail });
  const renameCat = useMutation({ mutationFn: (c: CatCategory) => { const name = window.prompt("Rename category", c.name); if (!name || name.trim() === c.name) return Promise.resolve(); return api(`/catalog/categories/${c.id}`, { method: "PATCH", body: { name: name.trim(), description: c.description, icon: c.icon, sort_order: c.sort_order } }); }, onSuccess: refresh, onError: fail });

  return (
    <div className="space-y-6">
      <Link to="/catalog" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Service Catalog</Link>
      <div className="flex items-start justify-between gap-3"><PageHeader title="Manage catalog" subtitle="Build services without touching code: pick the form, approval and fulfillment steps." />
        <Button variant="primary" disabled={!cats.data?.length} onClick={() => cats.data && setDraft(blank(cats.data[0].id))}><Plus className="size-4" />New service</Button></div>
      {msg && <ErrorNote message={msg} />}
      <Card title="Services" className="overflow-hidden [&>div]:p-0">
        {items.isLoading ? <div className="h-32"><Spinner /></div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-line text-xs text-muted"><tr><th className="px-4 py-2.5 text-left font-medium">Service</th><th className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Category</th><th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Fields / steps</th><th className="px-3 py-2.5 text-left font-medium">Status</th><th className="w-28" /></tr></thead>
            <tbody className="divide-y divide-line">{(items.data ?? []).map((i) => { const Icon = iconFor(i.icon); return (
              <tr key={i.id} className={i.is_active ? "" : "opacity-60"}>
                <td className="px-4 py-3"><span className="flex items-center gap-2.5"><Icon className="size-4 text-muted" />{i.name}{i.approval_required && <span className="rounded border border-line px-1.5 text-[10px] text-muted">Approval</span>}</span></td>
                <td className="hidden px-3 py-3 text-muted sm:table-cell">{i.category.name}</td><td className="hidden px-3 py-3 text-muted md:table-cell">{i.field_count} / {i.task_count}</td>
                <td className="px-3 py-3"><Button variant="ghost" busy={toggle.isPending && toggle.variables === i.id} onClick={() => toggle.mutate(i.id)}>{i.is_active ? "Active" : "Inactive"}</Button></td>
                <td className="px-3 py-3"><div className="flex justify-end gap-1"><button aria-label={`Edit ${i.name}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-ink" onClick={() => edit.mutate(i.id)}><Pencil className="size-4" /></button>
                  <button aria-label={`Delete ${i.name}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-danger" onClick={() => window.confirm(`Delete "${i.name}"?`) && del.mutate(i.id)}><Trash2 className="size-4" /></button></div></td></tr>); })}</tbody></table></div>)}
      </Card>
      <Card title="Categories">
        <ul className="mb-4 divide-y divide-line">{(cats.data ?? []).map((c) => <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span>{c.name} <span className="text-xs text-muted">{c.total_items} service{c.total_items === 1 ? "" : "s"}</span></span>
          <span className="flex gap-1"><Button variant="ghost" onClick={() => renameCat.mutate(c)}>Rename</Button><Button variant="ghost" onClick={() => window.confirm(`Delete category "${c.name}"?`) && delCat.mutate(c.id)}>Delete</Button></span></li>)}</ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newCat.trim().length >= 2) addCat.mutate(); }}><input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category name" aria-label="New category name" className="h-9 flex-1 rounded-lg border border-line bg-surface2 px-3 text-sm focus:border-accent focus:outline-none sm:max-w-xs" /><Button type="submit" disabled={newCat.trim().length < 2}>Add category</Button></form>
      </Card>
      {draft && <Editor initial={draft} categories={cats.data ?? []} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); refresh(); }} />}
    </div>
  );
}
