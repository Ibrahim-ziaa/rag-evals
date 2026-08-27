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
STOP = set("a an the of to for is are do does did i my we you it in on at by and or can what how long which when".split())


def stem(w: str) -> str:
    """Crude but predictable: enough to match quote/quotes and discount/discounts."""
    for suf in ("ing", "es", "s"):
        if len(w) > 4 and w.endswith(suf):
            return w[: -len(suf)]
    return w


@dataclass(frozen=True)
class Chunk:
    doc_id: str
    chunk_id: int
    text: str


def chunk_documents(docs_dir: str | Path, max_words: int = 60, overlap: int = 15) -> list[Chunk]:
    """Split each markdown file into overlapping word windows. Sentence boundaries would be better
    for prose; word windows are predictable, which matters more for an eval harness."""
    chunks: list[Chunk] = []
    for path in sorted(Path(docs_dir).glob("*.md")):
        words = path.read_text().split()
        i, n = 0, 0
        while i < len(words):
            chunks.append(Chunk(path.stem, n, " ".join(words[i : i + max_words])))
            n += 1
            if i + max_words >= len(words):
                break
            i += max_words - overlap
    return chunks


def tokens(text: str) -> list[str]:
    uni = [stem(w) for w in WORD.findall(text.lower()) if w not in STOP]
    return uni + [f"{a}_{b}" for a, b in zip(uni, uni[1:])]


class Embedder(Protocol):
    def fit(self, texts: list[str]) -> None: ...
    def embed(self, texts: list[str]) -> np.ndarray: ...


class TfidfEmbedder:
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

    def embed(self, texts: list[str]) -> np.ndarray:
        assert self.idf is not None, "call fit() first"
        out = np.zeros((len(texts), len(self.vocab)), dtype=np.float32)
        for r, t in enumerate(texts):
            for w, c in Counter(tokens(t)).items():
                j = self.vocab.get(w)
                if j is not None:
                    out[r, j] = c
        out *= self.idf
        norms = np.linalg.norm(out, axis=1, keepdims=True)
        norms[norms == 0] = 1
        return out / norms


class Index:
    def __init__(self, chunks: list[Chunk], embedder: Embedder | None = None):
        self.chunks = chunks
        self.embedder = embedder or TfidfEmbedder()
        texts = [c.text for c in chunks]
        self.embedder.fit(texts)
        self.matrix = self.embedder.embed(texts)

    def search(self, query: str, k: int = 3, min_score: float = 0.0) -> list[tuple[Chunk, float]]:
        q = self.embedder.embed([query])[0]
        scores = self.matrix @ q
        order = np.argsort(-scores)[:k]
        return [(self.chunks[i], float(scores[i])) for i in order if scores[i] >= min_score]
