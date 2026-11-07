import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { Button, ErrorNote, Field } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try { await login(email.trim(), password); }
    catch (err) { setError(err instanceof Error ? err.message : "Login failed"); }
    finally { setBusy(false); }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-accent font-semibold text-accentfg">L</div>
          <h1 className="text-2xl font-semibold tracking-tight">LifeOps</h1>
          <p className="mt-1.5 text-sm text-muted">Our Dreams. Our life. Under control.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-surface p-6">
          <Field label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <ErrorNote message={error} />}
          <Button type="submit" variant="primary" busy={busy} className="w-full">Sign in</Button>
        </form>
      </div>
    </main>
  );
}
