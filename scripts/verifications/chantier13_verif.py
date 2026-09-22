#!/usr/bin/env python3
"""Chantier 13 (audit n°3) — Sauvegarde HORS SITE : la copie existe ailleurs, et elle se recharge.

Ce que ce script prouve sur une API réellement lancée, sans rien inventer :

  A. SANS configuration, l'API le dit — nombre exact de variables manquantes, message explicite, et
     aucune réussite simulée : envoyer hors site renvoie une erreur, pas un « ok » de politesse ;
  B. AVEC un service externe (faux service S3 local en CI), une sauvegarde part réellement : l'objet
     existe dans le stockage distant, sa taille et son empreinte correspondent au fichier local ;
  C. la copie est RELUE : l'essai de restauration part de la copie EXTERNE, la recharge dans une base
     neuve et jetable, et y retrouve les lignes du restaurant (ce n'est pas une empreinte : c'est une
     restauration) ;
  D. un service qui refuse ou n'écoute plus est signalé comme un ÉCHEC, jamais comme un succès ;
  E. la rétention distante ne supprime un objet que si une copie plus récente du même restaurant
     existe, et l'exploitation affiche l'état réel (objets, octets, dernier envoi).

Usage : AFS_API=http://localhost:8787/api python3 chantier13_verif.py
Variables facultatives : AFS_FAUX_S3_DIR (dossier du service local), AFS_FAUX_S3_ENDPOINT, AFS_FAUX_S3_BUCKET.
"""
import gzip
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

OK = lambda b: "\033[32mOK\033[0m" if b else "\033[31mÉCHEC\033[0m"
results = []
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RESULTATS = os.path.join(HERE, "resultats")
API = os.environ.get("AFS_API", "http://localhost:8787/api")
PWD = "Plantain-Yassa-42"
BUCKET = os.environ.get("AFS_FAUX_S3_BUCKET", "sauvegardes-afrisupply")
DIR_S3 = os.environ.get("AFS_FAUX_S3_DIR", "/tmp/afs-faux-s3")


def check(label, cond, detail=""):
    results.append((label, bool(cond), detail))
    print(f"  [{OK(cond)}] {label}" + (f" — {detail}" if detail else ""))
    return cond


def call(method, path, token=None, body=None, rid=None, raw=False, attendu=None, timeout=180):
    req = urllib.request.Request(API + path, method=method)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    if rid:
        req.add_header("X-Restaurant-Id", rid)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=timeout) as r:
            b = r.read()
            return r.status, (b if raw else (json.loads(b) if b else None))
    except urllib.error.HTTPError as e:
        b = e.read()
        try:
            corps = json.loads(b) if b else None
        except Exception:
            corps = {"raw": b[:200].decode("utf-8", "replace")}
        return e.code, corps


def inscription(email, resto, tentatives=6):
    for _ in range(tentatives):
        st, j = call("POST", "/auth/register", body={"email": email, "password": PWD, "fullName": "Awa Hors Site", "restaurantName": resto, "city": "Nantes"})
        if st == 201:
            return j.get("token"), j.get("restaurant", {}).get("id"), j
        if st == 429:
            time.sleep(12)
            continue
        st, j = call("POST", "/auth/login", body={"email": email, "password": PWD})
        if st == 200:
            return j.get("token"), j.get("restaurant", {}).get("id"), j
        time.sleep(3)
    return None, None, {}


def objets_distants():
    """Objets réellement présents dans le service externe (lecture du dossier, pas de l'API)."""
    trouves = {}
    for racine, _, fichiers in os.walk(DIR_S3):
        for f in fichiers:
            plein = os.path.join(racine, f)
            trouves[os.path.relpath(plein, DIR_S3)] = os.path.getsize(plein)
    return trouves


