import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi, type DocDetail, type DocRow } from "../api";
import { Card, CardHead, ErrorBox, PageHeader, Skeleton } from "../components/ui";
import { ago, when } from "../format";

export default function Documents() {
  const [params, setParams] = useSearchParams();
  const list = useApi<{ documents: DocRow[] }>("/docs");
  const docs = list.data?.documents ?? [];
  const selected = params.get("doc") ?? docs[0]?.id ?? null;
  const chunk = params.get("chunk");
  const detail = useApi<DocDetail>(selected ? `/docs/${selected}` : null);
  const scroller = useRef<HTMLOListElement | null>(null);
  const chunkRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    // scroll only the passage list, never the page
    if (scroller.current) scroller.current.scrollTop = chunkRef.current ? Math.max(0, chunkRef.current.offsetTop - scroller.current.offsetTop - 120) : 0;
  }, [detail.data, chunk]);

  if (list.error) return <ErrorBox message={list.error} retry={list.reload} />;
  const totals = docs.reduce((a, d) => ({ words: a.words + d.words, chunks: a.chunks + d.chunks }), { words: 0, chunks: 0 });

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Documents"
        sub={docs.length ? `${docs.length} markdown documents, ${totals.words.toLocaleString()} words, split into ${totals.chunks} passages along their headings. Last indexed ${ago(docs[0].indexed_at)}.` : "Loading the corpus"} />
      {list.loading && !docs.length ? <Skeleton /> : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 px-8 py-6">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 overflow-y-auto">
              <table className="w-full text-[13.5px]">
                <thead className="sticky top-0 border-b border-line bg-rail text-left text-[12px] text-ink-3">
                  <tr>
                    <th className="py-2 pl-4 pr-2">Document</th>
                    <th className="px-2 py-2 text-right">Words</th>
                    <th className="px-2 py-2 text-right">Sections</th>
                    <th className="px-2 py-2 text-right">Passages</th>
                    <th className="px-2 py-2 text-right" title="Test questions whose expected answer lives in this document">Tests</th>
                    <th className="py-2 pl-2 pr-4 text-right">Last indexed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {docs.map((d) => (
                    <tr key={d.id} onClick={() => setParams({ doc: d.id })} aria-selected={d.id === selected}
                      className={`cursor-pointer whitespace-nowrap ${d.id === selected ? "bg-accent-soft/70" : "hover:bg-rail/60"}`}>
                      <td className="max-w-0 w-full truncate py-[7px] pl-4 pr-2" title={d.file}>
                        <Link to={`/documents?doc=${d.id}`} className={d.id === selected ? "font-semibold" : "font-medium"}>{d.title}</Link>
                      </td>
                      <td className="tnum px-2 text-right text-ink-2">{d.words}</td>
                      <td className="tnum px-2 text-right text-ink-2">{d.sections}</td>
                      <td className="tnum px-2 text-right font-medium">{d.chunks}</td>
                      <td className="tnum px-2 text-right text-ink-2">{d.gold_questions}</td>
                      <td className="tnum pl-2 pr-4 text-right text-ink-2">{when(d.indexed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="flex min-h-0 flex-col">
            {detail.error ? <ErrorBox message={detail.error} retry={detail.reload} /> : !detail.data ? <Skeleton rows={5} /> : (
              <>
                <CardHead title={detail.data.title}
                  hint={<><span className="font-mono text-[12px]">{detail.data.file}</span>, {detail.data.chunk_count} passages of up to 80 words. Each is indexed together with its page title and heading.</>} />
                <ol ref={scroller} className="relative min-h-0 flex-1 divide-y divide-line overflow-y-auto">
                  {detail.data.chunks.map((c) => {
                    const on = chunk !== null && Number(chunk) === c.chunk_id;
                    return (
                      <li key={c.id} ref={on ? chunkRef : undefined} className={`relative px-5 py-3.5 ${on ? "bg-accent-soft/60" : ""}`}>
                        {on && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
                        <div className="mb-1 flex items-baseline justify-between gap-3">
                          <span className="text-[13px] font-semibold">{c.section}</span>
                          <span className="tnum shrink-0 font-mono text-[11.5px] text-ink-3">passage {c.chunk_id}, {c.words} words, chars {c.start} to {c.end}</span>
                        </div>
                        <p className="whitespace-pre-line text-[13.5px] leading-[1.6] text-ink-2">{c.text}</p>
                      </li>
                    );
                  })}
                </ol>
                {detail.data.questions.length > 0 && (
                  <div className="border-t border-line bg-rail/50 px-5 py-2.5 text-[12.5px] text-ink-2">
                    Tested by {detail.data.questions.length} question{detail.data.questions.length === 1 ? "" : "s"}:{" "}
                    {detail.data.questions.map((q) => <Link key={q.id} to={`/quality/runs/latest/questions/${q.id}`} className="mr-2 font-mono text-accent hover:underline" title={q.question}>{q.id}</Link>)}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
