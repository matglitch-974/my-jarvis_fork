/* settings.js — Configuration (Réglages) v2
 * 5 sous-pages : Profil · Modèles & API · Conso · Système · À propos
 */
(function () {
  "use strict";
  const J = window.Jarvis, el = J.el;

  const PAGES = [
    { id: "preferences", label: "Préférences" },
    { id: "modeles",     label: "Modèles" },
    { id: "conso",       label: "Conso" },
    { id: "systeme",     label: "Système" },
    { id: "apparence",   label: "Apparence" },
    { id: "apropos",     label: "À propos" },
  ];

  let _activePage = "preferences";
  const root = document.getElementById("page-root");
  let _settings = null;

  /* ───────── Helpers ───────── */
  function pageWrapper(pageId, title, meta, body) {
    const idx = PAGES.findIndex(p => p.id === pageId);
    const num = String(idx + 1).padStart(2, "0");
    const wrap = el("div", { class: "page room-in" });

    const head = el("div", { class: "page-head" });
    const left = el("div");
    const eyebrow = el("div", { class: "page-eyebrow" });
    eyebrow.appendChild(el("span", { class: "num", text: num }));
    eyebrow.appendChild(el("span", { text: " · " + PAGES[idx].label.toUpperCase() }));
    left.appendChild(eyebrow);
    left.appendChild(el("h1", { text: title }));
    head.appendChild(left);
    if (meta) { const m = el("div", { class: "page-head-meta" }); m.innerHTML = meta; head.appendChild(m); }
    wrap.appendChild(head);

    const pb = el("div", { class: "page-body" });
    pb.appendChild(body);
    wrap.appendChild(pb);
    return wrap;
  }

  function ghostSec(title, sub, right, content) {
    const sec = el("div", { class: "ghost-sec" });
    const hd = el("div", { class: "ghost-sec-hd" });
    const l = el("div");
    l.appendChild(el("div", { class: "ghost-sec-title", text: title }));
    if (sub) l.appendChild(el("div", { class: "ghost-sec-sub", text: sub }));
    hd.appendChild(l);
    if (right) hd.appendChild(el("div", { class: "ghost-sec-r", text: right }));
    sec.appendChild(hd);
    sec.appendChild(content);
    return sec;
  }

  /* Dossier repliable (02/08) — même habillage qu'une section, mais le corps
     se plie. Sert à ranger les réglages de l'accueil sans allonger la page. */
  function folderSec(title, sub, content, open) {
    const sec = el("div", { class: "ghost-sec folder-sec" + (open ? " is-open" : "") });
    const hd = el("button", { class: "ghost-sec-hd folder-hd", type: "button" });
    const l = el("div");
    l.appendChild(el("div", { class: "ghost-sec-title", text: title }));
    if (sub) l.appendChild(el("div", { class: "ghost-sec-sub", text: sub }));
    hd.appendChild(l);
    hd.appendChild(el("span", {
      class: "folder-chevron",
      html: '<svg width="11" height="7" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1"'
          + ' stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    }));
    const bodyWrap = el("div", { class: "folder-body" }, [content]);
    hd.addEventListener("click", () => sec.classList.toggle("is-open"));
    sec.appendChild(hd);
    sec.appendChild(bodyWrap);
    return sec;
  }

  /* Sélecteur d'ancrage 3×3 de la barre d'outils (02/08). */
  function dockPosPicker(value, onpick) {
    const P = window.JarvisPerso;
    const all = (P && P.DOCK_POS) || [];
    const grid = el("div", { class: "dock-grid" });
    all.forEach((id) => {
      const cell = el("button", {
        class: "dock-cell", type: "button", title: id.replace("-", " "),
        dataset: { on: id === value ? "true" : "false", pos: id },
      });
      cell.appendChild(el("span", { class: "dock-dot" }));
      cell.addEventListener("click", () => {
        grid.querySelectorAll(".dock-cell").forEach(c => c.dataset.on = "false");
        cell.dataset.on = "true";
        onpick(id);
      });
      grid.appendChild(cell);
    });
    return grid;
  }

  function settingRow(label, sub, control) {
    const row = el("div", { class: "setting-row" });
    const txt = el("div");
    txt.appendChild(el("div", { class: "setting-label", text: label }));
    if (sub) txt.appendChild(el("div", { class: "setting-sub", text: sub }));
    row.appendChild(txt);
    row.appendChild(control);
    return row;
  }

  /* mapValue (optionnel) : traduit le LIBELLÉ affiché en valeur envoyée au
     backend. Sans lui, un menu lisible (« YouTube Music ») écrirait ce texte
     tel quel dans .env au lieu de l'identifiant attendu (youtube_music). */
  function makeSelect(options, current, key, onchange, mapValue) {
    let selected = options.includes(current) ? current : (options[0] || "");

    const wrap = el("div", { class: "csel-wrap" });
    const btn  = el("button", { class: "csel-btn" });
    const lbl  = el("span", { class: "csel-label", text: selected });
    const chev = el("span", { class: "csel-chevron",
      html: '<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
    btn.appendChild(lbl); btn.appendChild(chev);
    wrap.appendChild(btn);

    const dropdown = el("div", { class: "csel-dropdown" });
    options.forEach(o => {
      const item = el("div", { class: "csel-item" + (o === selected ? " active" : ""), text: o });
      item.addEventListener("click", () => {
        selected = o;
        lbl.textContent = o;
        dropdown.querySelectorAll(".csel-item").forEach(it => it.classList.toggle("active", it.textContent === o));
        close();
        if (onchange) onchange(o);
      });
      dropdown.appendChild(item);
    });
    wrap.appendChild(dropdown);

    const handleOutside = e => { if (!wrap.contains(e.target)) close(); };
    const close = () => {
      wrap.classList.remove("open");
      document.removeEventListener("click", handleOutside);
    };

    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (wrap.classList.contains("open")) { close(); return; }
      wrap.classList.add("open");
      setTimeout(() => document.addEventListener("click", handleOutside), 0);
    });

    const saveBtn = el("button", { class: "m-btn", text: "Sauv." });
    saveBtn.addEventListener("click", () =>
      saveSetting(key, mapValue ? mapValue(selected) : selected, saveBtn));
    const ctrl = el("div", { style: { display: "flex", gap: "8px", alignItems: "center" } });
    ctrl.appendChild(wrap); ctrl.appendChild(saveBtn);
    return ctrl;
  }

  async function getSettings() {
    if (_settings) return _settings;
    try { _settings = await J.api.get("/api/settings"); } catch (_) { _settings = {}; }
    return _settings;
  }

  async function saveSetting(key, value, btn) {
    if (btn) { btn.textContent = "…"; btn.disabled = true; }
    try {
      const resp = await J.api.post("/api/settings/update", { key, value });
      _settings = null; // invalidate cache
      if (resp.needs_restart) {
        J.notify({ kind: "error", text: key + " · redémarrage Jarvis requis" });
      } else {
        J.notify({ kind: "success", text: key + " · appliqué" });
      }
    } catch (e) {
      J.notify({ kind: "error", text: e.message });
    }
    if (btn) { btn.textContent = "Sauv."; btn.disabled = false; }
  }

  /* ───────── Connexions (M5) ─────────
     Lit /api/connectors/status (lecture seule) et rend une ligne par connecteur :
     pastille santé + libellé statut + bouton "Reconnecter" (si OAuth).
     L'édition (clés API, OAuth initial) reste dans Atelier › Intégrations. */
  const HEALTH_STYLES = {
    ok:      { color: "var(--green, #36d399)", label: "connecté" },
    expired: { color: "var(--red, #ff4444)",   label: "token expiré" },
    missing: { color: "var(--fg-3, #666)",     label: "non configuré" },
    error:   { color: "var(--red, #ff4444)",   label: "erreur" },
  };

  async function fetchConnectorsStatus(container) {
    const items = await J.api.get("/api/connectors/status");
    container.innerHTML = "";
    items.forEach(c => {
      const row = el("div", { style: {
        display: "grid", gridTemplateColumns: "10px 1fr auto auto",
        gap: "12px", alignItems: "center",
        padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.05)",
      }});
      const h = HEALTH_STYLES[c.token_health] || HEALTH_STYLES.error;
      /* Pastille santé */
      const dot = el("div"); dot.style.cssText =
        "width:10px;height:10px;border-radius:50%;background:" + h.color +
        ";box-shadow:0 0 6px " + h.color + "55";
      row.appendChild(dot);
      /* Nom + sous-libellé */
      const txt = el("div");
      txt.appendChild(el("div", { text: c.name, style: { fontSize: "14px" } }));
      const subParts = [c.kind, h.label];
      if (c.kind === "messaging" && c.enabled === false) subParts.push("désactivé");
      txt.appendChild(el("div", {
        text: subParts.join(" · "),
        style: { fontSize: "11px", color: "var(--fg-3, #777)", fontFamily: "var(--mono, Geist Mono, monospace)" },
      }));
      row.appendChild(txt);
      /* Reconnecter (OAuth uniquement, ou si missing+token-based) */
      if (c.reconnect_url) {
        const btn = el("button", {
          class: "m-btn",
          text: c.token_health === "ok" ? "Renouveler" : "Reconnecter",
        });
        btn.style.cssText = "padding:4px 10px;font-size:11px;";
        btn.addEventListener("click", () => { window.location.href = c.reconnect_url; });
        row.appendChild(btn);
      } else {
        row.appendChild(el("div"));
      }
      /* Lien Éditer (Atelier/Intégrations) */
      if (c.edit_url) {
        const ed = el("a", { text: "Éditer", href: c.edit_url });
        ed.style.cssText = "font-size:11px;color:var(--fg-3,#888);text-decoration:none;border-bottom:1px dotted rgba(255,255,255,.2);padding-bottom:1px;";
        row.appendChild(ed);
      } else {
        row.appendChild(el("div"));
      }
      container.appendChild(row);
    });
    if (!items.length) {
      container.appendChild(el("div", {
        style: { color: "var(--fg-3, #777)", fontSize: "12px", padding: "8px 0" },
        text: "Aucun connecteur configuré.",
      }));
    }
  }

  /* ───────── 01 Préférences ───────── */
  async function renderPreferences() {
    const s   = await getSettings();
    const jarvis = s.jarvis    || {};
    const music  = s.music     || {};
    const pro    = s.proactive || {};

    const wrap = el("div", { style: { display:"flex", flexDirection:"column", gap:"40px" } });

    // ── Identité ──
    const identList = el("div");
    const fnInput = el("input", { class: "input-mono", style: { width:"220px" }, value: jarvis.user_firstname || "" });
    const fnSave  = el("button", { class: "m-btn", text: "Sauv." });
    fnSave.addEventListener("click", () => saveSetting("USER_FIRSTNAME", fnInput.value, fnSave));
    const fnCtrl  = el("div", { style: { display:"flex", gap:"8px" } });
    fnCtrl.appendChild(fnInput); fnCtrl.appendChild(fnSave);
    identList.appendChild(settingRow("Prénom", "USER_FIRSTNAME", fnCtrl));
    const upInput = el("input", { class: "input-mono", style: { width:"220px" }, value: jarvis.user_profile || "", placeholder: "entrepreneur tech, Lyon…" });
    const upSave  = el("button", { class: "m-btn", text: "Sauv." });
    upSave.addEventListener("click", () => saveSetting("USER_PROFILE", upInput.value, upSave));
    const upCtrl  = el("div", { style: { display:"flex", gap:"8px" } });
    upCtrl.appendChild(upInput); upCtrl.appendChild(upSave);
    identList.appendChild(settingRow("Profil", "USER_PROFILE", upCtrl));
    wrap.appendChild(ghostSec("Identité", "comment Jarvis s'adresse à toi", null, identList));

    // ── Langue & style ──
    // Un seul réglage DIALECT remplace l'ancienne bascule « Mode québécois »
    // (conservée en coulisse : le backend continue d'écrire QUEBEC_MODE pour
    // le choix de voix TTS).
    const DIALECTS = [
      { id: "standard",  label: "Français standard" },
      { id: "quebecois", label: "Québécois" },
      { id: "creole",    label: "Créole" },
      { id: "fr_nord",   label: "Français du Nord (Paris)" },
      { id: "fr_sud",    label: "Français du Sud (Marseille)" },
    ];
    const dialectLabels = DIALECTS.map(d => d.label);
    const curDialect = DIALECTS.find(d => d.id === (jarvis.dialect || "standard")) || DIALECTS[0];

    const styleList = el("div");
    styleList.appendChild(settingRow(
      "Dialecte", "DIALECT — accent, tournures et voix",
      makeSelect(dialectLabels, curDialect.label, "DIALECT", null, (label) => {
        const found = DIALECTS.find(d => d.label === label);
        return found ? found.id : "standard";
      }),
    ));
    wrap.appendChild(ghostSec("Langue & style", "dialecte · voix", null, styleList));

    // ── Musique ──
    const MUSIC_PROVIDERS = [
      { id: "—",             label: "—" },
      { id: "spotify",       label: "Spotify" },
      { id: "deezer",        label: "Deezer" },
      { id: "youtube_music", label: "YouTube Music" },
      { id: "local",         label: "Local" },
    ];
    const curProv = MUSIC_PROVIDERS.find(p => p.id === (music.music_provider || "—")) || MUSIC_PROVIDERS[0];
    const musicList = el("div");
    musicList.appendChild(settingRow("Fournisseur", "MUSIC_PROVIDER",
      makeSelect(MUSIC_PROVIDERS.map(p => p.label), curProv.label, "MUSIC_PROVIDER", null,
        (label) => (MUSIC_PROVIDERS.find(p => p.label === label) || MUSIC_PROVIDERS[0]).id)));
    wrap.appendChild(ghostSec("Musique", "source de lecture active", null, musicList));

    // ── Proactivité ──
    const proList = el("div");

    const cityInput = el("input", { class: "input-mono", style: { width:"180px" }, value: pro.home_city || "" });
    const citySave  = el("button", { class: "m-btn", text: "Sauv." });
    citySave.addEventListener("click", () => saveSetting("HOME_CITY", cityInput.value, citySave));
    const cityCtrl  = el("div", { style: { display:"flex", gap:"8px" } });
    cityCtrl.appendChild(cityInput); cityCtrl.appendChild(citySave);
    proList.appendChild(settingRow("Ville météo", "HOME_CITY", cityCtrl));

    const hourInput = el("input", {
      type: "number", min: "0", max: "23",
      class: "input-mono", style: { width:"70px" },
      value: String(pro.briefing_hour ?? 9),
    });
    const hourSave = el("button", { class: "m-btn", text: "Sauv." });
    hourSave.addEventListener("click", () => saveSetting("BRIEFING_HOUR", hourInput.value, hourSave));
    const hourCtrl = el("div", { style: { display:"flex", gap:"8px", alignItems:"center" } });
    hourCtrl.appendChild(hourInput);
    hourCtrl.appendChild(el("span", { style: { color:"var(--fg-3)", fontFamily:"var(--mono)", fontSize:"11px" }, text:"h00" }));
    hourCtrl.appendChild(hourSave);
    proList.appendChild(settingRow("Heure du briefing", "BRIEFING_HOUR", hourCtrl));

    wrap.appendChild(ghostSec("Proactivité", "briefing · rappels · météo", null, proList));

    // ── Connexions (santé des connecteurs OAuth / API — M5) ──
    const connList = el("div", { id: "connexions-list" });
    connList.appendChild(el("div", { style: { color:"var(--fg-3)", fontSize:"12px" }, text:"Chargement…" }));
    wrap.appendChild(ghostSec(
      "Connexions",
      "état des tokens · édition des clés dans Atelier › Intégrations",
      null, connList
    ));
    /* Fetch async — ne bloque pas le rendu. */
    fetchConnectorsStatus(connList).catch(() => {
      connList.innerHTML = '';
      connList.appendChild(el("div", { style: { color:"var(--red)", fontSize:"12px" }, text:"État indisponible" }));
    });

    // ── Wake up ──
    const wakeList = el("div");

    const wupTog = el("div", { class: "toggle" + (jarvis.wakeup_enabled ? " on" : "") });
    wupTog.addEventListener("click", () => {
      const next = !wupTog.classList.contains("on");
      wupTog.classList.toggle("on", next);
      saveSetting("WAKEUP_ENABLED", String(next), null);
    });
    wakeList.appendChild(settingRow("Séquence wake up", "Veille + scan facial + clap", wupTog));

    const clapTog = el("div", { class: "toggle" + (jarvis.clap_detection_enabled ? " on" : "") });
    clapTog.addEventListener("click", () => {
      const next = !clapTog.classList.contains("on");
      clapTog.classList.toggle("on", next);
      saveSetting("CLAP_DETECTION_ENABLED", String(next), null);
    });
    wakeList.appendChild(settingRow("Détection de clap", "Double clap pour réveiller Jarvis", clapTog));

    wrap.appendChild(ghostSec("Wake up", "déclencheurs de réveil", null, wakeList));

    const page = pageWrapper("preferences", "Tes préférences", null, wrap);
    root.innerHTML = ""; root.appendChild(page);
  }

  /* ───────── Ollama helpers ───────── */

  const _OLLAMA_POPULAR = [
    { id: "qwen3:8b",     label: "Qwen 3 · 8B",    gb: "5.2", tag: "Recommandé" },
    { id: "qwen2.5:7b",   label: "Qwen 2.5 · 7B",  gb: "4.4", tag: "Tool use"   },
    { id: "qwen3:4b",     label: "Qwen 3 · 4B",     gb: "2.6", tag: "Léger"      },
    { id: "llama3.1:8b",  label: "Llama 3.1 · 8B",  gb: "4.7", tag: ""           },
    { id: "mistral:7b",   label: "Mistral · 7B",    gb: "4.1", tag: ""           },
  ];

  function showPullModal(modelId, onDone) {
    const overlay = el("div", { class: "ollama-pull-overlay" });

    const dialog = el("div", { class: "ollama-pull-dialog" });
    dialog.appendChild(el("div", { class: "ollama-pull-eyebrow", text: "Téléchargement" }));
    dialog.appendChild(el("div", { class: "ollama-pull-model-name", text: modelId }));

    const barWrap = el("div", { class: "ollama-pull-bar" });
    const barFill = el("div", { class: "ollama-pull-fill indeterminate" });
    barWrap.appendChild(barFill);
    dialog.appendChild(barWrap);

    const statusEl = el("div", { class: "ollama-pull-status", text: "Connexion à Ollama…" });
    dialog.appendChild(statusEl);

    const closeBtn = el("button", { class: "m-btn ghost", text: "✕ Fermer" });
    closeBtn.disabled = true;
    closeBtn.addEventListener("click", () => { overlay.remove(); if (onDone) onDone(); });
    dialog.appendChild(closeBtn);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    (async () => {
      try {
        const resp = await fetch("/api/ollama/pull", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelId }),
        });
        if (!resp.ok || !resp.body) throw new Error("HTTP " + resp.status);

        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let d;
            try { d = JSON.parse(line.slice(6)); } catch (_) { continue; }
            if (d.done) {
              barFill.classList.remove("indeterminate");
              barFill.style.width = "100%";
              statusEl.textContent = "Téléchargé ✓";
              closeBtn.disabled = false;
              return;
            }
            if (d.error) {
              statusEl.textContent = "Erreur : " + d.error;
              barFill.classList.remove("indeterminate");
              closeBtn.disabled = false;
              return;
            }
            if (d.total && d.completed) {
              const pct = Math.round((d.completed / d.total) * 100);
              barFill.classList.remove("indeterminate");
              barFill.style.width = pct + "%";
              statusEl.textContent = (d.status || "downloading") + " · " + pct + "%";
            } else if (d.status) {
              statusEl.textContent = d.status;
            }
          }
        }
        statusEl.textContent = "Terminé";
        barFill.classList.remove("indeterminate");
        barFill.style.width = "100%";
        closeBtn.disabled = false;
      } catch (err) {
        statusEl.textContent = "Erreur : " + err.message;
        barFill.classList.remove("indeterminate");
        closeBtn.disabled = false;
      }
    })();
  }

  function _buildOllamaContent(data, llm) {
    const content = el("div");

    if (!data.available) {
      const row = el("div", { class: "ollama-offline-row" });
      row.innerHTML =
        '<span class="ollama-dot"></span>Ollama non disponible · ' +
        (llm.ollama_base_url || "localhost:11434");
      content.appendChild(row);
      content.appendChild(el("div", {
        class: "ollama-hint",
        text: "Démarrez Ollama pour gérer vos modèles locaux.",
      }));
      return ghostSec("Modèles locaux", "Ollama · function calling hors-ligne", null, content);
    }

    const downloaded = new Set(data.models.map(m => m.name || m.model || ""));
    const currentModel = llm.ollama_model || "";

    // ── Modèle actif ──
    const names = data.models.map(m => m.name || m.model || "").filter(Boolean);
    if (names.length) {
      content.appendChild(settingRow("Modèle actif", "OLLAMA_MODEL",
        makeSelect(names, currentModel, "OLLAMA_MODEL")));
    } else {
      content.appendChild(el("div", { class: "ollama-hint", text: "Aucun modèle téléchargé." }));
    }

    // ── Bibliothèque de téléchargement ──
    const toDownload = _OLLAMA_POPULAR.filter(m => !downloaded.has(m.id));
    if (toDownload.length) {
      content.appendChild(el("div", { class: "ollama-lib-sep", text: "Télécharger un modèle" }));
      const grid = el("div", { class: "ollama-model-grid" });
      toDownload.forEach(m => {
        const card = el("div", { class: "ollama-model-card" });
        const info = el("div");
        const nameLine = el("div", { class: "ollama-model-name" });
        nameLine.textContent = m.label;
        if (m.tag) {
          const badge = el("span", { class: "ollama-tag", text: m.tag });
          nameLine.appendChild(badge);
        }
        info.appendChild(nameLine);
        info.appendChild(el("div", { class: "ollama-model-size", text: m.gb + " Go · " + m.id }));
        card.appendChild(info);

        const dlBtn = el("button", { class: "m-btn", text: "↓" });
        dlBtn.title = "Télécharger " + m.id;
        dlBtn.addEventListener("click", () => showPullModal(m.id, () => renderModeles()));
        card.appendChild(dlBtn);
        grid.appendChild(card);
      });
      content.appendChild(grid);
    } else if (data.models.length) {
      content.appendChild(el("div", { class: "ollama-hint",
        text: "Tous les modèles recommandés sont présents." }));
    }

    return content;
  }

  /* ───────── 02 Modèles & API ───────── */
  async function renderModeles() {
    const s = await getSettings();
    const llm   = s.llm   || {};
    const audio = s.audio || {};
    const keys  = s.api_keys || {};

    const wrap = el("div", { style: { display:"flex", flexDirection:"column", gap:"40px" } });

    const MODELS_BY_BACKEND = {
      anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
      mistral:   ["mistral-large-latest", "mistral-small-latest", "open-mistral-7b"],
      openai:    ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
      gemini:    ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-pro"],
    };
    const CLAUDE = MODELS_BY_BACKEND.anthropic;
    /* Vision — demande 22 : plus AUCUN modèle OpenAI dans la liste, les images
       de la webcam et de l'écran ne partent plus chez eux. Anthropic (défaut,
       même abonnement que le reste) ou Gemini. */
    const VISION = [
      "claude-sonnet-5",
      "claude-opus-5",
      "claude-haiku-4-5-20251001",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
    ];

    // Fetch Ollama data une fois pour toute la section
    let ollamaData = { available: false, models: [] };
    try { ollamaData = await J.api.get("/api/ollama/models"); } catch (_) {}

    let liveProvider = llm.llm_provider || "api";
    let liveBackend  = llm.api_backend  || "anthropic";

    function buildApiContent() {
      const d = el("div");
      const modelDiv = el("div");
      function refreshModelRow(backend) {
        const models = MODELS_BY_BACKEND[backend] || CLAUDE;
        modelDiv.innerHTML = "";
        modelDiv.appendChild(settingRow("Modèle", "ANTHROPIC_MODEL",
          makeSelect(models, llm.anthropic_model, "ANTHROPIC_MODEL")));
      }
      d.appendChild(settingRow("Backend", "API_BACKEND",
        makeSelect(["anthropic", "mistral", "openai", "gemini"], liveBackend, "API_BACKEND",
          v => { liveBackend = v; refreshModelRow(v); })));
      refreshModelRow(liveBackend);
      d.appendChild(modelDiv);
      d.appendChild(settingRow("Vocal", "VOICE_ANTHROPIC_MODEL",
        makeSelect(CLAUDE, llm.voice_anthropic_model, "VOICE_ANTHROPIC_MODEL")));
      return d;
    }

    const llmBody = el("div");
    const subDiv  = el("div", { class: "llm-sub" });
    function refreshSub(provider) {
      subDiv.innerHTML = "";
      subDiv.appendChild(provider === "local"
        ? _buildOllamaContent(ollamaData, llm)
        : buildApiContent());
    }
    llmBody.appendChild(settingRow("Provider", "LLM_PROVIDER",
      makeSelect(["api", "local"], liveProvider, "LLM_PROVIDER",
        v => { liveProvider = v; refreshSub(v); })));
    llmBody.appendChild(subDiv);
    refreshSub(liveProvider);
    wrap.appendChild(ghostSec("Modèle LLM", "provider · backend · modèles", null, llmBody));

    // Vision toujours présent — utilise les APIs cloud quel que soit le provider
    const visionList = el("div");
    visionList.appendChild(settingRow("Modèle vision", "VISION_MODEL",
      makeSelect(VISION, llm.vision_model, "VISION_MODEL")));
    visionList.appendChild(el("div", {
      class: "setting-note",
      text: "Aucun modèle OpenAI : tes images ne transitent plus par eux. "
          + "Un modèle claude-* utilise ta clé Anthropic, un modèle gemini-* ta clé Google.",
    }));
    wrap.appendChild(ghostSec("Vision", "modèle vision · Anthropic ou Google", null, visionList));

    // ── Audio & voix ──
    const audioList = el("div");
    const GEMINI_TTS_VOICES = [
      "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
      "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
      "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
      "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
      "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
    ];
    [
      { label: "TTS Provider",     sub: "TTS_PROVIDER",     options: ["piper", "elevenlabs", "gemini"],            val: audio.tts_provider },
      { label: "STT Provider",     sub: "STT_PROVIDER",     options: ["deepgram", "openai", "google"],             val: audio.stt_provider },
      { label: "ElevenLabs model", sub: "ELEVENLABS_MODEL",  options: ["eleven_flash_v2_5", "eleven_turbo_v2_5"],   val: audio.elevenlabs_model },
      { label: "Gemini TTS model", sub: "GEMINI_TTS_MODEL",  options: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"], val: audio.gemini_tts_model },
      { label: "Voix Gemini",      sub: "GEMINI_TTS_VOICE",  options: GEMINI_TTS_VOICES,                            val: audio.gemini_tts_voice },
      { label: "Whisper model",    sub: "WHISPER_MODEL",     options: ["tiny", "base", "small", "medium", "large"], val: audio.whisper_model },
    ].forEach(f => audioList.appendChild(settingRow(f.label, f.sub, makeSelect(f.options, f.val, f.sub))));

    let voices = [];
    try { voices = await J.api.get("/api/settings/voices"); } catch (_) {}
    if (voices.length) {
      const vSelect = el("select", { class: "select-mono", style: { minWidth: "200px" } });
      voices.forEach(v => {
        const opt = el("option", { value: v.id, text: v.name });
        if (v.id === audio.elevenlabs_voice_id) opt.selected = true;
        vSelect.appendChild(opt);
      });
      const saveBtn = el("button", { class: "m-btn", text: "Sauv." });
      saveBtn.addEventListener("click", () => saveSetting("ELEVENLABS_VOICE_ID", vSelect.value, saveBtn));
      const ctrl = el("div", { style: { display:"flex", gap:"8px", alignItems:"center" } });
      ctrl.appendChild(vSelect); ctrl.appendChild(saveBtn);
      audioList.appendChild(settingRow("Voix ElevenLabs", "ELEVENLABS_VOICE_ID", ctrl));
    }
    wrap.appendChild(ghostSec("Audio & voix", "TTS · STT · voix", null, audioList));

    // Clés API — édition inline, sans popup navigateur
    const keyList = el("div");
    Object.entries(keys).forEach(([k, masked]) => {
      const ctrl = el("div", { style: { display:"flex", gap:"8px", alignItems:"center" } });
      const valEl = el("div", { class: "key-val", text: masked || "— non configurée" });
      const editBtn = el("button", { class: "m-btn", text: "Éditer" });

      const showDisplay = () => {
        ctrl.innerHTML = "";
        ctrl.appendChild(valEl);
        ctrl.appendChild(editBtn);
      };

      editBtn.addEventListener("click", () => {
        ctrl.innerHTML = "";
        const inp = el("input", {
          type: "password",
          class: "input-mono",
          style: { width: "220px" },
          placeholder: "Nouvelle valeur…",
        });
        const saveBtn  = el("button", { class: "m-btn",        text: "Sauvegarder" });
        const cancelBtn = el("button", { class: "m-btn ghost",  text: "✕" });

        saveBtn.addEventListener("click", async () => {
          if (!inp.value.trim()) return;
          await saveSetting(k, inp.value.trim(), saveBtn);
          valEl.textContent = "••••••••";
          showDisplay();
        });
        cancelBtn.addEventListener("click", showDisplay);

        inp.addEventListener("keydown", e => {
          if (e.key === "Enter") saveBtn.click();
          if (e.key === "Escape") cancelBtn.click();
        });

        ctrl.appendChild(inp);
        ctrl.appendChild(saveBtn);
        ctrl.appendChild(cancelBtn);
        inp.focus();
      });

      showDisplay();
      keyList.appendChild(settingRow(k, "clé secrète", ctrl));
    });
    wrap.appendChild(ghostSec("Clés API", "champs masqués", null, keyList));

    const page = pageWrapper("modeles", "Modèles & clés API", null, wrap);
    root.innerHTML = ""; root.appendChild(page);
  }

  /* ───────── Quota d'abonnement (III › 03) ───────── */
  async function renderQuota(card) {
    let q = null;
    try { q = await J.api.get("/api/quota"); } catch (e) { q = null; }
    card.innerHTML = "";

    const hd = el("div", { class: "card-hd" });
    const ttl = el("div");
    ttl.appendChild(el("h2", { text: "Abonnement" }));
    ttl.appendChild(el("span", { class: "sub", text: q && q.plan ? q.plan : "état du forfait" }));
    hd.appendChild(ttl);
    card.appendChild(hd);

    if (!q) {
      card.appendChild(el("div", { class: "conso-empty", text: "Quota indisponible (API muette)." }));
      return;
    }
    if (q.mode === "api") {
      card.appendChild(el("div", { class: "conso-empty",
        text: q.note || "Facturation à l'usage : pas de quota, seulement un coût." }));
      return;
    }
    if (!q.available) {
      card.appendChild(el("div", { class: "conso-empty", text: q.note || q.error || "Moteur d'abonnement injoignable." }));
      return;
    }

    const grid = el("div", { class: "quota-grid" });
    [
      { key: "session", label: "Session · 5 h glissantes" },
      { key: "week",    label: "Semaine · 7 j glissants" },
    ].forEach(({ key, label }) => {
      const w = q[key] || {};
      const tile = el("div", { class: "quota-tile" });
      tile.appendChild(el("div", { class: "quota-lbl", text: label }));
      const val = el("div", { class: "quota-val" });
      val.textContent = String(w.requests || 0);
      val.appendChild(el("span", { class: "quota-unit",
        text: w.limit ? " / " + w.limit + " requêtes" : " requêtes" }));
      tile.appendChild(val);
      if (w.limit) {
        const bar = el("div", { class: "quota-bar" });
        const fill = el("i");
        fill.style.width = Math.min(100, w.pct || 0).toFixed(1) + "%";
        if ((w.pct || 0) > 85) fill.classList.add("is-hot");
        bar.appendChild(fill);
        tile.appendChild(bar);
      }
      tile.appendChild(el("div", { class: "quota-sub",
        text: (w.tokens || 0).toLocaleString("fr-FR") + " tokens" }));
      grid.appendChild(tile);
    });
    card.appendChild(grid);

    if (q.note) card.appendChild(el("div", { class: "setting-note", text: q.note }));

    // Les plafonds ne sont pas devinables : on laisse le Maître les déclarer.
    // Ils partent au sidecar (qui tient le compteur), pas dans le .env de
    // jarvis-OS que ce process Node ne lit jamais.
    const limitRow = el("div", { class: "quota-limits" });
    const inputs = {};
    const mkLimit = (lbl, key, cur, sub) => {
      const inp = el("input", { class: "input-mono", type: "number", min: "0",
        style: { width: "110px" }, value: cur ? String(cur) : "", placeholder: "—" });
      inputs[key] = inp;
      return settingRow(lbl, sub, inp);
    };
    limitRow.appendChild(mkLimit("Plafond session", "session", (q.session || {}).limit,
      "requêtes autorisées sur 5 h"));
    limitRow.appendChild(mkLimit("Plafond semaine", "week", (q.week || {}).limit,
      "requêtes autorisées sur 7 jours"));

    const saveLimits = el("button", { class: "m-btn", text: "Enregistrer les plafonds" });
    saveLimits.addEventListener("click", async () => {
      saveLimits.textContent = "…"; saveLimits.disabled = true;
      try {
        await J.api.post("/api/quota/limits", {
          session: parseInt(inputs.session.value, 10) || 0,
          week: parseInt(inputs.week.value, 10) || 0,
        });
        J.notify({ kind: "success", text: "Plafonds enregistrés" });
        renderQuota(card);
        return;
      } catch (e) {
        J.notify({ kind: "error", text: e.message });
      }
      saveLimits.textContent = "Enregistrer les plafonds"; saveLimits.disabled = false;
    });
    limitRow.appendChild(el("div", { style: { marginTop: "12px" } }, [saveLimits]));

    card.appendChild(ghostSec(
      "Plafonds déclarés",
      "Anthropic ne publie pas le solde d'un abonnement : renseigne ce que ton forfait autorise pour obtenir une jauge. Effet immédiat.",
      null, limitRow,
    ));
  }

  /* ───────── 03 Conso ───────── */
  async function renderConso() {
    const C = window.JarvisCharts;

    let session = {}, daily = [], monthly = {}, byModel = [], hourly = Array(24).fill(0);
    try {
      [session, daily, monthly, byModel, hourly] = await Promise.all([
        J.api.get("/api/conso/session"),
        J.api.get("/api/conso/daily?days=30"),
        J.api.get("/api/conso/monthly"),
        J.api.get("/api/conso/by_model"),
        J.api.get("/api/conso/hourly"),
      ]);
    } catch (_) {}

    const BUDGET = 500;
    const monthlyCost = monthly.cost_usd || 0;
    const monthlyTokens = monthly.tokens || 0;
    const todayCost = session.total_cost_usd || 0;
    const budgetPct = Math.min(100, (monthlyCost / BUDGET) * 100);
    // Forecast: linear extrapolation from elapsed days
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const forecast = dayOfMonth > 0 ? monthlyCost / dayOfMonth * daysInMonth : monthlyCost;

    // Helper: format tokens
    function fmtTokens(n) {
      if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
      return String(n);
    }

    const wrap = el("div", { style: { display:"flex", flexDirection:"column" } });

    /* ── Abonnement (demande 19) ──────────────────────────────────────────
       Affiché AVANT les coûts : quand on tourne à l'abonnement, c'est le
       quota qui compte, pas le dollar. */
    const quotaCard = el("div", { class: "card conso-quota" });
    quotaCard.appendChild(el("div", { class: "conso-quota-load", text: "Abonnement · lecture…" }));
    wrap.appendChild(quotaCard);
    renderQuota(quotaCard).catch(() => {
      quotaCard.innerHTML = "";
      quotaCard.appendChild(el("div", { class: "conso-empty", text: "Quota indisponible." }));
    });

    /* ── Hero 4 tiles ── */
    const hero = el("div", { class: "conso-hero" });

    // Tile 1: Total mois
    const t1 = el("div", { class: "conso-tile primary" });
    t1.appendChild(el("div", { class: "l", text: "Total · ce mois" }));
    const v1 = el("div", { class: "v" });
    const whole1 = Math.floor(monthlyCost);
    const dec1 = (monthlyCost % 1).toFixed(2).slice(1);
    v1.innerHTML = `$${whole1}<span class="dec">${dec1}</span> <span class="rel">ce mois</span>`;
    t1.appendChild(v1);
    t1.appendChild(el("div", { class: "d", text: `budget mensuel · $${BUDGET} · ${budgetPct.toFixed(0)}% consommé` }));
    const budgetBar = el("div", { class: "conso-budget-bar" });
    const budgetFill = el("i"); budgetFill.style.width = budgetPct.toFixed(1) + "%";
    budgetBar.appendChild(budgetFill); t1.appendChild(budgetBar);
    hero.appendChild(t1);

    // Tile 2: Aujourd'hui
    const t2 = el("div", { class: "conso-tile" });
    t2.appendChild(el("div", { class: "l", text: "Aujourd'hui" }));
    const v2 = el("div", { class: "v" });
    v2.innerHTML = `$${Math.floor(todayCost)}<span class="dec">${(todayCost % 1).toFixed(2).slice(1)}</span>`;
    t2.appendChild(v2);
    t2.appendChild(el("div", { class: "d sub", text: "session courante" }));
    const spark2 = C.sparkline(daily.slice(-7).map(d => d.cost_usd || 0), { color: "#4A9EFF" });
    spark2.setAttribute("class", "conso-spark");
    t2.appendChild(spark2);
    hero.appendChild(t2);

    // Tile 3: Tokens
    const t3 = el("div", { class: "conso-tile" });
    t3.appendChild(el("div", { class: "l", text: "Tokens · mois" }));
    const v3 = el("div", { class: "v" });
    const fmtTok = fmtTokens(monthlyTokens);
    const tokNum = fmtTok.slice(0, -1), tokUnit = fmtTok.slice(-1);
    v3.innerHTML = `${tokNum}<span class="unit">${tokUnit}</span>`;
    t3.appendChild(v3);
    t3.appendChild(el("div", { class: "d sub", text: "input + output · tous providers" }));
    const spark3 = C.sparkline(daily.slice(-7).map(d => d.cost_usd || 0), { color: "#36D399" });
    spark3.setAttribute("class", "conso-spark");
    t3.appendChild(spark3);
    hero.appendChild(t3);

    // Tile 4: Forecast
    const t4 = el("div", { class: "conso-tile" });
    t4.appendChild(el("div", { class: "l", text: "Forecast fin de mois" }));
    const v4 = el("div", { class: "v gold", text: "$" + Math.round(forecast) });
    t4.appendChild(v4);
    t4.appendChild(el("div", { class: "d sub", text: "extrapolation linéaire" }));
    const flag = el("div", { class: "conso-tile-flag" });
    flag.innerHTML = `<span class="dot"></span> extrapolé`;
    t4.appendChild(flag);
    hero.appendChild(t4);
    wrap.appendChild(hero);

    /* ── Evolution area chart ── */
    const evol = el("div", { class: "card conso-evolution" });
    const evolHd = el("div", { class: "card-hd" });
    const evolTtl = el("div");
    evolTtl.appendChild(el("h2", { text: "Évolution · 30 derniers jours" }));
    evolTtl.appendChild(el("span", { class: "sub", text: "coût USD / jour" }));
    evolHd.appendChild(evolTtl);

    // Range toggles
    const rangeWrap = el("div", { class: "conso-range" });
    const rg1 = el("div", { class: "conso-range-group" });
    const btnUSD = el("button", { text: "USD", class: "on" });
    rg1.appendChild(btnUSD);
    const rg2 = el("div", { class: "conso-range-group" });
    let activeRange = "30j";
    ["7j", "30j", "90j"].forEach(r => {
      const btn = el("button", { text: r });
      if (r === activeRange) btn.classList.add("on");
      btn.addEventListener("click", () => {
        rg2.querySelectorAll("button").forEach(b => b.classList.remove("on"));
        btn.classList.add("on");
        activeRange = r;
        const days = parseInt(r);
        const sliced = daily.slice(-days);
        areaWrap.innerHTML = "";
        areaWrap.appendChild(C.areaChart(sliced.map(d => d.cost_usd || 0), { color: "#4A9EFF" }));
      });
      rg2.appendChild(btn);
    });
    rangeWrap.appendChild(rg1); rangeWrap.appendChild(rg2);
    evolHd.appendChild(rangeWrap);
    evol.appendChild(evolHd);

    const areaWrap = el("div", { class: "conso-area-wrap" });
    areaWrap.appendChild(C.areaChart(daily.map(d => d.cost_usd || 0), { color: "#4A9EFF" }));
    evol.appendChild(areaWrap);

    const axis = el("div", { class: "conso-axis" });
    axis.appendChild(el("span", { text: "J-29" }));
    axis.appendChild(el("span", { text: "J-15" }));
    axis.appendChild(el("span", { text: "J-1" }));
    evol.appendChild(axis);

    const legend = el("div", { class: "conso-legend" });
    const li = el("span", { class: "conso-legend-item" });
    const sw = el("span", { class: "sw" }); sw.style.background = "#4A9EFF";
    li.appendChild(sw);
    li.appendChild(document.createTextNode(" Jarvis "));
    li.appendChild(el("span", { class: "val", text: "$" + monthlyCost.toFixed(2) }));
    legend.appendChild(li);
    evol.appendChild(legend);
    wrap.appendChild(evol);

    /* ── Row 2: Usage + Providers ── */
    const row2 = el("div", { class: "conso-row-2" });

    // Usage by type card
    const usageCard = el("div", { class: "card conso-usage" });
    const usageHd = el("div", { class: "card-hd" });
    const usageTtl = el("div");
    usageTtl.appendChild(el("h2", { text: "Répartition par type d'usage" }));
    usageTtl.appendChild(el("span", { class: "sub", text: "où part vraiment l'argent" }));
    usageHd.appendChild(usageTtl); usageCard.appendChild(usageHd);

    const byType = (monthly.by_type || []).slice(0, 6);
    if (byType.length) {
      byType.forEach(u => {
        const row = el("div", { class: "conso-usage-row" });
        const sw = el("span", { class: "conso-usage-sw" }); sw.style.background = u.color || "var(--accent)";
        row.appendChild(sw);
        const body = el("div", { class: "conso-usage-body" });
        body.appendChild(el("div", { class: "nm", text: u.label }));
        body.appendChild(el("div", { class: "ctx", text: u.sub }));
        const bar = el("div", { class: "conso-usage-bar" });
        const fill = el("i"); fill.style.width = Math.round((u.pct || 0) * 100) + "%";
        fill.style.background = u.color || "var(--accent)";
        bar.appendChild(fill); body.appendChild(bar);
        row.appendChild(body);
        const vals = el("div", { class: "conso-usage-vals" });
        vals.appendChild(el("div", { class: "val", text: "$" + (u.cost_usd || 0).toFixed(2) }));
        vals.appendChild(el("div", { class: "pct", text: Math.round((u.pct || 0) * 100) + "%" }));
        row.appendChild(vals);
        usageCard.appendChild(row);
      });
    } else {
      usageCard.appendChild(el("div", { class: "conso-empty", text: "— données insuffisantes" }));
    }
    row2.appendChild(usageCard);

    // Providers card (donut + heatmap)
    const provCard = el("div", { class: "card conso-providers" });
    const provHd = el("div", { class: "card-hd" });
    const provTtl = el("div");
    provTtl.appendChild(el("h2", { text: "Par provider" }));
    provTtl.appendChild(el("span", { class: "sub", text: "part du total" }));
    provHd.appendChild(provTtl); provCard.appendChild(provHd);

    const provList = monthly.providers || [];
    const PROV_COLORS = { anthropic: "#E5A23E", elevenlabs: "#A78BFA", openai: "#36D399", deepgram: "#4A9EFF" };
    const donutSlices = provList.map(p => ({
      value: p.cost_usd || 0,
      color: PROV_COLORS[p.name] || "var(--fg-3)",
    }));
    const donutTotal = "$" + Math.round(monthlyCost);

    const provGrid = el("div", { class: "conso-providers-grid" });
    const donutEl = C.donut(donutSlices, donutTotal);
    donutEl.setAttribute("class", "conso-donut");
    provGrid.appendChild(donutEl);
    const provLeg = el("div", { class: "conso-providers-legend" });
    provList.forEach(p => {
      const row = el("div", { class: "conso-providers-row" });
      const sw = el("span", { class: "sw" }); sw.style.background = PROV_COLORS[p.name] || "var(--fg-3)";
      row.appendChild(sw);
      row.appendChild(el("span", { class: "nm", text: p.name }));
      row.appendChild(el("span", { class: "val", text: "$" + (p.cost_usd || 0).toFixed(2) }));
      provLeg.appendChild(row);
    });
    provGrid.appendChild(provLeg);
    provCard.appendChild(provGrid);

    // Heatmap
    const peakHour = hourly.indexOf(Math.max(...hourly));
    const peakVal = Math.max(...hourly);
    const heat = el("div", { class: "conso-heat" });
    const heatHd = el("div", { class: "conso-heat-head" });
    heatHd.appendChild(el("span", { text: "Usage · 24h · $/heure" }));
    heatHd.appendChild(el("span", { text: `peak ${String(peakHour).padStart(2,"0")}:00 · $${peakVal.toFixed(3)}` }));
    heat.appendChild(heatHd);
    heat.appendChild(C.heatRow(hourly));
    const heatFt = el("div", { class: "conso-heat-foot" });
    ["00:00", "06:00", "12:00", "18:00", "23:59"].forEach(t => heatFt.appendChild(el("span", { text: t })));
    heat.appendChild(heatFt);
    provCard.appendChild(heat);
    row2.appendChild(provCard);
    wrap.appendChild(row2);

    /* ── Row 3: Par modèle + Par skill ── */
    const row3 = el("div", { class: "conso-row-2" });

    // Par modèle
    const modCard = el("div", { class: "card" });
    const modHd = el("div", { class: "card-hd" });
    const modTtl = el("div");
    modTtl.appendChild(el("h2", { text: "Par modèle" }));
    modTtl.appendChild(el("span", { class: "sub", text: "tokens consommés · part" }));
    modHd.appendChild(modTtl); modCard.appendChild(modHd);
    if (byModel.length) {
      byModel.slice(0, 5).forEach(m => {
        const row = el("div", { class: "conso-mod-row" });
        row.appendChild(el("div", { class: "nm", text: m.model }));
        const bar = el("div", { class: "conso-mod-bar" });
        const fill = el("i"); fill.style.width = (m.pct || 0) + "%";
        bar.appendChild(fill); row.appendChild(bar);
        const vals = el("div", { class: "conso-mod-vals" });
        vals.appendChild(el("span", { class: "meta", text: fmtTokens(m.tokens || 0) }));
        vals.appendChild(el("span", { class: "meta accent", text: "$" + (m.cost_usd || 0).toFixed(2) }));
        row.appendChild(vals);
        modCard.appendChild(row);
      });
    } else {
      modCard.appendChild(el("div", { class: "conso-empty", text: "— aucune donnée ce mois" }));
    }
    row3.appendChild(modCard);

    // Par skill (placeholder — pas de données backend pour l'instant)
    const skillCard = el("div", { class: "card" });
    const skillHd = el("div", { class: "card-hd" });
    const skillTtl = el("div");
    skillTtl.appendChild(el("h2", { text: "Par skill" }));
    skillTtl.appendChild(el("span", { class: "sub", text: "skills qui consomment le plus" }));
    skillHd.appendChild(skillTtl); skillCard.appendChild(skillHd);
    skillCard.appendChild(el("div", { class: "conso-empty", text: "— bientôt disponible" }));
    row3.appendChild(skillCard);
    wrap.appendChild(row3);

    const page = pageWrapper("conso", "Ce que Jarvis consomme pour fonctionner", null, wrap);
    root.innerHTML = ""; root.appendChild(page);
  }

  /* ───────── 04 Système ───────── */
  async function renderSysteme() {
    let perf = {};
    try { perf = await J.api.get("/api/system/perf"); } catch (_) {}

    const wrap = el("div", { style: { display:"flex", flexDirection:"column", gap:"40px" } });

    // Perf tiles
    const perfGrid = el("div", { class: "perf-grid" });
    const tiles = [
      { label: "CPU",     val: (perf.cpu_pct||0).toFixed(0), unit: "%", bar: perf.cpu_pct },
      { label: "RAM",     val: (perf.ram_used_gb||0).toFixed(1), unit: " GB", bar: perf.ram_pct },
      { label: "Disque",  val: (perf.disk_used_gb||0).toFixed(0), unit: " GB", bar: perf.disk_pct },
      perf.battery_pct != null
        ? { label: "Batterie", val: perf.battery_pct, unit: "%", bar: perf.battery_pct }
        : { label: "Uptime", val: perf.uptime_s ? Math.floor(perf.uptime_s/3600)+"h" : "—", unit: "", bar: null },
    ];
    tiles.forEach(t => {
      const tile = el("div", { class: "perf-tile" });
      tile.appendChild(el("div", { class: "perf-label", text: t.label }));
      const valEl = el("div", { class: "perf-val" });
      valEl.textContent = t.val;
      valEl.appendChild(el("span", { class: "perf-unit", text: t.unit }));
      tile.appendChild(valEl);
      if (t.bar != null) {
        const bw = el("div", { class: "perf-bar-wrap" });
        bw.appendChild(el("div", { class: "perf-bar-fill", style: { width: Math.min(100, t.bar||0)+"%", background: t.bar > 80 ? "var(--red)" : "var(--accent)" } }));
        tile.appendChild(bw);
      }
      perfGrid.appendChild(tile);
    });
    wrap.appendChild(ghostSec("Performances", perf.platform || "système", null, perfGrid));

    // Stats Jarvis
    let stats = {};
    try { stats = await J.api.get("/api/system/stats"); } catch (_) {}
    if (Object.keys(stats).length) {
      const statGrid = el("div", { class: "perf-grid" });
      const stiles = [
        { label: "Projets",  val: (stats.projects||{}).total||0, unit: "" },
        { label: "En cours", val: (stats.projects||{}).running||0, unit: "" },
        { label: "Topics",   val: (stats.memory||{}).topics||0, unit: "" },
        { label: "Sessions", val: (stats.sessions||{}).total||0, unit: "" },
      ];
      stiles.forEach(t => {
        const tile = el("div", { class: "perf-tile" });
        tile.appendChild(el("div", { class: "perf-label", text: t.label }));
        tile.appendChild(el("div", { class: "perf-val", text: String(t.val) }));
        statGrid.appendChild(tile);
      });
      wrap.appendChild(ghostSec("Statistiques Jarvis", "projets · mémoire · sessions", null, statGrid));
    }

    // Logs
    let logs = [];
    try { logs = await J.api.get("/api/system/logs"); } catch (_) {}
    const logView = el("div", { class: "log-viewer" });
    (logs.length ? logs : ["Aucun log récent"]).forEach(line => {
      const entry = el("span", { class: "log-entry" + (line.includes("ERROR")?" error":line.includes("WARN")?" warn":""), text: line });
      logView.appendChild(entry);
      logView.appendChild(document.createTextNode("\n"));
    });
    logView.scrollTop = logView.scrollHeight;
    wrap.appendChild(ghostSec("Logs récents", logs.length + " lignes", null, logView));

    // Danger zone
    const danger = el("div", { class: "danger-zone" });
    danger.appendChild(el("div", { class: "danger-title", text: "ZONE DANGER" }));

    const cleanRow = el("div", { class: "danger-row" });
    const cleanTxt = el("div");
    cleanTxt.appendChild(el("div", { class: "danger-label", text: "Nettoyer les projets terminés" }));
    cleanTxt.appendChild(el("div", { class: "danger-sub", text: "Supprime les workspaces done/failed/killed" }));
    cleanRow.appendChild(cleanTxt);
    const cleanBtn = el("button", { class: "btn-danger", text: "Nettoyer" });
    cleanBtn.addEventListener("click", async () => {
      // window.confirm est inopérant dans la fenêtre native WebView2.
      const ok = await J.confirm({
        eyebrow: "Zone danger",
        title: "Nettoyer tous les projets terminés ?",
        body: "Les workspaces done / failed / killed seront supprimés du disque.",
        okLabel: "Nettoyer",
      });
      if (!ok) return;
      cleanBtn.textContent = "…"; cleanBtn.disabled = true;
      try {
        const r = await J.api.delete("/api/system/projects/done");
        J.notify({ kind: "success", text: r.removed + " projets supprimés" });
      } catch (e) { J.notify({ kind: "error", text: e.message }); }
      cleanBtn.textContent = "Nettoyer"; cleanBtn.disabled = false;
    });
    cleanRow.appendChild(cleanBtn);
    danger.appendChild(cleanRow);

    const restartRow = el("div", { class: "danger-row" });
    const restartTxt = el("div");
    restartTxt.appendChild(el("div", { class: "danger-label", text: "Redémarrer Jarvis" }));
    restartTxt.appendChild(el("div", { class: "danger-sub", text: "Relance le processus FastAPI" }));
    restartRow.appendChild(restartTxt);
    const restartBtn = el("button", { class: "btn-danger", text: "Redémarrer" });
    restartBtn.addEventListener("click", async () => {
      const ok = await J.confirm({
        eyebrow: "Zone danger",
        title: "Redémarrer Jarvis ?",
        body: "Le processus FastAPI est relancé. La fenêtre se recharge dans la foulée.",
        okLabel: "Redémarrer",
      });
      if (!ok) return;
      restartBtn.textContent = "…"; restartBtn.disabled = true;
      try { await J.api.post("/api/system/restart"); }
      catch (_) { setTimeout(() => window.location.reload(), 3000); }
    });
    restartRow.appendChild(restartBtn);
    danger.appendChild(restartRow);

    wrap.appendChild(danger);

    const page = pageWrapper("systeme", "Système & processus", null, wrap);
    root.innerHTML = ""; root.appendChild(page);
  }

  /* ───────── 05 À propos ───────── */
  async function renderApropos() {
    const year = new Date().getFullYear();

    const wrap = el("div", { class: "about2" });

    // ── Header : nom + badge ──────────────────────────────────
    const hdr = el("div", { class: "about2-hdr" });
    const nameWrap = el("div", { class: "about2-name-wrap" });
    nameWrap.appendChild(el("div", { class: "about2-name", text: "Jarvis" }));
    const sub = el("div", { class: "about2-sub-row" });
    sub.appendChild(el("span", { class: "about2-badge", text: "v4.0" }));
    sub.appendChild(el("span", { class: "about2-tagline", text: "Assistant personnel intelligent · vocal · proactif" }));
    nameWrap.appendChild(sub);
    hdr.appendChild(nameWrap);
    wrap.appendChild(hdr);

    wrap.appendChild(el("div", { class: "about2-sep" }));

    // ── Métadonnées ───────────────────────────────────────────
    const meta = el("dl", { class: "about2-meta" });
    [
      ["Auteur",  "Barthélemy Houot"],
      ["Licence", "GNU AGPL-3.0"],
      ["Année",   String(year)],
    ].forEach(([k, v]) => {
      meta.appendChild(el("dt", { class: "about2-dt", text: k }));
      meta.appendChild(el("dd", { class: "about2-dd", text: v }));
    });
    wrap.appendChild(meta);

    // ── Code source (AGPL) ────────────────────────────────────
    const srcLink = el("a", {
      class: "about2-src",
      href: "https://github.com/Grominet95/jarvis-OS",
      text: "Code source (AGPL)",
    });
    srcLink.target = "_blank";
    srcLink.rel = "noopener noreferrer";
    wrap.appendChild(srcLink);

    wrap.appendChild(el("div", { class: "about2-sep" }));

    // ── Copyright ─────────────────────────────────────────────
    wrap.appendChild(el("p", { class: "about2-copy",
      text: `© ${year} Barthélemy Houot · GNU AGPL-3.0` }));

    // ── Bouton mise à jour ────────────────────────────────────
    const updateBtn = el("button", { class: "about2-update-btn", text: "Vérifier les mises à jour" });
    const updateStatus = el("div", { class: "about2-update-status" });

    updateBtn.addEventListener("click", async () => {
      updateBtn.disabled = true;
      updateBtn.textContent = "Mise à jour en cours…";
      updateStatus.textContent = "";
      updateStatus.className = "about2-update-status";
      try {
        const res = await J.api.post("/admin/api/system/update", {});
        if (res.already_up_to_date) {
          updateStatus.textContent = "Jarvis est déjà à jour.";
          updateStatus.className = "about2-update-status ok";
          updateBtn.textContent = "À jour";
        } else if (res.ok) {
          updateStatus.textContent = "Mise à jour réussie. Redémarre Jarvis pour appliquer les changements.";
          updateStatus.className = "about2-update-status ok";
          updateBtn.textContent = "Redémarrer";
          updateBtn.disabled = false;
          updateBtn.addEventListener("click", () => {
            J.api.post("/admin/api/system/restart", {}).catch(() => {});
          }, { once: true });
        } else {
          updateStatus.textContent = "Erreur : " + (res.error || "Échec de la mise à jour.");
          updateStatus.className = "about2-update-status err";
          updateBtn.textContent = "Réessayer";
          updateBtn.disabled = false;
        }
      } catch (_) {
        updateStatus.textContent = "Impossible de contacter le serveur.";
        updateStatus.className = "about2-update-status err";
        updateBtn.textContent = "Réessayer";
        updateBtn.disabled = false;
      }
    });

    const updateWrap = el("div", { class: "about2-update-wrap" });
    updateWrap.appendChild(updateBtn);
    updateWrap.appendChild(updateStatus);
    wrap.appendChild(updateWrap);

    const page = pageWrapper("apropos", "À propos de Jarvis", null, wrap);
    root.innerHTML = ""; root.appendChild(page);
  }

  /* ═══════════════════════════════════════════════════════════════════
     Briques de la page Apparence (« Perso »)
     ═══════════════════════════════════════════════════════════════════ */

  function toggleRow(label, sub, value, onchange) {
    const tog = el("div", { class: "toggle" + (value ? " on" : "") });
    tog.addEventListener("click", () => {
      const next = !tog.classList.contains("on");
      tog.classList.toggle("on", next);
      onchange(next);
    });
    return settingRow(label, sub, tog);
  }

  function sliderRow(label, sub, opts, value, fmt, oninput) {
    const wrap = el("div", { class: "slider-ctrl" });
    const input = el("input", {
      type: "range", min: String(opts.min), max: String(opts.max), step: String(opts.step),
      value: String(value),
    });
    const out = el("span", { class: "slider-val", text: fmt(value) });
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      out.textContent = fmt(v);
      oninput(v);
    });
    wrap.appendChild(input); wrap.appendChild(out);
    return settingRow(label, sub, wrap);
  }

  /* ── Sélecteur de couleur précis (demande 5) ────────────────────────────
     Carré saturation/luminosité + bandeau de teinte + bandeau de
     transparence + saisies HEX / RVB / TSL. Tout le spectre est atteignable,
     y compris les teintes sourdes (marron = orange désaturé et assombri) que
     les palettes de pastilles ne donnent jamais. */
  function colorPicker(initial, onChange) {
    const T = window.JarvisTheme;
    let rgb = (initial && initial.rgb) || "74, 158, 255";
    let alpha = initial && initial.alpha != null ? initial.alpha : 1;
    let hsl = T.toHsl(rgb);   // [h, s, l]

    const root_ = el("div", { class: "cpick" });

    // — Carré S/L —
    const field = el("div", { class: "cpick-field" });
    const fieldThumb = el("div", { class: "cpick-thumb" });
    field.appendChild(fieldThumb);

    // — Bandeaux —
    const hueBar = el("div", { class: "cpick-bar cpick-hue" });
    const hueThumb = el("div", { class: "cpick-thumb cpick-thumb--bar" });
    hueBar.appendChild(hueThumb);

    const alphaBar = el("div", { class: "cpick-bar cpick-alpha" });
    const alphaFill = el("div", { class: "cpick-alpha-fill" });
    const alphaThumb = el("div", { class: "cpick-thumb cpick-thumb--bar" });
    alphaBar.appendChild(alphaFill); alphaBar.appendChild(alphaThumb);

    // — Aperçu + saisies —
    const preview = el("div", { class: "cpick-preview" });
    const hexIn = el("input", { class: "input-mono cpick-hex", maxlength: "7" });
    const nums = el("div", { class: "cpick-nums" });
    function numField(lbl, min, max, step) {
      const box = el("label", { class: "cpick-num" });
      box.appendChild(el("span", { text: lbl }));
      const i = el("input", { type: "number", min: String(min), max: String(max), step: String(step) });
      box.appendChild(i);
      nums.appendChild(box);
      return i;
    }
    const rIn = numField("R", 0, 255, 1);
    const gIn = numField("V", 0, 255, 1);
    const bIn = numField("B", 0, 255, 1);
    const hIn = numField("T", 0, 360, 1);
    const sIn = numField("S", 0, 100, 1);
    const lIn = numField("L", 0, 100, 1);
    const aIn = numField("A", 0, 100, 1);

    let _silent = false;

    function paint() {
      const pure = T.rgbStr(T.hslToRgb(hsl[0], 100, 50));
      field.style.background =
        "linear-gradient(to top, #000, transparent), " +
        "linear-gradient(to right, #fff, transparent), rgb(" + pure + ")";
      fieldThumb.style.left = hsl[1] + "%";
      // La luminosité HSL n'est PAS l'axe vertical d'un carré S/V : on convertit
      // en V pour que le curseur tombe là où l'œil l'attend.
      const v = hsl[2] + hsl[1] * Math.min(hsl[2], 100 - hsl[2]) / 100;
      fieldThumb.style.top = (100 - v) + "%";
      fieldThumb.style.background = "rgb(" + rgb + ")";
      hueThumb.style.left = (hsl[0] / 360 * 100) + "%";
      alphaThumb.style.left = (alpha * 100) + "%";
      alphaFill.style.background = "linear-gradient(to right, rgba(" + rgb + ",0), rgb(" + rgb + "))";
      preview.style.background = "rgba(" + rgb + "," + alpha + ")";

      _silent = true;
      hexIn.value = T.hexOf(rgb);
      const p = rgb.split(",").map(n => parseInt(n, 10));
      rIn.value = p[0]; gIn.value = p[1]; bIn.value = p[2];
      hIn.value = Math.round(hsl[0]); sIn.value = Math.round(hsl[1]); lIn.value = Math.round(hsl[2]);
      aIn.value = Math.round(alpha * 100);
      _silent = false;
    }

    function commit() { paint(); onChange({ rgb: rgb, alpha: alpha }); }

    function fromHsl() { rgb = T.rgbStr(T.hslToRgb(hsl[0], hsl[1], hsl[2])); commit(); }
    function fromRgb() { hsl = T.toHsl(rgb); commit(); }

    /* Un seul gestionnaire de glissement pour les trois surfaces : le pointeur
       est capturé, donc le curseur suit même en sortant de la zone. */
    function drag(elm, handler) {
      function move(ev) {
        const r = elm.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
        handler(x, y);
      }
      elm.addEventListener("pointerdown", (ev) => {
        elm.setPointerCapture(ev.pointerId);
        move(ev);
        const onMove = (e2) => move(e2);
        const onUp = (e2) => {
          elm.releasePointerCapture(e2.pointerId);
          elm.removeEventListener("pointermove", onMove);
          elm.removeEventListener("pointerup", onUp);
        };
        elm.addEventListener("pointermove", onMove);
        elm.addEventListener("pointerup", onUp);
      });
    }

    drag(field, (x, y) => {
      // Carré en S/V (comme Windows), converti vers HSL pour le stockage.
      const sv = x, vv = 1 - y;
      const l = vv * (1 - sv / 2);
      const s = (l === 0 || l === 1) ? 0 : (vv - l) / Math.min(l, 1 - l);
      hsl = [hsl[0], s * 100, l * 100];
      fromHsl();
    });
    drag(hueBar, (x) => { hsl = [x * 360, hsl[1], hsl[2]]; fromHsl(); });
    drag(alphaBar, (x) => { alpha = Math.round(x * 100) / 100; commit(); });

    hexIn.addEventListener("input", () => {
      if (_silent) return;
      const p = T.parseHex(hexIn.value);
      if (!p) return;
      rgb = T.rgbStr(p); fromRgb();
    });
    [rIn, gIn, bIn].forEach(i => i.addEventListener("input", () => {
      if (_silent) return;
      const clamp = (v) => Math.max(0, Math.min(255, parseInt(v, 10) || 0));
      rgb = [clamp(rIn.value), clamp(gIn.value), clamp(bIn.value)].join(", ");
      fromRgb();
    }));
    [hIn, sIn, lIn].forEach(i => i.addEventListener("input", () => {
      if (_silent) return;
      hsl = [
        Math.max(0, Math.min(360, parseFloat(hIn.value) || 0)),
        Math.max(0, Math.min(100, parseFloat(sIn.value) || 0)),
        Math.max(0, Math.min(100, parseFloat(lIn.value) || 0)),
      ];
      fromHsl();
    }));
    aIn.addEventListener("input", () => {
      if (_silent) return;
      alpha = Math.max(0, Math.min(100, parseFloat(aIn.value) || 0)) / 100;
      commit();
    });

    const head = el("div", { class: "cpick-head" });
    head.appendChild(preview);
    head.appendChild(hexIn);
    // Pipette système : présente sur Chromium (donc dans la fenêtre native).
    if (window.EyeDropper) {
      const pick = el("button", { class: "m-btn", text: "Pipette" });
      pick.title = "Prélever une couleur à l'écran";
      pick.addEventListener("click", async () => {
        try {
          const res = await new window.EyeDropper().open();
          const p = T.parseHex(res.sRGBHex);
          if (p) { rgb = T.rgbStr(p); fromRgb(); }
        } catch (_) { /* annulé */ }
      });
      head.appendChild(pick);
    }

    root_.appendChild(field);
    root_.appendChild(hueBar);
    root_.appendChild(alphaBar);
    root_.appendChild(head);
    root_.appendChild(nums);
    paint();

    return {
      el: root_,
      set(v) {
        rgb = v.rgb || rgb;
        alpha = v.alpha != null ? v.alpha : alpha;
        hsl = T.toHsl(rgb);
        paint();
      },
      get() { return { rgb: rgb, alpha: alpha }; },
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     05 Apparence (« Perso »)
     ═══════════════════════════════════════════════════════════════════ */
  function renderApparence() {
    const T = window.JarvisTheme;
    const P = window.JarvisPerso;
    const themes = (T && T.THEMES) || {};
    const body = el("div", { style: { display:"flex", flexDirection:"column", gap:"40px" } });

    /* ── Coloris ─────────────────────────────────────────────────────── */
    let current = T ? T.current() : "bleu";
    const grid = el("div", { class: "theme-grid" });

    function markActive(id) {
      current = id;
      grid.querySelectorAll(".theme-swatch").forEach((b) => {
        b.dataset.active = b.dataset.theme === id ? "true" : "false";
      });
    }

    function swatch(id, label, colors, isCustom) {
      const sw = el("button", {
        class: "theme-swatch" + (colors.length > 1 ? " is-multi" : ""),
        dataset: { theme: id, active: id === current ? "true" : "false" },
        title: label,
      });
      const dots = el("span", { class: "theme-dots" });
      colors.forEach((c) => dots.appendChild(
        el("span", { class: "theme-dot", style: { background: "rgb(" + c + ")" } })));
      sw.appendChild(dots);
      sw.appendChild(el("span", { class: "theme-name", text: label }));
      sw.addEventListener("click", () => {
        if (isCustom) { T.apply("custom"); markActive("custom"); syncPicker(); return; }
        T.apply(id);
        markActive(id);
        syncPicker();
      });
      return sw;
    }

    Object.keys(themes).forEach((id) => {
      const t = themes[id];
      const colors = t.s || t.t ? [t.rgb, t.s || t.rgb, t.t || t.rgb] : [t.rgb];
      grid.appendChild(swatch(id, t.label, colors, false));
    });
    // Pastille « Sur mesure » : reprend la dernière couleur libre choisie.
    const custom0 = (T && T.custom()) || null;
    grid.appendChild(swatch(
      "custom", "Sur mesure",
      custom0 ? [custom0.p, custom0.s || custom0.p, custom0.t || custom0.p] : ["120, 140, 170"],
      true,
    ));

    body.appendChild(ghostSec(
      "Coloris",
      "Une teinte unique, ou un coloris à trois couleurs (primaire · secondaire · tertiaire).",
      null, grid,
    ));

    /* ── Couleur précise ─────────────────────────────────────────────── */
    const cur = T ? T.resolve(T.current()) : { p: "74, 158, 255", s: null, t: null, a: 1 };
    const draft = {
      p: cur.p,
      s: cur.s || null,
      t: cur.t || null,
      a: cur.a == null ? 1 : cur.a,
    };
    let slot = "p";   // p | s | t

    const tabs = el("div", { class: "cpick-tabs" });
    const picker = colorPicker({ rgb: draft.p, alpha: draft.a }, (v) => {
      draft[slot] = v.rgb;
      if (slot === "p") draft.a = v.alpha;
      T.applyCustom({ p: draft.p, s: draft.s, t: draft.t, a: draft.a });
      markActive("custom");
      refreshTabDots();
    });

    function syncPicker() {
      const r = T.resolve(T.current());
      draft.p = r.p; draft.s = r.s; draft.t = r.t; draft.a = r.a == null ? 1 : r.a;
      slot = "p";
      refreshTabs();
      picker.set({ rgb: draft.p, alpha: draft.a });
    }

    const TAB_DEFS = [
      { id: "p", label: "Primaire" },
      { id: "s", label: "Secondaire" },
      { id: "t", label: "Tertiaire" },
    ];

    function refreshTabDots() {
      tabs.querySelectorAll(".cpick-tab").forEach((b) => {
        const v = draft[b.dataset.slot];
        const dot = b.querySelector(".cpick-tab-dot");
        dot.style.background = v ? "rgb(" + v + ")" : "transparent";
        dot.classList.toggle("is-off", !v);
      });
    }

    function refreshTabs() {
      tabs.querySelectorAll(".cpick-tab").forEach((b) => {
        b.dataset.active = b.dataset.slot === slot ? "true" : "false";
      });
      refreshTabDots();
    }

    TAB_DEFS.forEach((d) => {
      const b = el("button", { class: "cpick-tab", dataset: { slot: d.id, active: d.id === "p" ? "true" : "false" } });
      b.appendChild(el("span", { class: "cpick-tab-dot" }));
      b.appendChild(el("span", { text: d.label }));
      b.addEventListener("click", () => {
        slot = d.id;
        // Un secondaire/tertiaire vide part de la primaire : on ne demande pas
        // au Maître de repartir du noir.
        if (!draft[slot]) draft[slot] = draft.p;
        T.applyCustom({ p: draft.p, s: draft.s, t: draft.t, a: draft.a });
        markActive("custom");
        refreshTabs();
        picker.set({ rgb: draft[slot], alpha: draft.a });
      });
      tabs.appendChild(b);
    });

    const clearBtn = el("button", { class: "m-btn ghost", text: "Retirer cette couleur" });
    clearBtn.addEventListener("click", () => {
      if (slot === "p") { J.notify({ kind: "error", text: "La couleur primaire est obligatoire." }); return; }
      draft[slot] = null;
      T.applyCustom({ p: draft.p, s: draft.s, t: draft.t, a: draft.a });
      slot = "p";
      refreshTabs();
      picker.set({ rgb: draft.p, alpha: draft.a });
    });

    const pickWrap = el("div", { class: "cpick-wrap" });
    pickWrap.appendChild(tabs);
    pickWrap.appendChild(picker.el);
    pickWrap.appendChild(el("div", { class: "cpick-foot" }, [clearBtn]));
    refreshTabs();

    body.appendChild(ghostSec(
      "Couleur précise",
      "Teinte, saturation, luminosité et transparence — tout le spectre, marron et bleus sourds compris.",
      null, pickWrap,
    ));

    /* ── Fond (demande 17) ───────────────────────────────────────────── */
    const bgList = el("div");
    const bg = P.get().bg;

    const modeSel = el("div", { class: "seg" });
    [["noir","Noir"],["couleur","Couleur"],["image","Photo"]].forEach(([id, lbl]) => {
      const b = el("button", { class: "seg-btn", text: lbl, dataset: { on: bg.mode === id ? "true" : "false" } });
      b.addEventListener("click", () => {
        modeSel.querySelectorAll(".seg-btn").forEach(x => x.dataset.on = "false");
        b.dataset.on = "true";
        P.set({ bg: { mode: id } });
        refreshBgExtras(id);
      });
      modeSel.appendChild(b);
    });
    bgList.appendChild(settingRow("Type de fond", "noir · couleur unie · photo", modeSel));

    const extras = el("div", { class: "bg-extras" });
    bgList.appendChild(extras);

    function refreshBgExtras(mode) {
      extras.innerHTML = "";
      if (mode === "couleur") {
        const cp = colorPicker({ rgb: hexToRgbStr(P.get().bg.color), alpha: 1 }, (v) => {
          P.set({ bg: { color: window.JarvisTheme.hexOf(v.rgb) } });
        });
        extras.appendChild(cp.el);
      }
      if (mode === "image") {
        const fileBtn = el("button", { class: "m-btn", text: "Choisir une photo…" });
        const file = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
        const statusEl = el("div", { class: "setting-note", text: P.get().bg.image ? "Photo en place." : "Aucune photo." });
        fileBtn.addEventListener("click", () => file.click());
        file.addEventListener("change", async () => {
          const f = file.files && file.files[0];
          if (!f) return;
          statusEl.textContent = "Envoi…";
          try {
            const dataUrl = await new Promise((ok, ko) => {
              const fr = new FileReader();
              fr.onload = () => ok(String(fr.result));
              fr.onerror = ko;
              fr.readAsDataURL(f);
            });
            const r = await J.api.post("/api/perso/wallpaper", { data_url: dataUrl });
            P.set({ bg: { mode: "image", image: r.url } });
            statusEl.textContent = "Photo en place.";
          } catch (e) {
            statusEl.textContent = "Échec : " + e.message;
          }
        });
        const row = el("div", { style: { display: "flex", gap: "8px", alignItems: "center" } });
        row.appendChild(fileBtn); row.appendChild(file);
        extras.appendChild(settingRow("Photo de fond", "visible nette à l'accueil, floutée ailleurs", row));
        extras.appendChild(statusEl);
        extras.appendChild(sliderRow(
          "Voile sombre", "assombrit la photo pour garder le texte lisible",
          { min: 0, max: 0.9, step: 0.02 }, P.get().bg.dim,
          (v) => Math.round(v * 100) + " %",
          (v) => P.set({ bg: { dim: v } }),
        ));
        extras.appendChild(sliderRow(
          "Flou hors accueil", "Mission Control et chapitres I · II · III",
          { min: 0, max: 60, step: 2 }, P.get().bg.blur,
          (v) => v + " px",
          (v) => P.set({ bg: { blur: v } }),
        ));
      }
    }
    refreshBgExtras(bg.mode);
    body.appendChild(ghostSec("Fond", "couleur ou photo · nette à l'accueil, floue dans les menus", null, bgList));

    /* ── Effets (demande 18) ─────────────────────────────────────────── */
    const fxList = el("div");
    fxList.appendChild(toggleRow(
      "Effet de luisance",
      "Halos, liseré lumineux des bords, projecteur qui suit la souris, aurore de fond",
      P.get().glow,
      (v) => P.set({ glow: v }),
    ));
    const glassOn = window.JarvisGlass ? window.JarvisGlass.enabled() : false;
    fxList.appendChild(toggleRow(
      "Effet verre",
      "Réfraction de bord façon Liquid Glass, pas un flou générique — expérimental",
      glassOn,
      (v) => { if (window.JarvisGlass) window.JarvisGlass.setEnabled(v); },
    ));
    body.appendChild(ghostSec("Effets", "ce qui brille, et ce qui ne brille plus", null, fxList));

    /* ── Accueil : dossier « éléments » (02/08) ───────────────────────── */
    const homeList = el("div");

    homeList.appendChild(settingRow(
      "Position de la barre d'outils",
      "Neuf ancrages — les quatre coins, les quatre bords, ou le centre",
      dockPosPicker(P.get().dock.pos, (pos) => P.set({ dock: { pos: pos, x: null, y: null } })),
    ));
    homeList.appendChild(toggleRow(
      "Barre d'outils déplaçable",
      "Permet de déplacer la barre d'outils présente sur l'écran principal de Jarvis",
      P.get().dock.draggable,
      (v) => P.set({ dock: { draggable: v } }),
    ));
    homeList.appendChild(toggleRow(
      "Afficher « JARVIS »",
      "Le grand mot filigrané derrière l'horloge, à l'accueil",
      P.get().brand,
      (v) => P.set({ brand: v }),
    ));
    homeList.appendChild(sliderRow(
      "Taille du mot « JARVIS »", "hauteur du filigrane derrière l'horloge",
      { min: 40, max: 320, step: 2 }, P.get().brandSize,
      (v) => v + " px",
      (v) => P.set({ brandSize: v }),
    ));
    homeList.appendChild(sliderRow(
      "Taille de la sphère", "100 % = taille d'origine ; 83 % est le défaut",
      { min: 0.1, max: 3, step: 0.01 }, P.get().orbScale,
      (v) => Math.round(v * 100) + " %",
      (v) => P.set({ orbScale: v }),
    ));
    body.appendChild(folderSec(
      "Éléments de l'accueil", "barre d'outils · marque · sphère", homeList, true,
    ));

    /* ── Accueil : dossier « masquer » (02/08) ────────────────────────── */
    const hideList = el("div");
    [
      ["clock",   "Horloge",          "Le grand chiffre en haut à droite"],
      ["dock",    "Barre d'outils",   "Micro, écran, caméra, fichiers, musique, chat, perso"],
      ["orb",     "Sphère",           "La boule de particules au centre"],
      ["channel", "Dernier message",  "Le mot de Jarvis, en bas à droite"],
    ].forEach(([key, label, sub]) => {
      hideList.appendChild(toggleRow(label, sub, !P.get().hide[key], (v) => {
        const patch = { hide: {} };
        patch.hide[key] = !v;
        P.set(patch);
      }));
    });
    hideList.appendChild(toggleRow(
      "Date", "La ligne sous l'horloge",
      P.get().date.show,
      (v) => P.set({ date: { show: v } }),
    ));
    body.appendChild(folderSec(
      "Retirer des éléments de l'accueil",
      "décocher masque l'élément, sans rien supprimer", hideList, false,
    ));

    /* ── Horloge (demande 11) ─────────────────────────────────────────── */
    const clockList = el("div");
    const clk = P.get().clock;

    const modeClk = el("div", { class: "seg" });
    [["classique","Classique"],["chaine","Chaîne complète"]].forEach(([id, lbl]) => {
      const b = el("button", { class: "seg-btn", text: lbl, dataset: { on: clk.mode === id ? "true" : "false" } });
      b.addEventListener("click", () => {
        modeClk.querySelectorAll(".seg-btn").forEach(x => x.dataset.on = "false");
        b.dataset.on = "true";
        P.set({ clock: { mode: id } });
        refreshClockExtras(id);
      });
      modeClk.appendChild(b);
    });
    clockList.appendChild(settingRow("Type d'affichage", "HH:MM, ou la chaîne millièmes → année", modeClk));

    const clockExtras = el("div");
    clockList.appendChild(clockExtras);

    // Même ordre que perso.chainSegments : microsecondes à gauche, année à
    // droite. On garde n vignettes en partant de la droite.
    function chainPreview(n, weekday) {
      const d = new Date();
      const pad = (v, w) => String(v).padStart(w || 2, "0");
      let us = 0;
      try { us = Math.floor((performance.now() % 1) * 1000); } catch (e) {}
      const all = [
        pad(us, 3), pad(d.getMilliseconds(), 3), pad(d.getSeconds()), pad(d.getMinutes()),
        pad(d.getHours()), pad(d.getDate()), pad(d.getMonth() + 1), String(d.getFullYear()),
      ];
      const kept = all.slice(all.length - n).join(":");
      const W = ["D","L","M","Me","J","V","S"];
      return (weekday ? W[d.getDay()] + " " : "") + kept;
    }

    function refreshClockExtras(mode) {
      clockExtras.innerHTML = "";
      if (mode === "chaine") {
        const prev = el("div", { class: "clock-preview", text: chainPreview(P.get().clock.segments, P.get().clock.weekday) });
        clockExtras.appendChild(sliderRow(
          "Nombre de vignettes",
          "1 = l'année seule (à droite) ; chaque cran ajoute une unité vers la gauche, "
          + "jusqu'aux microsecondes",
          { min: 1, max: 8, step: 1 }, P.get().clock.segments,
          (v) => v + (v > 1 ? " vignettes" : " vignette"),
          (v) => { P.set({ clock: { segments: v } }); prev.textContent = chainPreview(v, P.get().clock.weekday); },
        ));
        clockExtras.appendChild(toggleRow(
          "Lettre du jour",
          "Tout à gauche : D L M Me J V S — « Me » pour mercredi, qui partagerait sinon le M de mardi",
          P.get().clock.weekday,
          (v) => { P.set({ clock: { weekday: v } }); prev.textContent = chainPreview(P.get().clock.segments, v); },
        ));
        clockExtras.appendChild(settingRow("Aperçu", "ordre : microsecondes → année", prev));
      }
      clockExtras.appendChild(sliderRow(
        "Taille de l'horloge", "hauteur du chiffre à l'accueil",
        { min: 8, max: 220, step: 2 }, P.get().clock.size,
        (v) => v + " px",
        (v) => P.set({ clock: { size: v } }),
      ));

      /* Date sous l'horloge (02/08) : format réglable ; le retrait se fait
         depuis le dossier « Retirer des éléments de l'accueil ». */
      const dateFmt = el("div", { class: "seg" });
      const datePrev = el("div", { class: "clock-preview", text: P.formatDate(new Date()) });
      [["complet","Complet"],["court","Court"],["numerique","Numérique"]].forEach(([id, lbl]) => {
        const b = el("button", {
          class: "seg-btn", text: lbl,
          dataset: { on: P.get().date.format === id ? "true" : "false" },
        });
        b.addEventListener("click", () => {
          dateFmt.querySelectorAll(".seg-btn").forEach(x => x.dataset.on = "false");
          b.dataset.on = "true";
          P.set({ date: { format: id } });
          datePrev.textContent = P.formatDate(new Date(), id);
        });
        dateFmt.appendChild(b);
      });
      clockExtras.appendChild(settingRow("Format de la date", "la ligne sous l'horloge", dateFmt));
      clockExtras.appendChild(settingRow("Aperçu de la date", "tel qu'il s'affiche à l'accueil", datePrev));
    }
    refreshClockExtras(clk.mode);
    body.appendChild(ghostSec("Horloge", "format · vignettes · taille", null, clockList));

    /* ── Remise à zéro ───────────────────────────────────────────────── */
    const resetWrap = el("div");
    const resetBtn = el("button", { class: "m-btn ghost", text: "Tout remettre par défaut" });
    resetBtn.addEventListener("click", async () => {
      const ok = await J.confirm({
        eyebrow: "Apparence",
        title: "Remettre l'apparence par défaut ?",
        body: "Fond, luisance, taille de la sphère, horloge, date, marque et barre d'outils reviennent à leurs valeurs d'origine. La teinte, elle, n'est pas touchée.",
        okLabel: "Remettre à zéro",
      });
      if (!ok) return;
      P.reset();
      navigate("apparence");
    });
    resetWrap.appendChild(resetBtn);
    body.appendChild(ghostSec("Réinitialiser", "revenir aux réglages d'origine", null, resetWrap));

    const page = pageWrapper("apparence", "Apparence", "Perso — teinte, fond, accueil, horloge", body);
    root.innerHTML = "";
    root.appendChild(page);
  }

  function hexToRgbStr(hex) {
    const p = window.JarvisTheme.parseHex(hex);
    return p ? window.JarvisTheme.rgbStr(p) : "6, 8, 13";
  }

  /* ───────── Router ───────── */
  const RENDERERS = {
    preferences: renderPreferences,
    modeles:     renderModeles,
    conso:       renderConso,
    systeme:     renderSysteme,
    apparence:   renderApparence,
    apropos:     renderApropos,
  };

  function navigate(pageId) {
    _activePage = pageId;
    const nav = document.getElementById("j-rooms-pages");
    if (nav) {
      const btns = Array.from(nav.querySelectorAll("button"));
      const idx = PAGES.findIndex(p => p.id === pageId);
      btns.forEach((b, i) => b.dataset.active = i === idx ? "true" : "false");
    }
    const fn = RENDERERS[pageId];
    if (fn) { root.innerHTML = ""; fn(); }
  }

  /* ───────── Init ───────── */
  // Le bouton « Perso » de la barre d'accueil pointe sur /settings#apparence :
  // sans cette lecture du hash, il tombait toujours sur Préférences.
  function pageFromHash() {
    const h = (location.hash || "").replace(/^#/, "").toLowerCase();
    return PAGES.some(p => p.id === h) ? h : "preferences";
  }
  _activePage = pageFromHash();

  J.mountAtmosphere();

  J.mountRooms({
    mode: "config",
    pages: PAGES,
    activePage: _activePage,
    onNav: (id) => navigate(id),
  });

  J.registerCommands(PAGES.map(p => ({
    kind: "nav", id: "cfg-" + p.id, group: "Réglages",
    title: p.label, glyph: "→",
    run: () => navigate(p.id),
  })));

  window.addEventListener("hashchange", () => navigate(pageFromHash()));

  navigate(_activePage);
})();
