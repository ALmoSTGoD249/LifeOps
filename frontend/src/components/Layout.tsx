import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, ChevronsLeft, ChevronsRight, LogOut, Monitor, Moon, MoreHorizontal, Plus, Search, Sun, User as UserIcon, Users, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { usePrefs } from "../lib/prefs";
import { NAV } from "../nav";
import { Avatar, cx } from "./ui";

function useOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  });
  return ref;
}

function Menu({ trigger, children, align = "right" }: { trigger: (toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  return (
    <div ref={ref} className="relative">
      {trigger(() => setOpen((o) => !o))}
      {open && <div className={cx("absolute top-11 z-40 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-2xl", align === "right" ? "right-0" : "left-0")}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

const itemCls = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-surface2";
const iconBtn = "grid size-9 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-ink";

function Palette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const items = useMemo(() => NAV.filter((n) => (!n.adminOnly || user?.role === "admin") && n.label.toLowerCase().includes(q.toLowerCase())), [q, user]);
  const go = (p: string) => { nav(p); onClose(); };
  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/50 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-label="Search" className="mx-auto w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && items[0]) go(items[0].path); }} placeholder="Jump to a section" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/60" />
        </div>
        <ul className="max-h-72 overflow-auto p-1.5">
          {items.map((n) => <li key={n.path}><button className={itemCls} onClick={() => go(n.path)}><n.icon className="size-4 text-muted" />{n.label}</button></li>)}
          {!items.length && <li className="px-3 py-6 text-center text-sm text-muted">No matching section</li>}
        </ul>
        <p className="border-t border-line px-4 py-2.5 text-xs text-muted">Searching records (incidents, tasks, assets, articles) arrives in Phase 4.</p>
      </div>
    </div>
  );
}

const navGroups = [
  { label: "Workspace", paths: ["/", "/my-work"] },
  { label: "Operations", paths: ["/incidents", "/catalog", "/requests", "/tasks"] },
  { label: "Household", paths: ["/assets", "/maintenance", "/knowledge"] },
  { label: "System", paths: ["/activity", "/admin"] },
];

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { user } = useAuth();
  const visible = NAV.filter((n) => !n.adminOnly || user?.role === "admin");
  return (
    <nav className="flex-1 space-y-4 overflow-auto px-2 py-3">
      {navGroups.map((group) => {
        const items = visible.filter((n) => group.paths.includes(n.path));
        if (!items.length) return null;
        return (
          <section key={group.label} className="space-y-1">
            {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/60">{group.label}</p>}
            {items.map((n) => (
              <NavLink key={n.path} to={n.path} end={n.path === "/"} onClick={onNavigate} title={collapsed ? n.label : undefined}
                className={({ isActive }) => cx("lifeops-nav-link flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors duration-150", isActive ? "bg-surface2 text-ink shadow-[inset_2px_0_0_var(--accent)]" : "text-muted hover:bg-surface2/60", collapsed && "justify-center px-0")}>
                <n.icon className="size-[17px] shrink-0" />{!collapsed && <span>{n.label}</span>}
              </NavLink>
            ))}
          </section>
        );
      })}
    </nav>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { prefs, update } = usePrefs();
  const nav = useNavigate();
  const [palette, setPalette] = useState(false);
  const [more, setMore] = useState(false);
  const collapsed = prefs.sidebar_collapsed;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const themes = [["dark", "Dark", Moon], ["light", "Light", Sun], ["system", "System", Monitor]] as const;
  const ThemeIcon = themes.find((t) => t[0] === prefs.theme)![2];
  const quick = [["Report an incident", "/incidents?new=1"], ["Submit a request", "/catalog"], ["Create a task", "/tasks?new=1"], ["Add an asset", "/assets"], ["Schedule maintenance", "/maintenance"]] as const;
  const bottom = NAV.filter((n) => ["/", "/my-work", "/incidents", "/tasks"].includes(n.path));

  return (
    <div className="flex h-dvh bg-bg">
      <aside className={cx("hidden flex-col border-r border-line bg-surface transition-[width] duration-200 md:flex", collapsed ? "w-16" : "w-60")}>
        <div className={cx("flex h-14 items-center gap-2.5 px-4", collapsed && "justify-center px-0")}>
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-sm font-semibold text-accentfg">L</span>
          {!collapsed && <span className="font-semibold tracking-tight">LifeOps</span>}
        </div>
        <NavList collapsed={collapsed} />
        <button onClick={() => update({ sidebar_collapsed: !collapsed })} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="m-2 flex h-9 items-center justify-center gap-2 rounded-lg text-xs text-muted hover:bg-surface2 hover:text-ink">
          {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" />Collapse</>}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/75 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:px-5">
          <button onClick={() => setPalette(true)} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-muted hover:border-muted/60 sm:max-w-sm sm:flex-none sm:basis-96">
            <Search className="size-4 shrink-0" /><span className="truncate">Search</span><kbd className="ml-auto hidden rounded border border-line px-1.5 font-mono text-[10px] sm:block">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Menu trigger={(t) => <button onClick={t} aria-label="Quick create" className="grid size-9 place-items-center rounded-lg bg-accent text-accentfg hover:opacity-90"><Plus className="size-4" /></button>}>
              {(close) => quick.map(([l, p]) => <button key={p} className={itemCls} onClick={() => { nav(p); close(); }}>{l}</button>)}
            </Menu>
            <Menu trigger={(t) => <button onClick={t} aria-label="Notifications" className={iconBtn}><Bell className="size-[18px]" /></button>}>
              {() => <p className="px-3 py-8 text-center text-sm text-muted">No notifications yet. Assignments, approvals and deadlines will appear here.</p>}
            </Menu>
            <Menu trigger={(t) => <button onClick={t} aria-label="Theme" className={iconBtn}><ThemeIcon className="size-[18px]" /></button>}>
              {(close) => themes.map(([v, l, I]) => <button key={v} className={cx(itemCls, prefs.theme === v && "text-accent")} onClick={() => { update({ theme: v }); close(); }}><I className="size-4" />{l}</button>)}
            </Menu>
            <Menu trigger={(t) => <button onClick={t} aria-label="Account" className="ml-1 rounded-full"><Avatar name={user?.full_name ?? ""} src={user?.avatar_url} /></button>}>
              {(close) => (
                <>
                  <div className="px-2.5 py-2"><p className="truncate text-sm font-medium">{user?.full_name}</p><p className="truncate text-xs text-muted">{user?.email}</p></div>
                  <div className="my-1 h-px bg-line" />
                  <button className={itemCls} onClick={() => { nav("/profile"); close(); }}><UserIcon className="size-4" />Profile and password</button>
                  <button className={itemCls} onClick={() => logout()}><Users className="size-4" />Switch user</button>
                  <button className={itemCls} onClick={() => logout()}><LogOut className="size-4" />Sign out</button>
                </>
              )}
            </Menu>
          </div>
        </header>
        <main className="flex-1 overflow-auto px-4 py-6 pb-24 sm:px-8 md:pb-8"><div className="mx-auto w-full max-w-[1440px]"><Outlet /></div></main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        {bottom.map((n) => (
          <NavLink key={n.path} to={n.path} end={n.path === "/"} className={({ isActive }) => cx("flex flex-col items-center gap-1 py-2.5 text-[11px]", isActive ? "text-accent" : "text-muted")}><n.icon className="size-5" />{n.label.replace("Service ", "")}</NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted"><MoreHorizontal className="size-5" />More</button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 md:hidden" onClick={() => setMore(false)}>
          <div className="max-h-[80dvh] w-full overflow-auto rounded-t-2xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4"><span className="text-sm font-medium">Navigate</span><button aria-label="Close" onClick={() => setMore(false)} className={iconBtn}><X className="size-4" /></button></div>
            <NavList collapsed={false} onNavigate={() => setMore(false)} />
          </div>
        </div>
      )}
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  );
}
