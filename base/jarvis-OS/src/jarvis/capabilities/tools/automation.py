# Copyright (C) 2026 Barthélemy Houot & contributeurs MyJarvis
# This file is part of the MyJarvis fork of Jarvis OS,
# licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

"""Outil `automation` — Jarvis crée lui-même ses automatisations (demande 10).

C'est le SEUL moment où le modèle intervient : il traduit une phrase (« chaque
matin à 8 h, donne-moi la météo ») en un plan figé. Ensuite, le moteur rejoue
ce plan sans lui, donc sans consommer un seul token.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from jarvis.capabilities.tools.base import Tool, ToolResult

if TYPE_CHECKING:  # pragma: no cover — typage seul, pas d'import au runtime
    from jarvis.engine.automations import AutomationEngine, AutomationStore
    from jarvis.kernel.contracts import ToolRegistry


class AutomationTool(Tool):
    name = "automation"
    description = (
        "Crée, liste, modifie, supprime ou déclenche une AUTOMATISATION : une "
        "suite d'appels d'outils figés, rejouée automatiquement sans réflexion "
        "ni coût. Utilise-le quand l'utilisateur dit « chaque matin… », « toutes "
        "les heures… », « quand je me réveille… », « automatise… ».\n"
        "Actions :\n"
        "- 'create' : name + trigger + actions. Les paramètres des actions "
        "doivent être CONCRETS (aucune variable à interpréter plus tard).\n"
        "- 'list'   : les automatisations existantes et leur dernier passage.\n"
        "- 'run'    : déclenche tout de suite (id requis).\n"
        "- 'enable' / 'disable' : active ou met en pause (id requis).\n"
        "- 'delete' : supprime (id requis).\n"
        "Déclencheurs : {\"type\":\"daily\",\"at\":\"08:00\"} · "
        "{\"type\":\"interval\",\"seconds\":3600} · "
        "{\"type\":\"event\",\"name\":\"wake_up\"} · {\"type\":\"manual\"}."
    )
    input_schema = {  # noqa: RUF012
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["create", "list", "run", "enable", "disable", "delete"],
                "description": "Opération à effectuer. Défaut : 'list'.",
            },
            "id": {"type": "string", "description": "Identifiant, pour run/enable/disable/delete."},
            "name": {"type": "string", "description": "Nom lisible de l'automatisation."},
            "trigger": {
                "type": "object",
                "description": (
                    "Déclencheur. Ex : {\"type\":\"daily\",\"at\":\"08:00\"}. "
                    "Types : daily (at HH:MM), interval (seconds), event (name), manual."
                ),
            },
            "actions": {
                "type": "array",
                "description": (
                    "Suite d'appels d'outils, dans l'ordre. Chaque entrée : "
                    "{\"tool\":\"<nom d'outil existant>\", \"params\":{…}}. "
                    "Ajoute \"continue_on_error\": true pour ne pas interrompre la "
                    "suite si une étape échoue."
                ),
                "items": {"type": "object"},
            },
        },
        "required": ["action"],
    }

    def __init__(
        self,
        store: AutomationStore,
        engine: AutomationEngine,
        tool_registry: ToolRegistry,
    ) -> None:
        self._store = store
        self._engine = engine
        self._tools = tool_registry

    def _known_tools(self) -> set[str]:
        return {s["name"] for s in self._tools.schemas()}

    async def execute(self, action: str = "list", **kwargs: object) -> ToolResult:
        if action == "list":
            items = self._store.list()
            if not items:
                return ToolResult(content="Aucune automatisation enregistrée.")
            lines = []
            for a in items:
                état = "active" if a.enabled else "en pause"
                dernier = a.last_run or "jamais"
                trig = json.dumps(a.trigger, ensure_ascii=False)
                lines.append(
                    f"- [{a.id}] {a.name} · {état} · déclencheur {trig} "
                    f"· {len(a.actions)} étape(s) · dernier passage : {dernier}"
                    + (f" · erreur : {a.last_error}" if a.last_error else "")
                )
            return ToolResult(content="\n".join(lines))

        if action == "create":
            name = str(kwargs.get("name") or "").strip()
            trigger = kwargs.get("trigger") or {"type": "manual"}
            actions = kwargs.get("actions") or []
            if not name:
                return ToolResult(content="Il faut un nom.", is_error=True)
            if not isinstance(actions, list) or not actions:
                return ToolResult(content="Il faut au moins une action.", is_error=True)

            # On refuse tout de suite un plan qui appelle un outil inexistant :
            # sinon l'automatisation échouerait silencieusement chaque nuit.
            known = self._known_tools()
            unknown = [
                str(a.get("tool"))
                for a in actions
                if isinstance(a, dict) and str(a.get("tool")) not in known
            ]
            if unknown:
                return ToolResult(
                    content=(
                        f"Outils inconnus : {', '.join(unknown)}. "
                        f"Outils disponibles : {', '.join(sorted(known))}."
                    ),
                    is_error=True,
                )

            auto = self._store.create(name=name, trigger=dict(trigger), actions=list(actions))
            return ToolResult(
                content=(
                    f"Automatisation « {auto.name} » créée (id {auto.id}). "
                    f"Déclencheur : {json.dumps(auto.trigger, ensure_ascii=False)}. "
                    "Elle tournera désormais sans consommer de tokens."
                )
            )

        aid = str(kwargs.get("id") or "").strip()
        if not aid:
            return ToolResult(content="Il faut l'identifiant (id).", is_error=True)

        if action == "run":
            res = await self._engine.run(aid, reason="demandé par Jarvis")
            if not res.get("ok"):
                return ToolResult(content=f"Échec : {res.get('error')}", is_error=True)
            return ToolResult(content=f"Exécutée : {len(res.get('steps', []))} étape(s).")

        if action in ("enable", "disable"):
            auto = self._store.update(aid, enabled=(action == "enable"))
            if auto is None:
                return ToolResult(content="Automatisation introuvable.", is_error=True)
            return ToolResult(
                content=f"« {auto.name} » {'activée' if auto.enabled else 'mise en pause'}."
            )

        if action == "delete":
            if not self._store.delete(aid):
                return ToolResult(content="Automatisation introuvable.", is_error=True)
            return ToolResult(content="Automatisation supprimée.")

        return ToolResult(content=f"Action inconnue : {action}", is_error=True)
