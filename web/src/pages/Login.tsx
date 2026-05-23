import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const path = mode === "login" ? "/v1/auth/login" : "/v1/auth/signup";
      const body = mode === "login" ? { email, password } : { email, password, org_name: orgName };
      const res = await api<{ access_token: string }>(path, { method: "POST", body: JSON.stringify(body) });
      localStorage.setItem("token", res.access_token);
      nav("/findings");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50">
      <form onSubmit={submit} className="bg-white border rounded-lg p-6 w-full max-w-sm space-y-3">
        <h1 className="text-xl font-semibold">{mode === "login" ? "Sign in" : "Create account"}</h1>
        {mode === "signup" && (
          <input className="w-full border rounded px-3 py-2" placeholder="Organization name"
            value={orgName} onChange={e => setOrgName(e.target.value)} required />
        )}
        <input className="w-full border rounded px-3 py-2" type="email" placeholder="Email"
          value={email} onChange={e => setEmail(e.target.value)} required />
        <input className="w-full border rounded px-3 py-2" type="password" placeholder="Password"
          value={password} onChange={e => setPassword(e.target.value)} required />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button className="w-full bg-slate-900 text-white rounded py-2">{mode === "login" ? "Sign in" : "Sign up"}</button>
        <button type="button" className="w-full text-sm text-slate-600"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
