import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

interface Account {
  id: string;
  label: string;
  account_id: string | null;
  status: string;
}

interface TimelineEvent {
  type: "cloudtrail";
  event_id: string;
  event_name: string;
  event_source: string;
  event_time: string;
  actor: string | null;
  source_ip: string | null;
  resources: { type: string | null; name: string | null }[];
}

interface TimelineMeta {
  cloudtrail_logging: boolean;
  trail_count: number;
  events_in_account: number;
  last_scan_at: string | null;
}

interface TimelineResponse {
  events: TimelineEvent[];
  total: number;
  meta?: TimelineMeta;
}

type ServiceFilter = "all" | "IAM" | "S3" | "Network" | "KMS" | "Other";

const TIMELINE_WINDOWS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
] as const;

const SERVICE_OPTIONS: { value: ServiceFilter; label: string }[] = [
  { value: "all", label: "All services" },
  { value: "IAM", label: "IAM" },
  { value: "S3", label: "S3" },
  { value: "Network", label: "Network" },
  { value: "KMS", label: "KMS" },
  { value: "Other", label: "Other" },
];

const selectClass =
  "h-[42px] appearance-none rounded-xl border border-zinc-200 bg-white pl-3 pr-8 text-sm font-semibold text-zinc-600 shadow-sm shadow-zinc-950/[0.03] outline-none transition hover:border-zinc-300 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20";

function emptyTimelineCopy(meta: TimelineMeta | undefined, days: number) {
  if (!meta?.last_scan_at) {
    return {
      title: "No events yet",
      body: "Run a scan to pull infrastructure write events from CloudTrail.",
    };
  }
  if (meta.events_in_account === 0 && !meta.cloudtrail_logging) {
    return {
      title: "CloudTrail is not logging",
      body: "Enable a multi-region trail so API changes are recorded.",
      hint: "Fix the CloudTrail finding, then re-scan.",
    };
  }
  if (meta.events_in_account === 0) {
    return {
      title: "No infrastructure changes found",
      body: "No tracked write events in the last 90 days.",
    };
  }
  return {
    title: "Nothing in this window",
    body: `No events in the last ${days} days. Try a longer window or clear filters.`,
  };
}

