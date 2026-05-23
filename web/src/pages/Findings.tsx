import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";

type Finding = {
  id: string;
  check_id: string;
  resource_arn: string;
  title: string;
  severity: string;
  risk_score: number;
  status: string;
  evidence: Record<string, unknown>;
  first_seen: string;
  last_seen: string;
};

const sevColor: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-700",
};

export default function Findings() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const q = useQuery({
    queryKey: ["findings", status],
    queryFn: () => api<Finding[]>(`/v1/findings?status=${status}`),
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "snooze" | "resolve" | "ignore" }) =>
      api(`/v1/findings/${id}/${action}`, {
        method: "POST",
        body: action === "snooze" ? JSON.stringify({ days: 30 }) : JSON.stringify({}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["findings"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Findings</h1>
        <select className="border rounded px-2 py-1 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="open">Open</option>
          <option value="snoozed">Snoozed</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
      </div>

      {q.isLoading && <div className="text-slate-500">Loading…</div>}
      {q.data?.length === 0 && (
        <div className="bg-white border rounded p-8 text-center text-slate-500">
          No {status} findings. Connect an account on the Accounts page to start.
        </div>
      )}

      <div className="bg-white border rounded overflow-hidden">
        {q.data?.map(f => (
          <div key={f.id} className="border-b last:border-b-0 p-4 flex items-start gap-4">
            <div className={`text-xs px-2 py-1 rounded ${sevColor[f.severity] ?? "bg-slate-100"}`}>{f.severity}</div>
            <div className="font-mono text-xs text-slate-500 w-12 text-right">{f.risk_score}</div>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{f.title}</div>
              <div className="text-xs text-slate-500 font-mono truncate">{f.resource_arn}</div>
              <div className="text-xs text-slate-400 mt-1">{f.check_id}</div>
            </div>
            <div className="flex gap-1">
              <button className="text-xs px-2 py-1 border rounded hover:bg-slate-50"
                onClick={() => act.mutate({ id: f.id, action: "snooze" })}>Snooze 30d</button>
              <button className="text-xs px-2 py-1 border rounded hover:bg-slate-50"
                onClick={() => act.mutate({ id: f.id, action: "resolve" })}>Resolve</button>
              <button className="text-xs px-2 py-1 border rounded hover:bg-slate-50"
                onClick={() => act.mutate({ id: f.id, action: "ignore" })}>Ignore</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
