"""
python -m rag_evals run                      # score the gold set offline with the production config, compare to evals/baseline.json
python -m rag_evals run --config initial     # any preset from rag_evals/config.py
python -m rag_evals run --save               # overwrite the baseline with this run
python -m rag_evals run --live               # use Claude as the generator (needs ANTHROPIC_API_KEY)
python -m rag_evals ask "How long is the warranty on a dishwasher?"
python -m rag_evals serve                    # web app and API on http://localhost:8102
"""
from __future__ import annotations

import json
import sys

from .answer import AnthropicGenerator, ExtractiveGenerator, answer
from .config import BASELINE, HANDBOOK_DOCS, HANDBOOK_GOLD, PRESETS, PRODUCTION, ROOT, load_synonyms
from .index import Index, chunk_documents
from .runner import compare, run


def _option(rest: list[str], flag: str, default: str) -> str:
    return rest[rest.index(flag) + 1] if flag in rest and rest.index(flag) + 1 < len(rest) else default


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    cmd, rest = argv[0], argv[1:]

    if cmd == "serve":
        import uvicorn

        uvicorn.run("rag_evals.api:app", host=_option(rest, "--host", "127.0.0.1"), port=int(_option(rest, "--port", "8102")))
        return 0

    config = PRESETS.get(_option(rest, "--config", PRODUCTION.id))
    if config is None:
        print("unknown config. choose from:", ", ".join(PRESETS))
        return 2
    gen = AnthropicGenerator() if "--live" in rest else ExtractiveGenerator()
    index = Index(chunk_documents(HANDBOOK_DOCS, config.max_words, config.overlap, config.section_aware))
    retrieval = config.retrieval_kwargs(load_synonyms())

    if cmd == "ask":
        skip = {"--config", _option(rest, "--config", "")}
        q = " ".join(a for a in rest if not a.startswith("--") and a not in skip)
        a = answer(index, q, gen, k=config.k, min_score=config.min_score, **retrieval)
        print(a.text)
        for c, s in a.retrieved:
            print(f"  {s:.3f}  {c.id}  ({c.section})")
        return 0

    if cmd == "run":
        summary, rows, details = run(HANDBOOK_DOCS, HANDBOOK_GOLD, gen, k=config.k, min_score=config.min_score, index=index, **retrieval)
        print(f"config: {config.id} ({config.summary})")
        print(f"{'id':<5}{'prec':>6}{'rec':>6}{'mrr':>6}{'grnd':>6}{'rel':>6}{'abst':>6}")
        for r in rows:
            print(f"{r.id:<5}{r.retrieval_precision:>6.2f}{r.retrieval_recall:>6.2f}{r.mrr:>6.2f}{r.groundedness:>6.2f}{r.relevance:>6.2f}{r.abstain_correct:>6.2f}")
        print("\nsummary:", json.dumps(summary))
        (ROOT / "evals" / "last_run.json").write_text(json.dumps({"config": config.to_dict(), "summary": summary, "details": details}, indent=2))
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
