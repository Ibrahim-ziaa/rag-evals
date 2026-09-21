from __future__ import annotations

import json
from pathlib import Path

from .answer import Generator, answer
from .index import Index, chunk_documents
from .metrics import Row, _cited_ids, score, summarize

TOLERANCE = 0.02  # a metric may drop this much before the run is called a regression


def load_gold(path: str | Path) -> list[dict]:
    return [json.loads(l) for l in Path(path).read_text().splitlines() if l.strip()]


def _passage(rank: int, chunk, s: float) -> dict:
    return {"rank": rank, "id": chunk.id, "doc_id": chunk.doc_id, "chunk_id": chunk.chunk_id, "title": chunk.title,
            "section": chunk.section, "score": round(s, 4), "text": chunk.text}


def run(docs_dir, gold_path, generator: Generator, k: int = 3, min_score: float = 0.08,
        index: Index | None = None, **retrieval) -> tuple[dict, list[Row], list[dict]]:
    index = index or Index(chunk_documents(docs_dir))
    rows, details = [], []
    for g in load_gold(gold_path):
        a = answer(index, g["question"], generator, k=k, min_score=min_score, **retrieval)
        r = score(g, a)
        rows.append(r)
        details.append({"id": g["id"], "question": g["question"], "answer": a.text, "abstained": a.abstained, "citations": _cited_ids(a.text),
                        "retrieved": [c.id for c, _ in a.retrieved],
                        "passages": [_passage(i + 1, c, s) for i, (c, s) in enumerate(a.retrieved)],
                        "candidates": [_passage(i + 1, c, s) for i, (c, s) in enumerate(a.candidates)],
                        **r.__dict__})
    return summarize(rows), rows, details


def compare(current: dict, baseline: dict, tolerance: float = TOLERANCE) -> list[str]:
    """Return a list of regressions (empty = pass)."""
    return [f"{k}: {baseline[k]:.3f} -> {current[k]:.3f}" for k in baseline if current.get(k, 0) < baseline[k] - tolerance]
