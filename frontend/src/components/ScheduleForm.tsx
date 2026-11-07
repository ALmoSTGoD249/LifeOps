import { useState, type FormEvent } from "react";
import { Button, ErrorNote, Field, SelectField, TextArea } from "./ui";
import { FREQS } from "../lib/tasks";
import { PRIORITY_LABEL, useMembers } from "../lib/incidents";
import { Schedule, useAssetOptions } from "../lib/household";

const toLocal = (iso: string | null) => { if (!iso) return ""; const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z"); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export default function ScheduleForm({ initial, presetAsset, busy, error, submitLabel, onSubmit, onCancel }: { initial?: Schedule; presetAsset?: string; busy: boolean; error?: string; submitLabel: string; onSubmit: (b: object) => void; onCancel: () => void }) {
  const assets = useAssetOptions().data ?? [];
  const members = useMembers().data ?? [];
  const [v, setV] = useState({ name: initial?.name ?? "", description: initial?.description ?? "", asset: initial?.asset?.number ?? presetAsset ?? "", frequency: initial?.frequency ?? "monthly", interval: initial?.interval ?? 1,
    due: toLocal(initial?.next_due ?? null), lead: initial?.lead_days ?? 3, fromCompletion: initial?.from_completion ?? false, priority: initial?.priority ?? 3, assignee: initial?.assigned_to?.id ?? "", active: initial?.is_active ?? true,
    checklist: (initial?.checklist ?? []).join("\n") });
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const nameErr = touched && v.name.trim().length < 2 ? "Enter at least 2 characters" : undefined;
  const dueErr = touched && !v.due ? "Choose when it is next due" : undefined;
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (v.name.trim().length < 2 || !v.due) return;
    const due = new Date(v.due).toISOString();
    onSubmit({ name: v.name.trim(), description: v.description, asset_number: v.asset || null, frequency: v.frequency, interval: v.interval, lead_days: v.lead, from_completion: v.fromCompletion, priority: v.priority,
      assigned_to_id: v.assignee || null, is_active: v.active, checklist: v.checklist.split("\n").map((s) => s.trim()).filter(Boolean), ...(initial ? { next_due: due } : { first_due: due }) });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name" required maxLength={200} autoFocus value={v.name} error={nameErr} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Replace water purifier filter" />
      <TextArea label="Description" value={v.description} onChange={(e) => set("description", e.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Asset" value={v.asset} onChange={(e) => set("asset", e.target.value)}><option value="">None</option>{assets.map((a) => <option key={a.number} value={a.number}>{a.number} {a.name}</option>)}</SelectField>
        <SelectField label="Assigned to" value={v.assignee} onChange={(e) => set("assignee", e.target.value)}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</SelectField>
        <div className="grid grid-cols-2 gap-3"><SelectField label="Repeats" value={v.frequency} onChange={(e) => set("frequency", e.target.value)}>{FREQS.map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}</SelectField>
          <Field label="Every" type="number" min={1} max={60} value={v.interval} onChange={(e) => set("interval", Math.max(1, Number(e.target.value) || 1))} /></div>
        <Field label={initial ? "Next due" : "First due"} type="datetime-local" value={v.due} error={dueErr} onChange={(e) => set("due", e.target.value)} />
        <Field label="Create the task this many days before" type="number" min={0} max={90} value={v.lead} onChange={(e) => set("lead", Math.max(0, Number(e.target.value) || 0))} />
        <SelectField label="Priority" value={v.priority} onChange={(e) => set("priority", Number(e.target.value))}>{[1, 2, 3, 4].map((p) => <option key={p} value={p}>P{p} {PRIORITY_LABEL[p]}</option>)}</SelectField>
      </div>
      <TextArea label="Checklist (one item per line, copied onto every task)" value={v.checklist} onChange={(e) => set("checklist", e.target.value)} />
      <div className="space-y-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={v.fromCompletion} onChange={(e) => set("fromCompletion", e.target.checked)} />Count the next due date from when it is completed, not from the old due date</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} />Active</label></div>
      {error && <ErrorNote message={error} />}
      <div className="flex gap-2"><Button type="submit" variant="primary" busy={busy}>{submitLabel}</Button><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
