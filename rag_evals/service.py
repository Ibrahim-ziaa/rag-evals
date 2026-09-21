"""In-memory demo state behind the web app: the production index, the evaluation history, ask and compare.

Nothing here is precomputed. On start (and on reset) the evaluator really runs each seeded configuration
against the gold set; the only thing that is staged is the timestamps, which are spread over the past
three weeks so the history reads like a project rather than eight runs in one second."""
from __future__ import annotations

import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .answer import ABSTAIN, CITATION, ExtractiveGenerator, Generator, answer, expand_query, sentence_spans
from .config import HANDBOOK_DOCS, HANDBOOK_GOLD, PRESETS, PRODUCTION, RagConfig, load_synonyms
from .explain import METRIC_KEYS, METRICS, explain, flip_reason, passed
from .index import STOP, WORD, Index, TfidfEmbedder, chunk_documents, stem, tokens
from .runner import TOLERANCE, compare, load_gold, run

# (config id, days ago, note)
SEED_PLAN = [
    ("initial", 21.0, "First working version"),
    ("smaller-chunks", 18.2, "Split pages into 120 word chunks"),
    ("top-3", 15.1, "Retrieve three passages instead of one"),
    ("score-floor", 11.3, "Decline when nothing scores above 0.12"),
    ("section-aware", 7.0, "Chunk along document headings"),
    ("production", 5.2, "Per document cap, weak passage cut, synonyms. Accepted as baseline"),
    ("top-5", 2.1, "Tried five passages per question"),
    ("production", 0.15, "Scheduled check"),
]

