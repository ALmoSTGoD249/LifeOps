import { useState, type FormEvent } from "react";
import { Button, ErrorNote, Field, SelectField, TextArea } from "./ui";
import { ASSET_STATUS, CONDITION, useAssetCategories, type Asset } from "../lib/household";
import { useMembers } from "../lib/incidents";

type V = { name: string; category_id: string; manufacturer: string; model: string; serial_number: string; purchase_date: string; warranty_expires: string; purchase_price: string; location: string; owner_id: string; condition: string; status: string; notes: string };

export default function AssetForm({ initial, busy, error, submitLabel, onSubmit, onCancel }: { initial?: Asset; busy: boolean; error?: string; submitLabel: string; onSubmit: (b: object) => void; onCancel: () => void }) {
  const cats = useAssetCategories().data ?? [];
  const members = useMembers().data ?? [];
  const [v, setV] = useState<V>({ name: initial?.name ?? "", category_id: initial?.category?.id ?? "", manufacturer: initial?.manufacturer ?? "", model: initial?.model ?? "", serial_number: initial?.serial_number ?? "",
    purchase_date: initial?.purchase_date ?? "", warranty_expires: initial?.warranty_expires ?? "", purchase_price: initial?.purchase_price != null ? String(initial.purchase_price) : "", location: initial?.location ?? "",
    owner_id: initial?.owner?.id ?? "", condition: initial?.condition ?? "good", status: initial?.status ?? "in_use", notes: initial?.notes ?? "" });
  const [touched, setTouched] = useState(false);
  const set = (k: keyof V) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  const dateErr = v.purchase_date && v.warranty_expires && v.warranty_expires < v.purchase_date ? "Warranty cannot end before the purchase date" : undefined;
  const nameErr = touched && v.name.trim().length < 2 ? "Enter at least 2 characters" : undefined;
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (v.name.trim().length < 2 || dateErr) return;
    onSubmit({ ...v, name: v.name.trim(), category_id: v.category_id || null, owner_id: v.owner_id || null, purchase_date: v.purchase_date || null, warranty_expires: v.warranty_expires || null, purchase_price: v.purchase_price === "" ? null : Number(v.purchase_price) });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required maxLength={120} autoFocus value={v.name} error={nameErr} onChange={set("name")} />
        <SelectField label="Category" value={v.category_id} onChange={set("category_id")}><option value="">None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
        <Field label="Manufacturer" maxLength={80} value={v.manufacturer} onChange={set("manufacturer")} /><Field label="Model" maxLength={80} value={v.model} onChange={set("model")} />
        <Field label="Serial number" maxLength={80} value={v.serial_number} onChange={set("serial_number")} /><Field label="Location" maxLength={120} value={v.location} onChange={set("location")} placeholder="e.g. Kitchen" />
        <Field label="Purchase date" type="date" value={v.purchase_date} onChange={set("purchase_date")} /><Field label="Warranty expires" type="date" value={v.warranty_expires} error={dateErr} onChange={set("warranty_expires")} />
        <Field label="Purchase price" type="number" min={0} step="0.01" value={v.purchase_price} onChange={set("purchase_price")} />
        <SelectField label="Owner" value={v.owner_id} onChange={set("owner_id")}><option value="">Shared (household)</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</SelectField>
        <SelectField label="Condition" value={v.condition} onChange={set("condition")}>{Object.entries(CONDITION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectField>
        <SelectField label="Status" value={v.status} onChange={set("status")}>{Object.entries(ASSET_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectField>
      </div>
      <TextArea label="Notes" value={v.notes} onChange={set("notes")} />
      {error && <ErrorNote message={error} />}
      <div className="flex gap-2"><Button type="submit" variant="primary" busy={busy}>{submitLabel}</Button><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
