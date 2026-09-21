export const f2 = (n: number) => n.toFixed(2);
export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const signed = (n: number) => (Math.abs(n) < 0.005 ? "0.00" : `${n > 0 ? "+" : "-"}${Math.abs(n).toFixed(2)}`);

export function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}
export function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
export const KIND_LABEL: Record<string, string> = {
  direct: "Direct", paraphrased: "Paraphrased", two_docs: "Spans two documents", unanswerable: "Unanswerable",
};
export function settingValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return "No limit";
  if (typeof v === "boolean") return v ? "On" : "Off";
  if ((key === "min_score" || key === "rel_floor") && v === 0) return "Off";
  return String(v);
}
