import { ArrowRight, Check, CornerDownRight, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, useApi, type AskResult, type Meta } from "../api";
import { PassageText } from "../components/Passage";
import { Button, Card, CardHead, ErrorBox, PageHeader, ScoreBar } from "../components/ui";
import { f2 } from "../format";

export default function Ask() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const focus = Number(params.get("cite") ?? 0) || null;
  const { data: meta } = useApi<Meta>("/meta");
  const [draft, setDraft] = useState(q);
  const [result, setResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(q);
    if (!q) { setResult(null); return; }
    let live = true;
    setLoading(true);
    setError(null);
    api<AskResult>("/ask", { method: "POST", body: JSON.stringify({ question: q }) })
      .then((r) => live && setResult(r)).catch((e) => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [q]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (text.length >= 3) setParams({ q: text });
  }
  const setFocus = (n: number) => setParams({ q, cite: String(n) }, { replace: true });

  return (
    <div>
      <PageHeader title="Ask the handbook"
        sub="Every answer is built only from the indexed documents and cites the exact passage it came from. When the documents do not hold the answer, the assistant says so." />
      <div className="px-8 py-6">
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="question" className="sr-only">Question</label>
          <input id="question" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off"
            placeholder="Ask about warranty, delivery, installation, error codes, billing"
            className="h-11 flex-1 rounded-[5px] border border-edge bg-panel px-3.5 text-[15px] placeholder:text-ink-3" />
          <Button type="submit" disabled={loading || draft.trim().length < 3}>{loading ? "Searching" : "Ask"}<ArrowRight size={15} /></Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-ink-3">Try</span>
          {meta?.suggested.map((s) => (
            <button key={s} onClick={() => setParams({ q: s })}
              className={`rounded-full border px-2.5 py-1 text-[12.5px] transition-colors ${s === q ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-panel text-ink-2 hover:border-accent hover:text-accent"}`}>
              {s.length > 58 ? `${s.slice(0, 56)}...` : s}
            </button>
          ))}
        </div>

        {error && <ErrorBox message={error} />}
        {!error && loading && !result && <div className="mt-6 grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-5"><div className="skeleton h-56" /><div className="skeleton h-56" /></div>}
        {!error && !q && <Intro meta={meta} />}
        {!error && result && q && (
          <div className={`mt-6 grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start gap-5 ${loading ? "opacity-60" : ""}`}>
            <div className="space-y-5">
              {result.abstained ? <Declined r={result} /> : <Answered r={result} focus={focus} onCite={setFocus} />}
              {!result.abstained && <Checks r={result} />}
              {meta && <Reliability meta={meta} declined={result.abstained} />}
            </div>
            {result.abstained ? <Closest r={result} /> : <Sources r={result} focus={focus} onFocus={setFocus} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Intro({ meta }: { meta: Meta | null }) {
  return (
    <Card className="mt-6 max-w-[820px]">
      <div className="grid grid-cols-3 divide-x divide-line">
        {[
          ["Cites the exact passage", "Each sentence of an answer carries a numbered citation. The source panel shows the passage word for word with the cited sentence highlighted."],
          ["Declines instead of guessing", `If no passage scores ${meta ? f2(meta.production.min_score) : "0.12"} or higher against the question, the assistant answers "I don't have that information" and shows what it found.`],
          ["Measured, not assumed", `${meta?.gold_questions ?? 50} test questions with known answers are scored on every change. See Quality for the numbers.`],
        ].map(([t, b]) => (
          <div key={t} className="p-5">
            <h3 className="font-serif text-[16px] font-semibold leading-snug">{t}</h3>
            <p className="mt-1 text-[13px] text-ink-2">{b}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Answered({ r, focus, onCite }: { r: AskResult; focus: number | null; onCite: (n: number) => void }) {
  const cited = r.sources.filter((s) => s.n).length;
  return (
    <Card>
      <CardHead title="Answer" right={<span className="inline-flex items-center gap-1.5 text-[12.5px] text-good"><ShieldCheck size={14} />Every sentence is cited</span>} />
      <div className="px-5 py-4">
        <p className="text-[12.5px] text-ink-3">{r.question}</p>
        <div className="mt-2 font-serif text-[18.5px] leading-[1.6] tracking-[-0.003em]">
          {r.parts.map((p, i) => p.type === "text"
            ? <span key={i}>{p.text} </span>
            : <button key={i} onClick={() => onCite(p.n)} aria-label={`Show source ${p.n}`}
                className={`tnum relative -top-0.5 mr-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded px-1 font-sans text-[11.5px] font-semibold tracking-normal transition-colors ${focus === p.n ? "bg-accent text-on-accent" : "bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--color-accent)] hover:bg-accent hover:text-on-accent"}`}>{p.n}</button>)}
        </div>
        {r.searched_as && (
          <p className="mt-4 flex items-start gap-1.5 text-[12.5px] text-ink-3">
            <CornerDownRight size={13} className="mt-0.5 shrink-0" />
            <span>Searched using the handbook's wording: <span className="text-ink-2">{r.searched_as}</span></span>
          </p>
        )}
      </div>
      <dl className="grid grid-cols-4 divide-x divide-line border-t border-line text-[12.5px]">
        {[
          ["Passages used", `${cited} of ${r.sources.length} retrieved`],
          ["Best match", f2(r.best_score)],
          ["Score floor", f2(r.floor)],
          ["Response time", `${r.latency_ms < 10 ? r.latency_ms.toFixed(1) : Math.round(r.latency_ms)} ms`],
        ].map(([k, v]) => (
          <div key={k} className="px-4 py-2.5"><dt className="text-ink-3">{k}</dt><dd className="tnum font-medium">{v}</dd></div>
        ))}
      </dl>
    </Card>
  );
}

function Checks({ r }: { r: AskResult }) {
  const c = r.checks;
  const rows: [string, string, boolean][] = [
    ["Citations that point to a retrieved passage", `${c.citations_valid} of ${c.citations}`, c.citations_valid === c.citations],
    ["Answer sentences found word for word in their source", `${c.sentences_verbatim} of ${c.sentences}`, c.sentences_verbatim === c.sentences],
    ["Passages that cleared the score floor and the weak passage cut", `${c.kept} of ${c.candidates}`, c.kept > 0],
  ];
  return (
    <Card>
      <CardHead title="Checks on this answer" hint={`Searched ${c.passages_searched} passages in ${c.documents_searched} documents. Drew on ${c.documents_used} document${c.documents_used === 1 ? "" : "s"}.`} />
      <ul className="divide-y divide-line text-[13.5px]">
        {rows.map(([label, value, ok]) => (
          <li key={label} className="flex items-center gap-3 px-5 py-2.5">
            {ok ? <Check size={15} className="shrink-0 text-good" strokeWidth={2.25} /> : <X size={15} className="shrink-0 text-bad" strokeWidth={2.25} />}
            <span className="flex-1 text-ink-2">{label}</span>
            <span className="tnum font-medium">{value}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Reliability({ meta, declined }: { meta: Meta; declined: boolean }) {
  const a = meta.reliability.after, b = meta.reliability.before;
  const tiles: [string, string, string][] = declined ? [
    [`${a.unanswerable_declined} of ${a.unanswerable_total}`, "unanswerable test questions declined", `${b.unanswerable_declined} of ${b.unanswerable_total} before the score floor`],
    [`${a.answerable_declined} of ${a.answerable_total}`, "answerable test questions declined by mistake", "the price of a strict floor"],
    [`${a.wrong_answers}`, "wrong answers across the test set", `down from ${b.wrong_answers} before tuning`],
  ] : [
    [`${a.passed} of ${a.total}`, "test questions answered correctly", `${b.passed} of ${b.total} before tuning`],
    [`${a.wrong_answers}`, "wrong answers across the test set", `down from ${b.wrong_answers} before tuning`],
    [`${a.unanswerable_declined} of ${a.unanswerable_total}`, "unanswerable test questions declined", `${b.unanswerable_declined} of ${b.unanswerable_total} before the score floor`],
  ];
  return (
    <Card>
      <CardHead title={declined ? "How reliable is this behaviour" : "How reliable is this assistant"}
        right={<Link to="/quality/compare" className="shrink-0 text-[13px] font-medium text-accent hover:underline">Open the evidence</Link>} />
      <div className="grid grid-cols-3 divide-x divide-line">
        {tiles.map(([n, label, note]) => (
          <div key={label} className="px-5 py-3.5">
            <div className="tnum font-serif text-[25px] font-semibold leading-tight tracking-[-0.015em]">{n}</div>
            <div className="text-[13px] leading-snug text-ink">{label}</div>
            <div className="mt-0.5 text-[12px] text-ink-3">{note}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Sources({ r, focus, onFocus }: { r: AskResult; focus: number | null; onFocus: (n: number) => void }) {
  const refs = useRef<Record<number, HTMLElement | null>>({});
  useEffect(() => { if (focus && refs.current[focus]) refs.current[focus]!.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [focus]);
  return (
    <Card>
      <CardHead title="Sources" hint="Passage text exactly as it appears in the document. The cited sentence is highlighted." />
      <ol className="divide-y divide-line">
        {r.sources.map((s) => {
          const active = s.n !== null && s.n === focus;
          return (
            <li key={s.id} ref={(el) => { if (s.n) refs.current[s.n] = el; }}
              className={`relative px-5 py-4 ${active ? "bg-accent-soft/60" : ""}`}>
              {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
              <div className="mb-2 flex items-center gap-3">
                {s.n
                  ? <button onClick={() => onFocus(s.n!)} className="tnum inline-flex h-5 min-w-5 items-center justify-center rounded bg-accent px-1 text-[12px] font-semibold text-on-accent">{s.n}</button>
                  : <span className="rounded border border-line-strong px-1.5 text-[11px] uppercase tracking-wide text-ink-3">Not cited</span>}
                <div className="min-w-0 flex-1">
                  <Link to={`/documents?doc=${s.doc_id}&chunk=${s.chunk_id}`} className="text-[13.5px] font-semibold hover:underline">{s.title}</Link>
                  <span className="text-[13px] text-ink-2"> / {s.section}</span>
                </div>
                <span className="flex items-center gap-2 text-[12.5px] text-ink-2" title="Match score between the question and this passage, 0 to 1">
                  <ScoreBar score={s.score} floor={r.floor} width={84} /><span className="tnum w-8 text-right font-medium">{f2(s.score)}</span>
                </span>
              </div>
              <div className={s.n ? "" : "[&_p]:text-ink-2"}><PassageText text={s.text} highlights={s.highlights} /></div>
              <p className="mt-2 font-mono text-[11.5px] text-ink-3">{s.doc_id}.md, passage {s.chunk_id}, rank {s.rank}</p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Declined({ r }: { r: AskResult }) {
  const unknown = r.decline?.unknown_words ?? [];
  return (
    <Card className="border-line-strong">
      <CardHead title="Answer" right={<span className="rounded-full bg-ink px-2 py-0.5 text-[12px] font-medium text-on-accent">Declined by design</span>} />
      <div className="px-5 py-4">
        <p className="text-[12.5px] text-ink-3">{r.question}</p>
        <p className="mt-2 font-serif text-[23px] font-semibold leading-snug tracking-[-0.015em]">I don't have that information.</p>
        <p className="mt-1 text-[14px] text-ink-2">Nothing in the handbook answers this, so the assistant did not write an answer. It will not fill the gap with a guess.</p>
      </div>
      <div className="border-t border-line px-5 py-4">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-ink-3">Why it declined</h3>
        <ul className="mt-2 space-y-2.5 text-[13.5px]">
          <li className="flex gap-3">
            <span className="tnum mt-px w-10 shrink-0 text-right font-semibold">{f2(r.best_score)}</span>
            <span className="text-ink-2">is the best match any passage reached. Scores run from 0 (no shared meaning) to 1 (same wording).</span>
          </li>
          <li className="flex gap-3">
            <span className="tnum mt-px w-10 shrink-0 text-right font-semibold">{f2(r.floor)}</span>
            <span className="text-ink-2">is the score floor. Below it a passage is treated as a coincidence of words, not evidence, and is never shown to the answer engine.</span>
          </li>
          {unknown.length > 0 && (
            <li className="flex gap-3">
              <span className="mt-px w-10 shrink-0 text-right font-semibold">{unknown.length}</span>
              <span className="text-ink-2">word{unknown.length === 1 ? "" : "s"} in the question appear{unknown.length === 1 ? "s" : ""} nowhere in the handbook:{" "}
                {unknown.map((w) => <code key={w} className="mr-1 rounded bg-rail px-1.5 py-0.5 font-mono text-[12px] text-ink">{w}</code>)}
              </span>
            </li>
          )}
        </ul>
      </div>
      <div className="border-t border-line bg-rail/60 px-5 py-3 text-[12.5px] text-ink-2">
        The floor was chosen by measurement, not by feel. <Link to="/quality/compare" className="font-medium text-accent hover:underline">See what it changed on the test questions</Link>
      </div>
    </Card>
  );
}

function Closest({ r }: { r: AskResult }) {
  return (
    <Card>
      <CardHead title="Closest passages found, none sufficient" hint={`The tick on each bar marks the score floor of ${f2(r.floor)}. All of these fall short of it.`} />
      {r.candidates.length === 0
        ? <p className="px-5 py-6 text-[13.5px] text-ink-2">No passage shares a single meaningful word with this question.</p>
        : (
          <ol className="divide-y divide-line">
            {r.candidates.map((c) => (
              <li key={c.id} className="px-5 py-4">
                <div className="mb-2 flex items-center gap-3">
                  <span className="tnum inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong px-1 text-[12px] font-medium text-ink-2">{c.rank}</span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/documents?doc=${c.doc_id}&chunk=${c.chunk_id}`} className="text-[13.5px] font-semibold hover:underline">{c.title}</Link>
                    <span className="text-[13px] text-ink-2"> / {c.section}</span>
                  </div>
                  <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
                    <ScoreBar score={c.score} floor={r.floor} max={0.3} width={120} /><span className="tnum w-8 text-right font-medium">{f2(c.score)}</span>
                  </span>
                </div>
                <div className="text-ink-2"><PassageText text={c.text} clamp={230} /></div>
              </li>
            ))}
          </ol>
        )}
    </Card>
  );
}
