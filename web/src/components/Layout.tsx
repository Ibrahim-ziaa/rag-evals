import { BookOpenText, FileText, GitCompareArrows, Gauge, ListChecks, RotateCcw } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, useApi, type Meta } from "../api";

const NAV = [
  { group: "Assistant", items: [
    { to: "/ask", label: "Ask", icon: BookOpenText },
    { to: "/documents", label: "Documents", icon: FileText },
  ] },
  { group: "Quality", items: [
    { to: "/quality", label: "Overview", icon: Gauge, end: true },
    { to: "/quality/compare", label: "Retrieval fix", icon: GitCompareArrows },
    { to: "/quality/questions", label: "Questions", icon: ListChecks },
  ] },
];

export default function Layout() {
  const { data: meta } = useApi<Meta>("/meta");
  const [resetting, setResetting] = useState(false);
  const navigate = useNavigate();

  async function reset() {
    setResetting(true);
    try { await api("/reset", { method: "POST" }); navigate(0); } finally { setResetting(false); }
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-rail">
        <div className="px-5 pb-5 pt-6">
          <div className="font-serif text-[22px] font-semibold leading-tight tracking-[-0.02em]">Sourcebook</div>
          <div className="mt-0.5 text-[12.5px] text-ink-3">Halden Home handbook</div>
        </div>
        <nav className="flex-1 space-y-5 px-3" aria-label="Main">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{g.group}</div>
              <ul className="space-y-0.5">
                {g.items.map(({ to, label, icon: Icon, ...rest }) => (
                  <li key={to}>
                    <NavLink to={to} end={"end" in rest}
                      className={({ isActive }) => `flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] ${isActive ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-line hover:text-ink"}`}>
                      <Icon size={15} strokeWidth={1.9} />{label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="space-y-3 border-t border-line px-5 py-4 text-[12px] text-ink-3">
          {meta && (
            <dl className="space-y-1 tnum">
              <div className="flex justify-between"><dt>Documents</dt><dd className="text-ink-2">{meta.documents}</dd></div>
              <div className="flex justify-between"><dt>Indexed passages</dt><dd className="text-ink-2">{meta.chunks}</dd></div>
              <div className="flex justify-between"><dt>Test questions</dt><dd className="text-ink-2">{meta.gold_questions}</dd></div>
              <div className="flex justify-between"><dt>Answer engine</dt><dd className="text-ink-2">{meta.generator === "claude" ? "Claude" : "Offline"}</dd></div>
            </dl>
          )}
          <div className="flex items-center justify-between">
            <span className="rounded border border-line-strong px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.05em] text-ink-2">Demo data</span>
            <button onClick={reset} disabled={resetting} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink" title="Clear manual runs and reseed the history">
              <RotateCcw size={12} />{resetting ? "Resetting" : "Reset demo"}
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto"><Outlet /></main>
    </div>
  );
}
