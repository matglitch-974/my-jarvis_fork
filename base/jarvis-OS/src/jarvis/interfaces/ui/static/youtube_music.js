/* youtube_music.js — lecteur YouTube Music embarqué (demande 6).

   YouTube n'offre aucune API de contrôle de lecture : la seule façon de jouer
   un morceau est le lecteur IFrame officiel. Ce fichier le monte, invisible,
   et l'accroche au reste de MyJarvis :

     - il rapporte son état au serveur (POST /api/youtube-music/state) ;
     - il vient chercher les ordres (GET /api/youtube-music/commands) émis par
       /api/music/play|pause|next|prev, la voix, ou une automatisation.

   Inerte tant que MUSIC_PROVIDER ≠ youtube_music : aucun script YouTube n'est
   chargé, aucune requête n'est faite. */
(function () {
  "use strict";

  var PLAYER = null;
  var READY = false;
  var TIMER = null;
  var POLL_MS = 1000;
  var _cfg = { playlist: "", search_available: false };

  function authHeaders() {
    return (window.Jarvis && Jarvis.authHeaders) ? Jarvis.authHeaders() : {};
  }

  function post(path, body) {
    return fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
      body: JSON.stringify(body || {}),
    });
  }

  /* ── Montage du lecteur ─────────────────────────────────────────────── */
  function mountHost() {
    var host = document.getElementById("ytm-host");
    if (host) return host;
    host = document.createElement("div");
    host.id = "ytm-host";
    // Hors écran plutôt que display:none : un IFrame masqué est mis en pause
    // par Chromium, ce qui couperait la lecture.
    host.style.cssText =
      "position:fixed;left:-9999px;top:0;width:320px;height:180px;" +
      "opacity:0;pointer-events:none;";
    host.innerHTML = '<div id="ytm-player"></div>';
    document.body.appendChild(host);
    return host;
  }

  function loadApi() {
    return new Promise(function (resolve, reject) {
      if (window.YT && window.YT.Player) return resolve();
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prev === "function") { try { prev(); } catch (e) {} }
        resolve();
      };
      if (document.getElementById("ytm-api")) return; // déjà en cours
      var s = document.createElement("script");
      s.id = "ytm-api";
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = function () { reject(new Error("API IFrame YouTube injoignable")); };
      document.head.appendChild(s);
    });
  }

  function buildPlayer() {
    mountHost();
    var vars = { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, origin: location.origin };
    if (_cfg.playlist) { vars.list = _cfg.playlist; vars.listType = "playlist"; }
    PLAYER = new YT.Player("ytm-player", {
      height: "180", width: "320",
      playerVars: vars,
      events: {
        onReady: function () { READY = true; report(); },
        onStateChange: report,
        onError: function (e) { console.warn("[YTM] erreur lecteur", e && e.data); },
      },
    });
  }

  /* ── Remontée d'état ────────────────────────────────────────────────── */
  function report() {
    if (!READY || !PLAYER || !PLAYER.getPlayerState) return;
    var d = {};
    try { d = PLAYER.getVideoData() || {}; } catch (e) {}
    var state = -1;
    try { state = PLAYER.getPlayerState(); } catch (e) {}
    var payload = {
      is_playing: state === 1,
      track: d.title || null,
      artist: d.author || "",
      album: "",
      album_art: d.video_id ? "https://i.ytimg.com/vi/" + d.video_id + "/hqdefault.jpg" : null,
      progress_ms: Math.round((safe(PLAYER.getCurrentTime) || 0) * 1000),
      duration_ms: Math.round((safe(PLAYER.getDuration) || 0) * 1000),
      video_id: d.video_id || null,
    };
    post("/api/youtube-music/state", payload).catch(function () {});
  }

  function safe(fn) { try { return fn.call(PLAYER); } catch (e) { return 0; } }

  /* ── Exécution des ordres serveur ───────────────────────────────────── */
  function runCommand(c) {
    if (!READY || !PLAYER) return;
    try {
      if (c.action === "play")  PLAYER.playVideo();
      else if (c.action === "pause") PLAYER.pauseVideo();
      else if (c.action === "next")  PLAYER.nextVideo();
      else if (c.action === "prev")  PLAYER.previousVideo();
      else if (c.action === "load") {
        if (c.video_id) PLAYER.loadVideoById(c.video_id);
        else if (c.playlist_id) PLAYER.loadPlaylist({ list: c.playlist_id, listType: "playlist" });
      }
    } catch (e) { console.warn("[YTM] ordre refusé", c, e); }
  }

  function tick() {
    fetch("/api/youtube-music/commands", { credentials: "same-origin", headers: authHeaders() })
      .then(function (r) { return r.ok ? r.json() : { commands: [] }; })
      .then(function (j) { (j.commands || []).forEach(runCommand); })
      .catch(function () {});
    report();
  }

  /* ── Démarrage conditionnel ─────────────────────────────────────────── */
  async function boot() {
    let status;
    try {
      const r = await fetch("/api/music/provider-status", {
        credentials: "same-origin", headers: authHeaders(),
      });
      status = await r.json();
    } catch (e) { return; }
    if (!status || status.provider !== "youtube_music") return;

    try {
      const r = await fetch("/api/youtube-music/config", {
        credentials: "same-origin", headers: authHeaders(),
      });
      _cfg = await r.json();
    } catch (e) {}

    try { await loadApi(); } catch (e) {
      console.warn("[YTM]", e.message);
      return;
    }
    buildPlayer();
    if (TIMER) clearInterval(TIMER);
    TIMER = setInterval(tick, POLL_MS);
  }

  window.JarvisYouTubeMusic = {
    boot: boot,
    search: function (q) {
      return fetch("/api/youtube-music/search?q=" + encodeURIComponent(q), {
        credentials: "same-origin", headers: authHeaders(),
      }).then(function (r) { return r.json(); });
    },
    load: function (videoId) { return post("/api/youtube-music/load", { video_id: videoId }); },
    isReady: function () { return READY; },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
