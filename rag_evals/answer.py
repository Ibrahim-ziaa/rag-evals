"""Answer generation with citations, plus an abstain rule.

The retrieval floor (`min_score`) is the single most important number in a RAG system nobody tunes:
below it, the model is told there is no evidence and must say so, instead of guessing.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Protocol

from .index import Chunk, Index, tokens

SYSTEM = """Answer the question using ONLY the provided passages. Quote numbers exactly as written.
Cite each fact with the passage id in square brackets, e.g. [shipping#0].
If the passages do not contain the answer, reply exactly: I don't have that information."""

ABSTAIN = "I don't have that information."
CITATION = re.compile(r"\[([a-z0-9\-]+#\d+)\]")
_SENT_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")
_BULLET = re.compile(r"^\s*(?:[-*]|\d+\.)\s+")


@dataclass
class Answer:
    text: str
    citations: list[str]
    retrieved: list[tuple[Chunk, float]]
    abstained: bool
    candidates: list[tuple[Chunk, float]] = field(default_factory=list)  # top k before the score floor


class Generator(Protocol):
    def generate(self, question: str, passages: list[tuple[str, str]]) -> str: ...


def sentence_spans(text: str) -> list[tuple[int, int, str]]:
    """Sentences of a passage with their character offsets. Headings are skipped, bullets are one sentence each."""
    spans: list[tuple[int, int, str]] = []
    pos = 0
    for line in text.split("\n"):
        line_start, pos = pos, pos + len(line) + 1
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        lead = _BULLET.match(line)
        offset = lead.end() if lead else len(line) - len(line.lstrip())
        body = line[offset:]
        cut = 0
        for m in list(_SENT_END.finditer(body)) + [None]:
            end = m.start() if m else len(body)
            sent = body[cut:end].rstrip()
            if sent:
                s = line_start + offset + cut
                spans.append((s, s + len(sent), sent))
            cut = m.end() if m else end
    return spans


def coverage(question: str, sentences: list[str], idf=lambda t: 1.0) -> tuple[float, list[str]]:
    """Share of the question's words (weighted by rarity) that the given sentences actually mention,
    and the question words they never mention. "Does it come in black?" is not covered by a sentence
    about cleaning stainless steel, however well the passage scored."""
    from .index import STOP, WORD, stem

    words = {stem(w): w for w in WORD.findall(question.lower()) if w not in STOP}
    have = {t for s in sentences for t in tokens(s) if "_" not in t}
    total = sum(idf(t) for t in words)
    missing = [w for t, w in words.items() if t not in have]
    return (sum(idf(t) for t in words if t in have) / total if total else 0.0), missing


class ExtractiveGenerator:
    """Offline stand-in: picks the sentences that best cover the question's terms, each with a citation.
    Deterministic, so the eval numbers are reproducible without a model."""

    max_sentences = 3
    min_gain = 0.3  # a further sentence must add at least this share of what the first one covered
    rank_discount = 0.15  # each step down the ranking costs a sentence this much of its score
    heading_weight = 0.5  # a sentence gets part credit for question terms in the heading it sits under

    def __init__(self):
        self._idf = lambda term: 1.0

    def use_index(self, index: Index) -> None:
        """Let rare corpus terms ("Saturday") outweigh common ones ("support") when choosing a sentence."""
        self._idf = index.idf

    def generate(self, question: str, passages: list[tuple[str, str]]) -> str:
        if not passages:
            return ABSTAIN
        q = set(tokens(question))
        cands = []  # (passage rank, passage id, sentence, its tokens, tokens of the headings above it)
        for rank, (pid, text) in enumerate(passages):
            heads = set(tokens(" ".join(l.lstrip("# ") for l in text.split("\n") if l.lstrip().startswith("#"))))
            for _, _, sent in sentence_spans(text):
                cands.append((rank, pid, sent, set(tokens(sent)), heads))
        if not cands:
            return ABSTAIN
        # weight each matched term by how rare it is, in the corpus and among the candidate sentences,
        # so "claim" beats "warranty" when "warranty" appears in every sentence
        weight = {t: self._idf(t) / sum(t in c[3] for c in cands) ** 0.5 for t in q if any(t in c[3] for c in cands)}
        head_weight = {t: self.heading_weight * self._idf(t) for t in q}
        covered: set[str] = set()
        picked: list[tuple[int, str, str]] = []
        first_gain = 0.0

        def gain(c) -> float:
            direct = sum(weight.get(t, 0) for t in c[3] - covered)
            if direct == 0:
                return 0.0
            # lower ranked passages have to work harder: the retriever already judged them less relevant
            return (direct + sum(head_weight[t] for t in (c[4] & q) - c[3] - covered)) / (1 + self.rank_discount * c[0])

        while len(picked) < self.max_sentences:
            best = max(cands, key=lambda c: (gain(c), -c[0]))
            g = gain(best)
            if g <= 0 or (picked and g < self.min_gain * first_gain):
                break
            if not picked:
                first_gain = g
            if best[2] not in [p[2] for p in picked]:
                picked.append((best[0], best[1], best[2]))
            covered |= best[3] | (best[4] & q)
        if not picked:  # nothing in the passages shares a term with the question
            rank, pid, sent = cands[0][:3]
            picked = [(rank, pid, sent)]
        return " ".join(f"{s if s[-1] in '.!?' else s + '.'} [{pid}]" for _, pid, s in picked)


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


def expand_query(question: str, synonyms: dict[str, str] | None) -> str:
    """Swap everyday words for the corpus's own wording ("fridge" -> "refrigerator") before searching."""
    if not synonyms:
        return question
    text = " " + " ".join(re.findall(r"[a-z0-9.\-]+", question.lower())) + " "
    hit = False
    for k, v in synonyms.items():
        if f" {k} " in text:
            text, hit = text.replace(f" {k} ", f" {v} "), True
    return text.strip() if hit else question


def passage_text(c: Chunk) -> str:
    """What the generator reads: the verbatim chunk, under its headings when the chunker kept them apart."""
    return f"# {c.title}\n## {c.section}\n{c.text}" if c.context else c.text


def answer(index: Index, question: str, generator: Generator, k: int = 3, min_score: float = 0.08,
           max_per_doc: int | None = None, rel_floor: float = 0.0, synonyms: dict[str, str] | None = None) -> Answer:
    query = expand_query(question, synonyms)
    candidates = index.search(query, k=k, min_score=0.0, max_per_doc=max_per_doc)
    top = candidates[0][1] if candidates else 0.0
    retrieved = [(c, s) for c, s in candidates if s >= min_score and s >= rel_floor * top]
    passages = [(c.id, passage_text(c)) for c, _ in retrieved]
    if hasattr(generator, "use_index"):
        generator.use_index(index)
    text = generator.generate(query, passages)
    cites = [p[0] for p in passages if f"[{p[0]}]" in text]
    return Answer(text=text, citations=cites, retrieved=retrieved, abstained=text.strip() == ABSTAIN, candidates=candidates)
