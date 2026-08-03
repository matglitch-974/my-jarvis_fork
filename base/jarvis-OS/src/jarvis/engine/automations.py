# Copyright (C) 2026 Barthélemy Houot & contributeurs MyJarvis
# This file is part of the MyJarvis fork of Jarvis OS,
# licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

"""Automatisations — demande 10 du Maître :

    « je veux que Jarvis puisse créer des automatisations et puisse les
      déclencher sans consommer beaucoup de tokens et peut-être même sans y
      réfléchir. »

Le point clé est là : **sans y réfléchir**. Une automatisation n'est donc PAS
une consigne en langue naturelle rejouée par le modèle à chaque déclenchement
— ce serait payer des tokens à chaque fois et risquer une interprétation
différente. C'est un plan figé : une liste d'appels d'outils avec leurs
paramètres, écrite une seule fois, puis rejouée à l'identique par ce moteur.

Coût d'un déclenchement : **zéro token**. Le modèle n'est sollicité qu'au
moment de la création (« crée-moi une automatisation qui… »), et seulement
pour traduire la phrase en plan.

Déclencheurs :
  - `daily`    : tous les jours à HH:MM
  - `interval` : toutes les N secondes
  - `event`    : sur un événement interne (réveil, arrivée d'un message…)
  - `manual`   : uniquement à la demande

Garde-fous :
  - un seul passage à la fois par automatisation (pas de recouvrement) ;
  - les outils appelables sont ceux du registre, rien d'autre ;
  - une erreur est journalisée sur l'automatisation, jamais propagée : une
    automatisation qui casse n'emporte pas le planificateur.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from loguru import logger

from jarvis.kernel.contracts import ToolRegistry

_TICK_SECONDS = 20  # granularité du planificateur


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class Action:
    """Un appel d'outil figé : nom + paramètres déjà résolus."""

    tool: str
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class Automation:
    id: str
    name: str
    trigger: dict[str, Any]
    actions: list[dict[str, Any]]
    enabled: bool = True
    created_at: str = ""
    last_run: str | None = None
    last_status: str | None = None
    last_error: str | None = None
    run_count: int = 0
    # Repère interne du planificateur (jamais exposé au Maître).
    _next_due: float | None = None


class AutomationStore:
    """Persistance simple : un JSON, quelques dizaines d'entrées au plus."""

    def __init__(self, memory_dir: str | Path) -> None:
        self._path = Path(memory_dir) / "automations.json"
        self._items: dict[str, Automation] = {}
        self._load()

    # ── Disque ────────────────────────────────────────────────────────────
    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Automatisations illisibles — on repart à vide", error=str(exc))
            return
        for item in raw.get("automations", []):
            item.pop("_next_due", None)
            try:
                self._items[item["id"]] = Automation(**item)
            except TypeError as exc:
                logger.warning("Automatisation ignorée (format)", error=str(exc))

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "automations": [
                {k: v for k, v in asdict(a).items() if k != "_next_due"}
                for a in self._items.values()
            ]
        }
        tmp = self._path.with_name(self._path.name + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self._path)

    # ── CRUD ──────────────────────────────────────────────────────────────
    def list(self) -> list[Automation]:
        return sorted(self._items.values(), key=lambda a: a.created_at, reverse=True)

    def get(self, aid: str) -> Automation | None:
        return self._items.get(aid)

    def create(
        self, name: str, trigger: dict[str, Any], actions: list[dict[str, Any]]
    ) -> Automation:
        aid = uuid.uuid4().hex[:12]
        auto = Automation(
            id=aid,
            name=name.strip() or "Sans nom",
            trigger=trigger,
            actions=actions,
            created_at=_now_iso(),
        )
        self._items[aid] = auto
        self._save()
        return auto

    def update(self, aid: str, **patch: Any) -> Automation | None:  # noqa: ANN401
        auto = self._items.get(aid)
        if auto is None:
            return None
        for key, value in patch.items():
            if value is not None and hasattr(auto, key):
                setattr(auto, key, value)
        auto._next_due = None  # le déclencheur a pu changer : on recalcule
        self._save()
        return auto

    def delete(self, aid: str) -> bool:
        if aid not in self._items:
            return False
        del self._items[aid]
        self._save()
        return True

    def mark_run(self, aid: str, status: str, error: str | None = None) -> None:
        auto = self._items.get(aid)
        if auto is None:
            return
        auto.last_run = _now_iso()
        auto.last_status = status
        auto.last_error = error
        auto.run_count += 1
        self._save()


