# Copyright (C) 2026 Barthélemy Houot & contributeurs MyJarvis
# This file is part of the MyJarvis fork of Jarvis OS,
# licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

"""Fond d'écran personnalisé — Réglages › Apparence (demande 17).

La photo de fond ne peut pas vivre dans localStorage : quelques mégaoctets
suffisent à faire sauter le quota du navigateur, et elle doit être la même
dans tous les onglets et au prochain démarrage. Elle est donc déposée ici.

Transport : JSON base64 plutôt que multipart. C'est volontaire — le multipart
exigerait `python-multipart`, une dépendance de plus pour un seul appel qui se
fait en local, une fois de temps en temps.
"""

from __future__ import annotations

import base64
import re
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from loguru import logger
from pydantic import BaseModel

router = APIRouter(prefix="/api/perso")

# Formats acceptés → extension sur disque.
_ALLOWED = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
}
_MAX_BYTES = 24 * 1024 * 1024  # 24 Mo : large pour une photo, borné quand même
_DATA_URL = re.compile(r"^data:(?P<mime>[\w/+.-]+);base64,(?P<payload>.+)$", re.S)


def _dir() -> Path:
    d = Path("config")
    d.mkdir(parents=True, exist_ok=True)
    return d


def _existing() -> Path | None:
    for ext in (".png", ".jpg", ".webp", ".gif", ".avif"):
        p = _dir() / f"wallpaper{ext}"
        if p.exists():
            return p
    return None


class WallpaperBody(BaseModel):
    data_url: str


@router.post("/wallpaper")
async def set_wallpaper(body: WallpaperBody) -> JSONResponse:
    m = _DATA_URL.match(body.data_url.strip())
    if not m:
        raise HTTPException(400, "Attendu : une data URL base64 (data:image/…;base64,…).")

    mime = m.group("mime").lower()
    ext = _ALLOWED.get(mime)
    if ext is None:
        raise HTTPException(
            415, f"Format non pris en charge : {mime}. PNG, JPEG, WebP, GIF ou AVIF."
        )

    try:
        raw = base64.b64decode(m.group("payload"), validate=True)
    except Exception as exc:
        raise HTTPException(400, f"Base64 illisible : {exc}") from exc

    if len(raw) > _MAX_BYTES:
        raise HTTPException(413, f"Image trop lourde ({len(raw) // 1048576} Mo). Maximum 24 Mo.")

    # Une seule image à la fois : on retire l'ancienne SEULEMENT après avoir
    # écrit la nouvelle, pour ne jamais se retrouver sans fond en cas d'échec.
    target = _dir() / f"wallpaper{ext}"
    tmp = target.with_name(target.name + ".tmp")
    tmp.write_bytes(raw)
    tmp.replace(target)
    for other_ext in _ALLOWED.values():
        other = _dir() / f"wallpaper{other_ext}"
        if other != target and other.exists():
            other.unlink()

    logger.info("Fond d'écran enregistré", path=str(target), ko=len(raw) // 1024)
    return JSONResponse({"ok": True, "url": f"/api/perso/wallpaper?v={int(time.time())}"})


@router.get("/wallpaper")
async def get_wallpaper() -> FileResponse:
    p = _existing()
    if p is None:
        raise HTTPException(404, "Aucun fond d'écran enregistré.")
    return FileResponse(str(p), headers={"Cache-Control": "public, max-age=60"})


@router.delete("/wallpaper")
async def clear_wallpaper() -> JSONResponse:
    p = _existing()
    if p is None:
        return JSONResponse({"ok": True, "removed": False})
    # Pas de suppression sèche : on garde la dernière image sous un nom mis de
    # côté, au cas où le Maître voudrait la reprendre.
    p.replace(p.with_name("wallpaper-precedent" + p.suffix))
    return JSONResponse({"ok": True, "removed": True})
