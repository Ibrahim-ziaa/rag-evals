import { ArrowRight, ChevronRight } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApi, type Change, type Compare as CompareData, type Run, type Side } from "../api";
import { Dumbbell } from "../components/charts";
import { Card, CardHead, DocName, Empty, ErrorBox, PageHeader, PassPill, Pill, Select, Skeleton } from "../components/ui";
import { f2, KIND_LABEL, settingValue, signed } from "../format";

const TABS: { key: Change | "all"; label: string }[] = [
  { key: "fixed", label: "Fixed" }, { key: "regressed", label: "Got worse" }, { key: "still_failing", label: "Still failing" },
  { key: "still_passing", label: "Still passing" }, { key: "all", label: "All" },
];

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const before = params.get("before"), after = params.get("after");
  const show = (params.get("show") ?? "fixed") as Change | "all";
  const qs = new URLSearchParams();
  if (before) qs.set("before", before);
  if (after) qs.set("after", after);
  const { data, error, reload } = useApi<CompareData>(`/compare${qs.size ? `?${qs}` : ""}`);
  const runs = useApi<{ runs: Run[] }>("/runs").data?.runs ?? [];
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }); };

  if (error) return <ErrorBox message={error} retry={reload} />;
  if (!data) return <Skeleton />;
  const { tally: t } = data;
  const rows = data.questions.filter((q) => show === "all" || q.change === show);
  const runLabel = (r: Run) => `Run ${r.number}: ${r.config.name}`;

  return (
    <div>
      <PageHeader title="Retrieval fix: what changed"
        sub="The same 50 test questions, the same documents and the same answer engine, evaluated under two retrieval setups. Only the settings listed below differ, so every change in the numbers is caused by them."
        actions={<>
          <Select label="Before run" value={data.before.id} onChange={(v) => set("before", v)}>{runs.map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}</Select>
          <ArrowRight size={15} className="text-ink-3" />
          <Select label="After run" value={data.after.id} onChange={(v) => set("after", v)}>{runs.map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}</Select>
        </>} />
      <div className="space-y-5 px-8 py-6">
        <div className="grid grid-cols-4 gap-4">
          <Headline label="Questions answered correctly" before={t.before.passed} after={t.after.passed} of={t.after.total} better="up"
            note={`${data.counts.fixed} fixed, ${data.counts.regressed} got worse, ${data.counts.still_failing} still failing.`} />
          <Headline label="Wrong answers given" before={t.before.wrong_answers} after={t.after.wrong_answers} of={t.after.total} better="down"
            note="An answer that misses the required fact, or answers a question it should decline." />
          <Headline label="Unanswerable questions declined" before={t.before.unanswerable_declined} after={t.after.unanswerable_declined} of={t.after.unanswerable_total} better="up"
            note="Out of scope questions, such as products the company does not sell." />
          <Headline label="Answerable questions declined" before={t.before.answerable_declined} after={t.after.answerable_declined} of={t.after.answerable_total} better="down"
            note="The cost of the score floor: questions worded very differently from the handbook." />
        </div>

        <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-5">
          <Card className="overflow-hidden">
            <CardHead title="Six measures, before and after"
              right={<span className="flex items-center gap-4 text-[12px] text-ink-2">
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full border-[1.75px] border-ink-2 bg-panel" />Before</span>
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />After</span>
              </span>} />
            <table className="w-full text-[13.5px]">
              <thead className="border-b border-line bg-rail/60 text-left text-[12px] text-ink-3">
                <tr><th className="px-4 py-2">Measure</th><th className="px-2 py-2 text-right">Before</th><th className="px-2 py-2 text-right">After</th><th className="px-2 py-2 text-right">Change</th><th className="hidden px-4 py-2 min-[1400px]:table-cell">0 to 1</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.metrics.map((m) => (
                  <tr key={m.key}>
                    <td className="px-4 py-[9px]" title={m.help}><div className="font-medium leading-snug">{m.label}</div><div className="text-[12.5px] leading-snug text-ink-3">{m.short}</div></td>
                    <td className="tnum px-2 text-right text-ink-2">{f2(m.before)}</td>
                    <td className="tnum px-2 text-right font-semibold">{f2(m.after)}</td>
                    <td className="px-2 text-right"><Pill tone={m.delta > 0.005 ? "good" : m.delta < -0.005 ? "bad" : "neutral"}><span className="tnum">{signed(m.delta)}</span></Pill></td>
                    <td className="hidden px-4 min-[1400px]:table-cell"><Dumbbell before={m.before} after={m.after} width={190} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.before.config.k < data.after.config.k && data.metrics[0].delta < 0 && <p className="border-t border-line bg-rail/50 px-4 py-2.5 text-[12.5px] text-ink-2">
              Precision falls when three passages are retrieved instead of one: more context, some of it off topic. "Knows when to decline" can stay flat while behaviour changes, see the two cards on the right above.
            </p>}
          </Card>

          <Card className="overflow-hidden">
            <CardHead title="What was changed" hint={`${data.settings.filter((s) => s.changed).length} of ${data.settings.length} retrieval settings differ`} />
            <table className="w-full text-[13.5px]">
              <thead className="border-b border-line bg-rail/60 text-left text-[12px] text-ink-3">
                <tr><th className="px-4 py-2">Setting</th><th className="px-2 py-2">Before</th><th className="px-4 py-2">After</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.settings.map((s) => (
                  <tr key={s.key} className={s.changed ? "" : "text-ink-3"}>
                    <td className="px-4 py-[9px]">{s.label}</td>
                    <td className="tnum whitespace-nowrap px-2">{settingValue(s.key, s.before)}</td>
                    <td className={`tnum px-4 ${s.changed ? "font-semibold text-ink" : ""}`}>{settingValue(s.key, s.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-line bg-rail/50 px-4 py-2.5 text-[12.5px] text-ink-2">
              Before: {data.before.config.summary.toLowerCase()}. After: {data.after.config.summary.toLowerCase()}.
            </p>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="font-serif text-[16px] font-semibold leading-snug tracking-[-0.005em]">Question by question</h2>
            <div className="flex gap-1" role="tablist">
              {TABS.map((tab) => {
                const n = tab.key === "all" ? data.questions.length : data.counts[tab.key];
                return (
                  <button key={tab.key} role="tab" aria-selected={show === tab.key} onClick={() => set("show", tab.key)}
                    className={`rounded-md px-2.5 py-1 text-[13px] ${show === tab.key ? "bg-accent font-medium text-on-accent" : "text-ink-2 hover:bg-rail"}`}>
                    {tab.label} <span className={`tnum ${show === tab.key ? "text-on-accent/75" : "text-ink-3"}`}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {rows.length === 0 ? <Empty title="No questions in this group" body={show === "regressed" ? "Nothing that passed before fails now." : "Pick another group or another pair of runs."} /> : (
            <table className="w-full table-fixed text-[13.5px]">
              <colgroup><col className="w-[52px]" /><col className="w-[27%]" /><col className="w-[21%]" /><col className="w-[21%]" /><col /><col className="w-[34px]" /></colgroup>
              <thead className="border-b border-line bg-rail/60 text-left text-[12px] text-ink-3">
                <tr><th className="py-2 pl-4">ID</th><th className="px-2 py-2">Question and expected documents</th><th className="px-2 py-2">Before: retrieved</th><th className="px-2 py-2">After: retrieved</th><th className="px-2 py-2">Why</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((q) => (
                  <tr key={q.id} onClick={() => navigate(`/quality/runs/${data.after.id}/questions/${q.id}`)} className="cursor-pointer align-top hover:bg-rail/50">
                    <td className="py-3 pl-4 font-mono text-[12px] text-ink-3">{q.id}</td>
                    <td className="px-2 py-3">
                      <Link to={`/quality/runs/${data.after.id}/questions/${q.id}`} className="font-medium leading-snug hover:underline">{q.question}</Link>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {q.kind !== "direct" && <Pill tone={q.kind === "unanswerable" ? "warn" : "neutral"}>{KIND_LABEL[q.kind]}</Pill>}
                        {q.expected_docs.map((d) => <DocName key={d} id={d} />)}
                        {q.expected_docs.length === 0 && <span className="text-[12.5px] text-ink-3">No document should match</span>}
                      </div>
                    </td>
                    <td className="px-2 py-3"><SideCell s={q.before} expected={q.expected_docs} /></td>
                    <td className="px-2 py-3"><SideCell s={q.after} expected={q.expected_docs} /></td>
                    <td className="px-2 py-3 text-[13px] leading-snug text-ink-2">{q.reason}</td>
                    <td className="py-3 pr-3 text-ink-3"><ChevronRight size={16} /></td>
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

function Headline({ label, before, after, of, better, note }: { label: string; before: number; after: number; of: number; better: "up" | "down"; note?: string }) {
  const diff = after - before;
  const good = diff === 0 ? null : (diff > 0) === (better === "up");
  return (
    <Card className="px-4 py-3.5">
      <h3 className="text-[12.5px] font-medium text-ink-2">{label}</h3>
      <div className="mt-1.5 flex items-baseline gap-2.5 tnum">
        <span className="font-serif text-[22px] font-normal text-ink-3">{before}</span>
        <ArrowRight size={16} className="relative top-0.5 text-ink-3" />
        <span className="font-serif text-[34px] font-semibold leading-none tracking-[-0.02em]">{after}</span>
        <span className="text-[13px] text-ink-3">of {of}</span>
        <span className="ml-auto">{good !== null && <Pill tone={good ? "good" : "warn"}>{diff > 0 ? "+" : "-"}{Math.abs(diff)}</Pill>}</span>
      </div>
      {note && <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{note}</p>}
    </Card>
  );
}

function SideCell({ s, expected }: { s: Side; expected: string[] }) {
  const docs = [...new Set(s.docs.map((d) => d.doc_id))];
  return (
    <div>
      <PassPill passed={s.passed} />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {s.abstained && docs.length === 0 && <span className="text-[12.5px] text-ink-2">Declined, nothing above the floor</span>}
        {docs.map((d) => <DocName key={d} id={d} tone={expected.includes(d) ? "good" : "bad"} />)}
      </div>
    </div>
  );
}
