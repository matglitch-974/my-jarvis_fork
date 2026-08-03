# Copyright (C) 2026 Barthélemy Houot & contributeurs MyJarvis
# This file is part of the MyJarvis fork of Jarvis OS,
# licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

"""API des automatisations (demande 10) — CRUD + déclenchement manuel.

Le moteur et son magasin vivent dans `app.state` (posés par bootstrap). Si
l'application tourne sans (montage partiel, tests), les routes répondent
proprement plutôt que de lever.
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from jarvis.engine.automations import Automation, AutomationEngine, AutomationStore

router = APIRouter(prefix="/api/automations")


def _store(request: Request) -> AutomationStore:
    store = getattr(request.app.state, "automation_store", None)
    if store is None:
        raise HTTPException(503, "Automatisations indisponibles (moteur non monté).")
    return store


def _engine(request: Request) -> AutomationEngine:
    engine = getattr(request.app.state, "automation_engine", None)
    if engine is None:
        raise HTTPException(503, "Automatisations indisponibles (moteur non monté).")
    return engine


def _public(auto: Automation) -> dict:
    data = asdict(auto)
    data.pop("_next_due", None)
    return data


class CreateBody(BaseModel):
    name: str
    trigger: dict = {"type": "manual"}
    actions: list[dict] = []


class UpdateBody(BaseModel):
    name: str | None = None
    trigger: dict | None = None
    actions: list[dict] | None = None
    enabled: bool | None = None


@router.get("")
async def list_automations(request: Request) -> dict:
    store = _store(request)
    return {"automations": [_public(a) for a in store.list()]}


@router.post("")
async def create_automation(body: CreateBody, request: Request) -> dict:
    if not body.name.strip():
        raise HTTPException(400, "Le nom ne peut pas être vide.")
    if not body.actions:
        raise HTTPException(400, "Il faut au moins une action.")
    auto = _store(request).create(body.name, body.trigger, body.actions)
    return _public(auto)


@router.put("/{aid}")
async def update_automation(aid: str, body: UpdateBody, request: Request) -> dict:
    auto = _store(request).update(
        aid,
        name=body.name,
        trigger=body.trigger,
        actions=body.actions,
        enabled=body.enabled,
    )
    if auto is None:
        raise HTTPException(404, f"Automatisation introuvable : {aid}")
    return _public(auto)


@router.delete("/{aid}")
async def delete_automation(aid: str, request: Request) -> dict:
    if not _store(request).delete(aid):
        raise HTTPException(404, f"Automatisation introuvable : {aid}")
    return {"deleted": aid}


@router.post("/{aid}/run")
async def run_automation(aid: str, request: Request) -> dict:
    return await _engine(request).run(aid, reason="interface")


@router.post("/events/{event}")
async def fire_event(event: str, request: Request) -> dict:
    """Déclenche les automatisations abonnées à un événement donné."""
    fired = await _engine(request).fire_event(event)
    return {"event": event, "fired": fired}


@router.get("/tools")
async def available_tools(request: Request) -> dict:
    """Outils appelables dans une action — l'interface s'en sert pour proposer
    une liste plutôt que de laisser taper un nom au hasard."""
    registry = getattr(request.app.state, "tool_registry", None)
    if registry is None:
        return {"tools": []}
    return {
        "tools": [
            {"name": s.get("name", ""), "description": (s.get("description") or "")[:220]}
            for s in registry.schemas()
        ]
    }
