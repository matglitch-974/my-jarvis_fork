/* voice_local.js — pipeline vocal LOCAL (demande 15).

   Le pipeline d'origine (voice_livekit.js) suppose un serveur LiveKit et une
   clé Deepgram. MyJarvis tourne par abonnement, sans aucune clé : le bouton
   micro échouait donc systématiquement. Celui-ci ne dépend de rien d'externe.

   Chaîne :
     micro → détection de parole (AnalyserNode) → MediaRecorder
     → POST /api/voice/transcribe   (faster-whisper, local)
     → POST /api/voice/generate     (moteur Jarvis, déjà en place)
     → POST /api/voice/speak        (Piper) — repli : voix du système.

   Ne s'installe QUE si LiveKit n'est pas configuré : si le Maître branche un
   jour un serveur LiveKit, le client d'origine reprend la main sans rien
   toucher ici. */
(function () {
  "use strict";

  /* ── Réglage de la détection de parole ───────────────────────────────── */
  var SILENCE_RMS   = 0.012;  // en-dessous : on considère que ça ne parle pas
  var SILENCE_MS    = 900;    // silence qui clôt un tour de parole
  var MIN_SPEECH_MS = 350;    // en-dessous : bruit parasite, on jette
  var MAX_TURN_MS   = 30000;  // garde-fou : on coupe au bout de 30 s

  function authHeaders(extra) {
    var h = Object.assign({}, extra || {});
    if (window.Jarvis && Jarvis.authHeaders) Object.assign(h, Jarvis.authHeaders());
    return h;
  }

  function orb(state) {
    if (typeof window.__jarvisSetOrbState === "function") window.__jarvisSetOrbState(state);
  }

  function say(role, text, streaming) {
    if (typeof window.addMsg === "function") return window.addMsg(role, text, streaming);
    return null;
  }

  function pickMime() {
    var candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return "";
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result);
        var comma = s.indexOf(",");
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  /* ── Client ──────────────────────────────────────────────────────────── */
  function LocalVoiceClient() {
    this._stream = null;
    this._ctx = null;
    this._analyser = null;
    this._rec = null;
    this._chunks = [];
    this._raf = null;
    this._btn = document.getElementById("hc-mic");
    this._busy = false;     // une réponse est en cours : on n'écoute pas
    this._running = false;
    this._speechStart = 0;
    this._lastVoice = 0;
    this._audioEl = null;

    var self = this;
    window.jarvis = {
      get isSpeaking() { return self._speaking === true; },
      stopAudio: function () { self._stopAudio(); },
      setState: function (s) { orb(String(s).toLowerCase()); },
      appendJarvisMessage: function (t) { say("assistant", t); },
      appendUserMessage: function (t) { if (t) say("user", t); },
    };
  }

  LocalVoiceClient.prototype._start = async function () {
    if (this._running) return;
    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    var AC = window.AudioContext || window.webkitAudioContext;
    this._ctx = new AC();
    if (this._ctx.state === "suspended") await this._ctx.resume();
    var src = this._ctx.createMediaStreamSource(this._stream);
    this._analyser = this._ctx.createAnalyser();
    this._analyser.fftSize = 1024;
    src.connect(this._analyser);

    this._running = true;
    orb("listening");
    this._loop();
    console.log("[Voix locale] micro ouvert — parlez, Maître.");
  };

  LocalVoiceClient.prototype._stop = function () {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._stopRecorder(true);
    if (this._stream) {
      this._stream.getTracks().forEach(function (t) { t.stop(); });
      this._stream = null;
    }
    if (this._ctx) { try { this._ctx.close(); } catch (e) {} this._ctx = null; }
    this._analyser = null;
    this._stopAudio();
    orb("idle");
  };

  LocalVoiceClient.prototype._stopAudio = function () {
    if (this._audioEl) {
      try { this._audioEl.pause(); } catch (e) {}
      this._audioEl.remove();
      this._audioEl = null;
    }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    this._speaking = false;
  };

  /* Boucle d'écoute : ouvre un enregistrement dès qu'on parle, le ferme après
     un silence franc. Pas de VAD savant — un seuil RMS suffit en intérieur et
     ne coûte rien en CPU. */
  LocalVoiceClient.prototype._loop = function () {
    var self = this;
    var buf = new Float32Array(this._analyser.fftSize);

    function frame() {
      if (!self._running || !self._analyser) return;
      self._raf = requestAnimationFrame(frame);
      if (self._busy) return;

      self._analyser.getFloatTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      var rms = Math.sqrt(sum / buf.length);
      var now = performance.now();

      if (rms > SILENCE_RMS) {
        if (!self._rec) self._startRecorder(now);
        self._lastVoice = now;
      } else if (self._rec) {
        if (now - self._lastVoice > SILENCE_MS) self._stopRecorder(false);
      }
      if (self._rec && now - self._speechStart > MAX_TURN_MS) self._stopRecorder(false);
    }
    frame();
  };

  LocalVoiceClient.prototype._startRecorder = function (now) {
    var mime = pickMime();
    if (!mime) { console.warn("[Voix locale] MediaRecorder indisponible."); return; }
    this._chunks = [];
    this._speechStart = now;
    this._lastVoice = now;
    var self = this;
    this._rec = new MediaRecorder(this._stream, { mimeType: mime });
    this._rec.ondataavailable = function (e) { if (e.data && e.data.size) self._chunks.push(e.data); };
    this._rec.onstop = function () {
      var blob = new Blob(self._chunks, { type: mime });
      self._chunks = [];
      if (self._discard || blob.size < 1200) { self._discard = false; return; }
      self._handleTurn(blob);
    };
    this._rec.start(200);
  };

  LocalVoiceClient.prototype._stopRecorder = function (discard) {
    if (!this._rec) return;
    var tooShort = performance.now() - this._speechStart < MIN_SPEECH_MS;
    this._discard = !!discard || tooShort;
    try { this._rec.stop(); } catch (e) {}
    this._rec = null;
  };

  /* ── Un tour de parole complet ───────────────────────────────────────── */
  LocalVoiceClient.prototype._handleTurn = async function (blob) {
    this._busy = true;
    orb("thinking");
    try {
      var b64 = await blobToBase64(blob);
      var tr = await fetch("/api/voice/transcribe", {
        method: "POST",
        credentials: "same-origin",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ audio: b64 }),
      }).then(function (r) { return r.json(); });

      var text = (tr && tr.text || "").trim();
      if (!text) { this._busy = false; orb("listening"); return; }
      say("user", text);

      var bubble = say("assistant", "", true);
      var sid = localStorage.getItem("jarvis_voice_session") || null;
      var resp = await fetch("/api/voice/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ message: text, session_id: sid }),
      });
      var newSid = resp.headers.get("x-session-id");
      if (newSid) localStorage.setItem("jarvis_voice_session", newSid);
      if (!resp.ok || !resp.body) throw new Error("HTTP " + resp.status);

      var reader = resp.body.getReader();
      var dec = new TextDecoder();
      var full = "";
      while (true) {
        var r = await reader.read();
        if (r.done) break;
        full += dec.decode(r.value, { stream: true });
        if (bubble) bubble.textContent = full;
      }
      await this._speak(full);
    } catch (e) {
      console.error("[Voix locale] tour en échec :", e);
    } finally {
      this._busy = false;
      orb(this._running ? "listening" : "idle");
    }
  };

  /* Piper d'abord (local, voix française). S'il n'est pas installé, le backend
     renvoie un audio vide : on bascule sur la synthèse du navigateur pour que
     Jarvis ait quand même une voix. */
  LocalVoiceClient.prototype._speak = async function (text) {
    if (!text || !text.trim()) return;
    orb("speaking");
    this._speaking = true;
    var self = this;
    try {
      var r = await fetch("/api/voice/speak", {
        method: "POST",
        credentials: "same-origin",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ text: text }),
      }).then(function (x) { return x.json(); });

      if (r && r.audio_b64) {
        await new Promise(function (resolve) {
          var el = new Audio("data:audio/wav;base64," + r.audio_b64);
          self._audioEl = el;
          el.onended = resolve;
          el.onerror = resolve;
          el.play().catch(resolve);
        });
        this._speaking = false;
        return;
      }
    } catch (e) { /* on tombe sur la voix système */ }

    if (window.speechSynthesis) {
      await new Promise(function (resolve) {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = "fr-FR";
        u.onend = resolve;
        u.onerror = resolve;
        window.speechSynthesis.speak(u);
      });
    }
    this._speaking = false;
  };

  /* ── Installation conditionnelle ─────────────────────────────────────── */
  async function boot() {
    var status;
    try {
      var r = await fetch("/api/voice/status", { credentials: "same-origin", headers: authHeaders() });
      status = await r.json();
    } catch (e) {
      status = { pipeline: "local" };  // API muette : le local reste le meilleur pari
    }
    if (status && status.pipeline === "livekit") return;  // LiveKit configuré : on s'efface

    window._voiceClient = new LocalVoiceClient();
    window._voiceClient._btn = document.getElementById("hc-mic");
    window.JarvisVoiceLocal = window._voiceClient;
    console.log("[Voix] pipeline LOCAL actif (Whisper + Piper, aucune clé requise).");
  }

  // Après voice_livekit.js (qui pose _voiceClient sur DOMContentLoaded) : on
  // laisse la boucle d'événements passer pour écraser proprement.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }
})();
