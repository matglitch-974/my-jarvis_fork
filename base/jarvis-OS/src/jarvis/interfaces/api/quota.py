# Copyright (C) 2026 Barthélemy Houot & contributeurs MyJarvis
# This file is part of the MyJarvis fork of Jarvis OS,
# licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

"""Quota d'ABONNEMENT — Réglages › Conso (III › 03).

Demande du Maître : « voir mon quota si j'ai un abonnement et pas en api ».

Précision honnête, à afficher telle quelle dans l'interface : Anthropic
n'expose aucune API publique donnant le solde restant d'un abonnement. La
seule mesure fiable est donc **ce que MyJarvis consomme lui-même**. Le sidecar
Claude Agent SDK (port 4981) tient un registre local de chaque requête aboutie
et le projette sur les deux fenêtres qui gouvernent l'abonnement : la session
glissante de 5 h et la semaine glissante.

Deux modes :
  - `subscription` : le sidecar répond → on relaie ses fenêtres ;
  - `api`          : une clé API est configurée → il n'y a pas de quota, mais
                     un coût ; on renvoie le coût du mois pour que l'interface
                     affiche la bonne chose plutôt qu'une jauge trompeuse.
"""

from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from jarvis.kernel.settings import settings

router = APIRouter()

_SIDECAR_TIMEOUT = 3.0


def _sidecar_url(path: str = "/quota") -> str:
    base = os.getenv("CLAUDE_SDK_URL", "http://127.0.0.1:4981").rstrip("/")
    return f"{base}{path}"


def _uses_subscription() -> bool:
    """Vrai si le moteur passe par le sidecar d'abonnement plutôt qu'une clé."""
    backend = (getattr(settings, "api_backend", "") or "").lower()
    if backend == "claude_agent_sdk":
        return True
    # Repli : pas de clé Anthropic renseignée → on est forcément en abonnement.
    try:
        return not settings.anthropic_api_key.get_secret_value()
    except AttributeError:
        return False


@router.get("/api/quota")
async def get_quota() -> dict:
    if not _uses_subscription():
        return {
            "mode": "api",
            "plan": None,
            "available": False,
            "note": (
                "Facturation à l'usage : il n'y a pas de quota d'abonnement à "
                "afficher, seulement un coût. Voir les cartes de consommation."
            ),
        }

    try:
        async with httpx.AsyncClient(timeout=_SIDECAR_TIMEOUT) as client:
            r = await client.get(_sidecar_url())
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}")
        data = r.json()
    except Exception as exc:  # sidecar éteint, ancienne version, réseau local KO
        logger.debug("Quota sidecar indisponible", error=str(exc))
        return {
            "mode": "subscription",
            "available": False,
            "error": str(exc),
            "note": (
                "Sidecar injoignable : lance MyJarvis par son raccourci pour "
                "que le moteur d'abonnement (port 4981) tourne."
            ),
        }

    data["available"] = True
    data.setdefault("mode", "subscription")
    data["note"] = (
        "Consommation mesurée localement par MyJarvis. Anthropic ne publie pas "
        "le solde d'un abonnement : les plafonds affichés sont ceux que tu as "
        "déclarés ci-dessous."
    )
    return data


class LimitsBody(BaseModel):
    session: int | None = None
    week: int | None = None
    plan: str | None = None


@router.post("/api/quota/limits")
async def set_quota_limits(body: LimitsBody) -> dict:
    """Écrit les plafonds côté sidecar — pris en compte immédiatement.

    Les mettre dans le .env de jarvis-OS ne servirait à rien : le compteur vit
    dans le process Node, qui ne lit pas ce fichier.
    """
    try:
        async with httpx.AsyncClient(timeout=_SIDECAR_TIMEOUT) as client:
            r = await client.post(
                _sidecar_url("/quota/limits"),
                json=body.model_dump(exclude_none=True),
            )
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}")
        return r.json()
    except Exception as exc:
        logger.warning("Plafonds de quota non enregistrés", error=str(exc))
        raise HTTPException(503, f"Sidecar injoignable : {exc}") from exc
