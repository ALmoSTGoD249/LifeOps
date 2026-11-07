import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { api, type User } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Avatar, Button, Card, ErrorNote, Field, Select, Spinner } from "../components/ui";
import PriorityMatrixEditor from "../components/PriorityMatrixEditor";
import { PageHeader } from "./Placeholder";

export default function Administration() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "user" });
  const users = useQuery({ queryKey: ["users", "all"], queryFn: () => api<User[]>("/users?include_inactive=true") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  const create = useMutation({
    mutationFn: () => api<User>("/users", { method: "POST", body: form }),
    onSuccess: () => { setAdding(false); setForm({ full_name: "", email: "", password: "", role: "user" }); refresh(); },
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: Partial<Pick<User, "role" | "is_active">> }) => api<User>(`/users/${v.id}`, { method: "PATCH", body: v.body }),
    onSuccess: refresh,
  });

  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <PageHeader title="Administration" subtitle="Household members and roles." />
      <Card title="Members" action={<Button variant="primary" onClick={() => setAdding((a) => !a)}><UserPlus className="size-4" />Add member</Button>}>
        {adding && (
          <form onSubmit={submit} className="mb-6 grid gap-4 rounded-xl border border-line bg-surface2/40 p-4 sm:grid-cols-2">
            <Field label="Full name" required value={form.full_name} onChange={set("full_name")} />
            <Field label="Email" type="email" required value={form.email} onChange={set("email")} />
            <Field label="Temporary password (min 10 characters)" type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={set("password")} />
            <label className="block"><span className="mb-1.5 block text-xs font-medium text-muted">Role</span>
              <Select value={form.role} onChange={set("role")} className="h-10 w-full"><option value="user">Standard user</option><option value="admin">Admin</option></Select></label>
            {create.isError && <div className="sm:col-span-2"><ErrorNote message={(create.error as Error).message} /></div>}
            <div className="flex gap-2 sm:col-span-2"><Button type="submit" variant="primary" busy={create.isPending}>Create member</Button><Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
          </form>
        )}
        {users.isLoading ? <div className="h-24"><Spinner /></div> : users.isError ? <ErrorNote message={(users.error as Error).message} /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="pb-3 font-medium">Member</th><th className="pb-3 font-medium">Role</th><th className="pb-3 font-medium">Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {users.data!.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td className="py-3"><div className="flex items-center gap-3"><Avatar name={u.full_name} src={u.avatar_url} /><div><p>{u.full_name}{self && <span className="ml-2 text-xs text-muted">you</span>}</p><p className="text-xs text-muted">{u.email}</p></div></div></td>
                    <td className="py-3"><Select value={u.role} disabled={self} onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value } })}><option value="user">Standard user</option><option value="admin">Admin</option></Select></td>
                    <td className="py-3"><Button variant="ghost" disabled={self} onClick={() => patch.mutate({ id: u.id, body: { is_active: !u.is_active } })}>{u.is_active ? "Active" : "Deactivated"}</Button></td>
                  </tr>
                );
              })}
            </tbody></table></div>
        )}
        {patch.isError && <div className="mt-4"><ErrorNote message={(patch.error as Error).message} /></div>}
      </Card>
      <PriorityMatrixEditor />
    </div>
  );
}
