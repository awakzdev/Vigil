import type { PeriodSummary } from "../lib/complianceHistory";

export function HistoryPeriodSummary({ summary }: { summary: PeriodSummary | undefined }) {
  if (!summary || summary.compliance_changes === 0) return null;

  return (
    <p className="text-sm text-zinc-600">
      <span className="font-semibold tabular-nums text-zinc-900">{summary.compliance_changes}</span>{" "}
      posture change{summary.compliance_changes === 1 ? "" : "s"}
      {summary.controls_regressed > 0 && (
        <>
          {" · "}
          <span className="font-medium text-red-700">{summary.controls_regressed} regressed</span>
        </>
      )}
      {summary.controls_improved > 0 && (
        <>
          {" · "}
          <span className="font-medium text-emerald-700">{summary.controls_improved} improved</span>
        </>
      )}
    </p>
  );
}
