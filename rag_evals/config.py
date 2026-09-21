"""Named retrieval configurations. Every number on the quality screens comes from running one of these
for real against the gold set; nothing is stored as a precomputed result."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HANDBOOK_DOCS = ROOT / "corpus" / "handbook" / "docs"
HANDBOOK_GOLD = ROOT / "corpus" / "handbook" / "gold.jsonl"
HANDBOOK_SYNONYMS = ROOT / "corpus" / "handbook" / "synonyms.json"
BASELINE = ROOT / "evals" / "baseline.json"


def load_synonyms(path: Path = HANDBOOK_SYNONYMS) -> dict[str, str]:
    return json.loads(path.read_text()) if path.exists() else {}


@dataclass(frozen=True)
class RagConfig:
    id: str
    name: str
    summary: str
    max_words: int = 60
    overlap: int = 15
    section_aware: bool = False
    k: int = 3
    min_score: float = 0.08
    max_per_doc: int | None = None   # cap on passages from one document, so a second document can get in
    rel_floor: float = 0.0           # drop passages scoring below this share of the best passage
    synonyms: bool = False           # expand everyday words to the handbook's wording before searching

    def retrieval_kwargs(self, synonyms: dict[str, str]) -> dict:
        return {"max_per_doc": self.max_per_doc, "rel_floor": self.rel_floor,
                "synonyms": synonyms if self.synonyms else None}

    def chunking_key(self) -> tuple:
        return (self.max_words, self.overlap, self.section_aware)

    def to_dict(self) -> dict:
        return asdict(self)


FLOOR = 0.12

PRESETS: dict[str, RagConfig] = {c.id: c for c in [
    RagConfig("initial", "Initial setup", "Whole page chunks, single best passage, no score floor",
              max_words=400, overlap=0, section_aware=False, k=1, min_score=0.0),
    RagConfig("smaller-chunks", "Smaller chunks", "120 word chunks, still one passage and no floor",
              max_words=120, overlap=20, section_aware=False, k=1, min_score=0.0),
    RagConfig("top-3", "Top 3 passages", "120 word chunks, three passages per question, no floor",
              max_words=120, overlap=20, section_aware=False, k=3, min_score=0.0),
    RagConfig("score-floor", "Score floor added", "Declines to answer when no passage scores above the floor",
              max_words=120, overlap=20, section_aware=False, k=3, min_score=FLOOR),
    RagConfig("section-aware", "Section aware chunks", "Chunks follow document headings and carry the page title and heading",
              max_words=80, overlap=20, section_aware=True, k=3, min_score=FLOOR),
    RagConfig("production", "Tuned retrieval", "Section aware chunks, two passages per document at most, weak passages dropped, synonyms",
              max_words=80, overlap=20, section_aware=True, k=3, min_score=FLOOR, max_per_doc=2, rel_floor=0.4, synonyms=True),
    RagConfig("top-5", "Experiment: top 5 passages", "Tuned retrieval with five passages per question and no weak passage cut",
              max_words=80, overlap=20, section_aware=True, k=5, min_score=FLOOR, max_per_doc=2, rel_floor=0.0, synonyms=True),
]}
PRODUCTION = PRESETS["production"]
