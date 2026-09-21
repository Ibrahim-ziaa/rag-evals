import { ChevronRight } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApi, type Run, type RunDetail } from "../api";
import { Card, DocName, Empty, ErrorBox, PageHeader, PassPill, Pill, Select, Skeleton } from "../components/ui";
import { f2, KIND_LABEL, when } from "../format";
import { SHORT } from "./Overview";

const FILTERS = [["all", "All"], ["failed", "Failing"], ["passed", "Passing"], ["paraphrased", "Paraphrased"], ["two_docs", "Two documents"], ["unanswerable", "Unanswerable"]] as const;

export default function Questions() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const runId = params.get("run") ?? "latest";
  const filter = params.get("filter") ?? "all";
  const runs = useApi<{ runs: Run[] }>("/runs").data?.runs ?? [];
  const { data, error, reload } = useApi<RunDetail>(`/runs/${runId}`);
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }); };

  if (error) return <ErrorBox message={error} retry={reload} />;
  if (!data) return <Skeleton />;
  const match = (q: RunDetail["questions"][number]) => filter === "all" || (filter === "failed" && !q.passed) || (filter === "passed" && q.passed) || q.kind === filter;
  const rows = data.questions.filter(match);
  const keys = Object.keys(SHORT) as (keyof typeof data.summary)[];

  return (
    <div>
      <PageHeader title="Test questions"
        sub={`Run ${data.number} (${data.config.name}, ${when(data.created_at)}): ${data.passed} of ${data.total} questions pass. Open any question to see what was retrieved and why each measure scored the way it did.`}
        actions={<Select label="Run" value={data.id} onChange={(v) => set("run", v)}>{[...runs].reverse().map((r) => <option key={r.id} value={r.id}>Run {r.number}: {r.config.name}</option>)}</Select>} />
      <div className="px-8 py-6">
        <div className="mb-3 flex gap-1" role="tablist">
          {FILTERS.map(([key, label]) => {
            const n = data.questions.filter((q) => key === "all" || (key === "failed" && !q.passed) || (key === "passed" && q.passed) || q.kind === key).length;
            return (
              <button key={key} role="tab" aria-selected={filter === key} onClick={() => set("filter", key)}
                className={`rounded-md px-2.5 py-1 text-[13px] ${filter === key ? "bg-accent font-medium text-on-accent" : "text-ink-2 hover:bg-rail"}`}>
                {label} <span className={`tnum ${filter === key ? "text-on-accent/75" : "text-ink-3"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <Card className="overflow-hidden">
          {rows.length === 0 ? <Empty title="No questions match" body="Choose another filter." /> : (
            <table className="w-full text-[13.5px]">
              <thead className="border-b border-line bg-rail/60 text-left text-[12px] text-ink-3">
                <tr>
                  <th className="py-2 pl-4 pr-2">ID</th><th className="px-2 py-2">Question</th><th className="px-2 py-2">Retrieved documents</th>
                  {keys.map((k) => <th key={k} className="px-2 py-2 text-right">{SHORT[k]}</th>)}
                  <th className="px-2 py-2">Result</th><th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((q) => (
                  <tr key={q.id} onClick={() => navigate(`/quality/runs/${data.id}/questions/${q.id}`)} className="cursor-pointer hover:bg-rail/50">
                    <td className="py-2 pl-4 pr-2 font-mono text-[12px] text-ink-3">{q.id}</td>
                    <td className="max-w-[420px] px-2 py-2">
                      <Link to={`/quality/runs/${data.id}/questions/${q.id}`} className="font-medium hover:underline">{q.question}</Link>
                      {q.kind !== "direct" && <span className="ml-2"><Pill tone={q.kind === "unanswerable" ? "warn" : "neutral"}>{KIND_LABEL[q.kind]}</Pill></span>}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {q.retrieved_docs.length === 0 && <span className="text-[12.5px] text-ink-3">Declined, nothing above the floor</span>}
                        {q.retrieved_docs.map((d) => <DocName key={d} id={d} tone={q.expected_docs.includes(d) ? "good" : "bad"} />)}
                      </div>
                    </td>
                    {keys.map((k) => <td key={k} className={`tnum px-2 text-right ${q.metrics[k] < 1 ? "font-medium text-bad" : "text-ink-3"}`}>{f2(q.metrics[k])}</td>)}
                    <td className="px-2"><PassPill passed={q.passed} /></td>
                    <td className="pr-3 text-ink-3"><ChevronRight size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
