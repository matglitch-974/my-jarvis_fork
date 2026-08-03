# Copyright (C) 2026 Barthélemy Houot & contributeurs MyJarvis
# This file is part of the MyJarvis fork of Jarvis OS,
# licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

"""Pipeline vocal LOCAL — demande 15 : « configure le pipeline vocal pour que
je puisse utiliser le micro ».

Pourquoi ne pas simplement brancher LiveKit : le pipeline d'origine exige un
serveur LiveKit (LIVEKIT_URL/API_KEY/API_SECRET) **et** une clé Deepgram. Le
.env de MyJarvis n'en a aucune, et le moteur tourne par abonnement, sans clé
API. Le micro ne pouvait donc pas fonctionner.

Ici : tout est local et sans clé.
    micro (navigateur) → WebM/Opus → /api/voice/transcribe (faster-whisper)
    → /api/voice/generate (moteur Jarvis, déjà en place)
    → /api/voice/speak (Piper) ou synthèse du navigateur en repli.

Whisper télécharge son modèle tout seul au premier usage. Piper, lui, a besoin
d'un fichier de voix : /api/voice/piper-install va le chercher à la demande, et
tant qu'il manque, le front parle avec la voix du système.
"""

from __future__ import annotations

import asyncio
import base64
import os
import re
from pathlib import Path

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import BaseModel

from jarvis.kernel.settings import settings
from jarvis.providers.audio.stt import transcribe_media

router = APIRouter()

_DATA_URL = re.compile(r"^data:(?P<mime>[\w/+.-]+);base64,(?P<payload>.+)$", re.S)
_MAX_AUDIO = 12 * 1024 * 1024  # ~10 min d'Opus : au-delà, c'est une erreur d'appel

# Voix française Piper (dépôt officiel rhasspy sur Hugging Face).
_PIPER_VOICE_URL = (
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
    "fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx"
)
_PIPER_CONFIG_URL = _PIPER_VOICE_URL + ".json"


def _livekit_ready() -> bool:
    return all(
        (os.getenv("LIVEKIT_URL"), os.getenv("LIVEKIT_API_KEY"), os.getenv("LIVEKIT_API_SECRET"))
    )


def _piper_path() -> Path:
    return Path(settings.piper_model_path)


@router.get("/api/voice/status")
async def voice_status() -> JSONResponse:
    """De quoi le front décide quel pipeline monter — sans deviner."""
    piper = _piper_path()
    return JSONResponse(
        {
            "livekit": _livekit_ready(),
            "local": True,
            "pipeline": "livekit" if _livekit_ready() else "local",
            "stt": {"engine": "faster-whisper", "model": settings.whisper_model},
            "tts": {
                "provider": settings.tts_provider,
                "piper_model": str(piper),
                "piper_ready": piper.exists(),
            },
        }
    )


class TranscribeBody(BaseModel):
    audio: str  # data URL base64 (audio/webm, audio/ogg, audio/wav…)


@router.post("/api/voice/transcribe")
async def voice_transcribe(body: TranscribeBody) -> JSONResponse:
    m = _DATA_URL.match(body.audio.strip())
    raw = body.audio
    if m:
        raw = m.group("payload")
    try:
        data = base64.b64decode(raw, validate=False)
    except Exception as exc:
        return JSONResponse({"ok": False, "error": f"base64 illisible : {exc}"}, status_code=400)

    if not data:
        return JSONResponse({"ok": True, "text": ""})
    if len(data) > _MAX_AUDIO:
        return JSONResponse({"ok": False, "error": "extrait audio trop long"}, status_code=413)

    try:
        text = await transcribe_media(data)
    except Exception as exc:
        logger.error("STT local en échec", error=str(exc))
        return JSONResponse({"ok": False, "error": str(exc), "text": ""}, status_code=200)

    logger.debug("STT local", ko=len(data) // 1024, chars=len(text))
    return JSONResponse({"ok": True, "text": text})


@router.post("/api/voice/piper-install")
async def piper_install() -> JSONResponse:
    """Télécharge la voix française Piper (~63 Mo) pour une synthèse 100 % locale."""
    target = _piper_path()
    if target.exists():
        return JSONResponse({"ok": True, "already": True, "path": str(target)})

    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + ".part")
    downloads = (
        (_PIPER_VOICE_URL, tmp),
        (_PIPER_CONFIG_URL, target.with_suffix(".onnx.json")),
    )
    try:
        async with httpx.AsyncClient(timeout=None, follow_redirects=True) as client:
            for url, dest in downloads:
                async with client.stream("GET", url) as resp:
                    resp.raise_for_status()
                    with dest.open("wb") as fh:
                        async for chunk in resp.aiter_bytes(1 << 16):
                            fh.write(chunk)
                await asyncio.sleep(0)
        tmp.replace(target)
    except Exception as exc:
        if tmp.exists():
            tmp.unlink()
        logger.error("Téléchargement voix Piper en échec", error=str(exc))
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=200)

    logger.info("Voix Piper installée", path=str(target))
    return JSONResponse({"ok": True, "already": False, "path": str(target)})
