import type { CurrentSummary, HistoryEvent, PeriodSummary } from "../lib/complianceHistory";
import { ComplianceTrendChart } from "./ComplianceTrendChart";

function ControlStatusRow({ summary }: { summary: CurrentSummary }) {
  const total = summary.controls_passed + summary.controls_failed + summary.controls_no_data;
  if (total === 0) return null;

  const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;

  return (
    <div className="rounded-xl border border-zinc-200/90 bg-white px-4 py-3.5 shadow-sm shadow-zinc-950/[0.03]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Current control status
      </p>

      {/* Bar */}
      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
        {summary.controls_passed > 0 && (
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${(summary.controls_passed / total) * 100}%` }}
            title={`Passing: ${summary.controls_passed}`}
          />
        )}
        {summary.controls_failed > 0 && (
          <div
            className="bg-rose-500 transition-all"
            style={{ width: `${(summary.controls_failed / total) * 100}%` }}
            title={`Failing: ${summary.controls_failed}`}
          />
        )}
        {summary.controls_no_data > 0 && (
          <div
            className="bg-zinc-300 transition-all"
            style={{ width: `${(summary.controls_no_data / total) * 100}%` }}
            title={`No data: ${summary.controls_no_data}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span>
          <span className="font-semibold tabular-nums text-emerald-700">{summary.controls_passed}</span>
          <span className="text-zinc-500"> passing ({pct(summary.controls_passed)})</span>
        </span>
        <span>
          <span className="font-semibold tabular-nums text-rose-700">{summary.controls_failed}</span>
          <span className="text-zinc-500"> failing ({pct(summary.controls_failed)})</span>
        </span>
        {summary.controls_no_data > 0 && (
          <span>
            <span className="font-semibold tabular-nums text-zinc-500">{summary.controls_no_data}</span>
            <span className="text-zinc-400"> no data ({pct(summary.controls_no_data)})</span>
          </span>
        )}
      </div>
    </div>
  );
}

export function HistoryDashboard({
  events,
  days,
  currentScore,
  currentSummary,
  periodSummary,
  scanCount,
  onSelectSnapshot,
}: {
  events: HistoryEvent[];
  days: number;
  currentScore: number | null | undefined;
  currentSummary?: CurrentSummary | null;
  periodSummary?: PeriodSummary;
  scanCount?: number;
  onSelectSnapshot?: (scanRunId: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Trend chart — hero element. Score movement + story + clickable points */}
      {events.length > 0 && (
        <ComplianceTrendChart
          events={events}
          currentScore={currentScore}
          days={days}
          periodSummary={periodSummary}
          onSelectSnapshot={onSelectSnapshot}
        />
      )}

      {events.length === 0 && currentScore != null && (
        <div className="rounded-2xl border border-zinc-200/90 bg-white px-5 py-5 shadow-sm shadow-zinc-950/[0.04]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Compliance posture
          </p>
          <p className="mt-3 text-4xl font-bold tabular-nums tracking-tight text-zinc-950">
            {currentScore}%
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Posture held steady — {scanCount ?? 0} scan{(scanCount ?? 0) === 1 ? "" : "s"} in the last {days} days
            with no control pass/fail changes.
          </p>
        </div>
      )}

      {/* Control status — compact, below the chart */}
      {currentSummary && <ControlStatusRow summary={currentSummary} />}
    </div>
  );
}
