# Copyright (C) 2026 Barthélemy Houot
# This file is part of Jarvis OS, licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

from __future__ import annotations

import asyncio
import io

import numpy as np
from faster_whisper import WhisperModel
from loguru import logger
from numpy.typing import NDArray

from jarvis.kernel.settings import settings

_model: WhisperModel | None = None


def _load_model() -> WhisperModel:
    global _model
    if _model is None:
        logger.info("Loading Whisper model", size=settings.whisper_model)
        try:
            _model = WhisperModel(settings.whisper_model, device="auto", compute_type="float16")
        except (RuntimeError, ValueError) as exc:
            # float16 n'existe pas sur un CPU sans AVX512-FP16 : ctranslate2
            # refuse le modèle au lieu de dégrader tout seul. Sur le portable du
            # Maître (CPU pur), sans ce repli, le micro ne transcrivait rien.
            logger.warning("Whisper float16 refusé — repli int8", error=str(exc))
            _model = WhisperModel(settings.whisper_model, device="cpu", compute_type="int8")
        logger.info("Whisper model ready")
    return _model


def _run_transcribe(model: WhisperModel, audio: NDArray[np.float32]) -> str:
    segments, info = model.transcribe(audio, language="fr", beam_size=5)
    text = " ".join(seg.text.strip() for seg in segments).strip()
    logger.debug("STT done", lang=info.language, chars=len(text))
    return text


async def transcribe(pcm_bytes: bytes) -> str:
    """Transcrit un buffer PCM float32 (16 kHz mono) en texte français."""
    if not pcm_bytes:
        return ""
    model = await asyncio.to_thread(_load_model)
    audio: NDArray[np.float32] = np.frombuffer(pcm_bytes, dtype=np.float32).copy()
    return await asyncio.to_thread(_run_transcribe, model, audio)


def _run_transcribe_media(model: WhisperModel, data: bytes) -> str:
    """faster-whisper décode lui-même le conteneur via PyAV : on peut lui
    passer directement le WebM/Opus produit par MediaRecorder, sans ffmpeg
    externe ni fichier temporaire."""
    segments, info = model.transcribe(io.BytesIO(data), language="fr", beam_size=5)
    text = " ".join(seg.text.strip() for seg in segments).strip()
    logger.debug("STT media done", lang=info.language, chars=len(text))
    return text


async def transcribe_media(data: bytes) -> str:
    """Transcrit un fichier audio encodé (WebM/Opus, WAV, MP4…) en français.

    C'est ce qu'envoie le navigateur : MediaRecorder ne sait pas produire du
    PCM brut, seulement un conteneur.
    """
    if not data:
        return ""
    model = await asyncio.to_thread(_load_model)
    return await asyncio.to_thread(_run_transcribe_media, model, data)
