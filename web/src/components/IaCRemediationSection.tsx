import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { drawerPanel } from "./drawerStyles";

type IaCResponse = {
  iac_status: string;
  reason?: string;
  terraform?: string | null;
  cloudformation?: string | null;
  cli?: string[];
  hints?: string[];
  pr_automation?: { available: boolean; note: string };
};

type PreviewResponse = {
  status: string;
  message?: string;
  action?: string;
  suggested_hcl?: string;
};

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-600">{label}</span>
        <button
          type="button"
          className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
          onClick={() => {
            void navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-100">
        {text}
      </pre>
    </div>
  );
}

export function IaCRemediationSection({
  findingId,
  checkId,
  bucketName,
}: {
  findingId: string;
  checkId: string;
  bucketName?: string;
}) {
  const [tfPaste, setTfPaste] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["iac-snippets", findingId],
    queryFn: () => api<IaCResponse>(`/v1/findings/${findingId}/iac-snippets`),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      api<PreviewResponse>("/v1/iac/terraform/preview-patch", {
        method: "POST",
        body: JSON.stringify({
          check_id: checkId,
          bucket_name: bucketName,
          files: [{ path: "main.tf", content: tfPaste }],
        }),
      }),
    onSuccess: (res) => setPreview(res),
  });

  if (isLoading) {
    return (
      <div className={`${drawerPanel} px-4 py-3 text-[13px] text-zinc-500`}>Loading IaC snippets…</div>
    );
  }
  if (error || !data) return null;

  const canPreview =
    data.pr_automation?.available &&
    checkId === "s3.bucket.public_access_not_blocked" &&
    bucketName;

  return (
    <div className={`${drawerPanel} overflow-hidden shadow-sm`}>
      <div className="border-b border-zinc-100 bg-gradient-to-r from-zinc-50/90 to-white px-4 py-3">
        <h3 className="text-[13px] font-semibold text-zinc-900">Infrastructure as Code</h3>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Deterministic snippets — copy into your repo. PR automation requires human review.
        </p>
      </div>
      <div className="space-y-3 px-4 py-3.5">
        {data.iac_status !== "iac_snippets" && (
          <p className="text-[13px] text-zinc-600">{data.reason}</p>
        )}
        {data.terraform && <CopyBlock label="Terraform" text={data.terraform} />}
        {data.cli && data.cli.length > 0 && (
          <CopyBlock label="AWS CLI" text={data.cli.join("\n")} />
        )}
        {data.hints?.map((h) => (
          <p key={h} className="text-[11px] text-zinc-500">
            {h}
          </p>
        ))}
        {data.pr_automation?.note && (
          <p className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900">
            {data.pr_automation.note}
          </p>
        )}

        {canPreview && (
          <div className="border-t border-zinc-100 pt-3">
            <p className="text-[12px] font-medium text-zinc-800">Match your Terraform (preview)</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Paste a .tf file that may contain the bucket resource. Vigil will suggest create vs update.
            </p>
            <textarea
              value={tfPaste}
              onChange={(e) => setTfPaste(e.target.value)}
              rows={6}
              className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-[11px] text-zinc-800"
              placeholder={'resource "aws_s3_bucket" "logs" { ... }'}
            />
            <button
              type="button"
              disabled={!tfPaste.trim() || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
              className="mt-2 rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            >
              {previewMutation.isPending ? "Parsing…" : "Preview patch"}
            </button>
            {preview?.suggested_hcl && (
              <CopyBlock label={`Patch (${preview.status})`} text={preview.suggested_hcl} />
            )}
            {preview?.message && !preview.suggested_hcl && (
              <p className="mt-2 text-[12px] text-zinc-600">{preview.message}</p>
            )}
            {preview?.action && (
              <p className="mt-1 text-[11px] text-zinc-500">{preview.action}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
