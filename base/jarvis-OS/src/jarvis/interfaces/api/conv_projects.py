# Copyright (C) 2026 Barthélemy Houot & contributeurs MyJarvis
# This file is part of the MyJarvis fork of Jarvis OS,
# licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

"""Projets de CONVERSATIONS (mode Claude) — à ne pas confondre avec les projets
de l'agent worker (`interfaces/api/projects.py`, workspaces + étapes + fichiers).

Règle métier posée par le Maître : chaque conversation appartient
obligatoirement à un projet, même si elle y est seule. Un projet « Sans titre »
est donc créé à la volée pour toute conversation orpheline.

Tri : épinglés d'abord, puis par date de CRÉATION du projet (décroissante) —
jamais par dernière activité.

Stockage : un seul JSON dans memory_dir, cohérent avec `session_titles.json`.
Pas de base : le volume est de l'ordre de la centaine d'entrées.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from jarvis.kernel.settings import settings

router = APIRouter()

_DEFAULT_PROJECT_NAME = "Sans titre"


def _store_path() -> Path:
    return Path(settings.memory_dir) / "conv_projects.json"


def _load() -> dict[str, Any]:
    p = _store_path()
    if not p.exists():
        return {"projects": {}, "assignments": {}}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        # Un store illisible ne doit pas faire tomber l'UI : on repart à vide
        # plutôt que de propager. L'ancien fichier n'est pas écrasé tant
        # qu'aucune écriture n'a lieu.
        return {"projects": {}, "assignments": {}}
    data.setdefault("projects", {})
    data.setdefault("assignments", {})
    return data


def _save(data: dict[str, Any]) -> None:
    """Écriture atomique : un plantage en cours d'écriture laisserait sinon un
    JSON tronqué, et donc un store illisible au redémarrage."""
    p = _store_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _sorted_projects(data: dict[str, Any]) -> list[dict]:
    """Épinglés d'abord, puis date de création décroissante."""
    counts: dict[str, int] = {}
    for project_id in data["assignments"].values():
        counts[project_id] = counts.get(project_id, 0) + 1

    items = [
        {
            "id": pid,
            "name": p.get("name", _DEFAULT_PROJECT_NAME),
            "created_at": p.get("created_at", ""),
            "pinned": bool(p.get("pinned", False)),
            "conversation_count": counts.get(pid, 0),
        }
        for pid, p in data["projects"].items()
    ]
    # Deux tris successifs plutôt qu'une clé composite : `sort` est stable en
    # Python, donc le second tri conserve l'ordre par date établi par le
    # premier. Les dates ISO se comparent directement en tant que chaînes.
    items.sort(key=lambda x: x["created_at"], reverse=True)
    items.sort(key=lambda x: not x["pinned"])
    return items


# ── Schemas ───────────────────────────────────────────────────────────────────


class CreateBody(BaseModel):
    name: str


class PinBody(BaseModel):
    pinned: bool


class RenameBody(BaseModel):
    name: str


class AssignBody(BaseModel):
    session_id: str
    project_id: str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/api/conv-projects")
async def list_conv_projects(request: Request) -> list[dict]:  # noqa: ARG001
    """Liste les projets de conversations, épinglés d'abord puis par création."""
    return _sorted_projects(_load())


@router.post("/api/conv-projects")
async def create_conv_project(body: CreateBody, request: Request) -> dict:  # noqa: ARG001
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Le nom du projet ne peut pas être vide.")
    data = _load()
    pid = uuid.uuid4().hex[:12]
    data["projects"][pid] = {"name": name, "created_at": _now(), "pinned": False}
    _save(data)
    return {"id": pid, "name": name, "created_at": data["projects"][pid]["created_at"]}


@router.post("/api/conv-projects/{project_id}/pin")
async def pin_conv_project(project_id: str, body: PinBody, request: Request) -> dict:  # noqa: ARG001
    data = _load()
    project = data["projects"].get(project_id)
    if project is None:
        raise HTTPException(404, f"Projet introuvable : {project_id}")
    project["pinned"] = body.pinned
    _save(data)
    return {"id": project_id, "pinned": body.pinned}


