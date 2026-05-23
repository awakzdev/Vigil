import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { token } from "./api";

const navItem = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
  }`;

export default function Layout() {
  const nav = useNavigate();
  useEffect(() => {
    if (!token()) nav("/login");
  }, [nav]);

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 flex-shrink-0 bg-slate-900 flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.png" alt="Vigil" className="w-10 h-10 object-contain flex-shrink-0" />
            <span className="text-white font-semibold text-base tracking-tight leading-none">Vigil</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLink to="/accounts" className={navItem}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            AWS Accounts
          </NavLink>
          <NavLink to="/findings" className={navItem}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Findings
          </NavLink>
        </nav>

        <div className="px-3 py-4 border-t border-white/10 space-y-1">
          <NavLink to="/account" className={navItem}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Account
          </NavLink>
          <button
            onClick={() => { localStorage.removeItem("token"); nav("/login"); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-slate-50">
        <div className="max-w-5xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
