export const BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";

export function token(): string | null {
  return localStorage.getItem("token");
}

export function refreshToken(): string | null {
  return localStorage.getItem("refresh_token");
}

export function storeTokens(access: string, refresh: string) {
  localStorage.setItem("token", access);
  localStorage.setItem("refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("token");
  localStorage.removeItem("refresh_token");
}

function parseApiError(_status: number, body: string): string {
  let text = body.trim().replace(/^\d{3}:\s*/, "");
  try {
    const json = JSON.parse(text) as { detail?: unknown };
    const detail = json.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "msg" in item) {
            return String((item as { msg: unknown }).msg);
          }
          return String(item);
        })
        .join("; ");
    }
  } catch {
    // not JSON — fall through
  }
  if (text.startsWith("{")) return "Something went wrong. Try again.";
  return text || "Something went wrong. Try again.";
}

/** Turn API/ thrown errors into user-facing copy (no status codes or JSON blobs). */
export function formatApiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const msg = parseApiError(0, raw);
  if (!msg) return "Something went wrong. Try again.";
  return msg.charAt(0).toUpperCase() + msg.slice(1);
}

let _refreshing: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (_refreshing) return _refreshing;
  const rt = refreshToken();
  if (!rt) return null;
  _refreshing = (async () => {
    try {
      const res = await fetch(`${BASE}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      storeTokens(data.access_token, data.refresh_token);
      return data.access_token as string;
    } catch {
      return null;
    } finally {
      _refreshing = null;
    }
  })();
  return _refreshing;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401 && t) {
    const newToken = await tryRefresh();
    if (newToken) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
      const retry = await fetch(`${BASE}${path}`, { ...init, headers: retryHeaders });
      if (retry.status === 401) {
        clearTokens();
        window.location.href = "/login";
        throw new Error("session expired");
      }
      if (!retry.ok) {
        const body = await retry.text();
        throw new Error(parseApiError(retry.status, body));
      }
      if (retry.status === 204) return undefined as T;
      return retry.json();
    }
    clearTokens();
    window.location.href = "/login";
    throw new Error("session expired");
  }

  if (res.status === 401) {
    const body = await res.text();
    throw new Error(parseApiError(res.status, body));
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(parseApiError(res.status, body));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
