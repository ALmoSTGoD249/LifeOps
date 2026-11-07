import { useRef, useState } from "react";
import { Bold, Code, Heading2, Italic, Link2, List } from "lucide-react";
import Markdown from "./Markdown";
import { cx } from "./ui";

type Fmt = "bold" | "italic" | "heading" | "list" | "link" | "code";

export default function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function apply(kind: Fmt) {
    const el = ref.current; if (!el) return;
    const [s, e] = [el.selectionStart, el.selectionEnd];
    const sel = value.slice(s, e);
    const wrap = (l: string, r = l, ph = "text") => ({ text: l + (sel || ph) + r, from: s + l.length, to: s + l.length + (sel || ph).length });
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    let out: { text: string; from: number; to: number };
    let start = s, end = e;
    if (kind === "bold") out = wrap("**");
    else if (kind === "italic") out = wrap("_");
    else if (kind === "code") out = wrap("`");
    else if (kind === "link") { out = wrap("[", "](https://)", "link text"); }
    else { const prefix = kind === "heading" ? "## " : "- "; start = lineStart; end = lineStart; out = { text: prefix, from: s + prefix.length, to: e + prefix.length }; }
    onChange(value.slice(0, start) + out.text + value.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(out.from, out.to); });
  }
  const tools: [Fmt, typeof Bold, string][] = [["heading", Heading2, "Heading"], ["bold", Bold, "Bold"], ["italic", Italic, "Italic"], ["list", List, "List"], ["link", Link2, "Link"], ["code", Code, "Code"]];

  return (
    <div className="rounded-xl border border-line bg-surface2/40">
      <div className="flex items-center justify-between border-b border-line px-2 py-1.5">
        <div className="flex gap-0.5">{tools.map(([k, I, l]) => <button key={k} type="button" aria-label={l} title={l} disabled={preview} onClick={() => apply(k)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-ink disabled:opacity-30"><I className="size-4" /></button>)}</div>
        <div className="flex gap-1 text-xs">{[false, true].map((p) => <button key={String(p)} type="button" onClick={() => setPreview(p)} className={cx("rounded-md px-2.5 py-1", preview === p ? "bg-surface2 text-ink" : "text-muted hover:text-ink")}>{p ? "Preview" : "Write"}</button>)}</div>
      </div>
      {preview ? <div className="min-h-64 p-4">{value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted">Nothing to preview yet.</p>}</div>
        : <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} maxLength={100000} aria-label="Article body" placeholder="Write in Markdown: ## headings, **bold**, lists, links" className="min-h-64 w-full resize-y bg-transparent p-4 font-mono text-sm focus:outline-none" />}
    </div>
  );
}
