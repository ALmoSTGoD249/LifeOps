import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Prefs } from "./api";

const DEFAULTS: Prefs = { theme: "dark", sidebar_collapsed: false, dashboard_widgets: {} };

export function applyTheme(t: Prefs["theme"]) {
  const resolved = t === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : t;
  document.documentElement.dataset.theme = resolved;
  try { localStorage.setItem("lifeops-theme", t); } catch { /* storage unavailable */ }
}

export function usePrefs() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["prefs"], queryFn: () => api<Prefs>("/users/me/preferences") });
  const prefs = q.data ?? DEFAULTS;
  useEffect(() => { if (q.data) applyTheme(q.data.theme); }, [q.data]);
  const m = useMutation({
    mutationFn: (next: Prefs) => api<Prefs>("/users/me/preferences", { method: "PUT", body: next }),
    onMutate: (next) => { qc.setQueryData(["prefs"], next); applyTheme(next.theme); },
    onError: () => qc.invalidateQueries({ queryKey: ["prefs"] }),
  });
  return { prefs, update: (patch: Partial<Prefs>) => m.mutate({ ...prefs, ...patch }) };
}
