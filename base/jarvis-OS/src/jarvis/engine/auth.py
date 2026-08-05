# Copyright (C) 2026 Barthélemy Houot
# This file is part of Jarvis OS, licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

"""Garde-fou réseau — authentification Bearer pour l'API Jarvis."""

from __future__ import annotations

import hmac
from collections.abc import Sequence

from fastapi import HTTPException, WebSocket
from loguru import logger
from starlette.requests import HTTPConnection

from jarvis.kernel.settings import settings

# Sous-protocole WebSocket porteur du jeton. Le navigateur refuse les en-têtes
# personnalisés à l'upgrade, mais il accepte une liste de sous-protocoles :
# c'est la seule voie qui ne fait pas transiter le jeton par l'URL (et donc
# par les journaux d'accès et l'historique).
WS_SUBPROTOCOL = "jarvis-bearer"

# Chemins exemptés de l'authentification Bearer.
# Un préfixe couvre toutes ses sous-routes.
_EXEMPT_EXACT: frozenset[str] = frozenset({
    "/health",
    "/api/health",
    "/",
    "/command",
    "/dashboard",
    "/settings",
    "/capabilities",
    "/admin",
    "/macropad",
    # OAuth Spotify : seuls le lancement (lien <a href>) et le callback (redirect
    # navigateur) ne peuvent pas porter de header Bearer. On exempte UNIQUEMENT
    # ces 2 routes — surtout PAS tout /api/spotify/ (qui contient /token, /play,
    # /transfer… appelés en fetch avec authHeaders et qui DOIVENT rester protégés).
    "/api/spotify/auth",
    "/api/spotify/callback",
})
_EXEMPT_PREFIXES: Sequence[str] = (
    "/api/channels/",  # webhooks — vérification de signature propre
    "/api/google/",  # OAuth Google — redirect navigateur, header impossible
)


async def verify_api_token(request: HTTPConnection) -> None:
    """Dépendance FastAPI globale — vérification du token Bearer.

    No-op si ``api_auth_enabled=False`` (usage local inchangé).
    Quand activée : exige ``Authorization: Bearer <token>`` sauf pour les
    endpoints exemptés (health, webhooks canaux, OAuth Google) et les
    connexions WebSocket (l'API browser ne supporte pas les headers d'upgrade).

    Périmètre non protégé intentionnellement :
    - Pages HTML de l'UI (``/``, ``/dashboard``, …) — routes FastAPI explicites,
      exemptées ici ; le token API est injecté dans le HTML pour les appels
      ``/api/*`` depuis le navigateur (voir ``interfaces/api/ui.py``)
    - Assets statiques (``StaticFiles`` mount) — sous-app ASGI, hors dépendance
    - Callbacks OAuth (``/api/google/``) — redirect tiers, token impossible
    - Webhooks canaux (``/api/channels/``) — signature propre (HMAC/Token)

    Les WebSockets ne passent PAS par ici (la dépendance ne s'y applique pas) :
    ils sont vérifiés à la main par ``verify_ws_token`` avant ``accept()``.
    """
    if not settings.api_auth_enabled:
        return

    # Les connexions WebSocket ont leur propre porte — voir verify_ws_token.
    if request.scope.get("type") == "websocket":
        return

    path: str = request.url.path
    if path in _EXEMPT_EXACT:
        return
    for prefix in _EXEMPT_PREFIXES:
        if path.startswith(prefix):
            return

    auth_header: str = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        logger.warning(
            "Auth: token manquant",
            path=path,
            client=request.client.host if request.client else "?",
        )
        raise HTTPException(status_code=401, detail="Token Bearer requis.")

    token = auth_header[len("Bearer ") :]
    if not _token_valide(token):
        logger.warning(
            "Auth: token invalide",
            path=path,
            client=request.client.host if request.client else "?",
        )
        raise HTTPException(status_code=401, detail="Token invalide.")


def _token_valide(token: str) -> bool:
    """Comparaison à temps constant contre le jeton configuré."""
    expected = settings.api_token.get_secret_value()
    if not expected or not token:
        return False
    return hmac.compare_digest(token.encode("utf-8"), expected.encode("utf-8"))


def _jeton_de_websocket(websocket: WebSocket) -> str:
    """Extrait le jeton d'une poignée de main WebSocket.

    Trois voies, par ordre de préférence :
    1. sous-protocole ``jarvis-bearer, <jeton>`` — le navigateur sait le poser
       et le jeton ne finit ni dans l'URL ni dans les journaux ;
    2. en-tête ``Authorization: Bearer`` — clients hors navigateur ;
    3. paramètre ``?token=`` — dernier recours, visible dans les journaux.
    """
    protos = websocket.headers.get("sec-websocket-protocol", "")
    if protos:
        morceaux = [p.strip() for p in protos.split(",") if p.strip()]
        if len(morceaux) >= 2 and morceaux[0] == WS_SUBPROTOCOL:
            return morceaux[1]

    entete = websocket.headers.get("authorization", "")
    if entete.startswith("Bearer "):
        return entete[len("Bearer ") :]

    return websocket.query_params.get("token", "")


async def verify_ws_token(websocket: WebSocket) -> bool:
    """Autorise ou refuse une connexion WebSocket, AVANT ``accept()``.

    Sans cette porte, ``/ws`` offrait un contournement complet de
    l'authentification : le canal du chat donne accès à la passerelle LLM et à
    tous les outils, et il n'était couvert par rien.

    Retourne True si la connexion peut se poursuivre. Sinon ferme la socket
    avec le code 4401 (équivalent applicatif d'un 401) et retourne False.
    """
    if not settings.api_auth_enabled:
        return True

    if _token_valide(_jeton_de_websocket(websocket)):
        return True

    logger.warning(
        "Auth WS: refusée",
        path=websocket.url.path,
        client=websocket.client.host if websocket.client else "?",
    )
    await websocket.close(code=4401, reason="Token requis.")
    return False


def ws_subprotocol(websocket: WebSocket) -> str | None:
    """Sous-protocole à renvoyer dans ``accept()``.

    Une poignée de main WebSocket échoue si le client propose un
    sous-protocole et que le serveur n'en confirme aucun.
    """
    protos = websocket.headers.get("sec-websocket-protocol", "")
    morceaux = [p.strip() for p in protos.split(",") if p.strip()]
    return WS_SUBPROTOCOL if morceaux and morceaux[0] == WS_SUBPROTOCOL else None
