import { Link, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { token } from "./api";

export default function Layout() {
  const nav = useNavigate();
  useEffect(() => {
    if (!token()) nav("/login");
  }, [nav]);
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white px-6 py-3 flex items-center gap-6">
        <div className="font-semibold">Cloud Hygiene</div>
        <nav className="flex gap-4 text-sm">
          <Link to="/findings" className="hover:underline">Findings</Link>
          <Link to="/accounts" className="hover:underline">Accounts</Link>
        </nav>
        <button
          onClick={() => { localStorage.removeItem("token"); nav("/login"); }}
          className="ml-auto text-sm text-slate-600 hover:text-slate-900"
        >Sign out</button>
      </header>
      <main className="p-6"><Outlet /></main>
    </div>
  );
}
