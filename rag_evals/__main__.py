"""
python -m rag_evals run                 # score the gold set with the offline generator, compare to evals/baseline.json
python -m rag_evals run --save          # overwrite the baseline with this run
python -m rag_evals run --live          # use Claude as the generator (needs ANTHROPIC_API_KEY)
python -m rag_evals ask "How long is a quote valid?"
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from .answer import AnthropicGenerator, ExtractiveGenerator, answer
from .index import Index, chunk_documents
from .runner import compare, run

ROOT = Path(__file__).resolve().parent.parent
DOCS, GOLD, BASELINE = ROOT / "fixtures" / "docs", ROOT / "fixtures" / "gold.jsonl", ROOT / "evals" / "baseline.json"


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    cmd, rest = argv[0], argv[1:]
    gen = AnthropicGenerator() if "--live" in rest else ExtractiveGenerator()

    if cmd == "ask":
        q = " ".join(a for a in rest if not a.startswith("--"))
        a = answer(Index(chunk_documents(DOCS)), q, gen)
        print(a.text)
        for c, s in a.retrieved:
            print(f"  {s:.3f}  {c.doc_id}#{c.chunk_id}")
        return 0

    if cmd == "run":
        summary, rows, details = run(DOCS, GOLD, gen)
        print(f"{'id':<5}{'prec':>6}{'rec':>6}{'mrr':>6}{'grnd':>6}{'rel':>6}{'abst':>6}")
        for r in rows:
            print(f"{r.id:<5}{r.retrieval_precision:>6.2f}{r.retrieval_recall:>6.2f}{r.mrr:>6.2f}{r.groundedness:>6.2f}{r.relevance:>6.2f}{r.abstain_correct:>6.2f}")
        print("\nsummary:", json.dumps(summary))
        (ROOT / "evals" / "last_run.json").write_text(json.dumps({"summary": summary, "details": details}, indent=2))
        if "--save" in rest or not BASELINE.exists():
            BASELINE.write_text(json.dumps(summary, indent=2))
            print("baseline saved")
            return 0
        regressions = compare(summary, json.loads(BASELINE.read_text()))
        if regressions:
            print("REGRESSION:\n  " + "\n  ".join(regressions))
            return 1
        print("no regression vs baseline")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
