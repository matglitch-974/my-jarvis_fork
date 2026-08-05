# Copyright (C) 2026 Barthélemy Houot & contributeurs MyJarvis
# This file is part of the MyJarvis fork of Jarvis OS,
# licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

"""Moteur de raisonnement — Réglages › Moteur.

Demande du Maître : rendre le moteur compatible avec n'importe quelle API ou
modèle local, et pouvoir tout régler depuis l'interface.

Le choix du moteur vit dans le **sidecar Node**, pas dans le `.env` de
jarvis-OS : c'est le process Node qui parle aux fournisseurs, et lui seul peut
appliquer un changement sans redémarrage. Ce routeur n'est donc qu'un relais —
il ne duplique aucun réglage, ce qui évite d'avoir deux vérités qui divergent.

Quatre routes, calquées sur celles du sidecar :
  GET  /api/engine          → moteurs disponibles + configuration (clé masquée)
  PUT  /api/engine          → enregistre, après validation côté sidecar
  POST /api/engine/test     → essaie une configuration SANS l'enregistrer
  GET  /api/engine/models   → modèles réellement présents chez le fournisseur
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from loguru import logger

router = APIRouter()

# Un essai de connexion doit pouvoir attendre un modèle local qui se réveille.
_TIMEOUT_LECTURE = 8.0
_TIMEOUT_ESSAI = 30.0


def _sidecar(path: str) -> str:
    base = os.getenv("CLAUDE_SDK_URL", "http://127.0.0.1:4981").rstrip("/")
    return f"{base}{path}"


_INJOIGNABLE = (
    "Sidecar injoignable. Lance MyJarvis par son raccourci pour que le moteur "
    "(port 4981) tourne."
)


async def _relais(methode: str, chemin: str, corps: dict | None = None, timeout: float = _TIMEOUT_LECTURE) -> Any:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if methode == "GET":
                r = await client.get(_sidecar(chemin))
            elif methode == "PUT":
                r = await client.put(_sidecar(chemin), json=corps or {})
            else:
                r = await client.post(_sidecar(chemin), json=corps or {})
    except Exception as exc:
        logger.debug("Moteur : sidecar indisponible", error=str(exc))
        raise HTTPException(503, _INJOIGNABLE) from exc

    if r.status_code == 400:
        # Validation refusée côté sidecar : on remonte ses raisons telles quelles.
        raise HTTPException(400, r.json().get("soucis", ["Configuration refusée."]))
    if r.status_code != 200:
        raise HTTPException(502, f"Sidecar : HTTP {r.status_code}")
    return r.json()


@router.get("/api/engine")
async def get_engine() -> dict:
    """Configuration courante. La clé API n'en sort jamais en clair."""
    return await _relais("GET", "/engine")


@router.put("/api/engine")
async def set_engine(body: dict) -> dict:
    """Enregistre un réglage. Effet immédiat, sans redémarrage.

    Le corps est libre et transmis tel quel : le sidecar est seul juge de ce
    qui est valide, et ajouter un réglage là-bas n'oblige à rien ici.
    """
    out = await _relais("PUT", "/engine", body)
    logger.info("Moteur reconfiguré", moteur=(out.get("config") or {}).get("moteur"))
    return out


@router.post("/api/engine/test")
async def test_engine(body: dict) -> dict:
    """Essaie une configuration sans l'enregistrer.

    C'est ce qui permet le bouton « Connexion » : on ne garde un réglage que
    s'il répond vraiment.
    """
    return await _relais("POST", "/engine/test", body, timeout=_TIMEOUT_ESSAI)


@router.get("/api/engine/models")
async def list_models() -> dict:
    """Modèles réellement disponibles chez le fournisseur configuré.

    Renvoie une liste vide plutôt qu'une erreur quand le fournisseur ne sait
    pas se décrire : l'interface bascule alors sur une saisie libre.
    """
    try:
        return await _relais("GET", "/engine/models")
    except HTTPException:
        return {"modeles": []}
