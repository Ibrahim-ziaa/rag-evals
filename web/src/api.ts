import { useCallback, useEffect, useState } from "react";

export type MetricKey = "retrieval_precision" | "retrieval_recall" | "mrr" | "groundedness" | "relevance" | "abstain_correct";
export type Summary = Record<MetricKey, number>;

export interface Config {
  id: string; name: string; summary: string; max_words: number; overlap: number; section_aware: boolean;
  k: number; min_score: number; max_per_doc: number | null; rel_floor: number; synonyms: boolean;
}
export interface Meta {
  product: string; company: string; documents: number; chunks: number; gold_questions: number; unanswerable_questions: number;
  generator: "extractive" | "claude"; production: Config; suggested: string[]; tolerance: number; configs: Config[];
  metrics: { key: MetricKey; label: string; help: string; short: string }[];
  reliability: { before: Tally; after: Tally };
}
export interface Passage {
  rank: number; id: string; doc_id: string; chunk_id: number; title: string; section: string; score: number; text: string;
}
export interface Source extends Passage { n: number | null; highlights: [number, number][] }
export interface Candidate extends Passage { kept: boolean; expected?: boolean }
export type Part = { type: "text"; text: string } | { type: "cite"; n: number; passage_id: string; known: boolean };
export interface Rendered { text: string; parts: Part[]; sources: Source[] }
export interface AskResult extends Rendered {
  question: string; searched_as: string | null; abstained: boolean; candidates: Candidate[]; floor: number; best_score: number;
  generator: string; latency_ms: number;
  checks: { citations: number; citations_valid: number; sentences: number; sentences_verbatim: number; candidates: number; kept: number; documents_used: number; passages_searched: number; documents_searched: number };
  decline?: { reason: string; unknown_words: string[] };
}
export interface DocRow {
  id: string; title: string; file: string; words: number; sections: number; chunks: number; indexed_at: string; gold_questions: number;
}
export interface DocDetail extends Omit<DocRow, "chunks"> {
  chunk_count: number; text: string;
  chunks: { id: string; chunk_id: number; section: string; words: number; start: number; end: number; text: string }[];
  questions: { id: string; question: string }[];
}
export interface Gate { status: "pass" | "fail"; tolerance: number; regressions: { metric: MetricKey; baseline: number; value: number }[] }
export interface Run {
  id: string; number: number; config: Config; note: string; trigger: "seed" | "manual"; created_at: string; duration_ms: number;
  chunks: number; summary: Summary; total: number; passed: number; gate: Gate; is_baseline: boolean; deltas: Summary;
}
export interface QuestionRow {
  id: string; kind: string; question: string; passed: boolean; abstained: boolean; expected_docs: string[];
  retrieved_docs: string[]; top_score: number; metrics: Summary;
}
export interface RunDetail extends Run { questions: QuestionRow[] }
export interface QuestionDetail {
  run: { id: string; number: number; config: Config; created_at: string }; id: string; kind: string; question: string;
  expected_docs: string[]; must_mention: string[]; expect_abstain: boolean; passed: boolean; abstained: boolean;
  answer: Rendered; floor: number; candidates: Candidate[];
  metrics: { key: MetricKey; label: string; value: number; why: string }[];
  history: { run_id: string; number: number; config: string; is_baseline: boolean; passed: boolean }[]; prev: string | null; next: string | null;
}
export interface Side { passed: boolean; abstained: boolean; docs: { doc_id: string; score: number }[]; recall: number; relevance: number; abstain_correct: number }
export type Change = "fixed" | "regressed" | "still_passing" | "still_failing";
export interface Tally {
  passed: number; total: number; unanswerable_total: number; unanswerable_declined: number;
  answerable_total: number; answerable_declined: number; wrong_answers: number;
}
export interface Compare {
  before: Run; after: Run; tally: { before: Tally; after: Tally };
  metrics: { key: MetricKey; label: string; help: string; short: string; before: number; after: number; delta: number }[];
  settings: { key: string; label: string; before: unknown; after: unknown; changed: boolean }[];
  counts: Record<Change, number>;
  questions: { id: string; kind: string; question: string; expected_docs: string[]; change: Change; reason: string; before: Side; after: Side }[];
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* keep status text */ }
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
  }
  return res.json();
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (path === null) { setData(null); setLoading(false); return; }
    let live = true;
    setLoading(true);
    setError(null);
    api<T>(path).then((d) => live && setData(d)).catch((e) => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