SUGGESTED = [
    "How long is the warranty on a Halden dishwasher?",
    "What does error code E24 mean on the dishwasher?",
    "My ice maker stopped making ice, could it be the water filter, and what does a new filter cost?",
    "Can I put the washing machine on top of the dryer to save space?",
    "What is the warranty on a Halden air conditioner?",
]


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class Demo:
    def __init__(self, docs_dir: Path = HANDBOOK_DOCS, gold_path: Path = HANDBOOK_GOLD, generator: Generator | None = None):
        self.docs_dir, self.gold_path = Path(docs_dir), Path(gold_path)
        self.synonyms = load_synonyms()
        self.gold = load_gold(self.gold_path)
        self.gold_by_id = {g["id"]: g for g in self.gold}
        self.live = generator is None and os.environ.get("RAG_EVALS_LIVE") == "1"
        if generator is None:
            if self.live:
                from .answer import AnthropicGenerator
                generator = AnthropicGenerator()
            else:
                generator = ExtractiveGenerator()
        self.generator = generator
        self._indexes: dict[tuple, Index] = {}
        self._lock = threading.Lock()
        self.runs: list[dict] = []
        self.baseline_id = ""
        self.reset()

    # ---------------------------------------------------------------- index
    def index_for(self, config: RagConfig) -> Index:
        key = config.chunking_key()
        if key not in self._indexes:
            self._indexes[key] = Index(chunk_documents(self.docs_dir, config.max_words, config.overlap, config.section_aware))
            if config.chunking_key() == PRODUCTION.chunking_key():
                self.indexed_at = datetime.now(timezone.utc)
        return self._indexes[key]

    # ---------------------------------------------------------------- runs
    def reset(self) -> None:
        with self._lock:
            self.runs, self.baseline_id = [], ""
            now = datetime.now(timezone.utc)
            for config_id, days_ago, note in SEED_PLAN:
                r = self._execute(PRESETS[config_id], note, "seed", now - timedelta(days=days_ago))
                if config_id == "production" and not self.baseline_id:
                    self.baseline_id = r["id"]

    def _execute(self, config: RagConfig, note: str, trigger: str, when: datetime | None = None) -> dict:
        t0 = time.perf_counter()
        index = self.index_for(config)
        summary, _, details = run(self.docs_dir, self.gold_path, self.generator, k=config.k, min_score=config.min_score,
                                  index=index, **config.retrieval_kwargs(self.synonyms))
        for d in details:
            d["passed"] = passed(d)
        r = {"id": f"run-{len(self.runs) + 1:03d}", "number": len(self.runs) + 1, "config": config.to_dict(), "note": note,
             "trigger": trigger, "created_at": _iso(when or datetime.now(timezone.utc)),
             "duration_ms": round((time.perf_counter() - t0) * 1000), "chunks": len(index.chunks),
             "summary": summary, "total": len(details), "passed": sum(d["passed"] for d in details), "details": details}
        self.runs.append(r)
        return r

    def execute(self, config_id: str, note: str = "") -> dict:
        if config_id not in PRESETS:
            raise KeyError(config_id)
        with self._lock:
            r = self._execute(PRESETS[config_id], note or "Manual run", "manual")
        return self.run_summary(r)

    def get_run(self, run_id: str) -> dict:
        if run_id in ("latest", "baseline") and self.runs:
            return self.runs[-1] if run_id == "latest" else self.get_run(self.baseline_id)
        for r in self.runs:
            if r["id"] == run_id:
                return r
        raise KeyError(run_id)

    @property
    def baseline(self) -> dict:
        return self.get_run(self.baseline_id)

    def gate(self, r: dict) -> dict:
        base = self.baseline["summary"]
        regressions = [{"metric": k, "baseline": base[k], "value": r["summary"][k]}
                       for k in METRIC_KEYS if r["summary"][k] < base[k] - TOLERANCE]
        assert len(regressions) == len(compare(r["summary"], base))
        return {"status": "fail" if regressions else "pass", "tolerance": TOLERANCE, "regressions": regressions}

    def run_summary(self, r: dict) -> dict:
        out = {k: v for k, v in r.items() if k != "details"}
        out["gate"] = self.gate(r)
        out["is_baseline"] = r["id"] == self.baseline_id
        out["deltas"] = {k: round(r["summary"][k] - self.baseline["summary"][k], 4) for k in METRIC_KEYS}
        return out

    def question_row(self, d: dict) -> dict:
        g = self.gold_by_id[d["id"]]
        return {"id": d["id"], "kind": g.get("kind", "direct"), "question": d["question"], "passed": d["passed"],
                "abstained": d["abstained"], "expected_docs": g["relevant_docs"],
                "retrieved_docs": list(dict.fromkeys(p["doc_id"] for p in d["passages"])),
                "top_score": d["candidates"][0]["score"] if d["candidates"] else 0.0,
                "metrics": {k: d[k] for k in METRIC_KEYS}}

    def run_detail(self, run_id: str) -> dict:
        r = self.get_run(run_id)
        return {**self.run_summary(r), "questions": [self.question_row(d) for d in r["details"]]}

    def question_detail(self, run_id: str, qid: str) -> dict:
        r = self.get_run(run_id)
        d = next((d for d in r["details"] if d["id"] == qid), None)
        if d is None:
            raise KeyError(qid)
        g = self.gold_by_id[qid]
        why = explain(g, d)
        ids = [x["id"] for x in r["details"]]
        i = ids.index(qid)
        return {"run": {k: r[k] for k in ("id", "number", "config", "created_at")}, "id": qid, "kind": g.get("kind", "direct"),
                "question": d["question"], "expected_docs": g["relevant_docs"], "must_mention": g.get("must_mention", []),
                "expect_abstain": bool(g.get("expect_abstain")), "passed": d["passed"], "abstained": d["abstained"],
                "answer": self._render(d["answer"], d["passages"]), "floor": r["config"]["min_score"],
                "candidates": [{**c, "kept": any(p["id"] == c["id"] for p in d["passages"]),
                                "expected": c["doc_id"] in g["relevant_docs"]} for c in d["candidates"]],
                "metrics": [{"key": k, "label": label, "value": d[k], "why": why[k]} for k, label, _, _ in METRICS],
                "history": [{"run_id": x["id"], "number": x["number"], "config": x["config"]["name"], "is_baseline": x["id"] == self.baseline_id,
                             "passed": next(y["passed"] for y in x["details"] if y["id"] == qid)} for x in self.runs],
                "prev": ids[i - 1] if i > 0 else None, "next": ids[i + 1] if i + 1 < len(ids) else None}

    # ---------------------------------------------------------------- compare
    def compare(self, before_id: str | None = None, after_id: str | None = None) -> dict:
        before = self.get_run(before_id) if before_id else next(r for r in self.runs if r["config"]["id"] == "initial")
        after = self.get_run(after_id) if after_id else self.baseline
        rows = []
        for b, a in zip(before["details"], after["details"]):
            g = self.gold_by_id[b["id"]]
            change = {(False, True): "fixed", (True, False): "regressed", (True, True): "still_passing", (False, False): "still_failing"}[(b["passed"], a["passed"])]
            rows.append({"id": b["id"], "kind": g.get("kind", "direct"), "question": b["question"], "expected_docs": g["relevant_docs"],
                         "change": change, "reason": flip_reason(g, b, a),
                         "before": self._side(b), "after": self._side(a)})

        labels = [("max_words", "Chunk size (words)"), ("overlap", "Chunk overlap (words)"), ("section_aware", "Chunks follow headings"),
                  ("k", "Passages per question"), ("min_score", "Score floor"), ("max_per_doc", "Max passages per document"),
                  ("rel_floor", "Weak passage cut (share of best score)"), ("synonyms", "Everyday word synonyms")]
        return {"before": self.run_summary(before), "after": self.run_summary(after),
                "tally": {"before": self.tally(before), "after": self.tally(after)},
                "metrics": [{"key": k, "label": label, "help": help_, "before": before["summary"][k], "after": after["summary"][k],
                             "short": short, "delta": round(after["summary"][k] - before["summary"][k], 4)} for k, label, help_, short in METRICS],
                "settings": [{"key": k, "label": label, "before": before["config"][k], "after": after["config"][k],
                              "changed": before["config"][k] != after["config"][k]} for k, label in labels],
                "counts": {c: sum(r["change"] == c for r in rows) for c in ("fixed", "regressed", "still_passing", "still_failing")},
                "questions": rows}

    def tally(self, r: dict) -> dict:
        un = [d for d in r["details"] if self.gold_by_id[d["id"]].get("expect_abstain")]
        an = [d for d in r["details"] if not self.gold_by_id[d["id"]].get("expect_abstain")]
        return {"passed": r["passed"], "total": r["total"], "unanswerable_total": len(un),
                "unanswerable_declined": sum(d["abstained"] for d in un),
                "answerable_total": len(an), "answerable_declined": sum(d["abstained"] for d in an),
                "wrong_answers": sum((not d["abstained"]) and d["relevance"] == 0 for d in r["details"])}

    @staticmethod
    def _side(d: dict) -> dict:
        return {"passed": d["passed"], "abstained": d["abstained"],
                "docs": [{"doc_id": p["doc_id"], "score": p["score"]} for p in d["passages"]],
                "recall": d["retrieval_recall"], "relevance": d["relevance"], "abstain_correct": d["abstain_correct"]}

    # ---------------------------------------------------------------- ask
    def _render(self, text: str, passages: list[dict]) -> dict:
        """Turn "Sentence. [doc#3]" into numbered parts, and find the span of each passage that the claim came from."""
        by_id = {p["id"]: p for p in passages}
        numbers: dict[str, int] = {}
        highlights: dict[str, list[list[int]]] = {}
        parts, pos, claim = [], 0, ""
        for m in CITATION.finditer(text):
            chunk = text[pos:m.start()]
            if chunk.strip():
                parts.append({"type": "text", "text": chunk.strip()})
                claim = chunk
            pid = m.group(1)
            n = numbers.setdefault(pid, len(numbers) + 1)
            parts.append({"type": "cite", "n": n, "passage_id": pid, "known": pid in by_id})
            if pid in by_id:
                span = self._best_span(claim, by_id[pid]["text"])
                if span and span not in highlights.setdefault(pid, []):
                    highlights[pid].append(span)
            pos = m.end()
        if text[pos:].strip():
            parts.append({"type": "text", "text": text[pos:].strip()})
        sources = [{**p, "n": numbers.get(p["id"]), "highlights": sorted(highlights.get(p["id"], []))} for p in passages]
        return {"text": text, "parts": parts, "sources": sources}

    @staticmethod
    def _best_span(claim: str, passage: str) -> list[int] | None:
        want = set(tokens(claim))
        best, best_score = None, 0.0
        for s, e, sent in sentence_spans(passage):
            have = set(tokens(sent))
            score = len(want & have) / max(1, len(want | have))
            if score > best_score:
                best, best_score = [s, e], score
        return best if best_score >= 0.3 else None

    def unknown_words(self, question: str) -> list[str]:
        emb = self.index_for(PRODUCTION).embedder
        if not isinstance(emb, TfidfEmbedder):
            return []
        expanded = expand_query(question, self.synonyms)
        return list(dict.fromkeys(w for w in WORD.findall(expanded.lower()) if w not in STOP and stem(w) not in emb.vocab))

    def ask(self, question: str) -> dict:
        t0 = time.perf_counter()
        c = PRODUCTION
        a = answer(self.index_for(c), question, self.generator, k=c.k, min_score=c.min_score, **c.retrieval_kwargs(self.synonyms))
        from .runner import _passage
        passages = [_passage(i + 1, ch, s) for i, (ch, s) in enumerate(a.retrieved)]
        candidates = [{**_passage(i + 1, ch, s), "kept": any(ch.id == p["id"] for p in passages)} for i, (ch, s) in enumerate(a.candidates)]
        best = candidates[0]["score"] if candidates else 0.0
        expanded = expand_query(question, self.synonyms)
        out = {"question": question, "searched_as": expanded if expanded != question else None,
               "abstained": a.abstained, **self._render(a.text, passages), "candidates": candidates,
               "floor": c.min_score, "best_score": best, "generator": "claude" if self.live else "extractive",
               "latency_ms": round((time.perf_counter() - t0) * 1000, 1)}
        claims = [p["text"].rstrip(".") for p in out["parts"] if p["type"] == "text"]
        cites = [p for p in out["parts"] if p["type"] == "cite"]
        by_id = {p["id"]: p["text"] for p in passages}
        out["checks"] = {"citations": len(cites), "citations_valid": sum(p["known"] for p in cites),
                         "sentences": len(claims),
                         "sentences_verbatim": sum(any(cl in t for t in by_id.values()) for cl in claims),
                         "candidates": len(candidates), "kept": len(passages),
                         "documents_used": len({p["doc_id"] for p in out["sources"] if p["n"]}),
                         "passages_searched": len(self.index_for(c).chunks), "documents_searched": self.meta_counts()["documents"]}
        if a.abstained:
            out["decline"] = {"reason": "below_floor" if not passages else "no_answer_in_passages",
                              "unknown_words": self.unknown_words(question)}
        return out

    # ---------------------------------------------------------------- docs
    def docs(self) -> list[dict]:
        index = self.index_for(PRODUCTION)
        out = []
        for path in sorted(self.docs_dir.glob("*.md")):
            text = path.read_text()
            chunks = [c for c in index.chunks if c.doc_id == path.stem]
            out.append({"id": path.stem, "title": chunks[0].title if chunks else path.stem, "file": path.name,
                        "words": len(text.split()), "sections": len(dict.fromkeys(c.section for c in chunks)),
                        "chunks": len(chunks), "indexed_at": _iso(self.indexed_at),
                        "gold_questions": sum(path.stem in g["relevant_docs"] for g in self.gold)})
        return sorted(out, key=lambda d: d["title"])

    def doc(self, doc_id: str) -> dict:
        path = self.docs_dir / f"{doc_id}.md"
        if not re.fullmatch(r"[a-z0-9\-]+", doc_id) or not path.exists():
            raise KeyError(doc_id)
        meta = next(d for d in self.docs() if d["id"] == doc_id)
        index = self.index_for(PRODUCTION)
        chunks = [{"id": c.id, "chunk_id": c.chunk_id, "section": c.section, "words": len(c.text.split()),
                   "start": c.start, "end": c.end, "text": c.text} for c in index.chunks if c.doc_id == doc_id]
        return {**meta, "chunk_count": len(chunks), "text": path.read_text(), "chunks": chunks,
                "questions": [{"id": g["id"], "question": g["question"]} for g in self.gold if doc_id in g["relevant_docs"]]}

    def meta_counts(self) -> dict:
        return {"documents": len(list(self.docs_dir.glob("*.md")))}

    def meta(self) -> dict:
        index = self.index_for(PRODUCTION)
        return {"product": "Sourcebook", "company": "Halden Home (fictional)", "documents": len(list(self.docs_dir.glob("*.md"))),
                "chunks": len(index.chunks), "gold_questions": len(self.gold),
                "unanswerable_questions": sum(bool(g.get("expect_abstain")) for g in self.gold),
                "generator": "claude" if self.live else "extractive", "production": PRODUCTION.to_dict(),
                "suggested": SUGGESTED, "tolerance": TOLERANCE, "abstain_text": ABSTAIN,
                "configs": [c.to_dict() for c in PRESETS.values()],
                "metrics": [{"key": k, "label": label, "help": help_, "short": short} for k, label, help_, short in METRICS],
                "reliability": {"before": self.tally(next(r for r in self.runs if r["config"]["id"] == "initial")),
                                "after": self.tally(self.baseline)}}