function fmtTimeOnly(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function fmtDateHeader(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function serviceCategory(source: string, eventName: string): ServiceFilter {
  const s = source.replace(".amazonaws.com", "").toLowerCase();
  if (s === "iam") return "IAM";
  if (s === "s3") return "S3";
  if (s === "kms") return "KMS";
  if (s === "ec2" || /securitygroup/i.test(eventName)) return "Network";
  return "Other";
}

function serviceBadgeClass(category: ServiceFilter): string {
  switch (category) {
    case "IAM":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "S3":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "Network":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "KMS":
      return "border-indigo-200 bg-indigo-50 text-indigo-800";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
  }
}

function shortActor(actor: string | null): string | null {
  if (!actor) return null;
  const tail = actor.split("/").pop() || actor;
  return tail.length > 48 ? `${tail.slice(0, 45)}…` : tail;
}

function primaryResource(evt: TimelineEvent): string | null {
  const names = evt.resources.map((r) => r.name || r.type || "").filter(Boolean);
  if (names.length === 0) return null;
  const first = names[0];
  return first.length > 56 ? `${first.slice(0, 53)}…` : first;
}

function groupByDate(events: TimelineEvent[]): [string, TimelineEvent[]][] {
  const map = new Map<string, TimelineEvent[]>();
  for (const evt of events) {
    const key = dateKey(evt.event_time);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(evt);
  }
  return Array.from(map.entries());
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 flex-shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function EventRow({ evt }: { evt: TimelineEvent }) {
  const [open, setOpen] = useState(false);
  const category = serviceCategory(evt.event_source, evt.event_name);
  const actor = shortActor(evt.actor);
  const resource = primaryResource(evt);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm shadow-zinc-950/[0.03] transition hover:border-zinc-300 hover:shadow-md">
      <button
        type="button"
        className="flex w-full items-center gap-4 px-4 py-3.5 text-left sm:px-5"
        onClick={() => setOpen(!open)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900">{evt.event_name}</span>
            <span
              className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${serviceBadgeClass(category)}`}
            >
              {category}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {[actor, resource].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>

        <p className="hidden shrink-0 text-sm font-medium tabular-nums text-zinc-700 sm:block">
          {fmtTimeOnly(evt.event_time)}
        </p>

        <Chevron open={open} />
      </button>

      <div className="px-4 pb-3 sm:hidden">
        <p className="text-xs tabular-nums text-zinc-500">{fmtTimeOnly(evt.event_time)}</p>
      </div>

      {open && (
        <div className="border-t border-zinc-100 px-4 py-4 sm:px-5">
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <p className="font-medium uppercase tracking-wide text-zinc-400">Event time</p>
              <p className="mt-0.5 font-mono text-zinc-700">{evt.event_time}</p>
            </div>
            <div>
              <p className="font-medium uppercase tracking-wide text-zinc-400">Event source</p>
              <p className="mt-0.5 font-mono text-zinc-700">{evt.event_source}</p>
            </div>
            {evt.actor && (
              <div className="sm:col-span-2">
                <p className="font-medium uppercase tracking-wide text-zinc-400">Actor</p>
                <p className="mt-0.5 break-all font-mono text-zinc-700">{evt.actor}</p>
              </div>
            )}
            {evt.source_ip && (
              <div>
                <p className="font-medium uppercase tracking-wide text-zinc-400">Source IP</p>
                <p className="mt-0.5 font-mono text-zinc-700">{evt.source_ip}</p>
              </div>
            )}
            {evt.resources.length > 0 && (
              <div className="sm:col-span-2">
                <p className="font-medium uppercase tracking-wide text-zinc-400">Resources</p>
                <ul className="mt-1 space-y-0.5">
                  {evt.resources.map((r, i) => (
                    <li key={i} className="break-all font-mono text-zinc-700">
                      {r.name || "—"}
                      {r.type ? <span className="text-zinc-400"> ({r.type})</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Timeline() {
  const [params] = useSearchParams();
  if (params.get("view") === "compliance") {
    return <Navigate to="/controls" replace />;
  }

  const [days, setDays] = useState(30);
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [accountId, setAccountId] = useState<string>("");

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["accounts"],
    queryFn: () => api("/v1/accounts"),
  });

  const connected = (accounts || []).filter((a) => a.status === "connected");
  const effectiveAccountId = accountId || connected[0]?.id || "";

  const { data, isLoading, error } = useQuery<TimelineResponse>({
    queryKey: ["timeline", effectiveAccountId, days],
    queryFn: () => api(`/v1/accounts/${effectiveAccountId}/timeline?days=${days}&limit=200`),
    enabled: !!effectiveAccountId,
  });

  const filteredEvents = useMemo(() => {
    if (!data?.events) return [];
    return data.events.filter((evt) => {
      const cat = serviceCategory(evt.event_source, evt.event_name);
      return serviceFilter === "all" || cat === serviceFilter;
    });
  }, [data?.events, serviceFilter]);

  const grouped = useMemo(() => groupByDate(filteredEvents), [filteredEvents]);

  return (
    <div className="w-full px-8 py-7">
      <div className="mb-7 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Timeline</h1>
          <p className="mt-1 text-sm text-zinc-500">CloudTrail infrastructure changes from your last scan.</p>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {connected.length > 1 && (
            <select
              value={effectiveAccountId}
              onChange={(e) => setAccountId(e.target.value)}
              aria-label="AWS account"
              className={selectClass}
            >
              {connected.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          )}

          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Timeline window"
            className={selectClass}
          >
            {TIMELINE_WINDOWS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value as ServiceFilter)}
            aria-label="Service filter"
            className={selectClass}
          >
            {SERVICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {data && (
          <span className="text-sm tabular-nums text-zinc-500">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {!effectiveAccountId && (
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-16 text-center text-sm text-zinc-500">
          Connect an AWS account to view activity.
        </div>
      )}

      {isLoading && (
        <div className="space-y-2.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {String(error)}
        </div>
      )}

      {data && filteredEvents.length === 0 && (
        (() => {
          const copy = emptyTimelineCopy(data.meta, days);
          return (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center">
              <p className="text-base font-semibold text-zinc-800">{copy.title}</p>
              <p className="mt-2 text-sm text-zinc-500">{copy.body}</p>
              {copy.hint && <p className="mt-2 text-xs text-zinc-400">{copy.hint}</p>}
            </div>
          );
        })()
      )}

      {filteredEvents.length > 0 && (
        <div className="space-y-8 pb-8">
          {grouped.map(([key, events]) => (
            <section key={key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                {fmtDateHeader(events[0].event_time)}
              </h2>
              <div className="space-y-2">
                {events.map((evt) => (
                  <EventRow key={evt.event_id} evt={evt} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
