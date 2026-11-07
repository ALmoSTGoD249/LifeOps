import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, setCsrf, type Session, type User } from "./api";

type Ctx = { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void> };
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["session"],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      try {
        const s = await api<Session>("/auth/me");
        setCsrf(s.csrf_token);
        return s.user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });

  const login = async (email: string, password: string) => {
    const s = await api<Session>("/auth/login", { method: "POST", body: { email, password } });
    setCsrf(s.csrf_token);
    qc.clear();
    qc.setQueryData(["session"], s.user);
  };
  const logout = async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch { /* session may already be gone */ }
    setCsrf("");
    qc.clear();
    qc.setQueryData(["session"], null);
  };

  return <AuthCtx.Provider value={{ user: q.data ?? null, loading: q.isLoading, login, logout }}>{children}</AuthCtx.Provider>;
}
