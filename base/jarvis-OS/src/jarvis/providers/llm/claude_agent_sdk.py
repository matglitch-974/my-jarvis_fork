# Copyright (C) 2026 Barthélemy Houot & contributeurs MyJarvis
# This file is part of the MyJarvis fork of Jarvis OS,
# licensed under the GNU AGPL-3.0-or-later.
# See the LICENSE file or <https://www.gnu.org/licenses/agpl-3.0.html>.

"""Provider Claude Agent SDK (MyJarvis) — moteur par ABONNEMENT, sans clé API.

Ce provider ne parle pas à l'API Anthropic : il parle à un **sidecar Node
local** (MyJarvis\\Jarvis\\engine\\index.mjs) qui héberge le Claude Agent SDK
(@anthropic-ai/claude-agent-sdk), authentifié par le login Claude de la
machine (abonnement Pro/Max — `claude /login` ou `claude setup-token`).
Aucune clé `ANTHROPIC_API_KEY` n'est requise ni utilisée.

Contrat de gouvernance (invariant MyJarvis) : le sidecar expose chaque tool
Jarvis en outil MCP in-process, et chaque invocation RAPPELLE le
`tool_executor` reçu par `tool_loop()` — côté mission, ce callable porte le
gate composite (`worker_agent._tool_executor` → `_gate_tool`), qui reste donc
appliqué à l'identique. Le provider ne court-circuite jamais la gouvernance.

Protocole sidecar (HTTP local, long-poll) :
  POST /complete                {system, messages, model, ...} → {text, usage}
  POST /complete (stream=true)  → SSE `data:{"delta": …}`
  POST /tool-loop               {system, messages, tools, ...} → {loopId}
  GET  /tool-loop/{id}/events   → {type: tool_call|final|error|idle, ...}
  POST /tool-loop/{id}/tool-result  {callId, content}
  GET  /health                  → {ok: true}
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import datetime
from typing import Any

import httpx
from loguru import logger

from jarvis.kernel.contracts import UsageTracker
from jarvis.kernel.schemas import UsageEntry
from jarvis.kernel.settings import settings
from jarvis.providers.llm.base import LLMProvider

# Long-poll : le GET /events du sidecar rend la main au bout de ~25 s ;
# la lecture HTTP doit donc pouvoir attendre plus longtemps qu'un tour LLM.
_TIMEOUT = httpx.Timeout(connect=5.0, read=600.0, write=30.0, pool=5.0)


class ClaudeAgentSDKProvider(LLMProvider):
    """Provider LLM propulsé par le Claude Agent SDK via sidecar Node local."""

    def __init__(
        self,
        model: str | None = None,
        max_tokens: int = 2048,
        tracker: UsageTracker | None = None,
    ) -> None:
        self._base = settings.claude_sdk_url.rstrip("/")
        self._model = model or settings.claude_sdk_model
        self._max_tokens = max_tokens  # informatif — le SDK gère ses propres limites
        self._tracker = tracker
        self._client = httpx.AsyncClient(base_url=self._base, timeout=_TIMEOUT)

    def set_tracker(self, tracker: UsageTracker) -> None:
        """Injection post-construction (parité avec AnthropicProvider)."""
        self._tracker = tracker

    @property
    def supports_tools(self) -> bool:
        return True

    # ── complete ──────────────────────────────────────────────────────────────

    async def complete(
        self,
        messages: list[dict],
        system: str,
        tools: list[dict] | None = None,
        stream: bool = False,
        context: str = "",
    ) -> str | AsyncIterator[str]:
        payload = self._payload(messages, system, context)
        if stream:
            return self._stream(payload)

        try:
            r = await self._client.post("/complete", json=payload)
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise RuntimeError(
                f"Sidecar Claude Agent SDK injoignable ({self._base}) : {e}. "
                "Lancer MyJarvis\\Jarvis.cmd (fenêtre « Miku - MyJarvis sidecar »)."
            ) from e
        data = r.json()
        if data.get("error"):
            raise RuntimeError(f"Claude Agent SDK : {data['error']}")
        self._track(data.get("usage"), context)
        logger.debug("ClaudeAgentSDK complete", model=self._model, context=context)
        return data.get("text", "")

    async def _stream(self, payload: dict) -> AsyncIterator[str]:
        payload = {**payload, "stream": True}
        async with self._client.stream("POST", "/complete", json=payload) as r:
            r.raise_for_status()
            import json as _json

            async for line in r.aiter_lines():
                if not line.startswith("data:"):
                    continue
                ev = _json.loads(line[5:])
                if ev.get("error"):
                    raise RuntimeError(f"Claude Agent SDK : {ev['error']}")
                if ev.get("delta"):
                    yield ev["delta"]

    # ── tool loop ─────────────────────────────────────────────────────────────

    async def tool_loop(
        self,
        messages: list[dict],
        system: str,
        tools: list[dict],
        tool_executor: Callable[[str, dict], Awaitable[str]],
        context: str = "",
    ) -> str:
        """Boucle agentique côté SDK ; chaque exécution d'outil repasse ICI.

        Le sidecar émet `tool_call` pour chaque invocation décidée par le
        modèle ; nous exécutons via `tool_executor` (gate compris côté
        mission) et renvoyons le résultat. `final` clôt la boucle.
        """
        payload = self._payload(messages, system, context)
        payload["tools"] = tools

        try:
            r = await self._client.post("/tool-loop", json=payload)
            r.raise_for_status()
            loop_id = r.json()["loopId"]
        except httpx.HTTPError as e:
            logger.error("ClaudeAgentSDK tool_loop start failed", error=str(e))
            return (
                f"[ERREUR] Sidecar Claude Agent SDK injoignable ({self._base}). "
                "Lancer MyJarvis\\Jarvis.cmd."
            )

        while True:
            try:
                ev = (await self._client.get(f"/tool-loop/{loop_id}/events")).json()
            except httpx.HTTPError as e:
                logger.error("ClaudeAgentSDK tool_loop poll failed", error=str(e))
                return f"[ERREUR] Liaison sidecar interrompue : {e}"

            kind = ev.get("type")
            if kind == "idle":
                continue
            if kind == "tool_call":
                try:
                    result = await tool_executor(ev["name"], ev.get("input", {}))
                except Exception as e:  # parité registry.call : jamais de crash de boucle
                    logger.error("Tool execution error", name=ev.get("name"), error=str(e))
                    result = f"[ERREUR] outil {ev.get('name')}: {e}"
                await self._client.post(
                    f"/tool-loop/{loop_id}/tool-result",
                    json={"callId": ev["callId"], "content": result},
                )
                continue
            if kind == "final":
                self._track(ev.get("usage"), context)
                logger.debug("ClaudeAgentSDK tool loop done", context=context)
                return ev.get("text", "")
            if kind == "error":
                logger.error("ClaudeAgentSDK tool loop error", error=ev.get("message"))
                return f"[ERREUR] Claude Agent SDK : {ev.get('message')}"
            logger.warning("ClaudeAgentSDK event inconnu", event=kind)

    # ── health ────────────────────────────────────────────────────────────────

    async def health_check(self) -> bool:
        try:
            r = await self._client.get("/health", timeout=5.0)
            return bool(r.json().get("ok"))
        except Exception as e:
            logger.error("ClaudeAgentSDK health check failed", error=str(e))
            return False

    # ── interne ───────────────────────────────────────────────────────────────

    def _payload(self, messages: list[dict], system: str, context: str) -> dict[str, Any]:
        return {
            "system": system,
            "messages": messages,
            "model": self._model,
            "fallbackModel": settings.claude_sdk_fallback_model,
            "maxThinkingTokens": settings.claude_sdk_max_thinking_tokens,
            "context": context,
        }

    def _track(self, usage: dict | None, context: str) -> None:
        if self._tracker is None or not usage:
            return
        # Abonnement : coût marginal nul — on trace les tokens, pas des dollars.
        self._tracker.track(
            UsageEntry(
                timestamp=datetime.now().isoformat(),
                provider="claude_agent_sdk",
                model=self._model,
                input_tokens=int(usage.get("input_tokens", 0)),
                output_tokens=int(usage.get("output_tokens", 0)),
                cost_usd=0.0,
                context=context,
            )
        )
