import { Activity, AlertTriangle, BookOpen, Boxes, CheckSquare, ClipboardList, LayoutDashboard, Settings, ShoppingBag, UserCheck, Wrench, type LucideIcon } from "lucide-react";

export type NavItem = { path: string; label: string; icon: LucideIcon; phase: number; blurb: string; adminOnly?: boolean };

export const NAV: NavItem[] = [
  { path: "/", label: "Overview", icon: LayoutDashboard, phase: 1, blurb: "Your household at a glance." },
  { path: "/my-work", label: "My Work", icon: UserCheck, phase: 2, blurb: "Everything assigned to you: incidents, requests and tasks in one queue." },
  { path: "/incidents", label: "Incidents", icon: AlertTriangle, phase: 2, blurb: "Report and resolve things that break, with priority, work notes and a full timeline." },
  { path: "/catalog", label: "Service Catalog", icon: ShoppingBag, phase: 2, blurb: "Browse services and submit requests through dynamic forms." },
  { path: "/requests", label: "Requests", icon: ClipboardList, phase: 2, blurb: "Track REQ, RITM and SCTASK records from submission to completion." },
  { path: "/tasks", label: "Tasks", icon: CheckSquare, phase: 2, blurb: "Kanban, table and calendar views of everything that needs doing." },
  { path: "/assets", label: "Assets", icon: Boxes, phase: 3, blurb: "Appliances, devices and vehicles with warranty and full history." },
  { path: "/maintenance", label: "Maintenance", icon: Wrench, phase: 3, blurb: "Recurring schedules that generate tasks automatically." },
  { path: "/knowledge", label: "Knowledge Base", icon: BookOpen, phase: 3, blurb: "Procedures, contacts and sensitive household information." },
  { path: "/activity", label: "Activity", icon: Activity, phase: 4, blurb: "A chronological audit trail of every change." },
  { path: "/admin", label: "Administration", icon: Settings, phase: 1, blurb: "Household members and roles.", adminOnly: true },
];
