import { useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Link2, Paperclip, Pencil, Plus } from "lucide-react";
import { api, apiUpload, ApiError } from "../lib/api";
import { ASSET_STATUS, AssetDetail, CONDITION, FREQ_LABEL, WarrantyBadge, fmtDate, money } from "../lib/household";
import { Attach, PriorityBadge, StateBadge, TimelineItem, fmt } from "../lib/incidents";
import { Avatar, Button, Card, EmptyState, ErrorNote, Modal, Spinner } from "../components/ui";
import AssetForm from "../components/AssetForm";

const Row = ({ label, children }: { label: string; children: ReactNode }) => <div className="flex items-start justify-between gap-4 py-2 text-sm"><dt className="text-muted">{label}</dt><dd className="text-right">{children}</dd></div>;

function describe(t: TimelineItem): ReactNode {
  const d = t.details;
  switch (t.action) {
    case "created": return `added this asset`;
    case "updated": return <>updated {Object.entries(d).map(([k, c]: [string, any]) => <span key={k} className="mr-2 inline-block"><b className="font-medium">{k.replace(/_/g, " ")}</b>: {String(c.from ?? "none")} → {String(c.to ?? "none")}</span>)}</>;
    case "incident_linked": return <>linked incident <Link className="font-mono text-xs text-accent" to={`/incidents/${d.incident}`}>{d.incident}</Link></>;
    case "schedule_added": return <>added maintenance <Link className="font-mono text-xs text-accent" to={`/maintenance/${d.schedule}`}>{d.schedule}</Link> {d.name}</>;
    case "maintenance_done": return <>completed maintenance “{d.name}”</>;
    case "maintenance_skipped": return <>skipped maintenance “{d.name}”</>;
    case "attachment_added": return <>attached <b className="font-medium">{d.file}</b></>;
    default: return t.action;
  }
}

