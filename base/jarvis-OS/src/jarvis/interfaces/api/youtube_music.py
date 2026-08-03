# Copyright (C) 2026 Barthélemy Houot & contributeurs MyJarvis
# This file is part of the MyJarvis fork of Jarvis OS,
# licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

"""YouTube Music — fournisseur musical (demande 6 : III › 01 › Musique).

Pourquoi ce montage plutôt qu'un simple appel d'API : YouTube ne publie
aucune API de *contrôle de lecture*. On lit et on cherche côté serveur (API
YouTube Data v3, clé YOUTUBE_API_KEY), mais la lecture se fait dans un lecteur
IFrame YouTube embarqué dans l'interface — le seul moyen légal et fiable de
jouer un morceau depuis une page.

Le serveur est donc l'arbitre :
  - il tient l'état courant du lecteur, que le front lui rapporte ;
  - il empile les commandes (play/pause/next/prev/load), que le front vient
    chercher et exécute.

Sans clé API, tout marche encore : le lecteur joue la playlist configurée
(YOUTUBE_MUSIC_PLAYLIST). La clé ne sert qu'à la recherche et aux titres.
"""

from __future__ import annotations

import os
import time
from collections import deque
from typing import Any

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import BaseModel

router = APIRouter(prefix="/api/youtube-music")

_API = "https://www.googleapis.com/youtube/v3"

# État rapporté par le lecteur embarqué. Volontairement en mémoire : c'est un
# état d'instant, il n'a aucun sens de le faire survivre à un redémarrage.
_state: dict[str, Any] = {
    "connected": False,
    "is_playing": False,
    "track": None,
    "artist": "",
    "album": "",
    "album_art": None,
    "progress_ms": 0,
    "duration_ms": 0,
    "video_id": None,
    "updated_at": 0.0,
}

# File de commandes serveur → lecteur. Bornée : si l'interface est fermée, les
# ordres ne doivent pas s'accumuler indéfiniment.
_commands: deque[dict[str, Any]] = deque(maxlen=32)

# Au-delà, on considère que plus aucun lecteur n'écoute.
_STALE_AFTER_S = 20.0


def _api_key() -> str:
    return (os.getenv("YOUTUBE_API_KEY", "") or "").strip().strip("'\"")


def playlist_id() -> str:
    return (os.getenv("YOUTUBE_MUSIC_PLAYLIST", "") or "").strip().strip("'\"")


def _fresh() -> bool:
    return (time.time() - _state.get("updated_at", 0.0)) < _STALE_AFTER_S


# ── Interface commune aux fournisseurs musicaux (cf. music.py) ────────────────


async def _get_player_state() -> dict:
    """Même contrat que spotify/deezer/local : consommé par /api/music/status."""
    if not _fresh():
        # Le lecteur n'est pas monté (interface fermée, autre page). On le dit
        # franchement plutôt que de renvoyer un état figé qui ment.
        return {
            "connected": False,
            "is_playing": False,
            "track": None,
            "needs_player": True,
        }
    out = {k: v for k, v in _state.items() if k != "updated_at"}
    out["connected"] = True
    return out


def _push(action: str, **payload: Any) -> None:  # noqa: ANN401 — charge libre par action
    _commands.append({"id": f"{time.time_ns()}", "action": action, **payload})


async def play() -> JSONResponse:
    _push("play")
    return JSONResponse({"ok": True, "queued": "play"})


async def pause() -> JSONResponse:
    _push("pause")
    return JSONResponse({"ok": True, "queued": "pause"})


async def next_track() -> JSONResponse:
    _push("next")
    return JSONResponse({"ok": True, "queued": "next"})


async def previous_track() -> JSONResponse:
    _push("prev")
    return JSONResponse({"ok": True, "queued": "prev"})


# ── Endpoints propres au fournisseur ─────────────────────────────────────────


class StateBody(BaseModel):
    is_playing: bool = False
    track: str | None = None
    artist: str = ""
    album: str = ""
    album_art: str | None = None
    progress_ms: int = 0
    duration_ms: int = 0
    video_id: str | None = None


@router.post("/state")
async def report_state(body: StateBody) -> JSONResponse:
    """Le lecteur embarqué rapporte où il en est (appelé ~1×/s)."""
    _state.update(body.model_dump())
    _state["connected"] = True
    _state["updated_at"] = time.time()
    return JSONResponse({"ok": True})


@router.get("/commands")
async def pull_commands() -> JSONResponse:
    """Le lecteur vient chercher les ordres en attente et les vide."""
    out = list(_commands)
    _commands.clear()
    return JSONResponse({"commands": out})


@router.get("/config")
async def get_config() -> JSONResponse:
    """De quoi le lecteur a besoin pour démarrer, sans exposer la clé API."""
    return JSONResponse(
        {
            "playlist": playlist_id(),
            "search_available": bool(_api_key()),
        }
    )


@router.get("/search")
async def search(q: str, limit: int = 10) -> JSONResponse:
    key = _api_key()
    if not key:
        return JSONResponse(
            {
                "ok": False,
                "error": "no_api_key",
                "hint": (
                    "Renseigne YOUTUBE_API_KEY dans Réglages › Modèles › Clés API "
                    "pour chercher des morceaux. La lecture de la playlist "
                    "configurée fonctionne sans clé."
                ),
                "items": [],
            },
            status_code=200,
        )
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                f"{_API}/search",
                params={
                    "part": "snippet",
                    "q": q,
                    "type": "video",
                    "videoCategoryId": "10",  # Musique
                    "maxResults": max(1, min(25, limit)),
                    "key": key,
                },
            )
        if r.status_code != 200:
            return JSONResponse(
                {"ok": False, "error": f"HTTP {r.status_code}", "items": []}, status_code=200
            )
        items = []
        for it in r.json().get("items", []):
            sn = it.get("snippet") or {}
            thumbs = sn.get("thumbnails") or {}
            best = thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}
            items.append(
                {
                    "video_id": (it.get("id") or {}).get("videoId"),
                    "title": sn.get("title", ""),
                    "artist": sn.get("channelTitle", ""),
                    "thumbnail": best.get("url"),
                }
            )
        return JSONResponse({"ok": True, "items": items})
    except Exception as exc:
        logger.warning("YouTube Music search error", error=str(exc))
        return JSONResponse({"ok": False, "error": str(exc), "items": []}, status_code=200)


class LoadBody(BaseModel):
    video_id: str | None = None
    playlist_id: str | None = None


@router.post("/load")
async def load(body: LoadBody) -> JSONResponse:
    """Charge un morceau ou une playlist dans le lecteur embarqué."""
    if not body.video_id and not body.playlist_id:
        return JSONResponse({"ok": False, "error": "rien à charger"}, status_code=400)
    _push("load", video_id=body.video_id, playlist_id=body.playlist_id)
    return JSONResponse({"ok": True})


@router.get("/player")
async def get_player() -> JSONResponse:
    return JSONResponse(await _get_player_state())
