import type { HistoryEvent, HistoryEventType } from "./complianceHistory";

export type EventPresentation = {
  headline: string;
  subline: string;
  tone: "regressed" | "improved" | "baseline" | "neutral";
  dotClass: string;
  cardClass: string;
};

export function eventPresentation(event: HistoryEvent): EventPresentation {
  const before = event.posture_before;
  const after = event.posture_after;

  if (event.type === "baseline_established") {
    const discovered = event.findings_discovered ?? event.findings_opened;
    return {
      headline: "Initial compliance baseline",
      subline:
        discovered > 0
          ? `${discovered} finding${discovered === 1 ? "" : "s"} at first scan`
          : "First recorded posture in this window",
      tone: "baseline",
      dotClass: "bg-zinc-400 ring-zinc-200",
      cardClass: "border-zinc-200/90 bg-zinc-50/40",
    };
  }

  if (event.type === "compliance_regressed") {
    return {
      headline: "Compliance regressed",
      subline: scoreSubline(before, after),
      tone: "regressed",
      dotClass: "bg-red-500 ring-red-100",
      cardClass: "border-red-200/80 bg-red-50/25",
    };
  }

  if (event.type === "compliance_improved") {
    return {
      headline: "Compliance improved",
      subline: scoreSubline(before, after),
      tone: "improved",
      dotClass: "bg-emerald-500 ring-emerald-100",
      cardClass: "border-emerald-200/70 bg-emerald-50/20",
    };
  }

  return {
    headline: "Posture snapshot recorded",
    subline: scoreSubline(before, after),
    tone: "neutral",
    dotClass: "bg-indigo-400 ring-indigo-100",
    cardClass: "border-zinc-200/90 bg-white",
  };
}

function scoreSubline(before: number | null, after: number | null): string {
  if (after == null) return "Control status updated";
  if (before == null) return `Score now ${after}%`;
  if (before === after) return `Score held at ${after}%`;
  return `Score ${before}% → ${after}%`;
}

export function primaryCause(event: HistoryEvent): {
  controlId: string;
  title: string;
  transition: string;
} | null {
  const fail = event.diff.newly_failed[0];
  if (fail) {
    return {
      controlId: fail.control_id,
      title: fail.title,
      transition: "PASS → FAIL",
    };
  }
  const pass = event.diff.newly_passed[0];
  if (pass) {
    return {
      controlId: pass.control_id,
      title: pass.title,
      transition: "FAIL → PASS",
    };
  }
  const top = event.top_change;
  if (top?.control_id) {
    const transition =
      top.direction === "regressed"
        ? "PASS → FAIL"
        : top.direction === "improved"
          ? "FAIL → PASS"
          : "Updated";
    return { controlId: top.control_id, title: top.title, transition };
  }
  return null;
}

export type ImpactItem = {
  value: number;
  label: string;
  tone: "bad" | "good" | "neutral";
  direction: "up" | "down" | "flat";
};

export function impactItems(event: HistoryEvent): ImpactItem[] {
  const items: ImpactItem[] = [];
  if (event.findings_opened > 0) {
    items.push({
      value: event.findings_opened,
      label: `finding${event.findings_opened === 1 ? "" : "s"} opened`,
      tone: "bad",
      direction: "up",
    });
  }
  if (event.findings_resolved > 0) {
    items.push({
      value: event.findings_resolved,
      label: `finding${event.findings_resolved === 1 ? "" : "s"} resolved`,
      tone: "good",
      direction: "down",
    });
  }
  if (event.new_failures_count > 0) {
    items.push({
      value: event.new_failures_count,
      label: `control${event.new_failures_count === 1 ? "" : "s"} regressed`,
      tone: "bad",
      direction: "up",
    });
  }
  if (event.resolved_count > 0) {
    items.push({
      value: event.resolved_count,
      label: `control${event.resolved_count === 1 ? "" : "s"} improved`,
      tone: "good",
      direction: "down",
    });
  }
  if (event.type === "baseline_established") {
    const d = event.findings_discovered ?? event.findings_opened;
    if (d > 0 && items.length === 0) {
      items.push({ value: d, label: "findings in baseline", tone: "neutral", direction: "flat" });
    }
  }
  return items;
}

export function causeSentence(event: HistoryEvent): { control: string; text: string; tone: "bad" | "good" | "neutral" } | null {
  const c = primaryCause(event);
  if (!c) return null;
  const control = `${c.title} (${c.controlId})`;
  if (c.transition === "PASS → FAIL") return { control, text: "started failing", tone: "bad" };
  if (c.transition === "FAIL → PASS") return { control, text: "now passing", tone: "good" };
  return { control, text: "changed status", tone: "neutral" };
}

export function impactLines(event: HistoryEvent): string[] {
  const lines: string[] = [];
  if (event.findings_opened > 0) {
    lines.push(`+${event.findings_opened} finding${event.findings_opened === 1 ? "" : "s"} opened`);
  }
  if (event.findings_resolved > 0) {
    lines.push(`${event.findings_resolved} finding${event.findings_resolved === 1 ? "" : "s"} resolved`);
  }
  if (event.new_failures_count > 0) {
    lines.push(
      `${event.new_failures_count} control${event.new_failures_count === 1 ? "" : "s"} regressed`,
    );
  }
  if (event.resolved_count > 0) {
    lines.push(`${event.resolved_count} control${event.resolved_count === 1 ? "" : "s"} improved`);
  }
  if (event.type === "baseline_established") {
    const d = event.findings_discovered ?? event.findings_opened;
    if (d > 0 && lines.length === 0) {
      lines.push(`${d} findings in baseline`);
    }
  }
  return lines;
}

export function eventTypeLabel(type: HistoryEventType): string {
  switch (type) {
    case "baseline_established":
      return "Baseline";
    case "compliance_regressed":
      return "Regression";
    case "compliance_improved":
      return "Improvement";
    default:
      return "Snapshot";
  }
}
