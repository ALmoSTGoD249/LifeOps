import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckSquare, ClipboardList, Clock } from "lucide-react";
import { api, type User } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Avatar, Card, EmptyState, ErrorNote } from "../components/ui";

const count = (path: string) => ({ queryKey: ["count", path], queryFn: () => api<{ total: number }>(path).then((r) => r.total) });
const tiles = [
  { label: "Open incidents", icon: AlertTriangle, path: "/incidents?state=open&page_size=1", to: "/incidents" },
  { label: "Pending requests", icon: ClipboardList, path: "/requests?scope=active&page_size=1", to: "/requests?tab=all" },
  { label: "Active tasks", icon: CheckSquare, path: "/tasks?scope=all&state=active&page_size=1", to: "/tasks?scope=all" },
  { label: "Overdue tasks", icon: Clock, path: "/tasks?scope=overdue&page_size=1", to: "/tasks?scope=overdue" },
];

function Tile({ t }: { t: (typeof tiles)[number] }) {
  const q = useQuery({ ...count(t.path ?? "/none"), enabled: !!t.path });
  const body = (
    <div className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-muted/50">
      <t.icon className="size-4 text-muted" />
      <p className={`mt-3 font-mono text-2xl ${t.path ? "" : "text-muted/50"}`}>{!t.path ? "–" : q.isLoading ? "…" : q.isError ? "?" : q.data}</p>
      <p className="mt-1 text-xs text-muted">{t.label}</p>
    </div>
  );
  return t.to ? <Link to={t.to}>{body}</Link> : body;
}

export default function Overview() {
  const { user } = useAuth();
  const members = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/users") });
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{date}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{greet}, {user?.full_name.split(" ")[0]}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => <Tile key={t.label} t={t} />)}
      </div>
      <p className="-mt-3 text-xs text-muted">These counters are calculated live from your records.</p>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Recent activity" className="lg:col-span-2"><EmptyState icon={Activity} title="Nothing has happened yet" text="Incidents, requests and assignments will show up here as they happen." /></Card>
        <Card title="Household">
          {members.isError ? <ErrorNote message="Could not load members" /> : (
            <ul className="space-y-3">
              {(members.data ?? []).map((m) => (
                <li key={m.id} className="flex items-center gap-3"><Avatar name={m.full_name} src={m.avatar_url} /><div className="min-w-0"><p className="truncate text-sm">{m.full_name}</p><p className="text-xs capitalize text-muted">{m.role}</p></div></li>
              ))}
              {members.isLoading && <li className="text-sm text-muted">Loading</li>}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
