import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { LEVEL_LABEL, PRIORITY_LABEL, useMeta } from "../lib/incidents";
import { Button, Card, ErrorNote, Select } from "./ui";

export default function PriorityMatrixEditor() {
  const qc = useQueryClient();
  const meta = useMeta().data;
  const [grid, setGrid] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (meta) setGrid(Object.fromEntries(meta.priority_matrix.map((m) => [`${m.impact}-${m.urgency}`, m.priority]))); }, [meta]);
  const save = useMutation({
    mutationFn: () => api("/admin/priority-matrix", { method: "PUT", body: Object.entries(grid).map(([k, priority]) => { const [impact, urgency] = k.split("-").map(Number); return { impact, urgency, priority }; }) }),
    onSuccess: () => { setSaved(true); qc.invalidateQueries({ queryKey: ["incident-meta"] }); },
  });
  return (
    <Card title="Incident priority matrix">
      <p className="mb-4 text-sm text-muted">Priority is calculated from impact and urgency. Changes apply to incidents created or edited from now on; existing priorities are left as they are.</p>
      <div className="overflow-x-auto"><table className="text-sm"><thead><tr><th className="p-2 text-left text-xs font-medium text-muted">Impact \ Urgency</th>{[1, 2, 3].map((u) => <th key={u} className="p-2 text-xs font-medium text-muted">{LEVEL_LABEL[u]}</th>)}</tr></thead>
        <tbody>{[1, 2, 3].map((i) => <tr key={i}><th className="p-2 text-left text-xs font-medium text-muted">{LEVEL_LABEL[i]}</th>{[1, 2, 3].map((u) => (
          <td key={u} className="p-1.5"><Select aria-label={`Impact ${LEVEL_LABEL[i]}, urgency ${LEVEL_LABEL[u]}`} value={grid[`${i}-${u}`] ?? 3} onChange={(e) => { setSaved(false); setGrid({ ...grid, [`${i}-${u}`]: Number(e.target.value) }); }}>
            {[1, 2, 3, 4].map((p) => <option key={p} value={p}>P{p} {PRIORITY_LABEL[p]}</option>)}</Select></td>))}</tr>)}</tbody></table></div>
      {save.isError && <div className="mt-4"><ErrorNote message={(save.error as Error).message} /></div>}
      <div className="mt-4 flex items-center gap-3"><Button variant="primary" busy={save.isPending} onClick={() => save.mutate()}>Save matrix</Button>{saved && <span role="status" className="text-sm text-accent">Saved</span>}</div>
    </Card>
  );
}
