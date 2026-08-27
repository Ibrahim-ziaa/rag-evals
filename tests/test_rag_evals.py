from pathlib import Path

from rag_evals.answer import ABSTAIN, ExtractiveGenerator, answer
from rag_evals.index import Index, chunk_documents
from rag_evals.metrics import score
from rag_evals.runner import compare, run

ROOT = Path(__file__).parent.parent
DOCS, GOLD = ROOT / "fixtures" / "docs", ROOT / "fixtures" / "gold.jsonl"


def test_chunks_overlap_and_keep_doc_ids():
    chunks = chunk_documents(DOCS, max_words=20, overlap=5)
    assert {c.doc_id for c in chunks} == {"returns-policy", "shipping", "warranty", "pricing-terms"}
    a, b = chunks[0].text.split(), chunks[1].text.split()
    assert a[-5:] == b[:5]


def test_retrieval_finds_the_right_doc():
    index = Index(chunk_documents(DOCS))
    top = index.search("How long is the warranty on a pump?", k=1)[0][0]
    assert top.doc_id == "warranty"


def test_abstains_when_nothing_relevant():
    index = Index(chunk_documents(DOCS))
    a = answer(index, "What is the capital of France?", ExtractiveGenerator())
    assert a.abstained and a.text == ABSTAIN


def test_hallucinated_citation_scores_zero_groundedness():
    index = Index(chunk_documents(DOCS))

    class Liar:
        def generate(self, q, passages):
            return "Quotes are valid for 99 days. [made-up#7]"

    a = answer(index, "How long is a quote valid?", Liar())
    row = score({"id": "x", "relevant_docs": ["pricing-terms"], "must_mention": ["14 days"]}, a)
    assert row.groundedness == 0.0 and row.relevance == 0.0


def test_full_run_meets_floor_and_compare_flags_drops():
    summary, _, _ = run(DOCS, GOLD, ExtractiveGenerator())
    assert summary["retrieval_recall"] >= 0.9
    assert summary["abstain_correct"] == 1.0
    assert compare({"mrr": 0.80}, {"mrr": 0.95}) == ["mrr: 0.950 -> 0.800"]
    assert compare({"mrr": 0.94}, {"mrr": 0.95}) == []
