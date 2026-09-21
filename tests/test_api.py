import pytest
from fastapi.testclient import TestClient

from rag_evals.api import create_app
from rag_evals.config import PRESETS, PRODUCTION
from rag_evals.index import chunk_text
from rag_evals.service import SEED_PLAN, Demo


@pytest.fixture(scope="module")
def demo():
    return Demo()


@pytest.fixture()
def client(demo):
    demo.reset()
    return TestClient(create_app(demo))


def test_section_aware_chunks_never_straddle_a_heading_and_are_verbatim():
    text = "# Title\n\n## One\nalpha beta gamma delta\n\n## Two\nepsilon zeta"
    chunks = chunk_text("d", text, max_words=3, overlap=1, section_aware=True)
    assert [c.section for c in chunks] == ["One", "One", "Two"]
    assert all(text[c.start:c.end] == c.text and "#" not in c.text for c in chunks)
    assert chunks[0].embed_text.startswith("Title. One.")


def test_ask_returns_numbered_citations_with_a_highlight_inside_the_passage(client):
    r = client.post("/api/ask", json={"question": "How long is the warranty on a Halden dishwasher?"}).json()
    assert not r["abstained"] and "24 months" in r["text"]
    cites = [p for p in r["parts"] if p["type"] == "cite"]
    assert cites and cites[0]["n"] == 1 and all(c["known"] for c in cites)
    src = next(s for s in r["sources"] if s["n"] == 1)
    assert src["doc_id"] == "warranty-policy" and src["section"] == "Coverage periods"
    (start, end), = src["highlights"]
    assert "24 months" in src["text"][start:end]


def test_ask_declines_with_closest_passages_and_the_floor(client):
    r = client.post("/api/ask", json={"question": "Do you sell microwave ovens?"}).json()
    assert r["abstained"] and r["sources"] == []
    assert r["decline"]["reason"] == "below_floor" and "microwave" in r["decline"]["unknown_words"]
    assert r["candidates"] and all(c["score"] < r["floor"] and not c["kept"] for c in r["candidates"])
    assert r["floor"] == PRODUCTION.min_score


def test_ask_applies_synonyms_and_validates_input(client):
    r = client.post("/api/ask", json={"question": "Is my fridge compressor under guarantee?"}).json()
    assert "refrigerator" in r["searched_as"] and "warranty" in r["searched_as"]
    assert client.post("/api/ask", json={"question": ""}).status_code == 422


def test_docs_list_and_chunk_viewer(client):
    docs = client.get("/api/docs").json()["documents"]
    assert 15 <= len(docs) <= 25 and all(d["chunks"] > 0 and d["indexed_at"] for d in docs)
    d = client.get("/api/docs/warranty-policy").json()
    assert d["title"] == "Warranty Policy" and len(d["chunks"]) == d["chunk_count"] > 3
    assert all(d["text"][c["start"]:c["end"]] == c["text"] for c in d["chunks"])
    assert client.get("/api/docs/nope").status_code == 404
    assert client.get("/api/docs/..%2Fgold").status_code == 404


def test_run_history_is_seeded_by_real_runs_and_gated_against_the_baseline(client):
    body = client.get("/api/runs").json()
    runs = body["runs"]
    assert [r["config"]["id"] for r in runs] == [s[0] for s in SEED_PLAN]
    baseline = next(r for r in runs if r["is_baseline"])
    assert baseline["id"] == body["baseline_id"] and baseline["gate"]["status"] == "pass"
    first = runs[0]
    assert first["gate"]["status"] == "fail" and {g["metric"] for g in first["gate"]["regressions"]} >= {"retrieval_recall", "relevance"}
    assert all(set(r["summary"]) == set(baseline["summary"]) and r["total"] == 50 for r in runs)
    assert "details" not in first


def test_run_evaluation_button_adds_a_real_run(client):
    before = len(client.get("/api/runs").json()["runs"])
    r = client.post("/api/runs", json={"config_id": "production"})
    assert r.status_code == 201 and r.json()["trigger"] == "manual" and r.json()["gate"]["status"] == "pass"
    bad = client.post("/api/runs", json={"config_id": "initial"}).json()
    assert bad["gate"]["status"] == "fail"
    assert len(client.get("/api/runs").json()["runs"]) == before + 2
    assert client.post("/api/runs", json={"config_id": "nope"}).status_code == 404
    client.post("/api/reset")
    assert len(client.get("/api/runs").json()["runs"]) == before


def test_run_detail_and_question_drill_down(client):
    run_id = client.get("/api/runs").json()["baseline_id"]
    detail = client.get(f"/api/runs/{run_id}").json()
    assert len(detail["questions"]) == 50 and sum(q["passed"] for q in detail["questions"]) == detail["passed"]
    q = client.get(f"/api/runs/{run_id}/questions/q41").json()
    assert q["expected_docs"] == ["troubleshooting-refrigerator", "replacement-parts-and-filters"]
    assert [m["key"] for m in q["metrics"]] == [m["key"] for m in client.get("/api/meta").json()["metrics"]]
    assert all(m["why"] for m in q["metrics"])
    assert [c["rank"] for c in q["candidates"]] == list(range(1, len(q["candidates"]) + 1))
    assert client.get(f"/api/runs/{run_id}/questions/q99").status_code == 404
    assert client.get("/api/runs/run-999").status_code == 404


def test_compare_reports_real_deltas_and_flips(client):
    c = client.get("/api/compare").json()
    assert c["before"]["config"]["id"] == "initial" and c["after"]["is_baseline"]
    for m in c["metrics"]:
        assert m["delta"] == pytest.approx(m["after"] - m["before"], abs=1e-4)
    assert sum(c["counts"].values()) == 50
    assert c["counts"]["fixed"] == sum(q["change"] == "fixed" for q in c["questions"]) > 0
    assert c["tally"]["after"]["passed"] - c["tally"]["before"]["passed"] == c["counts"]["fixed"] - c["counts"]["regressed"]
    assert c["tally"]["before"]["unanswerable_declined"] == 0 < c["tally"]["after"]["unanswerable_declined"]
    assert all(q["reason"] for q in c["questions"])
    assert {s["key"] for s in c["settings"] if s["changed"]} >= {"max_words", "k", "min_score"}
    runs = client.get("/api/runs").json()["runs"]
    swapped = client.get(f"/api/compare?before={runs[2]['id']}&after={runs[3]['id']}").json()
    assert swapped["before"]["id"] == runs[2]["id"]
    assert client.get("/api/compare?before=run-999").status_code == 404


def test_every_preset_runs_and_unknown_api_paths_404(client):
    assert set(PRESETS) == {c["id"] for c in client.get("/api/meta").json()["configs"]}
    assert client.get("/api/nothing-here").status_code == 404
