"""Chunking and retrieval.

Default embedder is a local TF-IDF over word unigrams and bigrams: no API key, deterministic, good enough
to make the evals meaningful. `Embedder` is a two-method protocol; drop in Voyage, OpenAI, or Bedrock
Titan by implementing `fit` and `embed`.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np

WORD = re.compile(r"[a-z0-9]+")
NONSPACE = re.compile(r"\S+")
HEADING = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*$", re.MULTILINE)
STOP = set(
    "a an the of to for is are do does did i my we you it in on at by and or can what how long which when "
    "be if with this that your our from as will have has there me".split()
)


def stem(w: str) -> str:
    """Crude but predictable: enough to match quote/quotes, ship/shipping and install/installed."""
    if len(w) <= 4:
        return w
    if w.endswith("ies"):
        return w[:-3] + "y"
    if w.endswith("es") and w[:-2].endswith(("s", "x", "z", "ch", "sh")):
        return w[:-2]
    if w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    for suf in ("ing", "ed"):
        if w.endswith(suf) and len(w) - len(suf) >= (3 if suf == "ing" else 4):
            base = w[: -len(suf)]
            if base[-1] == base[-2] and base[-1] not in "lsz":
                base = base[:-1]  # shipping -> ship, stopped -> stop
            return base
    return w


@dataclass(frozen=True)
class Chunk:
    doc_id: str
    chunk_id: int
    text: str           # exact substring of the source file, so the UI can show the passage verbatim
    title: str = ""     # the document's H1
    section: str = ""   # the heading this chunk starts under
    context: str = ""   # prepended for embedding only (section-aware mode), never shown as passage text
    start: int = 0      # character offsets into the source file
    end: int = 0

    @property
    def id(self) -> str:
        return f"{self.doc_id}#{self.chunk_id}"

    @property
    def embed_text(self) -> str:
        return f"{self.context}\n{self.text}" if self.context else self.text


def _windows(n_words: int, max_words: int, overlap: int):
    i = 0
    while i < n_words:
        yield i, min(i + max_words, n_words)
        if i + max_words >= n_words:
            break
        i += max(1, max_words - overlap)


def chunk_text(doc_id: str, text: str, max_words: int = 60, overlap: int = 15, section_aware: bool = False) -> list[Chunk]:
    headings = [(m.start(), m.end(), len(m.group(1)), m.group(2)) for m in HEADING.finditer(text)]
    title = next((h[3] for h in headings if h[2] == 1), doc_id)
    chunks: list[Chunk] = []

    def emit(words: list[re.Match], section: str, context: str) -> None:
        for a, b in _windows(len(words), max_words, overlap):
            s, e = words[a].start(), words[b - 1].end()
            chunks.append(Chunk(doc_id, len(chunks), text[s:e], title, section, context, s, e))

    if not section_aware:
        # plain word windows over the whole file: headings are just words, sections are ignored
        words = list(NONSPACE.finditer(text))
        starts = [h[0] for h in headings]
        for a, b in _windows(len(words), max_words, overlap):
            s, e = words[a].start(), words[b - 1].end()
            under = [h[3] for h, hs in zip(headings, starts) if hs <= s]
            chunks.append(Chunk(doc_id, len(chunks), text[s:e], title, under[-1] if under else "", "", s, e))
        return chunks

    # section-aware: never let a chunk straddle a heading, and embed the title and heading with the body
    bounds = [(0, 0, 0, "")] + headings
    for n, (_, body_start, _level, heading) in enumerate(bounds):
        body_end = bounds[n + 1][0] if n + 1 < len(bounds) else len(text)
        words = [m for m in NONSPACE.finditer(text, body_start, body_end)]
        if not words:
            continue
        section = heading if heading != title else "Overview"
        emit(words, section or "Overview", f"{title}. {section}." if section else f"{title}.")
    return chunks


def chunk_documents(docs_dir: str | Path, max_words: int = 60, overlap: int = 15, section_aware: bool = False) -> list[Chunk]:
    """Split each markdown file into overlapping word windows. Sentence boundaries would be better
    for prose; word windows are predictable, which matters more for an eval harness."""
    chunks: list[Chunk] = []
    for path in sorted(Path(docs_dir).glob("*.md")):
        chunks.extend(chunk_text(path.stem, path.read_text(), max_words, overlap, section_aware))
    return chunks


def tokens(text: str) -> list[str]:
    uni = [stem(w) for w in WORD.findall(text.lower()) if w not in STOP]
    return uni + [f"{a}_{b}" for a, b in zip(uni, uni[1:])]


class Embedder(Protocol):
    def fit(self, texts: list[str]) -> None: ...
    def embed(self, texts: list[str]) -> np.ndarray: ...


class TfidfEmbedder:
    oov_weight = 1.5  # how hard a never-seen query word pulls the score down (0 = ignore unknown words)

    def __init__(self):
        self.vocab: dict[str, int] = {}
        self.idf: np.ndarray | None = None

    def fit(self, texts: list[str]) -> None:
        df: Counter[str] = Counter()
        for t in texts:
            df.update(set(tokens(t)))
        self.vocab = {w: i for i, w in enumerate(sorted(df))}
        n = len(texts)
        self.idf = np.array([math.log((1 + n) / (1 + df[w])) + 1 for w in self.vocab], dtype=np.float32)
        self._oov_idf = math.log(1 + n) + 1  # the weight of a word seen in no chunk at all

    def embed(self, texts: list[str]) -> np.ndarray:
        assert self.idf is not None, "call fit() first"
        out = np.zeros((len(texts), len(self.vocab)), dtype=np.float32)
        unseen = np.zeros(len(texts), dtype=np.float32)
        for r, t in enumerate(texts):
            for w, c in Counter(tokens(t)).items():
                j = self.vocab.get(w)
                if j is not None:
                    out[r, j] = c
                elif "_" not in w:
                    # a query word the corpus has never seen still counts toward the query's length,
                    # so "warranty on a microwave" scores lower than "warranty on a dishwasher"
                    unseen[r] += (c * self._oov_idf * self.oov_weight) ** 2
        out *= self.idf
        norms = np.sqrt((out**2).sum(axis=1) + unseen)[:, None]
        norms[norms == 0] = 1
        return out / norms


class Index:
    def __init__(self, chunks: list[Chunk], embedder: Embedder | None = None):
        self.chunks = chunks
        self.embedder = embedder or TfidfEmbedder()
        texts = [c.embed_text for c in chunks]
        self.embedder.fit(texts)
        self.matrix = self.embedder.embed(texts)

    def idf(self, term: str) -> float:
        """How rare a term is across the corpus; terms the corpus never uses get the largest weight."""
        emb = self.embedder
        if not isinstance(emb, TfidfEmbedder) or emb.idf is None:
            return 1.0
        j = emb.vocab.get(term)
        return float(emb.idf[j]) if j is not None else emb._oov_idf

    def search(self, query: str, k: int = 3, min_score: float = 0.0, max_per_doc: int | None = None) -> list[tuple[Chunk, float]]:
        q = self.embedder.embed([query])[0]
        scores = self.matrix @ q
        out: list[tuple[Chunk, float]] = []
        per_doc: Counter[str] = Counter()
        for i in np.argsort(-scores, kind="stable"):
            if len(out) >= k or scores[i] < min_score or scores[i] <= 0:
                break
            c = self.chunks[i]
            if max_per_doc and per_doc[c.doc_id] >= max_per_doc:
                continue  # leave room for a second document instead of three slices of the same page
            per_doc[c.doc_id] += 1
            out.append((c, float(scores[i])))
        return out
