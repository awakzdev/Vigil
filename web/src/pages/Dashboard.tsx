export default function Dashboard() {
  return (
    <div className="w-full px-8 py-7">
      <div className="mb-7 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Cloud posture overview across accounts, providers, and future Kubernetes targets.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-950/[0.04]">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Coverage</div>
          <div className="mt-4 text-3xl font-bold tracking-tight text-zinc-950">AWS</div>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            AWS IAM posture is active now. GCP, Azure, and Kubernetes coverage can plug into this page later.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-950/[0.04]">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Risk</div>
          <div className="mt-4 text-3xl font-bold tracking-tight text-zinc-950">Posture</div>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Summaries, trends, critical findings, and least-privilege progress will live here.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-950/[0.04]">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Roadmap</div>
          <div className="mt-4 text-3xl font-bold tracking-tight text-zinc-950">CSPM</div>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            This dashboard is the future control room for multi-cloud and Kubernetes security posture.
          </p>
        </div>
      </div>
    </div>
  );
}
