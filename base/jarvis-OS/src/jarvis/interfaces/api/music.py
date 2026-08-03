# Copyright (C) 2026 Barthélemy Houot
# This file is part of Jarvis OS, licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from jarvis.interfaces.api import deezer as _dz
from jarvis.interfaces.api import local_music as _lm
from jarvis.interfaces.api import spotify as _sp
from jarvis.interfaces.api import youtube_music as _ym
from jarvis.kernel.settings import settings

router = APIRouter(prefix="/api/music")

# Un seul endroit où l'on sait quels fournisseurs existent : ajouter une source
# se fait ici, pas dans trois `if` recopiés.
_PROVIDERS = {
    "spotify": _sp,
    "deezer": _dz,
    "youtube_music": _ym,
    "local": _lm,
}


async def _get_state() -> dict:
    provider = settings.music_provider or ""
    mod = _PROVIDERS.get(provider)
    if mod is None:
        return {"provider": None, "connected": False}
    state = await mod._get_player_state()
    state["provider"] = provider
    return state


async def _action(action: str) -> JSONResponse:
    provider = settings.music_provider or ""
    if not provider:
        return JSONResponse({"ok": False, "error": "no_provider"}, status_code=400)

    mod = _PROVIDERS.get(provider)
    if mod is None:
        return JSONResponse({"ok": False, "error": "unknown_provider"}, status_code=400)

    mapping = {
        "play": mod.play,
        "pause": mod.pause,
        "next": mod.next_track,
        "prev": mod.previous_track,
    }
    fn = mapping.get(action)
    if fn is None:
        return JSONResponse({"ok": False, "error": "unknown_action"}, status_code=400)
    return await fn()


@router.get("/status")
async def get_music_status() -> JSONResponse:
    return JSONResponse(await _get_state())


@router.get("/provider-status")
async def get_provider_status() -> JSONResponse:
    provider = settings.music_provider or ""
    if not provider:
        return JSONResponse({"provider": None, "connected": False})
    state = await _get_state()
    return JSONResponse({"provider": provider, "connected": state.get("connected", False)})


@router.post("/play")
async def music_play() -> JSONResponse:
    return await _action("play")


@router.post("/pause")
async def music_pause() -> JSONResponse:
    return await _action("pause")


@router.post("/next")
async def music_next() -> JSONResponse:
    return await _action("next")


@router.post("/prev")
async def music_prev() -> JSONResponse:
    return await _action("prev")
