import { useState } from "react";
import { Link } from "react-router-dom";
import { frameworkLabel } from "../data/frameworks";
import { InfrastructureEventsList } from "./InfrastructureEventsList";
import { ImpactList } from "./ImpactList";
import { causeSentence, impactItems } from "../lib/historyPresentation";
import {
  type HistoryEvent,
  scanAsOfDate,
  scanDateLabel,
  downloadEvidenceForScan,
} from "../lib/complianceHistory";

// ─── sub-components ────────────────────────────────────────────────────────────

function PostureShift({ before, after }: { before: number | null; after: number | null }) {
  if (after == null) return <span className="text-zinc-500">—</span>;
  if (before == null || before === after)
    return (
      <span className="text-3xl font-bold tabular-nums tracking-tight text-zinc-950">{after}%</span>
    );
  const down = after < before;
  const pts = after - before;
  return (
    <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <span className="flex items-baseline gap-2 text-3xl font-bold tabular-nums tracking-tight">
        <span className="text-zinc-300">{before}%</span>
        <span className="text-xl font-normal text-zinc-300">→</span>
        <span className={down ? "text-rose-700" : "text-emerald-700"}>{after}%</span>
      </span>
      <span
        className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
          down ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
        }`}
      >
        {pts > 0 ? "+" : "−"}
        {Math.abs(pts)} pts
      </span>
    </span>
  );
}

function ControlChangeList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "fail" | "pass";
  items: { control_id: string; title: string; open_finding_count?: number }[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-[13px] font-semibold text-zinc-900">{title}</h4>
      <ul className="mt-2 space-y-2">
        {items.map((c) => (
          <li
            key={c.control_id}
            className="rounded-lg border border-zinc-200/80 bg-white px-3 py-2 text-sm"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-mono text-[11px] font-semibold text-zinc-500">
                {c.control_id}
              </span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wide ${
                  tone === "fail" ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {tone === "fail" ? "PASS → FAIL" : "FAIL → PASS"}
              </span>
            </div>
            <p className="mt-0.5 font-medium text-zinc-900">{c.title}</p>
            {(c.open_finding_count ?? 0) > 0 && (
              <p className="mt-0.5 text-xs text-zinc-500">
                {c.open_finding_count} open finding{c.open_finding_count === 1 ? "" : "s"}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompareRow({
  label,
  before,
  after,
  betterWhen,
}: {
  label: string;
  before: number | null | undefined;
  after: number | null | undefined;
  betterWhen: "lower" | "higher";
}) {
  const b = before ?? null;
  const a = after ?? null;
  const delta = b != null && a != null ? a - b : null;
  const improved =
    delta == null || delta === 0 ? null : betterWhen === "lower" ? delta < 0 : delta > 0;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-zinc-600">{label}</span>
      <span className="flex items-center gap-1.5 text-xs tabular-nums">
        <span className="text-zinc-400">{b ?? "—"}</span>
        <span className="text-zinc-300">→</span>
        <span className="font-semibold text-zinc-900">{a ?? "—"}</span>
        {delta != null && delta !== 0 && (
          <span
            className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              improved ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            }`}
          >
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </span>
    </div>
  );
}

// ─── main component ─────────────────────────────────────────────────────────────

