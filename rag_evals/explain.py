"""Plain language for the quality screens: why a question scored the way it did, and why it flipped."""
from __future__ import annotations

METRICS = [
    ("retrieval_precision", "Retrieval precision", "Share of retrieved passages that come from a document the gold set expects. Low means junk is crowding the context.", "How much of what was retrieved is relevant"),
    ("retrieval_recall", "Retrieval recall", "Share of expected documents that were retrieved at all. Low means the right page never reaches the model.", "Whether the right document was found at all"),
    ("mrr", "Rank of first hit (MRR)", "1 divided by the rank of the first correct passage. Low means the right passage is buried under wrong ones.", "How near the top the right passage ranks"),
    ("groundedness", "Groundedness", "Share of citations that point to a passage that was actually retrieved. Anything under 1.00 is an invented source.", "Citations point to passages that were really retrieved"),
    ("relevance", "Answer relevance", "The answer contains every fact the gold set requires, or declines when it should.", "The answer contains the facts the question needs"),
    ("abstain_correct", "Knows when to decline", "Declined exactly when the gold set says the documents hold no answer, and answered otherwise.", "Declines when it should, answers when it can"),
]
METRIC_KEYS = [m[0] for m in METRICS]


def passed(d: dict) -> bool:
    """A question passes when every expected document was found, the answer has the required facts,
    no citation is invented, and the assistant declined only if it should have."""
    return d["retrieval_recall"] == 1 and d["relevance"] == 1 and d["abstain_correct"] == 1 and d["groundedness"] == 1


def _docs(ids) -> str:
    return ", ".join(ids) if ids else "none"


def explain(gold: dict, d: dict) -> dict[str, str]:
    expected = list(gold["relevant_docs"])
    got = [p["doc_id"] for p in d["passages"]]
    n = len(got)
    out: dict[str, str] = {}
    if gold.get("expect_abstain"):
        clean = "Nothing cleared the score floor, which is correct: no document should be retrieved for this question."
        dirty = f"{n} passage{'s' if n != 1 else ''} cleared the score floor, but the gold set says no document answers this."
        out["retrieval_precision"] = out["retrieval_recall"] = out["mrr"] = clean if not n else dirty
    else:
        hits = sum(g in expected for g in got)
        out["retrieval_precision"] = (f"{hits} of {n} retrieved passages come from an expected document." if n
                                      else "Nothing was retrieved, so nothing retrieved was relevant.")
        found = [e for e in expected if e in got]
        missing = [e for e in expected if e not in got]
        out["retrieval_recall"] = (f"{len(found)} of {len(expected)} expected document{'s' if len(expected) != 1 else ''} retrieved."
                                   + (f" Missing: {_docs(missing)}." if missing else ""))
        rank = next((i + 1 for i, g in enumerate(got) if g in expected), None)
        out["mrr"] = f"First correct passage is at rank {rank}." if rank else "No correct passage in the retrieved set."
    cites = d.get("citations", [])
    retrieved_ids = {p["id"] for p in d["passages"]}
    if d["abstained"]:
        out["groundedness"] = "Declined to answer, so there is nothing to ground."
    elif not cites:
        out["groundedness"] = "The answer cites no passage at all."
    else:
        bad = [c for c in cites if c not in retrieved_ids]
        out["groundedness"] = ((f"All {len(cites)} citations point to retrieved passages." if len(cites) > 1 else "The one citation points to a retrieved passage.") if not bad
                               else f"Cites {_docs(bad)}, which was never retrieved.")
    must = gold.get("must_mention", [])
    if gold.get("expect_abstain"):
        out["relevance"] = "Declined, which is the right answer here." if d["abstained"] else "Gave an answer to a question the documents cannot answer."
    else:
        lacking = [m for m in must if m.lower() not in d["answer"].lower()]
        out["relevance"] = (f"Answer contains the required fact{'s' if len(must) != 1 else ''}: {', '.join(repr(m) for m in must)}." if not lacking
                            else f"Answer is missing: {', '.join(repr(m) for m in lacking)}.")
    if gold.get("expect_abstain"):
        out["abstain_correct"] = "Declined, and the gold set marks this question unanswerable." if d["abstained"] else "Answered a question the gold set marks unanswerable."
    else:
        out["abstain_correct"] = "Answered, and the gold set marks this question answerable." if not d["abstained"] else "Declined a question the documents can answer."
    return out


def flip_reason(gold: dict, before: dict, after: dict) -> str:
    """One sentence on what changed for a question between two runs."""
    expected = list(gold["relevant_docs"])
    b_docs = [p["doc_id"] for p in before["passages"]]
    a_docs = [p["doc_id"] for p in after["passages"]]
    b_ok, a_ok = passed(before), passed(after)
    if gold.get("expect_abstain"):
        if not b_ok and a_ok:
            top = before["passages"][0] if before["passages"] else None
            return (f"Before, it answered from {top['doc_id']} (score {top['score']:.2f}). Now no passage clears the score floor, so it declines."
                    if top else "Now declines.")
        if b_ok and not a_ok:
            return "A passage now clears the score floor, so it answers a question it should decline."
        return "Still answers from a passage that matches the words but not the question." if not a_ok else "Declined in both runs."
    b_missing = [e for e in expected if e not in b_docs]
    a_missing = [e for e in expected if e not in a_docs]
    if not b_ok and a_ok:
        if b_missing and not a_missing:
            return f"The expected document {_docs(b_missing)} was not retrieved before. It is now, so the answer has the required fact."
        if before["abstained"]:
            return "Declined before. Now the right passage clears the score floor."
        return "The right document was retrieved before, but the passage was too broad to pull the fact from. Smaller, section sized passages fixed the answer."
    if b_ok and not a_ok:
        if after["abstained"]:
            return "Best passage now scores under the floor, so the assistant declines a question it used to answer."
        if a_missing:
            return f"The expected document {_docs(a_missing)} dropped out of the retrieved set."
        return "Right documents retrieved, but the answer no longer contains the required fact."
    if not a_ok:
        if after["abstained"]:
            return "The question uses different words from the handbook, so no passage clears the score floor."
        if a_missing:
            return f"Still missing {_docs(a_missing)}."
        return "Right documents retrieved, but the extracted sentences miss a required fact."
    return "Passed in both runs."
