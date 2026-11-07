import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Brief } from "./incidents";

export type Asset = {
  id: string; number: string; name: string; category: { id: string; name: string } | null; manufacturer: string; model: string; serial_number: string;
  purchase_date: string | null; warranty_expires: string | null; purchase_price: number | null; location: string; owner: Brief | null; condition: string; status: string; notes: string;
  warranty_status: "none" | "active" | "expiring" | "expired"; warranty_days_left: number | null; created_at: string; updated_at: string;
};
export type AssetDetail = Asset & {
  incidents: { number: string; short_description: string; state: string; priority: number; created_at: string }[];
  schedules: { number: string; name: string; frequency: string; interval: number; next_due: string; is_active: boolean }[];
  records: { id: string; schedule_number: string | null; schedule_name: string | null; outcome: string; completed_at: string; completed_by: Brief | null; notes: string }[];
};
export type Schedule = {
  id: string; number: string; name: string; description: string; asset: { number: string; name: string } | null; frequency: string; interval: number; next_due: string; lead_days: number;
  from_completion: boolean; priority: number; assigned_to: Brief | null; is_active: boolean; last_completed_at: string | null; status: "ok" | "due_soon" | "overdue" | "inactive";
  current_task: { number: string; state: string; due_date: string | null } | null; checklist: string[];
};
export type MRecord = { id: string; schedule_number?: string; schedule_name?: string; asset?: { number: string; name: string } | null; outcome: string; due_date: string | null; completed_at: string; completed_by: Brief | null; notes: string };
export type Article = {
  id: string; number: string; title: string; category: { id: string; name: string } | null; status: "draft" | "published"; admins_only: boolean; tags: string[]; updated_at: string; created_at: string;
  updated_by: Brief | null; created_by: Brief | null; secret_count: number; excerpt: string; body?: string; secrets?: { id: string; label: string }[];
};

export const ASSET_STATUS: Record<string, string> = { in_use: "In use", in_storage: "In storage", in_repair: "In repair", retired: "Retired", disposed: "Disposed" };
export const CONDITION: Record<string, string> = { new: "New", good: "Good", fair: "Fair", poor: "Poor" };
export const FREQ_LABEL = (f: string, n: number) => (n === 1 ? { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" }[f] : `Every ${n} ${{ daily: "days", weekly: "weeks", monthly: "months", quarterly: "quarters", yearly: "years" }[f]}`);

export const fmtDate = (d: string | null) => (d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
export const money = (n: number | null) => (n === null ? "—" : n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).replace("US", ""));

export const useAssetOptions = () => useQuery({ queryKey: ["assets", "options"], queryFn: () => api<{ items: Asset[] }>("/assets?page_size=200&sort=name").then((r) => r.items), staleTime: 30_000 });
export const useAssetCategories = () => useQuery({ queryKey: ["asset-categories"], queryFn: () => api<{ id: string; name: string }[]>("/asset-categories"), staleTime: 60_000 });

const WCOLOR = { none: "#8a8d94", active: "#5cc98a", expiring: "#f5a15a", expired: "#ff6b6b" };
export function WarrantyBadge({ a }: { a: Pick<Asset, "warranty_status" | "warranty_days_left" | "warranty_expires"> }) {
  const label = a.warranty_status === "none" ? "No warranty" : a.warranty_status === "expired" ? "Expired" : a.warranty_status === "expiring" ? `Expires in ${a.warranty_days_left} d` : "In warranty";
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs"><i className="size-2 rounded-full" style={{ background: WCOLOR[a.warranty_status] }} />{label}</span>;
}
const SCOLOR = { ok: "#5cc98a", due_soon: "#f5a15a", overdue: "#ff6b6b", inactive: "#8a8d94" };
const SLABEL = { ok: "On track", due_soon: "Due soon", overdue: "Overdue", inactive: "Inactive" };
export function ScheduleBadge({ s }: { s: Schedule["status"] }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs"><i className="size-1.5 rounded-full" style={{ background: SCOLOR[s] }} />{SLABEL[s]}</span>;
}
