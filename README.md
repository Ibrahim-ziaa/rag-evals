# rag-evals

Retrieval-augmented answering over a folder of documents, with the part most RAG projects skip: a gold question set, six metrics, and a baseline the build fails against.

```
docs/*.md ─▶ chunk ─▶ TF-IDF index ─▶ retrieve (with a score floor) ─▶ generate with citations ─▶ score vs gold
```

## Why

A RAG system is only as good as the moment you notice it got worse. This repo makes that moment a failing exit code:

```
$ python -m rag_evals run
id    prec   rec   mrr  grnd   rel  abst
q1    1.00  1.00  1.00  1.00  1.00  1.00
...
summary: {"retrieval_precision": 0.96, "retrieval_recall": 1.0, "mrr": 1.0, "groundedness": 1.0, "relevance": 1.0, "abstain_correct": 1.0}
no regression vs baseline
```

Change the chunk size, swap the embedder, tweak the prompt, run again. If any metric drops more than 0.02 below `evals/baseline.json`, the command exits 1.

## Metrics

| metric | what it catches |
|---|---|
| retrieval_precision | junk passages crowding the context |
| retrieval_recall | the right document never being retrieved |
| mrr | the right passage being buried under wrong ones |
| groundedness | the model citing a passage it was never shown (a fabricated source) |
| relevance | the answer missing the fact the question asked for |
| abstain_correct | answering questions the documents cannot answer (and refusing ones they can) |

The gold set includes a question with no answer in the corpus (`q12`). A system that always answers fails it.

## Run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python -m rag_evals run            # offline, deterministic, no API key
python -m rag_evals ask "How do I claim a warranty?"
ANTHROPIC_API_KEY=... python -m rag_evals run --live   # Claude as the generator
pytest
```

## Swap parts

- **Embedder**: `TfidfEmbedder` is the default so the harness runs anywhere. Implement `fit`/`embed` for Voyage, OpenAI, or Bedrock Titan and pass it to `Index`.
- **Generator**: `ExtractiveGenerator` (offline) or `AnthropicGenerator`. Any object with `generate(question, passages)` works.
- **Corpus and gold**: drop your markdown in `fixtures/docs`, write `fixtures/gold.jsonl` (`question`, `relevant_docs`, `must_mention`, optional `expect_abstain`), run with `--save` to set a baseline.

MIT.