class AutomationEngine:
    """Planificateur + exécuteur. Aucun appel au LLM, par construction."""

    def __init__(self, store: AutomationStore, tool_registry: ToolRegistry) -> None:
        self._store = store
        self._tools = tool_registry
        self._task: asyncio.Task | None = None
        self._running: set[str] = set()

    # ── Cycle de vie ──────────────────────────────────────────────────────
    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._task = asyncio.create_task(self._loop(), name="automations-scheduler")
        logger.info("Planificateur d'automatisations démarré", tick_s=_TICK_SECONDS)

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    # ── Déclencheurs ──────────────────────────────────────────────────────
    def _due(self, auto: Automation, now: datetime, loop_now: float) -> bool:
        kind = (auto.trigger or {}).get("type", "manual")

        if kind == "interval":
            seconds = max(30, int(auto.trigger.get("seconds", 300)))
            if auto._next_due is None:
                auto._next_due = loop_now + seconds
                return False
            if loop_now >= auto._next_due:
                auto._next_due = loop_now + seconds
                return True
            return False

        if kind == "daily":
            at = str(auto.trigger.get("at", "09:00"))
            try:
                hh, mm = (int(x) for x in at.split(":", 1))
            except ValueError:
                return False
            # Le repère est la date du jour : on ne déclenche qu'une fois par
            # jour, même si le tick tombe deux fois dans la même minute.
            stamp = f"{now.date().isoformat()}T{hh:02d}:{mm:02d}"
            if auto.last_run and auto.last_run >= stamp:
                return False
            return (now.hour, now.minute) >= (hh, mm)

        return False  # event / manual : déclenchés hors du planificateur

    async def _loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(_TICK_SECONDS)
                now = datetime.now(UTC).astimezone()
                loop_now = asyncio.get_running_loop().time()
                for auto in self._store.list():
                    if not auto.enabled or auto.id in self._running:
                        continue
                    if self._due(auto, now, loop_now):
                        asyncio.create_task(
                            self.run(auto.id, reason="planifié"),
                            name=f"automation-{auto.id}",
                        )
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # une automatisation folle ne tue pas la boucle
                logger.error("Planificateur d'automatisations", error=str(exc))

    # ── Événements ────────────────────────────────────────────────────────
    async def fire_event(self, event: str, payload: dict[str, Any] | None = None) -> int:
        """Déclenche toutes les automatisations abonnées à `event`."""
        fired = 0
        for auto in self._store.list():
            if not auto.enabled or auto.id in self._running:
                continue
            trig = auto.trigger or {}
            if trig.get("type") == "event" and trig.get("name") == event:
                asyncio.create_task(
                    self.run(auto.id, reason=f"événement {event}", context=payload),
                    name=f"automation-{auto.id}",
                )
                fired += 1
        return fired

    # ── Exécution ─────────────────────────────────────────────────────────
    async def run(
        self, aid: str, reason: str = "manuel", context: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        auto = self._store.get(aid)
        if auto is None:
            return {"ok": False, "error": "automatisation introuvable"}
        if aid in self._running:
            return {"ok": False, "error": "déjà en cours"}

        self._running.add(aid)
        results: list[dict[str, Any]] = []
        failed: str | None = None
        try:
            for step in auto.actions:
                tool = str(step.get("tool", "")).strip()
                if not tool:
                    continue
                params = dict(step.get("params") or {})
                # Les automatisations peuvent recevoir un contexte d'événement ;
                # il n'est injecté que si l'action le demande explicitement.
                if context and step.get("with_context"):
                    params.setdefault("context", context)
                res = await self._tools.call(tool, params)
                results.append(
                    {"tool": tool, "is_error": res.is_error, "content": res.content[:600]}
                )
                if res.is_error:
                    failed = f"{tool} : {res.content[:200]}"
                    if not step.get("continue_on_error"):
                        break
            status = "failed" if failed else "ok"
            self._store.mark_run(aid, status, failed)
            logger.info(
                "Automatisation exécutée",
                name=auto.name,
                reason=reason,
                status=status,
                steps=len(results),
            )
            return {"ok": failed is None, "error": failed, "steps": results}
        except Exception as exc:
            self._store.mark_run(aid, "failed", str(exc))
            logger.error("Automatisation en échec", name=auto.name, error=str(exc))
            return {"ok": False, "error": str(exc), "steps": results}
        finally:
            self._running.discard(aid)