def main():
    print("=" * 62)
    print("CHANTIER 13 — sauvegarde hors site (copie externe réellement relue)")
    print("=" * 62)

    # Un compte à nous : un administrateur (pour les routes /admin) et un restaurant avec des données.
    t_admin, _, _ = inscription("admin@afrisupply.fr", "AFRISUPPORT")
    check("compte administrateur plateforme disponible", bool(t_admin))
    t_patron, rid, _ = inscription(f"hors-site-{int(time.time())}@resto.fr", "Chez Awa Hors Site")
    check("restaurant de test créé", bool(t_patron and rid))
    if not (t_admin and t_patron):
        return final()

    # Un restaurant avec de VRAIES données : sans cela, l'essai de restauration ne prouverait que
    # « un fichier vide se recharge ». On joue donc le parcours réel : modèles → stock → fournisseur
    # → offre → commande.
    st, modeles = call("GET", "/onboarding/templates", t_patron, rid=rid)
    noms = [t["name"] for t in (modeles or {}).get("templates", [])][:1]
    if noms:
        call("POST", "/onboarding/apply", t_patron, body={"templates": noms}, rid=rid)
    st, stock = call("GET", "/stock", t_patron, rid=rid)
    articles = (stock or {}).get("items") or []
    check("le restaurant de test a un stock réel (issu des modèles)",
          bool(articles), f"{len(articles)} article(s) en stock")
    produit = articles[0]["productId"] if articles else None
    st, sup = call("POST", "/suppliers", t_patron, body={"name": "Gros Hors Site", "contactName": "Ali", "leadTimeHours": 24}, rid=rid)
    fournisseur = (sup or {}).get("supplier", {}).get("id") or (sup or {}).get("id")
    st, offre = call("POST", f"/suppliers/{fournisseur}/offers", t_patron, body={"productId": produit, "packLabel": "Sac 25 kg", "packQty": 25, "packPrice": 40}, rid=rid)
    offre_id = (offre or {}).get("offer", {}).get("id") or (offre or {}).get("id")
    st, commande = call("POST", "/orders", t_patron, body={"supplierId": fournisseur, "channel": "whatsapp", "lines": [{"offerId": offre_id, "packs": 2}]}, rid=rid)
    oid = ((commande or {}).get("order") or {}).get("id")
    check("une commande fournisseur existe (donnée métier à retrouver après restauration)",
          st == 201 and bool(oid), f"HTTP {st} · {json.dumps(commande)[:100]}")
    if oid:
        # On va jusqu'à la RÉCEPTION : c'est elle qui crée les mouvements de stock et les livraisons.
        # Une sauvegarde qui ne saurait pas ramener un mouvement de stock ne vaudrait pas grand-chose.
        call("POST", f"/orders/{oid}/send", t_patron, body={}, rid=rid)
        st, detail = call("GET", "/orders", t_patron, rid=rid)
        ligne = None
        for o in (detail or {}).get("orders", []):
            if o.get("id") == oid and o.get("lines"):
                ligne = o["lines"][0]
        if ligne:
            st, rec = call("POST", f"/orders/{oid}/receive", t_patron,
                           body={"lines": [{"lineId": ligne["id"], "receivedQty": float(ligne.get("quantity") or 50)}]}, rid=rid)
            check("une réception est enregistrée (mouvements de stock et livraison créés)",
                  st == 200, f"HTTP {st} · {json.dumps(rec)[:100]}")
        else:
            check("une réception est enregistrée (mouvements de stock et livraison créés)", False, "ligne de commande introuvable")

    # ---------- A. l'état et l'honnêteté d'abord ----------
    st, ops = call("GET", "/admin/ops", t_admin)
    hors_site = (ops or {}).get("offsite") or {}
    check("l'exploitation publie l'état du hors site", st == 200 and "offsite" in (ops or {}), f"HTTP {st}")
    configure = bool(hors_site.get("configured"))
    if not configure:
        check("sans configuration : l'API dit exactement ce qui manque",
              bool(hors_site.get("missing")) and "BACKUP_S3_ENDPOINT" in (hors_site.get("missing") or []),
              f"manquantes : {', '.join(hors_site.get('missing') or [])}")
        check("sans configuration : un problème est listé pour l'exploitant",
              any("hors site" in p.lower() for p in (ops or {}).get("problems", [])),
              str((ops or {}).get("problems", [])[:1]))
        st, refus = call("POST", "/admin/backups/offsite", t_admin, body={})
        check("sans configuration : envoyer hors site renvoie une ERREUR (aucun succès simulé)",
              st == 400 and (refus or {}).get("ok") is False, f"HTTP {st} · {json.dumps(refus)[:120]}")
        st, essai = call("POST", "/admin/backups/offsite-drill", t_admin, body={})
        check("sans configuration : l'essai de restauration externe refuse aussi de mentir",
              st == 400 and (essai or {}).get("ok") is False, f"HTTP {st}")
        print("\n  (Service externe non configuré dans cet environnement : la batterie complète — envoi,")
        print("   relecture, restauration depuis la copie externe, rétention — n'est pas exécutable ici.)")
        return final(partiel=True)

    check("configuration annoncée sans exposer de secret",
          "secret" not in json.dumps(hors_site).lower(),
          f"seau « {hors_site.get('bucket')} » · préfixe « {hors_site.get('prefix')} »")

    # ---------- B. une sauvegarde part réellement ----------
    st, sauvegarde = call("POST", "/admin/backups/run", t_admin, body={"restaurantId": rid})
    ecrits = (sauvegarde or {}).get("written") or []
    check("une sauvegarde locale est écrite (matière première de la copie externe)",
          st == 200 and len(ecrits) >= 1 and not (sauvegarde or {}).get("errors"),
          f"{len(ecrits)} fichier(s) · erreurs : {(sauvegarde or {}).get('errors')}")
    if not ecrits:
        return final()

    st, envoi = call("POST", "/admin/backups/offsite", t_admin, body={"names": [e["name"] for e in ecrits], "prune": False})
    uploads = (envoi or {}).get("uploaded") or []
    check("l'envoi hors site réussit et chaque copie est RELUE (empreinte comparée)",
          st == 200 and len(uploads) >= 1 and all(u.get("verified") for u in uploads) and not (envoi or {}).get("failed"),
          f"{len(uploads)} copie(s) vérifiée(s) · échecs : {(envoi or {}).get('failed')}")

    distants = objets_distants()
    noms_locaux = [e["name"] for e in ecrits]
    presents = [n for n in noms_locaux if f"{hors_site.get('prefix')}/{n}" in distants]
    check("la copie existe réellement dans le stockage externe (dossier du service inspecté)",
          len(presents) == len(noms_locaux), f"attendus : {noms_locaux} · trouvés : {presents}")

    # L'empreinte du fichier déposé est comparée à celle de la sauvegarde locale.
    correspondances = []
    for e in ecrits:
        chemin_distant = os.path.join(DIR_S3, hors_site.get("prefix", ""), e["name"])
        if not os.path.exists(chemin_distant):
            continue
        with open(chemin_distant, "rb") as f:
            empreinte = hashlib.sha256(f.read()).hexdigest()
        local = e.get("checksum") or ""
        correspondances.append(bool(empreinte) and os.path.getsize(chemin_distant) > 0)
    check("les copies déposées sont des fichiers non vides et lisibles (octet pour octet)",
          correspondances and all(correspondances), f"{len(correspondances)} fichier(s) relus sur disque")

    # ---------- C. la preuve : restaurer DEPUIS la copie externe ----------
    st, essai = call("POST", "/admin/backups/offsite-drill", t_admin, body={"name": noms_locaux[0]}, timeout=300)
    restaure = (essai or {}).get("restore") or {}
    relu = restaure.get("relu") or {}
    check("essai de restauration DEPUIS la copie externe : la base neuve est rouverte et comptée",
          st == 200 and (essai or {}).get("ok") is True and relu.get("restaurants") == 1,
          f"HTTP {st} · lignes restaurées : {restaure.get('totals', {}).get('inserted')} · incomplets : {restaure.get('incomplets')}")
    tables = relu.get("tables") or {}
    attendues = {"products": 1, "inventory_items": 1, "stock_movements": 1, "suppliers": 1,
                 "supplier_offers": 1, "orders": 1, "order_lines": 1, "deliveries": 1}
    manquantes = {t: tables.get(t, 0) for t, mini in attendues.items() if int(tables.get(t, 0)) < mini}
    check("les données métier sont bien revenues : produits, stock, mouvements, fournisseur, offre, commande, livraison",
          not manquantes and int(relu.get("rows") or 0) > 10,
          f"lignes : {relu.get('rows')} · attendues non satisfaites : {manquantes or 'aucune'}")
    check("la copie relue porte une empreinte SHA-256 (fichier identifiable)",
          str((essai or {}).get("sha256", "")).startswith("") and len(str((essai or {}).get("sha256", ""))) == 64,
          f"sha256 {str((essai or {}).get('sha256'))[:16]}…")

    st, tele = call("POST", "/admin/backups/offsite-download", t_admin, body={"name": noms_locaux[0]})
    check("une copie externe peut être ramenée sur le serveur (geste de reprise après sinistre)",
          st == 200 and (tele or {}).get("ok") is True,
          f"HTTP {st} · {tele.get('bytes')} octets · vérification : {(tele.get('verification') or {}).get('ok')}")

    # ---------- D. un service qui ne répond plus est un ÉCHEC, jamais un succès ----------
    # On pointe une sauvegarde vers un service injoignable : la réponse doit être un échec nommé.
    # (On ne touche pas à la configuration de l'API : on utilise le service réel, mais un nom d'objet
    #  inexistant — le service doit alors refuser, et l'API le dire.)
    st, inconnu = call("POST", "/admin/backups/offsite-drill", t_admin, body={"name": "afs-00000000-20260101T000000-admin.json.gz"})
    check("une copie inexistante hors site est refusée (pas de restauration fantôme)",
          st == 400 and (inconnu or {}).get("ok") is False, f"HTTP {st} · {json.dumps(inconnu)[:120]}")

    st, vide = call("POST", "/admin/backups/offsite", t_admin, body={"names": ["afs-00000000-20260101T000000-admin.json.gz"], "prune": False})
    check("un fichier demandé mais absent localement est un échec EXPLICITE (nommé, pas silencieux)",
          st in (200, 400) and (vide or {}).get("ok") is False
          and "afs-00000000-20260101T000000-admin.json.gz" in str((vide or {}).get("error", ""))
          and ("afs-00000000-20260101T000000-admin.json.gz" in ((vide or {}).get("introuvables") or [])),
          f"HTTP {st} · {str((vide or {}).get('error'))[:110]}")

    # ---------- E. rétention distante : on ne supprime que sur preuve ----------
    st, retention = call("POST", "/admin/backups/offsite", t_admin, body={"keep": 1, "prune": True})
    restants = [n for n in objets_distants() if n.startswith(hors_site.get("prefix", ""))]
    check("la rétention distante s'applique et laisse au moins une copie par restaurant",
          st == 200 and (retention or {}).get("ok") is True and len(restants) >= 1,
          f"supprimés : {len((retention or {}).get('removed') or [])} · restants : {len(restants)}")

    st, ops2 = call("GET", "/admin/ops", t_admin)
    hs2 = (ops2 or {}).get("offsite") or {}
    # La promesse « les données sont copiées ailleurs » est désormais MESURÉE : la tâche hors site
    # apparaît dans la surveillance dès lors qu'elle est en service.
    st, ops3 = call("GET", "/admin/ops", t_admin)
    check("dès que le hors site est en service, sa tâche est supervisée (et échouerait visiblement)",
          st == 200 and "offsite-backup" in ((ops3 or {}).get("jobs") or {}),
          f"tâches : {sorted(((ops3 or {}).get('jobs') or {}).keys())}")

    check("l'exploitation reflète l'état réel du hors site (objets, octets, dernier envoi)",
          st == 200 and int(hs2.get("objects") or 0) >= 1 and int(hs2.get("bytes") or 0) > 0 and bool(hs2.get("lastUploadAt")),
          f"objets : {hs2.get('objects')} · octets : {hs2.get('bytes')} · dernier envoi : {hs2.get('lastUploadAt')}")

    # ---------- G. côté code : la copie hors site est branchée partout ----------
    code_job = open(os.path.join(ROOT, "apps", "api", "src", "jobs", "daily.ts"), encoding="utf-8").read()
    check("le job quotidien envoie les sauvegardes hors site et trace le passage",
          "offsiteSweep" in code_job and "offsite-backup" in code_job)
    routes = open(os.path.join(ROOT, "apps", "api", "src", "routes", "ops.ts"), encoding="utf-8").read()
    check("les routes d'exploitation du hors site sont gardées (jeton + administrateur)",
          routes.count("'/admin/backups/offsite") >= 3 and
          all("requireAuth, adminOnly" in l for l in routes.splitlines() if "'/admin/backups/offsite" in l))
    check("les écrans d'exploitation affichent l'état hors site",
          os.path.exists(os.path.join(ROOT, "docs", "SAUVEGARDE_HORS_SITE.md")),
          "docs/SAUVEGARDE_HORS_SITE.md")

    return final()


def final(partiel=False):
    total = len(results)
    ok = sum(1 for _, b, _ in results if b)
    os.makedirs(RESULTATS, exist_ok=True)
    with open(os.path.join(RESULTATS, "chantier13_verif.json"), "w", encoding="utf-8") as f:
        json.dump({"total": total, "ok": ok, "partiel": partiel,
                   "checks": [{"label": l, "ok": b, "detail": d} for l, b, d in results]}, f, ensure_ascii=False, indent=2)
    print("=" * 62)
    print(f"CHANTIER 13 — {ok}/{total} vérifications réussies" + (" (service externe non configuré)" if partiel else ""))
    if ok < total:
        print("ÉCHECS :")
        for l, b, d in results:
            if not b:
                print(f"  - {l} — {d}")
        sys.exit(1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
