"""Metrics computed per gold question, then averaged.

retrieval_precision  fraction of retrieved chunks that come from a relevant doc
retrieval_recall     fraction of relevant docs that appear in the retrieved set
mrr                  1 / rank of the first relevant chunk
groundedness         fraction of cited passage ids that were actually retrieved (a citation to nothing = hallucinated source)
relevance            all `must_mention` strings appear in the answer
abstain_correct      abstained exactly when the gold set says there is no answer
"""
from __future__ import annotations

from dataclasses import dataclass

from .answer import Answer


@dataclass
class Row:
    id: str
    retrieval_precision: float
    retrieval_recall: float
    mrr: float
    groundedness: float
    relevance: float
    abstain_correct: float


def score(gold: dict, ans: Answer) -> Row:
    relevant = set(gold["relevant_docs"])
    got_docs = [c.doc_id for c, _ in ans.retrieved]
    expect_abstain = bool(gold.get("expect_abstain"))

    if relevant:
        prec = sum(d in relevant for d in got_docs) / len(got_docs) if got_docs else 0.0
        rec = len(relevant & set(got_docs)) / len(relevant)
        mrr = next((1 / (i + 1) for i, d in enumerate(got_docs) if d in relevant), 0.0)
    else:
        prec = rec = mrr = 1.0 if not got_docs else 0.0  # nothing should be retrieved

    retrieved_ids = {f"{c.doc_id}#{c.chunk_id}" for c, _ in ans.retrieved}
    cited = _cited_ids(ans.text)
    grounded = (sum(cid in retrieved_ids for cid in cited) / len(cited)) if cited else (1.0 if ans.abstained else 0.0)

    must = gold.get("must_mention", [])
    relevance = 1.0 if all(m.lower() in ans.text.lower() for m in must) else 0.0
    if expect_abstain:
        relevance = 1.0 if ans.abstained else 0.0

    return Row(gold["id"], prec, rec, mrr, grounded, relevance, float(ans.abstained == expect_abstain))


def _cited_ids(text: str) -> list[str]:
    import re

    return re.findall(r"\[([a-z0-9\-]+#\d+)\]", text)


def summarize(rows: list[Row]) -> dict[str, float]:
    keys = ["retrieval_precision", "retrieval_recall", "mrr", "groundedness", "relevance", "abstain_correct"]
    return {k: round(sum(getattr(r, k) for r in rows) / len(rows), 4) for k in keys}
