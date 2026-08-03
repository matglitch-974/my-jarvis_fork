# Copyright (C) 2026 Barthélemy Houot
# This file is part of Jarvis OS, licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

"""Reconnaissance vocale LOCALE pour le pipeline LiveKit (faster-whisper).

`settings.stt_provider` accepte la valeur ``whisper`` depuis toujours, mais
`interfaces/voice/agent.py` n'implémentait que ``deepgram``, ``openai`` et
``google`` : choisir ``whisper`` retombait en silence sur Deepgram, qui exige
une clé payante. Le micro captait, et Jarvis ne comprenait rien — sans le
moindre message expliquant pourquoi.

Ce module comble le trou. Il enveloppe `providers.audio.stt` (faster-whisper,
déjà utilisé par le mode appui-pour-parler) dans l'interface STT de LiveKit.

Whisper ne sait pas transcrire en continu : il travaille sur un énoncé complet.
On expose donc une reconnaissance par blocs, que `stt.StreamAdapter` transforme
en flux temps réel en s'appuyant sur le VAD Silero pour découper la parole.
Conséquence assumée : pas de résultats intermédiaires (`interim_results`), la
transcription arrive quand la phrase est finie.

Rien ne quitte la machine.
"""

from __future__ import annotations

import numpy as np
from livekit import rtc
from livekit.agents import APIConnectOptions, stt
from livekit.agents.types import NOT_GIVEN, NotGivenOr
from loguru import logger

from jarvis.providers.audio import stt as whisper_backend

# Whisper est entraîné sur du 16 kHz mono : toute autre fréquence dégrade la
# transcription au lieu de la refuser, donc on rééchantillonne nous-mêmes.
_TAUX_WHISPER = 16000


class WhisperSTT(stt.STT):
    """STT LiveKit adossée à faster-whisper, en local."""

    def __init__(self, *, langue: str = "fr") -> None:
        super().__init__(
            capabilities=stt.STTCapabilities(streaming=False, interim_results=False)
        )
        self._langue = langue

    async def _recognize_impl(
        self,
        buffer: rtc.AudioFrame | list[rtc.AudioFrame],
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions | None = None,
    ) -> stt.SpeechEvent:
        trame = rtc.combine_audio_frames(buffer)
        texte = await whisper_backend.transcribe(_en_float32_16k(trame))

        if not texte:
            logger.debug("Whisper STT : énoncé vide (bruit ou silence)")

        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[
                stt.SpeechData(
                    language=language if isinstance(language, str) else self._langue,
                    text=texte,
                )
            ],
        )


def _en_float32_16k(trame: rtc.AudioFrame) -> bytes:
    """Convertit une trame LiveKit (PCM 16 bits entrelacé) en float32 16 kHz mono.

    C'est le format qu'attend `providers.audio.stt.transcribe`.
    """
    echantillons = np.frombuffer(trame.data, dtype=np.int16).astype(np.float32) / 32768.0

    # Démixage : on moyenne les canaux plutôt que d'en jeter un, pour ne pas
    # perdre la voix si elle n'est présente que sur le canal droit.
    if trame.num_channels > 1:
        echantillons = echantillons.reshape(-1, trame.num_channels).mean(axis=1)

    if trame.sample_rate != _TAUX_WHISPER:
        cible = int(len(echantillons) * _TAUX_WHISPER / trame.sample_rate)
        if cible <= 0:
            return b""
        # Interpolation linéaire : suffisante pour de la voix, et sans dépendance
        # supplémentaire (scipy n'est pas dans l'environnement de base).
        echantillons = np.interp(
            np.linspace(0, len(echantillons) - 1, cible, dtype=np.float32),
            np.arange(len(echantillons), dtype=np.float32),
            echantillons,
        ).astype(np.float32)

    return echantillons.astype(np.float32).tobytes()


def construire(vad: object, *, langue: str = "fr") -> stt.STT:
    """STT whisper prête pour l'AgentSession, enveloppée pour le temps réel.

    Le VAD passé est celui déjà chargé au prewarm : on ne recharge pas Silero.
    """
    base = WhisperSTT(langue=langue)
    if vad is None:
        # Sans VAD, impossible de découper la parole : on rend la STT par blocs
        # telle quelle plutôt que d'échouer. L'AgentSession saura s'en servir.
        logger.warning("Whisper STT sans VAD — découpage de la parole dégradé")
        return base
    return stt.StreamAdapter(stt=base, vad=vad)