@router.put("/api/conv-projects/{project_id}")
async def rename_conv_project(
    project_id: str, body: RenameBody, request: Request
) -> dict:  # noqa: ARG001
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Le nom du projet ne peut pas être vide.")
    data = _load()
    project = data["projects"].get(project_id)
    if project is None:
        raise HTTPException(404, f"Projet introuvable : {project_id}")
    project["name"] = name
    _save(data)
    return {"id": project_id, "name": name}


@router.delete("/api/conv-projects/{project_id}")
async def delete_conv_project(project_id: str, request: Request) -> dict:  # noqa: ARG001
    """Supprime le projet. Les conversations ne sont JAMAIS supprimées : elles
    sont détachées et retomberont dans un projet « Sans titre » à la demande."""
    data = _load()
    if project_id not in data["projects"]:
        raise HTTPException(404, f"Projet introuvable : {project_id}")
    del data["projects"][project_id]
    detached = [s for s, p in data["assignments"].items() if p == project_id]
    for s in detached:
        del data["assignments"][s]
    _save(data)
    return {"deleted": project_id, "detached_conversations": len(detached)}


@router.post("/api/conv-projects/assign")
async def assign_conversation(body: AssignBody, request: Request) -> dict:  # noqa: ARG001
    """Rattache une conversation à un projet.

    `project_id` absent → on renvoie le rattachement existant s'il y en a un,
    sinon on crée un projet « Sans titre » dédié. Sans cette idempotence, deux
    appels successifs sur la même conversation créaient deux projets, dont le
    premier restait vide.
    """
    data = _load()
    pid = body.project_id
    if pid is None:
        existing = data["assignments"].get(body.session_id)
        if existing is not None and existing in data["projects"]:
            return {"session_id": body.session_id, "project_id": existing}
        pid = uuid.uuid4().hex[:12]
        data["projects"][pid] = {
            "name": _DEFAULT_PROJECT_NAME,
            "created_at": _now(),
            "pinned": False,
        }
    elif pid not in data["projects"]:
        raise HTTPException(404, f"Projet introuvable : {pid}")
    data["assignments"][body.session_id] = pid
    _save(data)
    return {"session_id": body.session_id, "project_id": pid}


@router.get("/api/conv-projects/{project_id}/conversations")
async def list_project_conversations(
    project_id: str, request: Request
) -> list[str]:  # noqa: ARG001
    data = _load()
    if project_id not in data["projects"]:
        raise HTTPException(404, f"Projet introuvable : {project_id}")
    return [s for s, p in data["assignments"].items() if p == project_id]


@router.get("/api/conv-projects/assignments/all")
async def list_assignments(request: Request) -> dict:  # noqa: ARG001
    """Table session → projet. L'interface s'en sert pour grouper les fils."""
    return _load()["assignments"]


class EnsureBody(BaseModel):
    session_ids: list[str] = []


@router.post("/api/conv-projects/ensure-all")
async def ensure_all_assigned(body: EnsureBody, request: Request) -> dict:  # noqa: ARG001
    """Range TOUTES les conversations dans un projet — sans exception.

    Règle posée par le Maître (01/08) : aucune conversation ne doit flotter hors
    projet. Les orphelines rejoignent un projet « Sans titre » UNIQUE, et non un
    projet par conversation comme le faisait `assign` sans project_id — sinon la
    liste des projets devenait un doublon de la liste des conversations.
    """
    data = _load()
    orphans = [sid for sid in body.session_ids if sid not in data["assignments"]]
    if not orphans:
        return {"assigned": 0, "project_id": None}

    default_id = next(
        (
            pid
            for pid, p in data["projects"].items()
            if p.get("name") == _DEFAULT_PROJECT_NAME
        ),
        None,
    )
    if default_id is None:
        default_id = uuid.uuid4().hex[:12]
        data["projects"][default_id] = {
            "name": _DEFAULT_PROJECT_NAME,
            "created_at": _now(),
            "pinned": False,
        }

    for sid in orphans:
        data["assignments"][sid] = default_id
    _save(data)
    return {"assigned": len(orphans), "project_id": default_id}
