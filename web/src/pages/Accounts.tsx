import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";

type Account = {
  id: string;
  label: string;
  account_id: string | null;
  status: string;
  external_id: string;
  cfn_launch_url: string;
};

export default function Accounts() {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api<Account[]>("/v1/accounts") });
  const [label, setLabel] = useState("prod");
  const [roleArn, setRoleArn] = useState("");

  const create = useMutation({
    mutationFn: () => api<Account>("/v1/accounts", { method: "POST", body: JSON.stringify({ label }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
  const verify = useMutation({
    mutationFn: (id: string) => api<Account>(`/v1/accounts/${id}/verify`, { method: "POST", body: JSON.stringify({ role_arn: roleArn }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
  const scan = useMutation({
    mutationFn: (id: string) => api(`/v1/accounts/${id}/scan`, { method: "POST" }),
  });

  const acc = accounts.data?.[0];

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">AWS Account</h1>

      {!acc && (
        <div className="bg-white border rounded p-4 space-y-3">
          <p className="text-sm text-slate-600">Connect your AWS account. Read-only.</p>
          <input className="w-full border rounded px-3 py-2" value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (e.g. prod)" />
          <button onClick={() => create.mutate()} className="bg-slate-900 text-white rounded px-4 py-2">Create</button>
        </div>
      )}

      {acc && (
        <div className="bg-white border rounded p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="font-medium">{acc.label}</div>
            <span className={`text-xs px-2 py-1 rounded ${acc.status === "connected" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {acc.status}
            </span>
            {acc.account_id && <span className="text-sm text-slate-500">AWS {acc.account_id}</span>}
          </div>

          {acc.status !== "connected" && (
            <>
              <ol className="text-sm space-y-2 list-decimal list-inside">
                <li>
                  <a href={acc.cfn_launch_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                    Launch CloudFormation stack
                  </a> in your AWS console.
                </li>
                <li>Copy the <code>RoleArn</code> output and paste below.</li>
                <li>We verify with <code>sts:AssumeRole</code>.</li>
              </ol>
              <div className="text-xs text-slate-500">
                ExternalId: <code>{acc.external_id}</code>
              </div>
              <div className="flex gap-2">
                <input className="flex-1 border rounded px-3 py-2 font-mono text-sm"
                  placeholder="arn:aws:iam::123456789012:role/CloudHygieneReadOnly"
                  value={roleArn} onChange={e => setRoleArn(e.target.value)} />
                <button onClick={() => verify.mutate(acc.id)} className="bg-slate-900 text-white rounded px-4 py-2">Verify</button>
              </div>
              {verify.error && <div className="text-sm text-red-600">{(verify.error as Error).message}</div>}
            </>
          )}

          {acc.status === "connected" && (
            <button onClick={() => scan.mutate(acc.id)} className="bg-slate-900 text-white rounded px-4 py-2">
              {scan.isPending ? "Triggering…" : "Run scan now"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
