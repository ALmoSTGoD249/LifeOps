import type { Brief } from "./incidents";

export type Task = {
  id: string; number: string; title: string; description: string; category: string; priority: number; state: string; blocked_reason: string | null;
  assigned_to: Brief | null; created_by: Brief | null; due_date: string | null; completed_at: string | null; created_at: string; updated_at: string;
  source: string; parent: { type: string; number: string; title: string } | null; recurrence: { frequency: string; interval: number } | null;
  checklist_total: number; checklist_done: number; is_blocked_by_dependency: boolean;
};
export type TaskRef = { number: string; title: string; state: string };
export type TaskDetail = Task & { checklist: { id: string; text: string; done: boolean }[]; blocked_by: TaskRef[]; blocks: TaskRef[] };

export const TSTATE_LABEL: Record<string, string> = { open: "Open", in_progress: "In Progress", blocked: "Blocked", completed: "Completed", cancelled: "Cancelled" };
const TSTATE_COLOR: Record<string, string> = { open: "#8a8d94", in_progress: "#7c9cff", blocked: "#f5a15a", completed: "#5cc98a", cancelled: "#8a8d94" };
export const FREQS = ["daily", "weekly", "monthly", "quarterly", "yearly"];
export const isTaskOverdue = (t: Task) => !!t.due_date && ["open", "in_progress", "blocked"].includes(t.state) && new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t.due_date) ? t.due_date : t.due_date + "Z") < new Date();

export function TaskStateBadge({ s }: { s: string }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs"><i className="size-1.5 rounded-full" style={{ background: TSTATE_COLOR[s] }} />{TSTATE_LABEL[s] ?? s}</span>;
}
