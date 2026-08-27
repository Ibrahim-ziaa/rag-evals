"""Answer generation with citations, plus an abstain rule.

The retrieval floor (`min_score`) is the single most important number in a RAG system nobody tunes:
below it, the model is told there is no evidence and must say so, instead of guessing.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol

from .index import Chunk, Index, tokens

SYSTEM = """Answer the question using ONLY the provided passages. Quote numbers exactly as written.
Cite each fact with the passage id in square brackets, e.g. [shipping#0].
If the passages do not contain the answer, reply exactly: I don't have that information."""

ABSTAIN = "I don't have that information."


@dataclass
class Answer:
    text: str
    citations: list[str]
    retrieved: list[tuple[Chunk, float]]
    abstained: bool


class Generator(Protocol):
    def generate(self, question: str, passages: list[tuple[str, str]]) -> str: ...


class ExtractiveGenerator:
    """Offline stand-in: returns the best-matching sentence from the top passage, with a citation.
    Deterministic, so the eval numbers are reproducible without a model."""

    def generate(self, question: str, passages: list[tuple[str, str]]) -> str:
        if not passages:
            return ABSTAIN
        pid, text = passages[0]
        q = set(tokens(question))
        sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]
        sent_tokens = [set(tokens(s)) for s in sentences]
        # weight each matched term by how rare it is within the passage, so "claim" beats "warranty"
        # when "warranty" appears in every sentence
        weight = {t: 1 / sum(t in st for st in sent_tokens) for t in q if any(t in st for st in sent_tokens)}
        best = max(range(len(sentences)), key=lambda i: sum(weight.get(t, 0) for t in sent_tokens[i]))
        best = sentences[best]
        return f"{best}. [{pid}]"


class AnthropicGenerator:
    def __init__(self, model: str | None = None):
        import anthropic

        self._client = anthropic.Anthropic()
        self._model = model or os.environ.get("RAG_EVALS_MODEL", "claude-sonnet-5")

    def generate(self, question: str, passages: list[tuple[str, str]]) -> str:
        if not passages:
            return ABSTAIN
        ctx = "\n\n".join(f"[{pid}]\n{text}" for pid, text in passages)
        msg = self._client.messages.create(
            model=self._model, max_tokens=400, system=SYSTEM,
            messages=[{"role": "user", "content": f"Passages:\n{ctx}\n\nQuestion: {question}"}],
        )
        return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()


def answer(index: Index, question: str, generator: Generator, k: int = 3, min_score: float = 0.08) -> Answer:
    retrieved = index.search(question, k=k, min_score=min_score)
    passages = [(f"{c.doc_id}#{c.chunk_id}", c.text) for c, _ in retrieved]
    text = generator.generate(question, passages)
    cites = [p[0] for p in passages if f"[{p[0]}]" in text]
    return Answer(text=text, citations=cites, retrieved=retrieved, abstained=text.strip() == ABSTAIN)