export function HistorySnapshotDrawer({
  event,
  previousEvent,
  accountId,
  periodDays,
  initialTab,
  expandInfrastructure = false,
  onClose,
}: {
  event: HistoryEvent;
  previousEvent: HistoryEvent | null;
  accountId: string;
  periodDays: number;
  initialTab: "snapshot" | "compare";
  expandInfrastructure?: boolean;
  onClose: () => void;
}) {
  const canCompare = !!previousEvent;
  const [activeTab, setActiveTab] = useState<"snapshot" | "compare">(
    canCompare && initialTab === "compare" ? "compare" : "snapshot",
  );
  const [downloading, setDownloading] = useState(false);

  const snap = event.snapshot;
  const cause = causeSentence(event);
  const impacts = impactItems(event);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl"
        role="dialog"
        aria-labelledby="history-snapshot-title"
      >
        {/* Header */}
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="history-snapshot-title" className="text-lg font-semibold text-zinc-950">
              {scanDateLabel(event.timestamp)}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">{frameworkLabel(event.framework)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Tabs — only show Compare tab when there's a previous event to compare against */}
        {canCompare && (
          <div className="flex shrink-0 border-b border-zinc-100">
            {(["snapshot", "compare"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-2.5 text-[13px] font-semibold transition ${
                  activeTab === tab
                    ? "border-b-2 border-indigo-600 text-indigo-700"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {tab === "snapshot" ? "Snapshot" : `Compare to ${new Date(previousEvent!.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* ── Snapshot tab ─────────────────────────────────────────────── */}
          {activeTab === "snapshot" && (
            <>
              {event.type !== "baseline_established" ? (
                <PostureShift before={event.posture_before} after={event.posture_after} />
              ) : (
                <p className="text-3xl font-bold tabular-nums tracking-tight text-zinc-950">
                  {event.posture_after != null ? `${event.posture_after}%` : "—"}
                </p>
              )}

              {cause && event.type !== "baseline_established" && (
                <p className="mt-3 text-base leading-snug text-zinc-900">
                  <span className="font-semibold">{cause.control}</span>{" "}
                  <span
                    className={
                      cause.tone === "bad"
                        ? "text-rose-600"
                        : cause.tone === "good"
                          ? "text-emerald-600"
                          : "text-zinc-500"
                    }
                  >
                    {cause.text}
                  </span>
                </p>
              )}

              {event.type === "baseline_established" && (
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  First recorded posture for this framework in the selected window.
                </p>
              )}

              {impacts.length > 0 && (
                <div className="mt-5">
                  <ImpactList items={impacts} size="sm" />
                </div>
              )}

              {/* Control flips */}
              {event.type !== "baseline_established" &&
                (event.diff.newly_failed.length > 0 || event.diff.newly_passed.length > 0) && (
                  <div className="mt-6 space-y-4 border-t border-zinc-100 pt-5">
                    <ControlChangeList
                      title="Controls that failed"
                      tone="fail"
                      items={event.diff.newly_failed}
                    />
                    <ControlChangeList
                      title="Controls that passed"
                      tone="pass"
                      items={event.diff.newly_passed}
                    />
                  </div>
                )}

              {/* Snapshot totals */}
              <div className="mt-6 border-t border-zinc-100 pt-5">
                <p className="text-sm leading-relaxed text-zinc-500">
                  <span className="font-semibold tabular-nums text-zinc-900">
                    {snap?.controls_passed ?? "—"}
                  </span>{" "}
                  passing
                  <span className="mx-1.5 text-zinc-300">·</span>
                  <span className="font-semibold tabular-nums text-zinc-900">
                    {snap?.controls_failed ?? "—"}
                  </span>{" "}
                  failing
                  <span className="mx-1.5 text-zinc-300">·</span>
                  <span className="font-semibold tabular-nums text-zinc-900">
                    {snap?.controls_no_data ?? "—"}
                  </span>{" "}
                  no data
                  {event.type === "baseline_established" ? (
                    <>
                      <span className="mx-1.5 text-zinc-300">·</span>
                      <span className="font-semibold tabular-nums text-zinc-900">
                        {event.findings_discovered ?? event.findings_opened}
                      </span>{" "}
                      open findings in baseline
                    </>
                  ) : (
                    <>
                      <span className="mx-1.5 text-zinc-300">·</span>
                      <span className="font-semibold tabular-nums text-zinc-900">
                        {snap?.findings_opened ?? event.findings_opened}
                      </span>{" "}
                      findings opened this scan
                    </>
                  )}
                </p>
              </div>

              {(event.infrastructure_events_count ?? 0) > 0 &&
                event.type !== "baseline_established" && (
                  <details className="mt-4 rounded-lg border border-zinc-200/80 bg-zinc-50/40 px-3 py-2" open={expandInfrastructure}>
                    <summary className="cursor-pointer text-[12px] font-semibold text-zinc-600">
                      Technical CloudTrail context ({event.infrastructure_events_count})
                    </summary>
                    <div className="mt-2">
                      <InfrastructureEventsList
                        accountId={accountId}
                        onDate={scanAsOfDate(event.timestamp)}
                        count={event.infrastructure_events_count ?? 0}
                        defaultExpanded
                      />
                    </div>
                  </details>
                )}
            </>
          )}

          {/* ── Compare tab ──────────────────────────────────────────────── */}
          {activeTab === "compare" && previousEvent && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-zinc-700">
                  {new Date(previousEvent.timestamp).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                  <span className="mx-2 font-normal text-zinc-400">→</span>
                  {scanDateLabel(event.timestamp)}
                </p>
              </div>

              {/* Metrics comparison grid */}
              <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 px-4 py-1 divide-y divide-zinc-100">
                <CompareRow
                  label="Score"
                  before={previousEvent.posture_after}
                  after={event.posture_after}
                  betterWhen="higher"
                />
                <CompareRow
                  label="Passing controls"
                  before={previousEvent.snapshot?.controls_passed}
                  after={event.snapshot?.controls_passed}
                  betterWhen="higher"
                />
                <CompareRow
                  label="Failing controls"
                  before={previousEvent.snapshot?.controls_failed}
                  after={event.snapshot?.controls_failed}
                  betterWhen="lower"
                />
                <CompareRow
                  label="No data"
                  before={previousEvent.snapshot?.controls_no_data}
                  after={event.snapshot?.controls_no_data}
                  betterWhen="lower"
                />
                <CompareRow
                  label="Findings opened"
                  before={previousEvent.findings_opened}
                  after={event.findings_opened}
                  betterWhen="lower"
                />
                <CompareRow
                  label="Findings resolved"
                  before={previousEvent.findings_resolved}
                  after={event.findings_resolved}
                  betterWhen="higher"
                />
              </div>

              {/* Controls that changed in the current event */}
              {(event.diff.newly_failed.length > 0 || event.diff.newly_passed.length > 0) && (
                <div className="space-y-4 border-t border-zinc-100 pt-2">
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-400">
                    Changes in this scan
                  </p>
                  <ControlChangeList
                    title="Controls that failed"
                    tone="fail"
                    items={event.diff.newly_failed}
                  />
                  <ControlChangeList
                    title="Controls that passed"
                    tone="pass"
                    items={event.diff.newly_passed}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer: download */}
        <div className="shrink-0 border-t border-zinc-100 px-5 py-4">
          <button
            type="button"
            disabled={downloading}
            onClick={() => {
              setDownloading(true);
              void downloadEvidenceForScan(
                accountId,
                event.framework,
                event.timestamp,
                periodDays,
              ).finally(() => setDownloading(false));
            }}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {downloading ? "Generating…" : "Download Audit Package"}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Evidence as of {scanAsOfDate(event.timestamp)}. Rolling packs on{" "}
            <Link to="/controls" className="font-medium text-indigo-600 hover:text-indigo-800">
              Compliance
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
