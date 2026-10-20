"""Minimal local REST wrapper around notebooklm-py (unofficial; uses your saved Google session).

Bound to localhost only. Run `npm run bridge:login` once to authenticate.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from notebooklm import ChatError, NotebookLMClient

app = FastAPI(title="notebooklm-bridge")


class Ask(BaseModel):
    question: str


@asynccontextmanager
async def _client():
    """Open a client, mapping missing/expired auth to a clear 503 instead of a 500."""
    try:
        async with NotebookLMClient.from_storage() as client:
            yield client
    except FileNotFoundError as e:
        raise HTTPException(503, f"Not logged in to NotebookLM. Run `npm run bridge:login`. ({e})")
    except ChatError as e:
        raise HTTPException(502, str(e))


@app.get("/health")
async def health():
    return {"ok": True}


@app.get("/notebooks")
async def notebooks():
    async with _client() as client:
        items = await client.notebooks.list()
        return [{"id": n.id, "title": getattr(n, "title", "")} for n in items]


@app.post("/notebooks/{notebook_id}/ask")
async def ask(notebook_id: str, body: Ask):
    async with _client() as client:
        result = await client.chat.ask(notebook_id, body.question)
        return {"answer": result.answer}
