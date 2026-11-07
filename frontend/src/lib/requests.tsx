import { Bug, Calendar, Car, Coffee, Compass, Download, Gift, HandHelping, Hammer, Heart, Home, KeyRound, Laptop, Leaf, LifeBuoy, Monitor, Package, PartyPopper, Plane, PlaneTakeoff, ShoppingCart, Smartphone, Sofa, Sparkles, User, Wallet, Wrench, type LucideIcon } from "lucide-react";
import type { Brief } from "./incidents";

export const ICONS: Record<string, LucideIcon> = { home: Home, hammer: Hammer, wrench: Wrench, sparkles: Sparkles, sofa: Sofa, "shopping-cart": ShoppingCart, user: User, compass: Compass,
  "hand-helping": HandHelping, calendar: Calendar, plane: Plane, monitor: Monitor, "life-buoy": LifeBuoy, laptop: Laptop, download: Download, bug: Bug, heart: Heart,
  "party-popper": PartyPopper, "plane-takeoff": PlaneTakeoff, wallet: Wallet, package: Package, leaf: Leaf, gift: Gift, car: Car, coffee: Coffee, smartphone: Smartphone, key: KeyRound };
export const iconFor = (n: string): LucideIcon => ICONS[n] ?? Package;

export type Field = { key: string; label: string; field_type: "text" | "textarea" | "number" | "date" | "select" | "checkbox"; required: boolean; options: string[]; help_text: string };
export type Tpl = { title: string; description: string; assignee_mode: "requester" | "other_member" | "item_default" | "user"; assignee_id: string | null; due_offset_days: number | null };
export type CatCategory = { id: string; name: string; description: string; icon: string; sort_order: number; item_count: number; total_items: number };
export type CatItem = {
  id: string; category: { id: string; name: string }; name: string; description: string; icon: string; estimated_hours: number | null; is_active: boolean;
  approval_required: boolean; sequential: boolean; approver_id: string | null; default_assignee_id: string | null; field_count: number; task_count: number;
  fields?: Field[]; tasks?: Tpl[];
};
export type SCTask = { id: string; number: string; title: string; description: string; state: string; assigned_to: Brief | null; due_date: string | null; completed_at: string | null; ritm_number?: string; item_name?: string; request_number?: string };
export type ApprovalRow = { id: string; state: string; comment: string | null; created_at: string; decided_at: string | null; approver: Brief | null; ritm_number: string; item_name: string; request_number: string; requester: Brief | null; justification: string; form: { label: string; value: unknown }[] };
export type Ritm = {
  id: string; number: string; item_name: string; state: string; form: { label: string; value: unknown }[]; assigned_to: Brief | null; due_date: string | null; completed_at: string | null; sequential: boolean;
  tasks: SCTask[]; approvals: { id: string; state: string; approver: Brief | null; comment: string | null; decided_at: string | null }[];
};
export type Req = { id: string; number: string; state: string; short_description: string; requester: Brief | null; created_at: string; updated_at: string; closed_at: string | null; justification?: string; ritms: (Partial<Ritm> & { number: string; item_name: string; state: string })[] };
export type ReqEvent = { id: string; action: string; user_name: string | null; details: Record<string, any>; created_at: string; record_type: string; record_number: string; comment: { body: string } | null };

const LABEL: Record<string, string> = { awaiting_approval: "Awaiting approval", pending_approval: "Awaiting approval", in_progress: "In progress", completed: "Completed", rejected: "Rejected", cancelled: "Cancelled",
  open: "Open", awaiting_confirmation: "Awaiting confirmation", pending: "Waiting", requested: "Requested", approved: "Approved" };
const COLOR: Record<string, string> = { awaiting_approval: "#f5a15a", pending_approval: "#f5a15a", in_progress: "#7c9cff", open: "#7c9cff", completed: "#5cc98a", approved: "#5cc98a", rejected: "#ff6b6b",
  cancelled: "#8a8d94", awaiting_confirmation: "#e8c95a", pending: "#8a8d94", requested: "#f5a15a" };
export const stateLabel = (s: string) => LABEL[s] ?? s;
export function RState({ s }: { s: string }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs"><i className="size-1.5 rounded-full" style={{ background: COLOR[s] ?? "#8a8d94" }} />{stateLabel(s)}</span>;
}
export const eta = (h: number | null) => (h == null ? "" : h < 48 ? `About ${h} hour${h === 1 ? "" : "s"}` : `About ${Math.round(h / 24)} days`);
export const showVal = (v: unknown) => (typeof v === "boolean" ? (v ? "Yes" : "No") : v === null || v === undefined || v === "" ? "—" : String(v));
