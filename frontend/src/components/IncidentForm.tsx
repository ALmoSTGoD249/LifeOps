import { useState, type FormEvent } from "react";
import { Button, ErrorNote, Field, SelectField, TextArea } from "./ui";
import { useAssetOptions } from "../lib/household";
import { LEVEL_LABEL, PRIORITY_LABEL, useCategories, useMembers, useMeta, type Incident } from "../lib/incidents";

export type IncidentValues = {
  short_description: string; description: string; category_id: string; subcategory_id: string; impact: number; urgency: number;
  assigned_to_id: string; location: string; due_date: string; asset_id: string;
};

const toLocal = (iso: string | null) => { if (!iso) return ""; const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z"); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function valuesOf(i?: Incident): IncidentValues {
  return { short_description: i?.short_description ?? "", description: i?.description ?? "", category_id: i?.category?.id ?? "", subcategory_id: i?.subcategory?.id ?? "",
    impact: i?.impact ?? 3, urgency: i?.urgency ?? 3, assigned_to_id: i?.assigned_to?.id ?? "", location: i?.location ?? "", due_date: toLocal(i?.due_date ?? null), asset_id: i?.asset?.id ?? "" };
}
export const payload = (v: IncidentValues) => ({
  short_description: v.short_description.trim(), description: v.description, category_id: v.category_id || null, subcategory_id: v.subcategory_id || null,
  impact: v.impact, urgency: v.urgency, assigned_to_id: v.assigned_to_id || null, location: v.location.trim(), asset_id: v.asset_id || null, due_date: v.due_date ? new Date(v.due_date).toISOString() : null,
});

export default function IncidentForm({ initial, submitLabel, busy, error, onSubmit, onCancel }: {
  initial?: Incident; submitLabel: string; busy: boolean; error?: string; onSubmit: (v: IncidentValues) => void; onCancel: () => void;
}) {
  const [v, setV] = useState<IncidentValues>(valuesOf(initial));
  const [touched, setTouched] = useState(false);
  const cats = useCategories().data ?? [];
  const members = useMembers().data ?? [];
  const meta = useMeta().data;
  const assets = useAssetOptions().data ?? [];
  const subs = cats.find((c) => c.id === v.category_id)?.children ?? [];
  const priority = meta?.priority_matrix.find((m) => m.impact === v.impact && m.urgency === v.urgency)?.priority;
  const set = <K extends keyof IncidentValues>(k: K, val: IncidentValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const shortErr = touched && v.short_description.trim().length < 3 ? "Enter at least 3 characters" : undefined;

  function submit(e: FormEvent) { e.preventDefault(); setTouched(true); if (v.short_description.trim().length >= 3) onSubmit(v); }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Short description" required maxLength={200} value={v.short_description} error={shortErr} onChange={(e) => set("short_description", e.target.value)} placeholder="e.g. Washing machine is leaking" autoFocus />
      <TextArea label="Details" value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="What happened, when, anything you tried" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Category" value={v.category_id} onChange={(e) => { set("category_id", e.target.value); set("subcategory_id", ""); }}>
          <option value="">None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <SelectField label="Subcategory" value={v.subcategory_id} disabled={!subs.length} onChange={(e) => set("subcategory_id", e.target.value)}>
          <option value="">None</option>{subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <SelectField label="Impact" value={v.impact} onChange={(e) => set("impact", Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{LEVEL_LABEL[n]}</option>)}</SelectField>
        <SelectField label="Urgency" value={v.urgency} onChange={(e) => set("urgency", Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{LEVEL_LABEL[n]}</option>)}</SelectField>
      </div>
      {priority && <p className="text-xs text-muted">Calculated priority: <span className="font-medium text-ink">P{priority} {PRIORITY_LABEL[priority]}</span></p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Assigned to" value={v.assigned_to_id} onChange={(e) => set("assigned_to_id", e.target.value)}>
          <option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </SelectField>
        <Field label="Location" maxLength={120} value={v.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Laundry" />
        <SelectField label="Related asset" value={v.asset_id} onChange={(e) => set("asset_id", e.target.value)}><option value="">None</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.number} {a.name}</option>)}</SelectField>
        <Field label="Due date" type="datetime-local" value={v.due_date} onChange={(e) => set("due_date", e.target.value)} />
      </div>
      {error && <ErrorNote message={error} />}
      <div className="flex gap-2 pt-1"><Button type="submit" variant="primary" busy={busy}>{submitLabel}</Button><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
