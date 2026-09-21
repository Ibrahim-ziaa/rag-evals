import { AlertTriangle, Check, X } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-line-strong px-8 pb-5 pt-7">
      <div className="min-w-0">
        <h1 className="font-serif text-[27px] font-semibold leading-[1.15] tracking-[-0.018em]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-[760px] text-[13.5px] text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[5px] border border-line bg-panel ${className}`}>{children}</section>;
}

export function CardHead({ title, hint, right }: { title: string; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="font-serif text-[16px] font-semibold leading-snug tracking-[-0.005em]">{title}</h2>
        {hint && <p className="text-[12.5px] text-ink-3">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

type Tone = "good" | "bad" | "warn" | "neutral" | "accent";
const TONES: Record<Tone, string> = {
  good: "bg-good-soft text-good", bad: "bg-bad-soft text-bad", warn: "bg-warn-soft text-warn",
  neutral: "bg-rail text-ink-2", accent: "bg-accent-soft text-accent",
};
export function Pill({ tone = "neutral", children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ${TONES[tone]}`}>
      {icon}{children}
    </span>
  );
}
export function PassPill({ passed, labels = ["Pass", "Fail"] }: { passed: boolean; labels?: [string, string] }) {
  return passed
    ? <Pill tone="good" icon={<Check size={12} strokeWidth={2.5} />}>{labels[0]}</Pill>
    : <Pill tone="bad" icon={<X size={12} strokeWidth={2.5} />}>{labels[1]}</Pill>;
}

export function Button({ children, onClick, variant = "primary", disabled, type = "button", title }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost"; disabled?: boolean; type?: "button" | "submit"; title?: string;
}) {
  const styles = {
    primary: "bg-accent text-on-accent hover:bg-accent-strong disabled:bg-ink-3",
    secondary: "border border-edge bg-panel text-ink hover:bg-rail disabled:text-ink-3",
    ghost: "text-ink-2 hover:bg-rail hover:text-ink",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex h-9 items-center gap-2 rounded-[5px] px-3.5 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed ${styles}`}>
      {children}
    </button>
  );
}

export function Select({ value, onChange, children, label }: { value: string; onChange: (v: string) => void; children: ReactNode; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 max-w-[320px] rounded-[5px] border border-edge bg-panel px-2.5 pr-8 text-[13.5px] text-ink">
      {children}
    </select>
  );
}

export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div role="alert" className="m-8 flex items-start gap-3 rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-bad">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div className="text-[13.5px]">
        <p className="font-medium">Could not load this screen</p>
        <p className="text-bad">{message}. Check that the API is running on this port.</p>
        {retry && <button onClick={retry} className="mt-1 font-medium underline">Try again</button>}
      </div>
    </div>
  );
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-8" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-9" style={{ width: `${92 - (i % 3) * 14}%` }} />)}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="font-serif text-[16px] font-semibold leading-snug">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-3">{body}</p>
    </div>
  );
}

/** Horizontal score bar on a fixed 0 to max scale, with the score floor drawn as a tick. */
export function ScoreBar({ score, floor, max = 0.6, width = 120 }: { score: number; floor?: number; max?: number; width?: number }) {
  const w = Math.min(1, score / max) * 100;
  const below = floor !== undefined && score < floor;
  return (
    <span className="relative inline-block h-1.5 rounded-full bg-line align-middle" style={{ width }} aria-hidden>
      <span className={`absolute inset-y-0 left-0 rounded-full ${below ? "bg-ink-3" : "bg-accent"}`} style={{ width: `${w}%` }} />
      {floor !== undefined && floor > 0 && (
        <span className="absolute -inset-y-[3px] w-[1.5px] rounded bg-ink" style={{ left: `${(floor / max) * 100}%` }} />
      )}
    </span>
  );
}

export function DocName({ id, tone = "neutral" }: { id: string; tone?: "neutral" | "good" | "bad" }) {
  const cls = { neutral: "border-line text-ink-2", good: "border-good/30 bg-good-soft text-good", bad: "border-bad/25 bg-bad-soft text-bad" }[tone];
  return <span className={`inline-block rounded border px-1.5 py-px font-mono text-[11.5px] leading-[1.5] ${cls}`}>{id}</span>;
}
