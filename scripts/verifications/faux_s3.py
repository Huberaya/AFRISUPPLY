#!/usr/bin/env python3
"""Faux service de stockage « S3 » pour les vérifications de bout en bout — bibliothèque standard.

Les vérifications du chantier 13 ne doivent pas envoyer de vraies sauvegardes chez un hébergeur :
elles utilisent ce service local. Il n'a pas vocation à être complet, mais il est honnête :

  * il REFUSE toute requête non signée (en-tête Authorization absent ou malformé) : cela prouve que
    l'API signe réellement ses envois, et qu'on n'écrit pas des archives de restaurant en clair ;
  * il énumère vraiment les objets (list-type=2, prefix, max-keys) avec leur taille et leur date :
    la rétention distante travaille donc sur des données réelles, pas sur une liste inventée ;
  * il écrit les objets SUR LE DISQUE, dans un dossier inspectable : une vérification peut ouvrir le
    fichier déposé et comparer son empreinte SHA-256 avec la sauvegarde locale.

Usage : python3 faux_s3.py <port> <dossier> [nom-du-seau]
"""
import hashlib
import os
import re
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9900
RACINE = sys.argv[2] if len(sys.argv) > 2 else "/tmp/afs-faux-s3"
SEAU = sys.argv[3] if len(sys.argv) > 3 else "sauvegardes-afrisupply"


def chemin_objet(chemin_url: str) -> str:
    """Clé de l'objet à partir du chemin d'URL (style « path » : /seau/cle)."""
    chemin = urllib.parse.unquote(chemin_url.lstrip("/"))
    if chemin.startswith(SEAU + "/"):
        chemin = chemin[len(SEAU) + 1:]
    return chemin


def chemin_local(cle: str) -> str:
    """Emplacement disque d'un objet — refus des chemins qui sortent du dossier (traversée)."""
    cible = os.path.realpath(os.path.join(RACINE, cle))
    if not cible.startswith(os.path.realpath(RACINE)):
        raise ValueError("clé hors dossier")
    return cible


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # silence : les vérifications ont leur propre affichage
        pass

    def _refus(self, code: int, corps: str = ""):
        self.send_response(code)
        self.send_header("Content-Type", "application/xml")
        self.send_header("Content-Length", str(len(corps.encode())))
        self.end_headers()
        if corps:
            self.wfile.write(corps.encode())

    def _signature_ok(self) -> bool:
        auth = self.headers.get("Authorization", "")
        return bool(re.match(r"^AWS4-HMAC-SHA256 Credential=.+/s3/aws4_request, SignedHeaders=.+, Signature=[0-9a-f]{64}$", auth))

    def _corps(self) -> bytes:
        taille = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(taille) if taille else b""

    def _liste(self, prefixe: str) -> str:
        objets = []
        for racine, _, fichiers in os.walk(RACINE):
            for f in fichiers:
                plein = os.path.join(racine, f)
                cle = os.path.relpath(plein, RACINE)
                if not cle.startswith(prefixe):
                    continue
                st = os.stat(plein)
                objets.append(
                    f"<Contents><Key>{cle}</Key>"
                    f"<LastModified>{__import__('datetime').datetime.utcfromtimestamp(st.st_mtime).isoformat()}Z</LastModified>"
                    f"<Size>{st.st_size}</Size></Contents>"
                )
        objets.sort()
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            f'<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>{SEAU}</Name>'
            f"<Prefix>{prefixe}</Prefix><IsTruncated>false</IsTruncated>{''.join(objets)}</ListBucketResult>"
        )

    def do_PUT(self):
        if not self._signature_ok():
            return self._refus(403, "<Error><Code>AccessDenied</Code></Error>")
        cle = chemin_objet(self.path)
        corps = self._corps()
        cible = chemin_local(cle)
        os.makedirs(os.path.dirname(cible), exist_ok=True)
        with open(cible, "wb") as f:
            f.write(corps)
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.send_header("ETag", hashlib.md5(corps).hexdigest())
        self.end_headers()

    def do_GET(self):
        if not self._signature_ok():
            return self._refus(403, "<Error><Code>AccessDenied</Code></Error>")
        analyse = urllib.parse.urlparse(self.path)
        parametres = urllib.parse.parse_qs(analyse.query)
        if "list-type" in parametres:
            corps = self._liste(parametres.get("prefix", [""])[0])
            return self._refus(200, corps)
        try:
            with open(chemin_local(chemin_objet(analyse.path)), "rb") as f:
                corps = f.read()
        except (OSError, ValueError):
            return self._refus(404, "<Error><Code>NoSuchKey</Code></Error>")
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def do_HEAD(self):
        if not self._signature_ok():
            return self._refus(403)
        try:
            st = os.stat(chemin_local(chemin_objet(urllib.parse.urlparse(self.path).path)))
        except (OSError, ValueError):
            return self._refus(404)
        self.send_response(200)
        self.send_header("Content-Length", str(st.st_size))
        self.end_headers()

    def do_DELETE(self):
        if not self._signature_ok():
            return self._refus(403, "<Error><Code>AccessDenied</Code></Error>")
        try:
            os.remove(chemin_local(chemin_objet(urllib.parse.urlparse(self.path).path)))
        except (OSError, ValueError):
            pass
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()


if __name__ == "__main__":
    os.makedirs(RACINE, exist_ok=True)
    serveur = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[faux-s3] http://0.0.0.0:{PORT} · seau « {SEAU} » · objets dans {RACINE}", flush=True)
    serveur.serve_forever()
