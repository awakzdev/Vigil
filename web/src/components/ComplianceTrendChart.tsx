import { useState } from "react";
import type { HistoryEvent, PeriodSummary } from "../lib/complianceHistory";
import type { ImpactItem } from "../lib/historyPresentation";
import { ImpactList } from "./ImpactList";

type Point = {
  date: string;
  score: number | null;
  findingsOpened: number;
  failing: number;
  scanRunId: string;
  isBaseline: boolean;
};

function buildPoints(events: HistoryEvent[]): Point[] {
  const chronological = [...events].reverse();
  return chronological.map((e) => ({
    date: e.timestamp.slice(0, 10),
    score: e.posture_after,
    findingsOpened: e.findings_opened,
    failing: e.controls_failed_after ?? e.snapshot?.controls_failed ?? 0,
    scanRunId: e.scan_run_id,
    isBaseline: e.type === "baseline_established",
  }));
}

const CHART_W = 560;
const SCORE_H = 132;
const BARS_H = 56;
const GAP = 22;
const CHART_H = SCORE_H + GAP + BARS_H;
const PAD_X = 34;
const SCORE_PAD = 10;
const Y_TICKS = [0, 50, 100];

function fmtDay(date: string): string {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildStory(events: HistoryEvent[], summary?: PeriodSummary): ImpactItem[] {
  const changeEvents = events.filter((e) => e.type !== "baseline_established");
  const findingsIntroduced = changeEvents.reduce((s, e) => s + e.findings_opened, 0);
  const findingsResolved = changeEvents.reduce((s, e) => s + e.findings_resolved, 0);
  const regressed = summary?.controls_regressed ?? changeEvents.reduce((s, e) => s + e.new_failures_count, 0);
  const improved = summary?.controls_improved ?? changeEvents.reduce((s, e) => s + e.resolved_count, 0);

  const items: ImpactItem[] = [];
  if (findingsIntroduced > 0)
    items.push({ value: findingsIntroduced, label: "findings introduced", tone: "bad", direction: "up" });
  if (regressed > 0)
    items.push({ value: regressed, label: `control${regressed === 1 ? "" : "s"} regressed`, tone: "bad", direction: "up" });
  if (improved > 0)
    items.push({ value: improved, label: `control${improved === 1 ? "" : "s"} improved`, tone: "good", direction: "down" });
  if (findingsResolved > 0)
    items.push({ value: findingsResolved, label: "findings resolved", tone: "good", direction: "down" });
  return items;
}

export function ComplianceTrendChart({
  events,
  currentScore,
  days,
  periodSummary,
  onSelectSnapshot,
}: {
  events: HistoryEvent[];
  currentScore: number | null | undefined;
  days: number;
  periodSummary?: PeriodSummary;
  onSelectSnapshot?: (scanRunId: string) => void;
}) {
  const points = buildPoints(events);
  const [hover, setHover] = useState<number | null>(null);

  const scoreVals = points.map((p) => p.score).filter((v): v is number => v != null);
  const latest = currentScore ?? scoreVals[scoreVals.length - 1] ?? null;
  const earliest = scoreVals[0] ?? null;
  const delta = earliest != null && latest != null ? latest - earliest : null;
  const story = buildStory(events, periodSummary);

  const innerW = CHART_W - PAD_X * 2;
  const xAt = (i: number) =>
    PAD_X + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yScore = (v: number) => SCORE_PAD + (SCORE_H - SCORE_PAD * 2) - (v / 100) * (SCORE_H - SCORE_PAD * 2);

  const coords = points.map((p, i) => (p.score == null ? null : { x: xAt(i), y: yScore(p.score) }));
  const line = coords.filter(Boolean).map((c) => `${c!.x},${c!.y}`).join(" ");
  const area =
    line.length > 0 ? `${xAt(0)},${SCORE_H - SCORE_PAD} ${line} ${xAt(points.length - 1)},${SCORE_H - SCORE_PAD}` : "";

  const maxFindings = Math.max(1, ...points.map((p) => p.findingsOpened));
  const barsTop = SCORE_H + GAP;
  const barW = points.length > 0 ? Math.min(34, innerW / points.length / 1.8) : 0;

  return (
    <section className="w-full rounded-2xl border border-zinc-200/90 bg-white px-5 py-5 shadow-sm shadow-zinc-950/[0.04] sm:px-6 sm:py-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
        <div className="lg:w-[300px] lg:shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Compliance change · last {days} days
          </p>
          <div className="mt-3 flex items-baseline gap-2.5">
            {earliest != null && latest != null && earliest !== latest ? (
              <span className="flex items-baseline gap-2 text-4xl font-bold tabular-nums tracking-tight">
                <span className="text-zinc-300">{earliest}%</span>
                <span className="text-2xl font-normal text-zinc-300">→</span>
                <span className={delta != null && delta < 0 ? "text-rose-700" : "text-emerald-700"}>{latest}%</span>
              </span>
            ) : (
              <span className="text-4xl font-bold tabular-nums tracking-tight text-zinc-950">
                {latest != null ? `${latest}%` : "—"}
              </span>
            )}
            {delta != null && delta !== 0 && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                  delta < 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {delta > 0 ? "+" : "−"}
                {Math.abs(delta)} pts
              </span>
            )}
          </div>

          {story.length > 0 ? (
            <div className="mt-5">
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                What drove the change
              </p>
              <ImpactList items={story} size="sm" />
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">No posture-changing events in this window.</p>
          )}
        </div>

        <div className="relative min-w-0 flex-1 border-zinc-100 lg:border-l lg:pl-6">
          {points.length >= 1 ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Score &amp; findings over time
                </p>
                {onSelectSnapshot && <p className="text-[10px] text-zinc-400">Click a point to inspect</p>}
              </div>
              <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="mt-2 w-full" style={{ height: CHART_H }}>
                <defs>
                  <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity={0} />
                  </linearGradient>
                </defs>

                {Y_TICKS.map((t) => {
                  const y = yScore(t);
                  return (
                    <g key={t}>
                      <line x1={PAD_X} x2={CHART_W - PAD_X} y1={y} y2={y} stroke="rgb(244 244 245)" strokeWidth={1} />
                      <text x={PAD_X - 6} y={y + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>
                        {t}
                      </text>
                    </g>
                  );
                })}

                {area && <polygon points={area} fill="url(#scoreFill)" />}
                {line && (
                  <polyline
                    points={line}
                    fill="none"
                    stroke="rgb(79 70 229)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {hover != null && coords[hover] && (
                  <line
                    x1={xAt(hover)}
                    x2={xAt(hover)}
                    y1={SCORE_PAD - 4}
                    y2={barsTop + BARS_H}
                    stroke="rgb(212 212 216)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                )}

                {/* findings bars */}
                <text x={PAD_X - 6} y={barsTop + 8} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>
                  {maxFindings}
                </text>
                <line x1={PAD_X} x2={CHART_W - PAD_X} y1={barsTop + BARS_H} y2={barsTop + BARS_H} stroke="rgb(228 228 231)" strokeWidth={1} />
                {points.map((p, i) => {
                  const h = (p.findingsOpened / maxFindings) * BARS_H;
                  const active = hover === i;
                  return (
                    <rect
                      key={`bar-${p.scanRunId}`}
                      x={xAt(i) - barW / 2}
                      y={barsTop + BARS_H - h}
                      width={barW}
                      height={Math.max(0, h)}
                      rx={2}
                      fill={p.isBaseline ? "rgb(212 212 216)" : "rgb(244 63 94)"}
                      opacity={active ? 1 : 0.85}
                    />
                  );
                })}

                {points.map((p, i) => {
                  const c = coords[i];
                  if (!c) return null;
                  const active = hover === i;
                  return (
                    <g key={p.scanRunId}>
                      <circle cx={c.x} cy={c.y} r={active ? 6 : 4.5} fill="white" stroke="rgb(79 70 229)" strokeWidth={2.5} />
                      <rect
                        x={xAt(i) - innerW / Math.max(1, points.length) / 2}
                        y={0}
                        width={innerW / Math.max(1, points.length)}
                        height={CHART_H}
                        fill="transparent"
                        className={onSelectSnapshot ? "cursor-pointer" : ""}
                        onMouseEnter={() => setHover(i)}
                        onMouseLeave={() => setHover((hh) => (hh === i ? null : hh))}
                        onClick={() => onSelectSnapshot?.(p.scanRunId)}
                      />
                    </g>
                  );
                })}
              </svg>

              {hover != null && points[hover] && coords[hover] && (
                <div
                  className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg shadow-zinc-950/10"
                  style={{
                    left: `calc(${(coords[hover]!.x / CHART_W) * 100}% )`,
                    top: `${(coords[hover]!.y / CHART_H) * 100}%`,
                  }}
                >
                  <p className="font-semibold text-zinc-900">{fmtDay(points[hover].date)}</p>
                  <p className="mt-1 tabular-nums text-zinc-700">
                    <span className="font-semibold text-indigo-700">{points[hover].score}%</span> score
                  </p>
                  <p className="mt-0.5 tabular-nums text-zinc-700">
                    <span className="font-semibold text-rose-600">{points[hover].findingsOpened}</span> findings opened
                  </p>
                </div>
              )}

              <div className="mt-1 flex justify-between pl-7 text-[11px] font-medium tabular-nums text-zinc-400">
                <span>{fmtDay(points[0].date)}</span>
                {points.length > 1 && <span>{fmtDay(points[points.length - 1].date)}</span>}
              </div>
              <div className="mt-2 flex items-center gap-4 pl-7 text-[10px] text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-indigo-600" aria-hidden />
                  Score %
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-rose-500" aria-hidden />
                  Findings opened
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Run more scans in this window to see posture trend.</p>
          )}
        </div>
      </div>
    </section>
  );
}
