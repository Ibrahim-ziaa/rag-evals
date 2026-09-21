import type { ReactNode } from "react";

/** Passage text exactly as it appears in the document, with the cited span highlighted. */
export function PassageText({ text, highlights = [], clamp }: { text: string; highlights?: [number, number][]; clamp?: number }) {
  let body = text;
  let cut = false;
  if (clamp && text.length > clamp && highlights.length === 0) { body = text.slice(0, text.lastIndexOf(" ", clamp)); cut = true; }
  const out: ReactNode[] = [];
  let pos = 0;
  [...highlights].sort((a, b) => a[0] - b[0]).forEach(([s, e], i) => {
    if (s > pos) out.push(<span key={`t${i}`}>{body.slice(pos, s)}</span>);
    out.push(<mark key={`m${i}`} className="span">{body.slice(s, e)}</mark>);
    pos = e;
  });
  out.push(<span key="end">{body.slice(pos)}</span>);
  return <p className="whitespace-pre-line text-[13.5px] leading-[1.6] text-ink">{out}{cut && <span className="text-ink-3"> ...</span>}</p>;
}
