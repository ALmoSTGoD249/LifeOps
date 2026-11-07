import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type User } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, ErrorNote, Field } from "../components/ui";
import { PageHeader } from "./Placeholder";

export default function Profile() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(user?.full_name ?? "");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [saved, setSaved] = useState("");

  const save = useMutation({
    mutationFn: () => api<User>("/users/me", { method: "PATCH", body: { full_name: name.trim() } }),
    onSuccess: (u) => { qc.setQueryData(["session"], u); qc.invalidateQueries({ queryKey: ["users"] }); setSaved("Profile updated"); },
  });
  const pw = useMutation({
    mutationFn: () => api("/auth/change-password", { method: "POST", body: { current_password: cur, new_password: next } }),
    onSuccess: () => { setCur(""); setNext(""); setSaved("Password changed. Other devices were signed out."); },
  });
  const onProfile = (e: FormEvent) => { e.preventDefault(); setSaved(""); save.mutate(); };
  const onPw = (e: FormEvent) => { e.preventDefault(); setSaved(""); pw.mutate(); };

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="Profile" subtitle={user?.email} />
      {saved && <p role="status" className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">{saved}</p>}
      <Card title="Details">
        <form onSubmit={onProfile} className="space-y-4">
          <Field label="Full name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          {save.isError && <ErrorNote message={(save.error as Error).message} />}
          <Button type="submit" variant="primary" busy={save.isPending}>Save</Button>
        </form>
      </Card>
      <Card title="Change password">
        <form onSubmit={onPw} className="space-y-4">
          <Field label="Current password" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
          <Field label="New password (min 10 characters)" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
          {pw.isError && <ErrorNote message={(pw.error as Error).message} />}
          <Button type="submit" variant="primary" busy={pw.isPending}>Change password</Button>
        </form>
      </Card>
      <Button variant="ghost" onClick={() => logout()}>Sign out</Button>
    </div>
  );
}
