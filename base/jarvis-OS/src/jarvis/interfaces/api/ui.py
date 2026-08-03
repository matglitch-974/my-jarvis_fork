# Copyright (C) 2026 Barthélemy Houot
# This file is part of Jarvis OS, licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from jarvis.kernel.settings import settings

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str


def inject_client_config(html: str) -> str:
    token = settings.api_token.get_secret_value() if settings.api_auth_enabled else ""
    api_base = ""
    snippet = (
        "<script>"
        f"window.JARVIS_API_TOKEN={json.dumps(token)};"
        f"window.JARVIS_API_BASE={json.dumps(api_base)};"
        f"window.JARVIS_WAKEUP_ENABLED={json.dumps(bool(settings.wakeup_enabled))};"
        "</script>"
    )
    marker = "</head>"
    if marker in html:
        return html.replace(marker, snippet + marker, 1)
    return snippet + html


def _ui_html_response(html_path: Path) -> Response:
    return Response(
        content=inject_client_config(_versioned_html(html_path)),
        media_type="text/html",
        headers={"Cache-Control": "no-store"},
    )


_ASSET_REF_RE = re.compile(r"""((?:href|src)=["'])(/[^"'?#>]+\.(?:css|js))(["'])""")


def _versioned_html(html_path: Path) -> str:
    """Injecte ?v=<mtime> sur CHAQUE asset local (.css/.js) référencé par la page.

    La découverte est automatique : aucune liste à tenir à jour. Les listes
    manuelles d'avant étaient incomplètes (``/command`` n'en avait aucune,
    ``/`` en couvrait 6 sur 19) et un asset oublié peut être servi périmé
    depuis le cache du navigateur alors que le reste de la page est à jour —
    d'où des écrans qui ne se chargent plus ou mal après une mise à jour.
    """
    base = html_path.parent

    def _stamp(m: re.Match[str]) -> str:
        try:
            v = int((base / m.group(2).lstrip("/")).stat().st_mtime)
        except OSError:
            return m.group(0)
        return f"{m.group(1)}{m.group(2)}?v={v}{m.group(3)}"

    return _ASSET_REF_RE.sub(_stamp, html_path.read_text(encoding="utf-8"))


@router.get("/command", include_in_schema=False)
async def command_center_ui() -> Response:
    return _ui_html_response(Path("src/jarvis/interfaces/ui/static/command.html"))


@router.get("/dashboard", include_in_schema=False)
async def dashboard_ui() -> Response:
    return _ui_html_response(Path("src/jarvis/interfaces/ui/static/dashboard.html"))


@router.get("/settings", include_in_schema=False)
async def settings_ui() -> Response:
    return _ui_html_response(Path("src/jarvis/interfaces/ui/static/settings.html"))


@router.get("/", include_in_schema=False)
async def home_ui() -> Response:
    return _ui_html_response(Path("src/jarvis/interfaces/ui/static/home.html"))


@router.get("/capabilities", include_in_schema=False)
async def capabilities_ui() -> Response:
    return _ui_html_response(Path("src/jarvis/interfaces/ui/static/capabilities.html"))


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Point de contrôle — vérifie que le serveur est up."""
    return HealthResponse(status="ok", version="0.1.0")
