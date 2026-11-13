import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, CheckSquare,
  ClipboardList, Clock3, Plus, Users,
} from "lucide-react";
import { api, type User } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Avatar, Card, EmptyState, ErrorNote } from "../components/ui";

const count = (path: string) => ({
  queryKey: ["count", path],
  queryFn: () => api<{ total: number }>(path).then((r) => r.total),
});

const tiles = [
  { label: "Open incidents", icon: AlertTriangle, path: "/incidents?state=open&page_size=1", to: "/incidents", tone: "text-danger", hint: "Needs attention" },
  { label: "Pending requests", icon: ClipboardList, path: "/requests?scope=active&page_size=1", to: "/requests?tab=all", tone: "text-[var(--info)]", hint: "Awaiting progress" },
  { label: "Active tasks", icon: CheckSquare, path: "/tasks?scope=all&state=active&page_size=1", to: "/tasks?scope=all", tone: "text-accent", hint: "Currently in progress" },
  { label: "Overdue tasks", icon: Clock3, path: "/tasks?scope=overdue&page_size=1", to: "/tasks?scope=overdue", tone: "text-[var(--warning)]", hint: "Past their due date" },
];

function Metric({ t }: { t: (typeof tiles)[number] }) {
  const q = useQuery(count(t.path));
  return (
    <Link to={t.to} className={`metric-card group block rounded-xl border border-line bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface2/70 ${t.label === "Open incidents" ? "metric-card--incident" : ""}`}>
      <div className="flex items-center justify-between">
        <span className={`metric-icon grid size-9 place-items-center rounded-lg bg-surface2 ${t.tone}`}><t.icon className="size-[18px]" /></span>
        <ArrowUpRight className="metric-arrow size-4 text-muted/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
      </div>
      <p className={`metric-value mt-4 font-mono text-[1.8rem] font-semibold leading-none tracking-tight tabular-nums ${t.label === "Open incidents" ? "text-danger" : ""}`}>
        {q.isLoading ? "…" : q.isError ? "—" : q.data}
      </p>
      <p className="mt-2 text-sm font-medium text-ink">{t.label}</p>
      <p className="mt-0.5 text-xs text-muted">{t.hint}</p>
    </Link>
  );
}

const shortcuts = [
  { label: "Report an incident", detail: "Something needs attention", to: "/incidents?new=1", icon: AlertTriangle },
  { label: "Create a task", detail: "Add something to the to-do list", to: "/tasks?new=1", icon: CheckSquare },
  { label: "Browse services", detail: "Request help or a household service", to: "/catalog", icon: ClipboardList },
];

export default function Overview() {
  const { user } = useAuth();
  const members = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/users") });
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-[1440px] space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{date}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[2rem]">{greet}, {user?.full_name.split(" ")[0]}</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">A clear view of what is happening across your household.</p>
        </div>
        <Link to="/tasks?new=1" className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-semibold text-accentfg shadow-sm transition hover:brightness-105">
          <Plus className="size-4" /> Create task
        </Link>
      </section>

      <section aria-label="Household overview">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-wide">At a glance</h2>
            <p className="mt-0.5 text-xs text-muted">Live counts from your existing records</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted"><span className="size-1.5 rounded-full bg-[var(--success)]" /> Live</span>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {tiles.map((t) => <Metric key={t.label} t={t} />)}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <Card title="Recent activity" action={<Link to="/activity" className="inline-flex items-center gap-1 text-xs font-medium text-muted transition hover:text-accent">View activity <ArrowRight className="size-3.5" /></Link>}>
            <EmptyState icon={Activity} title="Nothing has happened yet" text="Incidents, requests and assignments will appear here as activity is recorded." />
          </Card>

          <Card title="Quick actions">
            <div className="grid gap-2 sm:grid-cols-3">
              {shortcuts.map((item) => (
                <Link key={item.label} to={item.to} className="group flex items-start gap-3 rounded-lg border border-line bg-bg/40 p-3 transition hover:border-accent/40 hover:bg-surface2/60">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface2 text-muted group-hover:text-accent"><item.icon className="size-[17px]" /></span>
                  <span className="min-w-0"><span className="block text-sm font-medium">{item.label}</span><span className="mt-1 block text-xs leading-relaxed text-muted">{item.detail}</span></span>
                  <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-muted/60 group-hover:text-accent" />
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-5 xl:col-span-4">
          <Card title="Household" action={<span className="inline-flex items-center gap-1 text-xs text-muted"><Users className="size-3.5" /> {members.data?.length ?? "—"}</span>}>
            {members.isError ? <ErrorNote message="Could not load household members" /> : (
              <ul className="divide-y divide-line">
                {(members.data ?? []).map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Avatar name={m.full_name} src={m.avatar_url} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.full_name}</p>
                      <p className="mt-0.5 text-xs capitalize text-muted">{m.role}</p>
                    </div>
                    {m.is_active && <span className="size-2 rounded-full bg-[var(--success)]" title="Active member" />}
                  </li>
                ))}
                {members.isLoading && <li className="py-3 text-sm text-muted">Loading household…</li>}
              </ul>
            )}
          </Card>
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Your workspace</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">Keep household work, requests and important resources connected in one place.</p>
            <Link to="/my-work" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">Open My Work <ArrowRight className="size-3.5" /></Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
