import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

export function cx(...c: (string | false | undefined | null)[]) { return c.filter(Boolean).join(" "); }

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "subtle"; busy?: boolean };
export function Button({ variant = "subtle", busy, className, children, disabled, ...p }: BtnProps) {
  const v = {
    primary: "bg-accent text-accentfg hover:opacity-90",
    subtle: "bg-surface2 text-ink border border-line hover:border-muted/60",
    ghost: "text-muted hover:text-ink hover:bg-surface2",
  }[variant];
  return (
    <button {...p} disabled={disabled || busy} className={cx("inline-flex items-center justify-center gap-2 rounded-lg px-3.5 h-9 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none", v, className)}>
      {busy && <Loader2 className="size-4 animate-spin" />}{children}
    </button>
  );
}

export function Field({ label, error, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <input {...p} className="h-10 w-full rounded-lg border border-line bg-surface2 px-3 text-sm text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none" />
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx("h-9 rounded-lg border border-line bg-surface2 px-2 text-sm text-ink focus:border-accent focus:outline-none disabled:opacity-50", p.className)} />;
}

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface", className)}>
      {title && <header className="flex items-center justify-between border-b border-line px-5 py-3"><h2 className="text-sm font-medium">{title}</h2>{action}</header>}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  return src
    ? <img src={src} alt="" style={{ width: size, height: size }} className="rounded-full object-cover" />
    : <span style={{ width: size, height: size, fontSize: size * 0.38 }} className="grid shrink-0 place-items-center rounded-full bg-accent/15 font-medium text-accent">{initials || "?"}</span>;
}

export function EmptyState({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-xl border border-line bg-surface2 text-muted"><Icon className="size-5" /></span>
      <h3 className="text-base font-medium">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{text}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function Spinner() { return <div className="grid h-full place-items-center"><Loader2 className="size-5 animate-spin text-muted" /></div>; }
export function ErrorNote({ message }: { message: string }) { return <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{message}</p>; }

import { useEffect } from "react";
import type { TextareaHTMLAttributes } from "react";
import { X } from "lucide-react";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()} className={cx("max-h-[92dvh] w-full overflow-auto", wide ? "max-w-3xl" : "max-w-xl") + "  rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl"}>
        <header className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-5 py-3.5"><h2 className="text-sm font-medium">{title}</h2><button aria-label="Close" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface2"><X className="size-4" /></button></header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function TextArea({ label, error, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <textarea {...p} className="min-h-24 w-full rounded-lg border border-line bg-surface2 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none" />
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

export function SelectField({ label, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <Select {...p} className="h-10 w-full">{children}</Select>
    </label>
  );
}
