import { useQuery } from "@tanstack/react-query";
import { api, type User } from "./api";

export type Brief = { id: string; full_name: string; avatar_url: string | null };
export type Cat = { id: string; name: string };
export type CatNode = Cat & { children: Cat[] };
export type Incident = {
  id: string; number: string; short_description: string; description: string; category: Cat | null; subcategory: Cat | null;
  impact: number; urgency: number; priority: number; state: string; assigned_to: Brief | null; reported_by: Brief | null;
  location: string; asset_id: string | null; asset: { id: string; number: string; name: string } | null; due_date: string | null; hold_reason: string | null; resolution_code: string | null;
  resolution_notes: string | null; created_at: string; updated_at: string; resolved_at: string | null; closed_at: string | null;
};
export type Meta = { states: string[]; transitions: Record<string, string[]>; resolution_codes: string[]; priority_matrix: { impact: number; urgency: number; priority: number }[] };
export type TimelineItem = { id: string; action: string; user_name: string | null; details: Record<string, any>; created_at: string; comment: { kind: string; body: string } | null };
export type Attach = { id: string; name: string; size: number; mime: string; created_at: string };

export const STATE_LABEL: Record<string, string> = { new: "New", in_progress: "In Progress", on_hold: "On Hold", resolved: "Resolved", closed: "Closed", cancelled: "Cancelled" };
export const PRIORITY_LABEL: Record<number, string> = { 1: "Critical", 2: "High", 3: "Moderate", 4: "Low" };
export const LEVEL_LABEL: Record<number, string> = { 1: "High", 2: "Medium", 3: "Low" };
export const CODE_LABEL = (c: string) => c.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase());
const PRIORITY_COLOR: Record<number, string> = { 1: "#ff6b6b", 2: "#f5a15a", 3: "#e8c95a", 4: "#8a8d94" };
const STATE_COLOR: Record<string, string> = { new: "#7c9cff", in_progress: "#7c9cff", on_hold: "#f5a15a", resolved: "#5cc98a", closed: "#8a8d94", cancelled: "#8a8d94" };

export const ts = (s: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z");
export const fmt = (s: string | null) => (s ? ts(s).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const isOverdue = (i: Incident) => !!i.due_date && ["new", "in_progress", "on_hold"].includes(i.state) && ts(i.due_date) < new Date();

export const useMeta = () => useQuery({ queryKey: ["incident-meta"], queryFn: () => api<Meta>("/incident-meta"), staleTime: 60_000 });
export const useCategories = () => useQuery({ queryKey: ["incident-categories"], queryFn: () => api<CatNode[]>("/incident-categories"), staleTime: 60_000 });
export const useMembers = () => useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/users") });

export function PriorityBadge({ p }: { p: number }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs"><i className="size-2 rounded-full" style={{ background: PRIORITY_COLOR[p] }} /><span className="font-mono text-muted">P{p}</span>{PRIORITY_LABEL[p]}</span>;
}
export function StateBadge({ s }: { s: string }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs"><i className="size-1.5 rounded-full" style={{ background: STATE_COLOR[s] }} />{STATE_LABEL[s] ?? s}</span>;
}
