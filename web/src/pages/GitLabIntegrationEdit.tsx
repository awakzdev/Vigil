import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

type GitLabProvider = {
  username: string | null;
  group_id: string | null;
  group_ids: string[];
  base_url: string | null;
  selected_repos: string[];
};

type GitLabGroup = {
  full_path: string;
  name: string;
};

type GitLabRepo = {
  path_with_namespace: string;
  visibility: string;
  default_branch: string | null;
};

function GitLabMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51a.42.42 0 0 1 .11-.18.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
    </svg>
  );
}

export default function GitLabIntegrationEdit() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justConnected = searchParams.get("connected") === "1";
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [repoFilter, setRepoFilter] = useState("");

  const provider = useQuery({
    queryKey: ["gitlab-provider"],
    queryFn: () => api<GitLabProvider | null>("/v1/integrations/gitlab"),
  });

  const groups = useQuery({
    queryKey: ["gitlab-groups"],
    queryFn: () => api<GitLabGroup[]>("/v1/integrations/gitlab/groups"),
    enabled: !!provider.data,
  });

  useEffect(() => {
    if (!provider.data) return;
    const owners = provider.data.group_ids?.length
      ? provider.data.group_ids
      : provider.data.group_id
        ? [provider.data.group_id]
        : [];
    setGroupIds(owners);
    setSelectedRepos(provider.data.selected_repos || []);
  }, [provider.data]);

  const repos = useQuery({
    queryKey: ["gitlab-repos", groupIds],
    queryFn: async () => {
      const lists = await Promise.all(
        groupIds.map((ns) => api<GitLabRepo[]>(`/v1/integrations/gitlab/repos?namespace=${encodeURIComponent(ns)}`))
      );
      return lists.flat();
    },
    enabled: !!provider.data && groupIds.length > 0,
  });

  const selectedSet = useMemo(() => new Set(selectedRepos), [selectedRepos]);
  const availableGroups = useMemo(() => {
    const discovered = (groups.data || []).map((g) => g.full_path);
    return Array.from(new Set([...discovered, ...groupIds])).filter(Boolean);
  }, [groupIds, groups.data]);
  const groupNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of groups.data || []) map[g.full_path] = g.name;
    return map;
  }, [groups.data]);
  const filteredRepos = useMemo(() => {
    const query = repoFilter.trim().toLowerCase();
    if (!query) return repos.data || [];
    return (repos.data || []).filter((r) => r.path_with_namespace.toLowerCase().includes(query));
  }, [repoFilter, repos.data]);
  const groupedRepos = useMemo(() => {
    return filteredRepos.reduce<Record<string, GitLabRepo[]>>((acc, repo) => {
      const ns = repo.path_with_namespace.split("/")[0] || "Other";
      acc[ns] = acc[ns] || [];
      acc[ns].push(repo);
      return acc;
    }, {});
  }, [filteredRepos]);

  const save = useMutation({
    mutationFn: () =>
      api("/v1/integrations/gitlab/scope", {
        method: "PUT",
        body: JSON.stringify({
          group_id: groupIds[0] || null,
          group_ids: groupIds,
          selected_repos: selectedRepos,
          base_url: provider.data?.base_url || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gitlab-provider"] });
      navigate("/integrations/gitlab");
    },
  });

  function toggleRepo(name: string) {
    setSelectedRepos((current) =>
      current.length === 0
        ? (repos.data || []).map((r) => r.path_with_namespace).filter((r) => r !== name)
        : current.includes(name)
          ? current.filter((r) => r !== name)
          : [...current, name]
    );
  }

  function toggleGroup(path: string) {
    if (groupIds.includes(path)) {
      setGroupIds((current) => current.filter((g) => g !== path));
      setSelectedRepos((current) =>
        current.filter((r) => !r.toLowerCase().startsWith(`${path.toLowerCase()}/`))
      );
      return;
    }
    setGroupIds((current) => [...current, path]);
  }

  if (provider.isLoading) {
    return <div className="mx-auto max-w-5xl text-sm text-zinc-500">Loading GitLab integration...</div>;
  }

  if (!provider.data) {
    return (
      <div className="mx-auto max-w-5xl rounded-lg border border-zinc-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-zinc-950">GitLab is not connected</h1>
        <p className="mt-2 text-sm text-zinc-600">Connect GitLab before choosing evidence scope.</p>
        <Link
          to="/integrations/gitlab"
          className="mt-5 inline-flex rounded-lg bg-[#e24329] px-4 py-2 text-sm font-medium text-white hover:bg-[#c93a22]"
        >
          Back to GitLab evidence
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <p className="text-sm font-medium text-sky-700">
          <Link to="/integrations" className="hover:underline">Integrations</Link>
          {" / "}
          <Link to="/integrations/gitlab" className="hover:underline">GitLab evidence</Link>
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">Edit evidence scope</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          Choose which connected GitLab groups and repositories should feed compliance identity and change-management evidence.
        </p>
      </div>

      {justConnected && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          GitLab connected. Select at least one group below, then save to start syncing evidence.
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e24329] text-white">
            <GitLabMark className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Source access</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Authenticated as {provider.data.username || "GitLab user"}
              {provider.data.base_url ? ` on ${provider.data.base_url.replace(/^https?:\/\//, "")}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-700">Available groups</div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm text-zinc-600">
              {groupIds.length} selected
            </div>
          </div>
          {groups.isLoading && <div className="text-sm text-zinc-500">Loading GitLab groups...</div>}
          {groups.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {(groups.error as Error).message}
            </div>
          )}
          {!!availableGroups.length && (
            <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200">
              {availableGroups.map((path) => (
                <label key={path} className="flex cursor-pointer items-center justify-between gap-4 bg-white px-4 py-3 hover:bg-zinc-50">
                  <div>
                    <div className="text-sm font-medium text-zinc-950">{groupNameMap[path] || path}</div>
                    <div className="mt-1 text-xs text-zinc-500">{path}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={groupIds.includes(path)}
                    onChange={() => toggleGroup(path)}
                    className="h-4 w-4 rounded border-zinc-300 text-[#e24329] focus:ring-[#e24329]"
                  />
                </label>
              ))}
            </div>
          )}
          {!groups.isLoading && !availableGroups.length && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-500">
              No GitLab groups found. Make sure the token has at least Reporter access to the target groups.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Repositories</h2>
            <p className="mt-1 text-sm text-zinc-500">Leave empty to include every repository under the selected groups.</p>
          </div>
          <button
            onClick={() => setSelectedRepos([])}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Include all repositories
          </button>
        </div>

        <div className="mt-5">
          <input
            type="search"
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
            placeholder="Filter repositories..."
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        {repos.isLoading && <div className="mt-6 text-sm text-zinc-500">Loading repositories...</div>}
        {repos.error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {(repos.error as Error).message}
          </div>
        )}
        {repos.data && (
          <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-zinc-200">
            {Object.entries(groupedRepos).map(([ns, nsRepos]) => (
              <div key={ns}>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{ns}</div>
                  <div className="text-xs text-zinc-500">{nsRepos.length} repositories</div>
                </div>
                <div className="divide-y divide-zinc-100">
                  {nsRepos.map((repo) => (
                    <label key={repo.path_with_namespace} className="group flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-zinc-50">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-950">{repo.path_with_namespace}</div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {repo.visibility} · default branch {repo.default_branch || "unknown"}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={!selectedRepos.length || selectedSet.has(repo.path_with_namespace)}
                        onChange={() => toggleRepo(repo.path_with_namespace)}
                        className="h-4 w-4 shrink-0 rounded border-zinc-300 text-[#e24329] group-hover:border-orange-400 focus:ring-[#e24329]"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {!!repos.data.length && !filteredRepos.length && (
              <div className="px-4 py-6 text-sm text-zinc-500">No repositories match this filter.</div>
            )}
            {!repos.data.length && <div className="px-4 py-6 text-sm text-zinc-500">No repositories found for these groups.</div>}
          </div>
        )}
      </div>

      {save.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {(save.error as Error).message}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Link
          to="/integrations/gitlab"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </Link>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !groupIds.length}
          className="rounded-lg bg-[#e24329] px-5 py-2 text-sm font-medium text-white hover:bg-[#c93a22] disabled:opacity-60"
        >
          {save.isPending ? "Saving..." : "Save scope"}
        </button>
      </div>
    </div>
  );
}
