import { CheckCircle2, Play, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi, type Meta, type Run } from "../api";
import { Sparkline, TrendChart } from "../components/charts";
import { Button, Card, CardHead, ErrorBox, PageHeader, Pill, Select, Skeleton } from "../components/ui";
import { ago, f2, signed, when } from "../format";

export default function Overview() {
  const { data: meta } = useApi<Meta>("/meta");
  const { data, error, loading, reload } = useApi<{ baseline_id: string; runs: Run[] }>("/runs");
  const [config, setConfig] = useState("production");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  async function runNow() {
    setRunning(true);
    setRunError(null);
    try {
      const r = await api<Run>("/runs", { method: "POST", body: JSON.stringify({ config_id: config }) });
      setFresh(r.id);
      reload();
    } catch (e) { setRunError((e as Error).message); } finally { setRunning(false); }
  }

  if (error) return <ErrorBox message={error} retry={reload} />;
  if (!data || !meta) return <Skeleton />;
  const runs = data.runs;
  const latest = runs[runs.length - 1];
  const baseline = runs.find((r) => r.is_baseline)!;
  const pass = latest.gate.status === "pass";
  const labelOf = (k: string) => meta.metrics.find((m) => m.key === k)?.label ?? k;

  return (
    <div>
      <PageHeader title="Quality overview"
        sub={`${meta.gold_questions} test questions with known answers, ${meta.unanswerable_questions} of them deliberately unanswerable, scored on six measures. A change ships only if no measure falls more than ${f2(meta.tolerance)} below the accepted baseline.`}
        actions={<>
          <Select label="Configuration to evaluate" value={config} onChange={setConfig}>
            {meta.configs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.id === "production" ? " (live)" : ""}</option>)}
          </Select>
          <Button onClick={runNow} disabled={running}><Play size={14} />{running ? "Running 50 questions" : "Run evaluation"}</Button>
        </>} />
      <div className="space-y-5 px-8 py-6">
        {runError && <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-[13px] text-bad">Run failed: {runError}</p>}

        <Card className={`flex items-center gap-5 px-5 py-4 ${pass ? "" : "border-bad/40"}`}>
          {pass ? <CheckCircle2 size={30} className="shrink-0 text-good" strokeWidth={1.75} /> : <XCircle size={30} className="shrink-0 text-bad" strokeWidth={1.75} />}
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[19px] font-semibold leading-snug tracking-[-0.01em]">{pass ? "Release gate passed" : "Release gate failed"}</div>
            <p className="text-[13.5px] text-ink-2">
              Run {latest.number} ({latest.config.name}, {ago(latest.created_at)}){" "}
              {pass
                ? <>holds every measure within {f2(latest.gate.tolerance)} of the baseline set by run {baseline.number}.</>
                : <>dropped below the baseline on {latest.gate.regressions.map((g, i) => <span key={g.metric}>{i ? ", " : ""}<span className="font-medium text-bad">{labelOf(g.metric).toLowerCase()} ({f2(g.baseline)} to {f2(g.value)})</span></span>)}. In CI this exits with code 1 and blocks the merge.</>}
            </p>
          </div>
          <div className="shrink-0 border-l border-line pl-5 text-right">
            <div className="tnum font-serif text-[28px] font-semibold leading-none tracking-[-0.015em]">{latest.passed}<span className="text-[16px] font-normal text-ink-3"> / {latest.total}</span></div>
            <Link to={`/quality/questions?run=${latest.id}`} className="text-[12.5px] text-accent hover:underline">questions pass</Link>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-4 min-[1500px]:grid-cols-6">
          {meta.metrics.map((m) => {
            const v = latest.summary[m.key], d = latest.deltas[m.key], since = v - runs[0].summary[m.key];
            const tone = d < -latest.gate.tolerance ? "bad" : d > 0.005 ? "good" : "neutral";
            return (
              <Card key={m.key} className="px-4 pb-3 pt-3.5" >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[12.5px] font-medium text-ink-2" title={m.help}>{m.label}</h3>
                </div>
                <div className="mt-1 flex items-end justify-between">
                  <span className="tnum font-serif text-[30px] font-semibold leading-none tracking-[-0.02em]">{f2(v)}</span>
                  <Sparkline values={runs.map((r) => r.summary[m.key])} width={96} height={30} />
                </div>
                <dl className="mt-2.5 space-y-1 text-[12px] text-ink-3">
                  <div className="flex items-center justify-between">
                    <dt className="tnum">Baseline {f2(baseline.summary[m.key])}</dt>
                    <dd><Pill tone={tone}><span className="tnum">{Math.abs(d) < 0.005 ? "No change" : signed(d)}</span></Pill></dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="tnum">Run 1 was {f2(runs[0].summary[m.key])}</dt>
                    <dd className={`tnum font-medium ${since > 0.005 ? "text-good" : since < -0.005 ? "text-bad" : "text-ink-3"}`}>{signed(since)}</dd>
                  </div>
                </dl>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHead title="Questions passing, by evaluation run"
            hint="A question passes when every expected document is retrieved, the answer holds the required facts, citations are real, and it declines only when it should."
            right={<Link to="/quality/compare" className="shrink-0 text-[13px] font-medium text-accent hover:underline">See what the retrieval fix changed</Link>} />
          <div className="px-4 pb-4 pt-3">
            <TrendChart total={latest.total} baselineValue={baseline.passed}
              points={runs.map((r) => ({ id: r.id, label: `Run ${r.number}`, sub: r.config.name.replace("Experiment: t", "T"), value: r.passed, failed: r.gate.status === "fail", baseline: r.is_baseline }))} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHead title="Run history" hint={loading ? "Refreshing" : `${runs.length} runs. Every row is a real execution of the evaluator against the ${meta.gold_questions} test questions.`} />
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="border-b border-line bg-rail/60 text-left text-[12px] text-ink-3">
                <tr>
                  <th className="py-2 pl-4 pr-2">Run</th><th className="px-2 py-2">When</th><th className="px-2 py-2">Configuration</th>
                  <th className="px-2 py-2 text-right">Passing</th>
                  {meta.metrics.map((m) => <th key={m.key} className="px-2 py-2 text-right" title={m.help}>{SHORT[m.key]}</th>)}
                  <th className="px-2 py-2 text-right">Time</th><th className="py-2 pl-2 pr-4">Gate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...runs].reverse().map((r) => (
                  <tr key={r.id} className={r.id === fresh ? "bg-accent-soft/70" : "hover:bg-rail/50"}>
                    <td className="tnum py-2 pl-4 pr-2 font-medium"><Link to={`/quality/questions?run=${r.id}`} className="hover:underline">{r.number}</Link></td>
                    <td className="tnum whitespace-nowrap px-2 text-ink-2">{when(r.created_at)}</td>
                    <td className="px-2 py-2 leading-snug">
                      <span className="font-medium">{r.config.name}</span>
                      {r.is_baseline && <span className="ml-2"><Pill tone="accent">Baseline</Pill></span>}
                      {r.trigger === "manual" && <span className="ml-2"><Pill>Manual</Pill></span>}
                      <div className="text-[12.5px] text-ink-3">{r.note}</div>
                    </td>
                    <td className="tnum px-2 text-right font-medium">{r.passed}<span className="font-normal text-ink-3">/{r.total}</span></td>
                    {meta.metrics.map((m) => {
                      const bad = r.gate.regressions.some((g) => g.metric === m.key);
                      return <td key={m.key} className={`tnum px-2 text-right ${bad ? "font-medium text-bad" : "text-ink-2"}`}>{f2(r.summary[m.key])}</td>;
                    })}
                    <td className="tnum whitespace-nowrap px-2 text-right text-ink-3">{r.duration_ms} ms</td>
                    <td className="py-2 pl-2 pr-4">
                      {r.gate.status === "pass"
                        ? <Pill tone="good" icon={<CheckCircle2 size={12} />}>Passed</Pill>
                        : <Pill tone="bad" icon={<XCircle size={12} />}>Failed</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

export const SHORT: Record<string, string> = {
  retrieval_precision: "Precision", retrieval_recall: "Recall", mrr: "MRR", groundedness: "Grounded", relevance: "Relevance", abstain_correct: "Declines",
};
