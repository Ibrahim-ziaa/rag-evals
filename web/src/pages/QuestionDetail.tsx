import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useApi, type QuestionDetail as Detail } from "../api";
import { PassageText } from "../components/Passage";
import { Card, CardHead, DocName, ErrorBox, PassPill, Pill, ScoreBar, Skeleton } from "../components/ui";
import { f2, KIND_LABEL, when } from "../format";

export default function QuestionDetail() {
  const { runId, qid } = useParams();
  const { data: q, error, reload } = useApi<Detail>(`/runs/${runId}/questions/${qid}`);
  if (error) return <ErrorBox message={error} retry={reload} />;
  if (!q) return <Skeleton />;
  const nav = (id: string | null, label: string, icon: "l" | "r") => id
    ? <Link to={`/quality/runs/${q.run.id}/questions/${id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-panel px-2.5 text-[13px] text-ink-2 hover:bg-rail">{icon === "l" && <ArrowLeft size={14} />}{label}{icon === "r" && <ArrowRight size={14} />}</Link>
    : null;
  const highlights = Object.fromEntries(q.answer.sources.map((s) => [s.id, s]));

  return (
    <div>
      <header className="border-b border-line px-8 pb-5 pt-6">
        <div className="flex items-center justify-between">
          <nav className="text-[13px] text-ink-3" aria-label="Breadcrumb">
            <Link to="/quality" className="hover:text-ink">Quality</Link> / <Link to={`/quality/questions?run=${q.run.id}`} className="hover:text-ink">Run {q.run.number}, {q.run.config.name}</Link> / <span className="font-mono text-ink-2">{q.id}</span>
          </nav>
          <div className="flex gap-2">{nav(q.prev, "Previous", "l")}{nav(q.next, "Next", "r")}</div>
        </div>
        <h1 className="mt-3 max-w-[980px] font-serif text-[27px] font-semibold leading-[1.2] tracking-[-0.018em]">{q.question}</h1>
        <div className="mt-2.5 flex items-center gap-2 text-[13px] text-ink-2">
          <PassPill passed={q.passed} labels={["Passes", "Fails"]} />
          <Pill tone={q.kind === "unanswerable" ? "warn" : "neutral"}>{KIND_LABEL[q.kind]}</Pill>
          <span className="text-ink-3">Evaluated {when(q.run.created_at)}</span>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start gap-5 px-8 py-6">
        <div className="space-y-5">
          <Card>
            <CardHead title="What the gold set expects" />
            <dl className="grid grid-cols-[150px_1fr] gap-y-2.5 px-4 py-3.5 text-[13.5px]">
              <dt className="text-ink-3">Documents</dt>
              <dd className="flex flex-wrap gap-1">{q.expected_docs.length ? q.expected_docs.map((d) => <Link key={d} to={`/documents?doc=${d}`}><DocName id={d} /></Link>) : <span className="text-ink-2">None. The correct behaviour is to decline.</span>}</dd>
              <dt className="text-ink-3">Facts in the answer</dt>
              <dd className="flex flex-wrap gap-1.5">{q.must_mention.length ? q.must_mention.map((m) => {
                const ok = q.answer.text.toLowerCase().includes(m.toLowerCase());
                return <span key={m} className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[12.5px] ${ok ? "border-good/30 bg-good-soft text-good" : "border-bad/25 bg-bad-soft text-bad"}`}>{ok ? <Check size={12} /> : <X size={12} />}{m}</span>;
              }) : <span className="text-ink-2">None</span>}</dd>
            </dl>
          </Card>

          <Card>
            <CardHead title="The answer it gave" right={q.abstained ? <Pill>Declined</Pill> : undefined} />
            <div className="px-4 py-3.5 font-serif text-[17.5px] leading-[1.6] tracking-[-0.003em]">
              {q.answer.parts.map((p, i) => p.type === "text"
                ? <span key={i}>{p.text} </span>
                : <span key={i} className="tnum relative -top-0.5 mr-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded bg-accent-soft px-1 font-sans text-[11.5px] font-semibold tracking-normal text-accent shadow-[inset_0_0_0_1px_var(--color-accent)]">{p.n}</span>)}
            </div>
          </Card>

          <Card>
            <CardHead title="Retrieved passages" hint={q.floor > 0 ? `Ranked by match score. The tick marks the score floor of ${f2(q.floor)}.` : "Ranked by match score. This configuration has no score floor, so everything is passed to the answer engine."} />
            {q.candidates.length === 0 ? <p className="px-4 py-5 text-[13.5px] text-ink-2">No passage shares a meaningful word with this question.</p> : (
              <ol className="divide-y divide-line">
                {q.candidates.map((c) => {
                  const src = highlights[c.id];
                  return (
                    <li key={c.id} className={`px-4 py-3.5 ${c.kept ? "" : "bg-rail/40"}`}>
                      <div className="mb-1.5 flex items-center gap-2.5">
                        <span className="tnum inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong px-1 text-[12px] font-medium text-ink-2">{c.rank}</span>
                        <div className="min-w-0 flex-1 truncate"><Link to={`/documents?doc=${c.doc_id}&chunk=${c.chunk_id}`} className="text-[13.5px] font-semibold hover:underline">{c.title}</Link><span className="text-[13px] text-ink-2"> / {c.section}</span></div>
                        {q.expected_docs.length > 0 && (c.expected ? <Pill tone="good">Expected document</Pill> : <Pill tone="bad">Not an expected document</Pill>)}
                        {!c.kept && <Pill>Dropped</Pill>}
                        {src?.n && <Pill tone="accent">Cited {src.n}</Pill>}
                        <span className="flex items-center gap-2"><ScoreBar score={c.score} floor={q.floor} width={72} /><span className="tnum w-8 text-right text-[12.5px] font-medium">{f2(c.score)}</span></span>
                      </div>
                      <div className={c.kept ? "" : "[&_p]:text-ink-2"}><PassageText text={c.text} highlights={src?.highlights} clamp={320} /></div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <Card className="sticky top-6">
          <CardHead title="Why it scored this way" hint="Each measure is 0 to 1 for a single question." />
          <ul className="divide-y divide-line">
            {q.metrics.map((m) => (
              <li key={m.key} className="flex gap-4 px-4 py-3">
                <span className={`tnum w-12 shrink-0 font-serif text-[20px] font-semibold leading-tight ${m.value < 1 ? "text-bad" : "text-ink"}`}>{f2(m.value)}</span>
                <div className="min-w-0"><div className="text-[13.5px] font-medium">{m.label}</div><p className="text-[13px] leading-snug text-ink-2">{m.why}</p></div>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-3">
            <h3 className="text-[12.5px] font-medium text-ink-2">This question across every run</h3>
            <ol className="mt-2 flex gap-1.5">
              {q.history.map((h) => (
                <li key={h.run_id} className="flex-1">
                  <Link to={`/quality/runs/${h.run_id}/questions/${q.id}`} title={`Run ${h.number}: ${h.config}`}
                    className={`flex h-9 flex-col items-center justify-center rounded border text-[11.5px] font-medium leading-none tnum ${h.passed ? "border-good/30 bg-good-soft text-good" : "border-bad/25 bg-bad-soft text-bad"} ${h.run_id === q.run.id ? "outline outline-2 outline-offset-1 outline-ink" : ""}`}>
                    <span>{h.number}</span>{h.passed ? <Check size={11} strokeWidth={2.5} /> : <X size={11} strokeWidth={2.5} />}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line bg-rail/50 px-4 py-3 text-[12.5px] tnum">
            <dt className="text-ink-3">Chunk size</dt><dd className="text-right">{q.run.config.max_words} words{q.run.config.section_aware ? ", along headings" : ""}</dd>
            <dt className="text-ink-3">Passages per question</dt><dd className="text-right">{q.run.config.k}</dd>
            <dt className="text-ink-3">Score floor</dt><dd className="text-right">{q.run.config.min_score > 0 ? f2(q.run.config.min_score) : "Off"}</dd>
          </dl>
        </Card>
      </div>
    </div>
  );
}
