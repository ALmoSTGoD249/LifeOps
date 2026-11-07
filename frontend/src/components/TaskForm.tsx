import { useState, type FormEvent } from "react";
import { Button, ErrorNote, Field, SelectField, TextArea } from "./ui";
import { PRIORITY_LABEL, useMembers } from "../lib/incidents";
import { FREQS, type TaskDetail } from "../lib/tasks";

const toLocal = (iso: string | null) => { if (!iso) return ""; const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z"); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export type TaskValues = { title: string; description: string; category: string; priority: number; assigned_to_id: string; due_date: string; incident_number: string; freq: string; interval: number; checklist: string };

export const taskPayload = (v: TaskValues, creating: boolean) => ({
  title: v.title.trim(), description: v.description, category: v.category.trim(), priority: v.priority, assigned_to_id: v.assigned_to_id || null,
  due_date: v.due_date ? new Date(v.due_date).toISOString() : null, incident_number: v.incident_number.trim() || null,
  recurrence_frequency: v.freq || null, recurrence_interval: v.interval,
  ...(creating ? { checklist: v.checklist.split("\n").map((s) => s.trim()).filter(Boolean) } : {}),
});

export default function TaskForm({ initial, incident, submitLabel, busy, error, onSubmit, onCancel }: {
  initial?: TaskDetail; incident?: string; submitLabel: string; busy: boolean; error?: string; onSubmit: (v: TaskValues) => void; onCancel: () => void;
}) {
  const members = useMembers().data ?? [];
  const [v, setV] = useState<TaskValues>({
    title: initial?.title ?? "", description: initial?.description ?? "", category: initial?.category ?? "", priority: initial?.priority ?? 3,
    assigned_to_id: initial?.assigned_to?.id ?? "", due_date: toLocal(initial?.due_date ?? null), incident_number: initial?.parent?.number ?? incident ?? "",
    freq: initial?.recurrence?.frequency ?? "", interval: initial?.recurrence?.interval ?? 1, checklist: "",
  });
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof TaskValues>(k: K, val: TaskValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const err = touched && v.title.trim().length < 3 ? "Enter at least 3 characters" : undefined;
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (v.title.trim().length >= 3) onSubmit(v); };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title" required maxLength={200} autoFocus value={v.title} error={err} onChange={(e) => set("title", e.target.value)} />
      <TextArea label="Description" value={v.description} onChange={(e) => set("description", e.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Assigned to" value={v.assigned_to_id} onChange={(e) => set("assigned_to_id", e.target.value)}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</SelectField>
        <SelectField label="Priority" value={v.priority} onChange={(e) => set("priority", Number(e.target.value))}>{[1, 2, 3, 4].map((p) => <option key={p} value={p}>P{p} {PRIORITY_LABEL[p]}</option>)}</SelectField>
        <Field label="Due date" type="datetime-local" value={v.due_date} onChange={(e) => set("due_date", e.target.value)} />
        <Field label="Category" maxLength={60} value={v.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Home, Finance" />
        <Field label="Related incident (optional)" value={v.incident_number} onChange={(e) => set("incident_number", e.target.value)} placeholder="INC000001" />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Repeats" value={v.freq} onChange={(e) => set("freq", e.target.value)}><option value="">Never</option>{FREQS.map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}</SelectField>
          <Field label="Every" type="number" min={1} max={60} disabled={!v.freq} value={v.interval} onChange={(e) => set("interval", Math.max(1, Number(e.target.value) || 1))} />
        </div>
      </div>
      {!initial && <TextArea label="Checklist (one item per line)" value={v.checklist} onChange={(e) => set("checklist", e.target.value)} />}
      {error && <ErrorNote message={error} />}
      <div className="flex gap-2 pt-1"><Button type="submit" variant="primary" busy={busy}>{submitLabel}</Button><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
