"""FastAPI app: JSON under /api, the built React app at /. One process, one port.

    uvicorn rag_evals.api:app --port 8102
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .service import Demo

DIST = Path(__file__).resolve().parent.parent / "web" / "dist"


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=400)


class RunIn(BaseModel):
    config_id: str = "production"
    note: str = Field(default="", max_length=120)


def create_app(demo: Demo | None = None) -> FastAPI:
    app = FastAPI(title="Sourcebook", docs_url="/api/openapi", redoc_url=None, openapi_url="/api/openapi.json")
    state = demo or Demo()
    app.state.demo = state

    def found(fn, *args):
        try:
            return fn(*args)
        except (KeyError, StopIteration):
            raise HTTPException(404, "Not found")

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.get("/api/meta")
    def meta():
        return state.meta()

    @app.post("/api/ask")
    def ask(body: AskIn):
        return state.ask(body.question.strip())

    @app.get("/api/docs")
    def docs():
        return {"documents": state.docs()}

    @app.get("/api/docs/{doc_id}")
    def doc(doc_id: str):
        return found(state.doc, doc_id)

    @app.get("/api/runs")
    def runs():
        return {"baseline_id": state.baseline_id, "runs": [state.run_summary(r) for r in state.runs]}

    @app.post("/api/runs", status_code=201)
    def start_run(body: RunIn):
        return found(state.execute, body.config_id, body.note)

    @app.get("/api/runs/{run_id}")
    def run_detail(run_id: str):
        return found(state.run_detail, run_id)

    @app.get("/api/runs/{run_id}/questions/{qid}")
    def question(run_id: str, qid: str):
        return found(state.question_detail, run_id, qid)

    @app.get("/api/compare")
    def compare(before: str | None = None, after: str | None = None):
        return found(state.compare, before, after)

    @app.post("/api/reset")
    def reset():
        state.reset()
        return {"ok": True, "runs": len(state.runs)}

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "DELETE"], include_in_schema=False)
    def api_404(rest: str):
        return JSONResponse({"detail": "Not found"}, status_code=404)

    if DIST.exists():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            f = (DIST / path).resolve()
            if path and f.is_file() and DIST.resolve() in f.parents:
                return FileResponse(f)
            return FileResponse(DIST / "index.html")

    return app


app = create_app()
