import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { token } from "./api";

const navItem = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
    isActive
      ? "bg-white/10 text-white shadow-sm ring-1 ring-white/5"
      : "text-slate-400 hover:text-slate-100 hover:bg-white/6"
  }`;

export default function Layout() {
  const nav = useNavigate();
  useEffect(() => {
    if (!token()) nav("/login");
  }, [nav]);

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <aside
        className="w-60 flex-shrink-0 sticky top-0 h-screen flex flex-col overflow-y-auto"
        style={{
          background: "linear-gradient(160deg, #0f172a 0%, #0d1424 50%, #090e1a 100%)",
          borderRight: "1px solid rgba(56, 189, 248, 0.12)",
          boxShadow: "4px 0 32px -4px rgba(14, 165, 233, 0.12), inset -1px 0 0 rgba(56, 189, 248, 0.06)",
        }}
      >
        {/* Logo */}
        <div className="px-5 py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(14,165,233,0.2))",
                boxShadow: "0 0 12px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
                border: "1px solid rgba(99,102,241,0.3)",
              }}
            >
              <img src="/favicon.png" alt="Vigil" className="w-7 h-7 object-contain drop-shadow" />
            </div>
            <span className="text-white font-semibold text-base tracking-tight leading-none">Vigil</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          <NavLink to="/accounts" className={navItem}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            Accounts
          </NavLink>
          <NavLink to="/findings" className={navItem}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Findings
          </NavLink>
        </nav>

        {/* Bottom: Account + Sign out */}
        <div className="px-2 py-4 space-y-0.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <NavLink to="/account" className={navItem}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Account
          </NavLink>
          <button
            onClick={() => { localStorage.removeItem("token"); nav("/login"); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-100 hover:bg-white/6 transition-all"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
