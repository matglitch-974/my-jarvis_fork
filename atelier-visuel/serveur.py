# -*- coding: utf-8 -*-
"""Atelier visuel de My Jarvis — serveur de rendu.

Sert le moteur de rendu et recoit les images produites pour les ecrire sur
disque. Aucune dependance hors bibliotheque standard.

    python serveur.py [port]        defaut 8913

Le moteur s'appelle par URL, ce qui evite tout pilotage exterieur :

    http://127.0.0.1:8913/moteur.html?scene=demo-3d&vues=6&sortie=galet

Il rend la scene, compose une planche contact, la poste sur /ecrire, et
affiche FINI. Le fichier atterrit dans sorties/.
"""
import io
import json
import os
import re
import sys
import base64
import mimetypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

RACINE = os.path.dirname(os.path.abspath(__file__))
SORTIES = os.path.join(RACINE, "sorties")
SCENES = os.path.join(RACINE, "scenes")
os.makedirs(SORTIES, exist_ok=True)
os.makedirs(SCENES, exist_ok=True)

# --- three.js : jamais de chemin fige, on cherche par motif -----------------

def trouver_three():
    """Cherche three.min.js dans l'arborescence My Jarvis, puis en local."""
    local = os.path.join(RACINE, "vendor", "three.min.js")
    if os.path.exists(local):
        return local
    base = os.path.abspath(os.path.join(RACINE, ".."))
    for dp, dn, fn in os.walk(base):
        dn[:] = [d for d in dn if d not in (".git", "node_modules", ".venv", "sorties")]
        for f in fn:
            if f in ("three.min.js", "three.module.min.js"):
                return os.path.join(dp, f)
    return None

THREE = trouver_three()


def liste_scenes():
    out = []
    for f in sorted(os.listdir(SCENES)):
        if f.endswith(".js"):
            titre = ""
            try:
                with open(os.path.join(SCENES, f), "r", encoding="utf-8") as fh:
                    for ligne in fh.read(2000).splitlines():
                        m = re.search(r"titre\s*[:=]\s*[\"'](.+?)[\"']", ligne)
                        if m:
                            titre = m.group(1)
                            break
            except OSError:
                pass
            out.append({"id": f[:-3], "fichier": f, "titre": titre})
    return out


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))

    # -- utilitaires --------------------------------------------------------
    def _envoyer(self, code, corps, ctype="application/json; charset=utf-8"):
        if isinstance(corps, str):
            corps = corps.encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(corps)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(corps)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            # L'onglet a ferme la connexion en cours de route : sans interet.
            self.close_connection = True

    def do_HEAD(self):
        self.do_GET()

    def _fichier(self, chemin):
        if not os.path.isfile(chemin):
            return self._envoyer(404, "introuvable: " + chemin, "text/plain; charset=utf-8")
        ctype = mimetypes.guess_type(chemin)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        with open(chemin, "rb") as fh:
            self._envoyer(200, fh.read(), ctype)

    # -- GET ----------------------------------------------------------------
    def do_GET(self):
        u = urlparse(self.path)
        p = u.path

        if p in ("/", "/index.html"):
            return self._fichier(os.path.join(RACINE, "moteur.html"))

        if p == "/api/scenes":
            return self._envoyer(200, json.dumps(liste_scenes(), ensure_ascii=False))

        if p == "/api/sorties":
            fichiers = []
            for f in sorted(os.listdir(SORTIES)):
                c = os.path.join(SORTIES, f)
                fichiers.append({"nom": f, "octets": os.path.getsize(c)})
            return self._envoyer(200, json.dumps(fichiers, ensure_ascii=False))

        if p == "/vendor/three.min.js":
            if THREE:
                return self._fichier(THREE)
            return self._envoyer(404, "three.js introuvable", "text/plain; charset=utf-8")

        # fichiers du dossier de l'atelier, sans remontee
        rel = p.lstrip("/").replace("\\", "/")
        if ".." in rel:
            return self._envoyer(403, "refuse", "text/plain; charset=utf-8")
        return self._fichier(os.path.join(RACINE, *rel.split("/")))

    # -- POST ---------------------------------------------------------------
    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/ecrire":
            return self._envoyer(404, "{}")

        n = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(n).decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as e:
            return self._envoyer(400, json.dumps({"erreur": str(e)}))

        nom = re.sub(r"[^A-Za-z0-9_\-.]", "_", data.get("nom") or "sortie")
        url = data.get("image") or ""
        m = re.match(r"^data:(image/(?:png|jpeg|webp)|video/webm)[^,;]*;base64,(.+)$", url, re.S)
        if not m:
            return self._envoyer(400, json.dumps({"erreur": "donnee absente ou mal formee"}))

        ext = {"image/png": ".png", "image/jpeg": ".jpg",
               "image/webp": ".webp", "video/webm": ".webm"}[m.group(1)]
        if not nom.endswith(ext):
            nom += ext
        chemin = os.path.join(SORTIES, nom)
        with open(chemin, "wb") as fh:
            fh.write(base64.b64decode(m.group(2)))

        sys.stderr.write("  ECRIT  %s  (%.0f Ko)\n" % (chemin, os.path.getsize(chemin) / 1024))
        return self._envoyer(200, json.dumps({"chemin": chemin,
                                              "octets": os.path.getsize(chemin)}))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8913
    sys.stderr.write("Atelier visuel My Jarvis\n")
    sys.stderr.write("  racine  : %s\n" % RACINE)
    sys.stderr.write("  three.js: %s\n" % (THREE or "ABSENT — les scenes 3D ne rendront pas"))
    sys.stderr.write("  scenes  : %d\n" % len(liste_scenes()))
    sys.stderr.write("  ecoute  : http://127.0.0.1:%d/\n\n" % port)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
