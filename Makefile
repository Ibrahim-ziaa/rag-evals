.PHONY: install build demo dev test

VENV := .venv
PY := $(VENV)/bin/python

install:
	test -d $(VENV) || python3 -m venv $(VENV)
	$(VENV)/bin/pip install -q -e ".[dev]"
	cd web && npm install --no-audit --no-fund

build:
	cd web && npm run build

# one process, one port: FastAPI serves the API and the built React app
demo: install build
	$(PY) -m rag_evals serve --port 8102

# hot reload: API on 8102, Vite on 5182 with /api proxied
dev:
	$(VENV)/bin/uvicorn rag_evals.api:app --reload --port 8102 & cd web && npm run dev

test:
	$(VENV)/bin/pytest -q
