import type { CurrentSummary, HistoryEvent, PeriodSummary } from "../lib/complianceHistory";
import { ComplianceTrendChart } from "./ComplianceTrendChart";

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "bad" | "accent";
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "bad"
        ? "text-rose-700"
        : tone === "accent"
          ? "text-indigo-700"
          : "text-zinc-950";

  return (
    <div className="rounded-xl border border-zinc-200/90 bg-white px-4 py-3.5 shadow-sm shadow-zinc-950/[0.03]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${valueClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function ControlStatusBar({ summary }: { summary: CurrentSummary }) {
  const total = summary.controls_passed + summary.controls_failed + summary.controls_no_data;
  if (total === 0) return null;

  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  const segments = [
    { n: summary.controls_passed, color: "bg-emerald-500", label: "Passing" },
    { n: summary.controls_failed, color: "bg-rose-500", label: "Failing" },
    { n: summary.controls_no_data, color: "bg-zinc-300", label: "No data" },
  ].filter((s) => s.n > 0);

  return (
    <div className="rounded-xl border border-zinc-200/90 bg-white px-4 py-4 shadow-sm shadow-zinc-950/[0.03]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Control status now</p>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-zinc-100">
        {segments.map((s) => (
          <div
            key={s.label}
            className={`${s.color} transition-all`}
            style={{ width: `${(s.n / total) * 100}%` }}
            title={`${s.label}: ${s.n}`}
          />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <li>
          <span className="font-semibold tabular-nums text-emerald-700">{summary.controls_passed}</span>
          <span className="text-zinc-500"> passing ({pct(summary.controls_passed)})</span>
        </li>
        <li>
          <span className="font-semibold tabular-nums text-rose-700">{summary.controls_failed}</span>
          <span className="text-zinc-500"> failing ({pct(summary.controls_failed)})</span>
        </li>
        <li>
          <span className="font-semibold tabular-nums text-zinc-600">{summary.controls_no_data}</span>
          <span className="text-zinc-500"> no data ({pct(summary.controls_no_data)})</span>
        </li>
      </ul>
    </div>
  );
}

function ChangesSparkline({ events }: { events: HistoryEvent[] }) {
  const changes = [...events]
    .reverse()
    .filter((e) => e.type !== "baseline_established")
    .slice(-12);

  if (changes.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 text-sm text-zinc-500">
        No control pass/fail flips in this window.
      </div>
    );
  }

  const max = Math.max(1, ...changes.map((e) => Math.max(e.new_failures_count, e.resolved_count)));

  return (
    <div className="rounded-xl border border-zinc-200/90 bg-white px-4 py-4 shadow-sm shadow-zinc-950/[0.03]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Control changes per snapshot
      </p>
      <div className="mt-3 flex items-end gap-1.5" style={{ height: 88 }}>
        {changes.map((e) => {
          const regH = (e.new_failures_count / max) * 72;
          const impH = (e.resolved_count / max) * 72;
          const day = new Date(e.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return (
            <div key={e.scan_run_id} className="flex min-w-0 flex-1 flex-col items-center gap-0.5" title={day}>
              <div className="flex w-full items-end justify-center gap-px" style={{ height: 72 }}>
                {e.resolved_count > 0 && (
                  <div
                    className="w-[42%] rounded-t bg-emerald-500/90"
                    style={{ height: Math.max(4, impH) }}
                  />
                )}
                {e.new_failures_count > 0 && (
                  <div
                    className="w-[42%] rounded-t bg-rose-500/90"
                    style={{ height: Math.max(4, regH) }}
                  />
                )}
                {e.new_failures_count === 0 && e.resolved_count === 0 && (
                  <div className="h-1 w-full rounded bg-zinc-200" />
                )}
              </div>
              <span className="truncate text-[9px] font-medium text-zinc-400">{day}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-4 text-[10px] text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-emerald-500" aria-hidden />
          Improved
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-rose-500" aria-hidden />
          Regressed
        </span>
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
  const score = currentScore ?? events[0]?.posture_after ?? null;
  const improved = periodSummary?.controls_improved ?? 0;
  const regressed = periodSummary?.controls_regressed ?? 0;
  const changes = periodSummary?.compliance_changes ?? events.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Posture score"
          value={score != null ? `${score}%` : "—"}
          sub="Latest successful scan"
          tone="accent"
        />
        <StatCard
          label="Failing controls"
          value={String(currentSummary?.controls_failed ?? "—")}
          sub={currentSummary ? `${currentSummary.controls_passed} passing` : undefined}
          tone={currentSummary && currentSummary.controls_failed > 0 ? "bad" : "neutral"}
        />
        <StatCard
          label="Improved"
          value={String(improved)}
          sub={`Last ${days} days`}
          tone={improved > 0 ? "good" : "neutral"}
        />
        <StatCard
          label="Regressed"
          value={String(regressed)}
          sub={`Last ${days} days`}
          tone={regressed > 0 ? "bad" : "neutral"}
        />
        <StatCard
          label="Scans"
          value={String(scanCount ?? changes)}
          sub={`${changes} posture change${changes === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {currentSummary && <ControlStatusBar summary={currentSummary} />}
        <ChangesSparkline events={events} />
      </div>

      {events.length > 0 && (
        <ComplianceTrendChart
          events={events}
          currentScore={currentScore}
          days={days}
          periodSummary={periodSummary}
          onSelectSnapshot={onSelectSnapshot}
        />
      )}

      {events.length === 0 && score != null && (
        <p className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 px-4 py-3 text-sm text-zinc-600">
          Posture held steady — {scanCount ?? 0} scan{(scanCount ?? 0) === 1 ? "" : "s"} in the last {days}{" "}
          days with no control pass/fail changes.
        </p>
      )}
    </div>
  );
}
