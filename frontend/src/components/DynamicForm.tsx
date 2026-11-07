import type { Field as FieldDef } from "../lib/requests";
import { Field, SelectField, TextArea } from "./ui";

export type FormValues = Record<string, string | boolean>;

/** Turns raw input state into the typed payload the API validates. Empty values are omitted. */
export function formPayload(fields: FieldDef[], v: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const x = v[f.key];
    if (f.field_type === "checkbox") { out[f.key] = x === true; continue; }
    if (x === undefined || x === "") continue;
    out[f.key] = f.field_type === "number" ? Number(x) : x;
  }
  return out;
}

export default function DynamicForm({ fields, values, errors, onChange }: { fields: FieldDef[]; values: FormValues; errors: Record<string, string>; onChange: (v: FormValues) => void }) {
  const set = (k: string, val: string | boolean) => onChange({ ...values, [k]: val });
  return (
    <div className="space-y-4">
      {fields.map((f) => {
        const label = f.label + (f.required && f.field_type !== "checkbox" ? " *" : "");
        const err = errors[f.key];
        const hint = f.help_text && <span className="-mt-3 block text-xs text-muted">{f.help_text}</span>;
        switch (f.field_type) {
          case "textarea": return <div key={f.key}><TextArea label={label} value={String(values[f.key] ?? "")} error={err} onChange={(e) => set(f.key, e.target.value)} />{hint}</div>;
          case "select": return <div key={f.key}><SelectField label={label} value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)}><option value="">Choose…</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</SelectField>{err && <span className="mt-1 block text-xs text-danger">{err}</span>}{hint}</div>;
          case "checkbox": return <div key={f.key}><label className="flex items-center gap-2.5 text-sm"><input type="checkbox" checked={values[f.key] === true} onChange={(e) => set(f.key, e.target.checked)} />{f.label}{f.required && " *"}</label>{err && <span className="mt-1 block text-xs text-danger">{err}</span>}{hint}</div>;
          default: return <div key={f.key}><Field label={label} type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"} step={f.field_type === "number" ? "any" : undefined} value={String(values[f.key] ?? "")} error={err} onChange={(e) => set(f.key, e.target.value)} />{hint}</div>;
        }
      })}
    </div>
  );
}