export default function AssetDetailPage() {
  const { number = "" } = useParams();
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ["asset", number], queryFn: () => api<AssetDetail>(`/assets/${number}`) });
  const tl = useQuery({ queryKey: ["asset", number, "activity"], queryFn: () => api<TimelineItem[]>(`/assets/${number}/activity`) });
  const att = useQuery({ queryKey: ["asset", number, "attachments"], queryFn: () => api<Attach[]>(`/assets/${number}/attachments`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["asset", number] }); qc.invalidateQueries({ queryKey: ["assets"] }); };
  const patch = useMutation({ mutationFn: (b: object) => api(`/assets/${number}`, { method: "PATCH", body: b }), onSuccess: () => { setEdit(false); refresh(); } });
  const upload = useMutation({ mutationFn: (f: File) => apiUpload(`/assets/${number}/attachments`, f), onSuccess: () => { setUploadErr(""); refresh(); }, onError: (e) => setUploadErr((e as Error).message) });

  if (q.isLoading) return <div className="h-64"><Spinner /></div>;
  if (q.isError) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return <div><Link to="/assets" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Assets</Link>{nf ? <EmptyState icon={Link2} title="Asset not found" text={`There is no asset ${number}.`} /> : <ErrorNote message={(q.error as Error).message} />}</div>;
  }
  const a = q.data!;
  const openIncidents = a.incidents.filter((i) => ["new", "in_progress", "on_hold"].includes(i.state)).length;

  return (
    <div>
      <Link to="/assets" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Assets</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex flex-wrap items-center gap-3"><span className="font-mono text-sm text-muted">{a.number}</span><span className="rounded-full border border-line px-2 py-0.5 text-xs">{ASSET_STATUS[a.status]}</span><WarrantyBadge a={a} /></div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{a.name}</h1><p className="mt-1 text-sm text-muted">{[a.category?.name, a.manufacturer, a.model].filter(Boolean).join(" · ")}</p></div>
        <div className="flex flex-wrap gap-2"><Link to={`/incidents?new=1`}><span className="inline-flex h-9 items-center rounded-lg border border-line bg-surface2 px-3.5 text-sm">Report incident</span></Link><Link to={`/maintenance?new=1&asset=${a.number}`}><span className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface2 px-3.5 text-sm"><Plus className="size-4" />Schedule maintenance</span></Link><Button onClick={() => setEdit(true)}><Pencil className="size-4" />Edit</Button></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Incidents (${a.incidents.length})`} action={openIncidents > 0 && <span className="text-xs text-muted">{openIncidents} open</span>} className="[&>div]:p-0">
            {a.incidents.length ? <ul className="divide-y divide-line">{a.incidents.map((i) => <li key={i.number}><Link to={`/incidents/${i.number}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface2/40"><span className="min-w-0 truncate"><span className="mr-2 font-mono text-xs text-accent">{i.number}</span>{i.short_description}</span><span className="flex shrink-0 items-center gap-3"><PriorityBadge p={i.priority} /><StateBadge s={i.state} /></span></Link></li>)}</ul>
              : <p className="px-5 py-6 text-sm text-muted">No incidents have been reported for this asset.</p>}
          </Card>
          <Card title="Maintenance" className="[&>div]:p-0">
            {a.schedules.length > 0 && <ul className="divide-y divide-line border-b border-line">{a.schedules.map((s) => <li key={s.number}><Link to={`/maintenance/${s.number}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface2/40"><span><span className="mr-2 font-mono text-xs text-accent">{s.number}</span>{s.name}<span className="ml-2 text-xs text-muted">{FREQ_LABEL(s.frequency, s.interval)}</span></span><span className="text-xs text-muted">{s.is_active ? `Next ${fmtDate(s.next_due)}` : "Inactive"}</span></Link></li>)}</ul>}
            {a.records.length ? <ul className="divide-y divide-line">{a.records.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span>{r.schedule_name ?? "Maintenance"}<span className="ml-2 text-xs text-muted">{r.outcome === "skipped" ? "skipped" : "done"} · {r.completed_by?.full_name}</span></span><span className="text-xs text-muted">{fmt(r.completed_at)}</span></li>)}</ul>
              : <p className="px-5 py-6 text-sm text-muted">{a.schedules.length ? "No maintenance has been completed yet." : "No maintenance is scheduled for this asset."}</p>}
          </Card>
          <Card title="History">
            <ol className="space-y-[18px]">{[...(tl.data ?? [])].reverse().map((t) => (
              <li key={t.id} className="relative pl-6 before:absolute before:left-[5px] before:top-2 before:size-2 before:rounded-full before:bg-line after:absolute after:bottom-[-18px] after:left-[8.5px] after:top-5 after:w-px after:bg-line last:after:hidden">
                <p className="text-sm"><b className="font-medium">{t.user_name ?? "System"}</b> <span className="text-muted">{describe(t)}</span></p><p className="text-xs text-muted/70">{fmt(t.created_at)}</p></li>))}</ol>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Details"><dl className="-my-2 divide-y divide-line">
            <Row label="Owner">{a.owner ? <span className="inline-flex items-center gap-2"><Avatar name={a.owner.full_name} src={a.owner.avatar_url} size={20} />{a.owner.full_name}</span> : "Shared"}</Row>
            <Row label="Location">{a.location || "—"}</Row><Row label="Condition">{CONDITION[a.condition]}</Row><Row label="Serial number"><span className="font-mono text-xs">{a.serial_number || "—"}</span></Row>
            <Row label="Purchased">{fmtDate(a.purchase_date)}</Row><Row label="Price">{money(a.purchase_price)}</Row><Row label="Warranty ends">{fmtDate(a.warranty_expires)}</Row><Row label="Added">{fmt(a.created_at)}</Row>
          </dl>{a.notes && <p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-sm">{a.notes}</p>}</Card>
          <Card title="Documents" action={<><input ref={file} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} /><Button variant="ghost" busy={upload.isPending} onClick={() => file.current?.click()}><Paperclip className="size-4" />Add</Button></>}>
            {uploadErr && <div className="mb-3"><ErrorNote message={uploadErr} /></div>}
            {att.data?.length ? <ul className="space-y-2">{att.data.map((f) => <li key={f.id}><a href={`/api/attachments/${f.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:border-muted/60"><span className="truncate">{f.name}</span><Download className="size-3.5 shrink-0 text-muted" /></a></li>)}</ul> : <p className="text-sm text-muted">Receipts, manuals and warranty cards. Photos, PDFs and text files up to 10 MB.</p>}
          </Card>
        </div>
      </div>
      {edit && <Modal wide title={`Edit ${a.number}`} onClose={() => setEdit(false)}><AssetForm initial={a} submitLabel="Save changes" busy={patch.isPending} error={patch.isError ? (patch.error as Error).message : undefined} onSubmit={(b) => patch.mutate(b)} onCancel={() => setEdit(false)} /></Modal>}
    </div>
  );
}
