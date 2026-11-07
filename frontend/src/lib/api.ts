let csrf = "";
export const setCsrf = (t: string) => { csrf = t; };

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) { super(message); }
}

export type User = { id: string; email: string; full_name: string; avatar_url: string | null; is_active: boolean; role: "admin" | "user" | string };
export type Session = { user: User; csrf_token: string };
export type Prefs = { theme: "dark" | "light" | "system"; sidebar_collapsed: boolean; dashboard_widgets: Record<string, boolean> };

function detail(d: unknown): string {
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && !Array.isArray(d) && "form_errors" in d) return "Please fix the highlighted fields";
  if (Array.isArray(d)) return d.map((e) => (e?.msg ? String(e.msg).replace(/^Value error, /, "") : "Invalid input")).join("; ");
  return "Something went wrong";
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = csrf;
  let res: Response;
  try {
    res = await fetch("/api" + path, { method, headers, credentials: "same-origin", body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, detail(data?.detail), data?.detail?.form_errors);
  return data as T;
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  let res: Response;
  try { res = await fetch("/api" + path, { method: "POST", headers: { "X-CSRF-Token": csrf }, credentials: "same-origin", body: fd }); }
  catch { throw new ApiError(0, "Cannot reach the server. Check your connection."); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, detail(data?.detail));
  return data as T;
}
