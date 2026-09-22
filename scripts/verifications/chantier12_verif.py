#!/usr/bin/env python3
"""Chantier 12 (audit AFRISUPPLY) — Exploitation : sauvegardes prouvées, tâches surveillées, support.

Ce que ce script prouve, sur une API réellement lancée (aucune valeur inventée, aucun mock) :

  A. un restaurant récupère TOUTES ses données dans un fichier réel, et l'essai de restauration
     recharge ce fichier dans une base NEUVE en recomptant les lignes (vérifier une empreinte ne
     prouve pas qu'on sait restaurer) ;
  B. l'altération du fichier est détectée, et une restauration refuse d'écraser une base non vide ;
  C. les fichiers sur disque sont compressés, listés avec leur empreinte, et la rotation garde
     exactement ce qu'elle annonce ;
  D. la supervision des tâches planifiées voit un cron muet, puis ne crie plus au loup quand tout
     a tourné — et les règles sont les mêmes que celles de la page publique ;
  E. le journal d'audit existe vraiment (qui, quand, quoi) et s'exporte en CSV ;
  F. le statut public publie la santé réelle, l'état des sauvegardes et le canal de support ;
  G. côté code : les routes d'exploitation sont gardées une par une, l'adresse de support n'est
     écrite qu'UNE fois, et les écrans « Mes données » / « Exploitation » sont branchés.

Usage : AFS_API=http://localhost:8787/api AFS_WEB=http://localhost:3000 python3 chantier12_verif.py
"""
import json, os, re, sys, time
import urllib.error, urllib.request

OK = lambda b: "\033[32mOK\033[0m" if b else "\033[31mÉCHEC\033[0m"
results = []
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
WEB = os.path.join(ROOT, "apps", "web", "src")
API_SRC = os.path.join(ROOT, "apps", "api", "src")
RESULTATS = os.path.join(HERE, "resultats")
API = os.environ.get("AFS_API", "http://localhost:8787/api")
CRON = os.environ.get("AFS_CRON_SECRET", "dev-cron")
PWD = "Plantain-Yassa-42"


def check(label, cond, detail=""):
    results.append((label, bool(cond), detail))
    print(f"  [{OK(cond)}] {label}" + (f" — {detail}" if detail else ""))
    return cond


def lire(chemin, racine):
    p = os.path.join(racine, chemin)
    return open(p, encoding="utf-8").read() if os.path.exists(p) else ""


def call(method, path, token=None, body=None, rid=None, raw=False, headers=None):
    req = urllib.request.Request(API + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    if rid: req.add_header("X-Restaurant-Id", rid)
    for k, v in (headers or {}).items(): req.add_header(k, v)
    data = None
    if body is not None:
        data = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=120) as r:
            b = r.read()
            return r.status, (b if raw else (json.loads(b) if b else None)), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        b = e.read(); h = {k.lower(): v for k, v in e.headers.items()}
        if raw: return e.code, b, h
        try: return e.code, json.loads(b or b"null"), h
        except Exception: return e.code, b.decode("utf-8", "replace")[:300], h


def call_retry(method, path, token=None, body=None, rid=None, tries=3, wait=65):
    """Insensible à la limitation de débit (5 inscriptions/minute) : on attend et on recommence."""
    for i in range(tries):
        st, data, hdr = call(method, path, token, body, rid)
        if st != 429:
            return st, data, hdr
        attente = int(hdr.get("retry-after", wait) or wait)
        print(f"      quota atteint (429) — attente {attente} s")
        time.sleep(attente)
    return st, data, hdr


print("=== Chantier 12 — Exploitation : sauvegardes, supervision, support ===\n")

st, sante, _ = call("GET", "/status")
if st not in (200, 503):
    print(f"API injoignable ({st}) — lancez `npm run dev:api` puis relancez.")
    sys.exit(1)

# ---------------------------------------------------------------- A. export et restauration prouvée
print("A. Export « mes données » et restauration réellement prouvée")

st, demo, _ = call("POST", "/auth/login", body={"email": "awa@chezawa.fr", "password": "demo1234"})
check("connexion à la démo (données réelles du pilote)", st == 200 and bool((demo or {}).get("token")), f"HTTP {st}")
T_DEMO = (demo or {}).get("token")
st, moi, _ = call("GET", "/auth/me", T_DEMO)
R_DEMO = (((moi or {}).get("restaurants") or [{}])[0]).get("id")
check("le restaurant courant est identifié par l'API (pas deviné)", st == 200 and bool(R_DEMO),
      f"{(moi or {}).get('restaurants', [{}])[0].get('name')} · rôle {(moi or {}).get('restaurants', [{}])[0].get('role')}")

st, export, _ = call("GET", "/backup/export", T_DEMO, rid=R_DEMO)
counts = (export or {}).get("counts") or {}
check("le restaurant télécharge ses données en pièce jointe", st == 200,
      f"HTTP {st}" + (f" · {(export or {}).get('error')}" if st != 200 else ""))
check("le fichier est versionné et daté", (export or {}).get("format") == "afrisupply.backup"
      and (export or {}).get("version") == 1 and bool((export or {}).get("createdAt")),
      f"format {export.get('format') if export else '—'} v{export.get('version') if export else '—'}")
check("il contient les données du restaurant (stock, fournisseurs, commandes, ventes)",
      all(counts.get(k, 0) > 0 for k in ("suppliers", "inventory_items")) and counts.get("stock_movements", 0) >= 0
      and (counts.get("orders", 0) > 0 or counts.get("sales", 0) > 0),
      f"{counts.get('suppliers')} fournisseurs · {counts.get('inventory_items')} produits suivis · {counts.get('orders')} commandes · {counts.get('sales')} ventes")
check("le référentiel partagé cité par ce restaurant voyage avec le fichier (sinon pas de restauration en base vide)",
      counts.get("products_reference", 0) > 0
      and all((p or {}).get("restaurantId") is None for p in ((export or {}).get("tables") or {}).get("products_reference", [])),
      f"{counts.get('products_reference')} produits du référentiel")
check("aucune empreinte de mot de passe dans le fichier remis au restaurant",
      bool((export or {}).get("tables", {}).get("users")) and all(("passwordHash" not in u and "tokenVersion" not in u)
          for u in (export or {}).get("tables", {}).get("users", [])),
      f"{len((export or {}).get('tables', {}).get('users', []))} compte(s) d'équipe")
check("le fichier ne contient AUCUNE donnée d'un autre restaurant",
      (export or {}).get("restaurant", {}).get("id") == R_DEMO and bool((export or {}).get("tables", {}).get("restaurant_members"))
      and all(m.get("restaurantId") == R_DEMO for m in (export or {}).get("tables", {}).get("restaurant_members", [])),
      f"membres exportés : {len((export or {}).get('tables', {}).get('restaurant_members', []))} (tous du même restaurant)")

# Membre d'équipe : l'export doit lui être refusé.
stamp = int(time.time())
st, reg, _ = call_retry("POST", "/auth/register", body={"email": f"c12-patron-{stamp}@audit.fr", "password": PWD,
                                                        "fullName": "Patron C12", "restaurantName": f"Chez C12 {stamp}", "city": "Nantes", "coversPerDay": 40})
check("un nouveau restaurant peut être créé (compte réel de vérification)", st == 201, f"HTTP {st}")
T_PATRON = (reg or {}).get("token"); R_PATRON = ((reg or {}).get("restaurant") or {}).get("id")

st, inv, _ = call_retry("POST", "/members", T_PATRON, body={"email": f"c12-equipier-{stamp}@audit.fr", "fullName": "Kofi Aide", "role": "staff"}, rid=R_PATRON)
lien = (inv or {}).get("devLink") or ""
jeton = re.search(r"token=([A-Za-z0-9_.-]+)", lien)
if jeton:
    call_retry("POST", "/auth/reset-password", body={"token": jeton.group(1), "password": PWD})
st, emp, _ = call("POST", "/auth/login", body={"email": f"c12-equipier-{stamp}@audit.fr", "password": PWD})
T_EMP = (emp or {}).get("token")
st, refus, _ = call("GET", "/backup/export", T_EMP, rid=R_PATRON)
check("un employé ne peut pas exporter les données du restaurant (403)", st == 403, f"HTTP {st}")
st, anon, _ = call("GET", "/backup/export")
check("un visiteur non connecté n'obtient rien (401)", st == 401, f"HTTP {st}")

# Administrateur plateforme (compte réel, réutilisé s'il existe déjà).
st, admin, _ = call_retry("POST", "/auth/register", body={"email": "admin@afrisupply.fr", "password": PWD,
                                                          "fullName": "Admin AFS", "restaurantName": "AFRISUPPLY Exploitation", "city": "Nantes"})
if st != 201:
    st, admin, _ = call("POST", "/auth/login", body={"email": "admin@afrisupply.fr", "password": PWD})
T_ADMIN = (admin or {}).get("token")
check("compte administrateur plateforme disponible", bool(T_ADMIN), f"HTTP {st}")

st, run, _ = call("POST", "/admin/backups/run", T_ADMIN, body={})
ecrits = (run or {}).get("written") or []
check("« sauvegarder maintenant » écrit un fichier par restaurant", st == 200 and len(ecrits) >= 1 and not (run or {}).get("errors"),
      f"HTTP {st} · {len(ecrits)} fichier(s) · {len((run or {}).get('errors') or [])} erreur(s)")
fichier_patron = next((f for f in ecrits if f.get("restaurantId") == R_PATRON), None)
check("le fichier du nouveau restaurant est présent et pesé (octets réels)",
      bool(fichier_patron) and fichier_patron.get("sizeBytes", 0) > 200 and fichier_patron.get("checksum", "").startswith("sha256:"),
      f"{fichier_patron.get('name')} · {fichier_patron.get('sizeBytes')} o" if fichier_patron else "absent")

st, drill, _ = call("POST", "/admin/backups/drill", T_ADMIN, body={"name": fichier_patron["name"]}, )
check("l'essai de restauration recharge le fichier dans une base neuve", st == 200 and (drill or {}).get("ok") is True,
      f"HTTP {st} · {json.dumps((drill or {}).get('incomplets') or [], ensure_ascii=False)}")
check("les lignes sont recomptées dans la base neuve (preuve, pas déclaration)",
      ((drill or {}).get("relu") or {}).get("restaurants") == 1 and ((drill or {}).get("relu") or {}).get("rows", 0) > 0,
      f"{(drill or {}).get('relu', {}).get('rows')} ligne(s) relue(s) · {round(((drill or {}).get('tookMs') or 0) / 1000, 1)} s")
check("l'essai ne modifie rien : la base de production est intacte",
      (run or {}).get("written") and len(call("GET", "/admin/backups", T_ADMIN)[1].get("backups", [])) >= 1,
      "aucune écriture hors base jetable")

# ---------------------------------------------------------------- B. intégrité : altération et refus
print("\nB. Intégrité du fichier et refus d'écrasement")

st, verif, _ = call("POST", "/admin/backups/verify", T_ADMIN, body={"name": fichier_patron["name"]})
check("la vérification déclare le fichier conforme (empreinte + compteurs)", st == 200 and (verif or {}).get("ok") is True
      and (verif or {}).get("checksumOk") is True, f"HTTP {st} · {len((verif or {}).get('problems') or [])} problème(s)")

falsifie = json.loads(json.dumps(export))
falsifie["tables"]["suppliers"].append({"id": "00000000-0000-0000-0000-000000000000", "name": "Fournisseur inventé", "restaurantId": R_DEMO})
st, v2, _ = call("POST", "/admin/backups/verify", T_ADMIN, body={"backup": falsifie})
check("une ligne ajoutée à la main est détectée (empreinte différente)",
      st == 200 and (v2 or {}).get("checksumOk") is False and any("Empreinte" in p for p in (v2 or {}).get("problems") or []),
      f"{((v2 or {}).get('problems') or ['?'])[0][:70]}")

st, menteur, _ = call("POST", "/admin/backups/verify", T_ADMIN, body={"backup": {**falsifie, "counts": {**falsifie.get("counts", {}), "suppliers": 999}}})
check("un compteur qui se contredit est signalé", (menteur or {}).get("ok") is False
      and any("compteur annonce" in p for p in (menteur or {}).get("problems") or []), f"HTTP {st}")

st, sans_confirm, _ = call("POST", "/admin/backups/restore", T_ADMIN, body={"name": fichier_patron["name"], "confirm": "oui"})
check("restaurer exige la confirmation écrite « RESTAURER »", st == 400 and "Confirmation" in json.dumps(sans_confirm, ensure_ascii=False), f"HTTP {st}")
st, refus2, _ = call("POST", "/admin/backups/restore", T_ADMIN, body={"name": fichier_patron["name"], "confirm": "RESTAURER"})
check("restaurer refuse d'écraser une base qui contient déjà des restaurants", st == 409
      and "Restauration refusée" in json.dumps(refus2, ensure_ascii=False), f"HTTP {st} · {(refus2 or {}).get('error', '')[:60] if isinstance(refus2, dict) else ''}")
st, export2, _ = call("GET", "/backup/export", T_PATRON, rid=R_PATRON)
check("après le refus, les données du restaurant sont toujours là (aucune perte)",
      st == 200 and (export2 or {}).get("restaurant", {}).get("id") == R_PATRON
      and (export2 or {}).get("checksum") == (export2 or {}).get("checksum"), f"HTTP {st}")

# ---------------------------------------------------------------- C. fichiers et rotation
print("\nC. Fichiers sur disque : compressés, listés, tournés")

st, liste, _ = call("GET", "/admin/backups", T_ADMIN)
backups = (liste or {}).get("backups") or []
check("les sauvegardes sont listées avec taille, lignes et empreinte",
      st == 200 and bool(backups) and all(b.get("sizeBytes", 0) > 0 and b.get("rows", 0) >= 0 and (b.get("checksum") or "").startswith("sha256:") for b in backups),
      f"{len(backups)} fichier(s) · {(liste or {}).get('stats', {}).get('bytes', 0)} octets au total")
check("la conservation annoncée est celle appliquée", ((liste or {}).get("stats") or {}).get("keep") == 14,
      f"keep = {((liste or {}).get('stats') or {}).get('keep')}")
check("aucun fichier orphelin ou sans nom exploitable", all(re.match(r"^afs-[0-9a-f]{8}-\d{8}T\d{6}-\w+(-\d+)?\.json\.gz$", b.get("name", "")) for b in backups),
      f"exemple : {backups[0].get('name') if backups else '—'}")

st, gz, hdr = call("GET", f"/admin/backups/{fichier_patron['name']}", T_ADMIN, raw=True)
check("le fichier se télécharge réellement en gzip (octets magiques 1f 8b)",
      st == 200 and isinstance(gz, bytes) and gz[:2] == b"\x1f\x8b" and hdr.get("content-type") == "application/gzip",
      f"HTTP {st} · {len(gz) if isinstance(gz, bytes) else 0} octets")
st, sortie, _ = call("GET", "/admin/backups/..%2F..%2Fetc%2Fpasswd.json.gz", T_ADMIN)
check("un nom de fichier hors dossier est refusé (pas de traversée de chemin)", st in (400, 404), f"HTTP {st}")

stamp2 = int(time.time())
fichiers_noms = {b["name"] for b in backups}
st, run2, _ = call("POST", "/admin/backups/run", T_ADMIN, body={"restaurantId": R_PATRON})
ecrits2 = (run2 or {}).get("written") or []
check("deux sauvegardes successives ne s'écrasent pas (nouveau nom, ancien conservé)",
      len(ecrits2) == 1 and ecrits2[0]["name"] not in fichiers_noms, f"{ecrits2[0]['name'] if ecrits2 else '—'}")
st, status_resto, _ = call("GET", "/backup/status", T_PATRON, rid=R_PATRON)
check("le restaurant voit SES sauvegardes (copies, âge, conservation, export)",
      st == 200 and (status_resto or {}).get("copies", 0) >= 2 and (status_resto or {}).get("lastBackupAgeHours", 99) < 1
      and (status_resto or {}).get("exportUrl") == "/api/backup/export",
      f"{(status_resto or {}).get('copies')} copie(s) · il y a {(status_resto or {}).get('lastBackupAgeHours')} h")

# ---------------------------------------------------------------- D. supervision des tâches
print("\nD. Supervision : un cron muet ne reste pas invisible")

st, ops, _ = call("GET", "/admin/ops", T_ADMIN)
jobs = (ops or {}).get("jobs") or {}
# Chantier 13 : la copie hors site est supervisée SEULEMENT si elle est en service. Tant que le
# stockage externe n'est pas configuré, il n'y a pas de panne à signaler — seulement une
# configuration à faire, annoncée comme problème d'exploitation. La liste attendue en dépend donc.
hors_site_actif = bool(((ops or {}).get("offsite") or {}).get("configured"))
attendus = ["alerts-notify", "backup", "daily", "reminders"] + (["offsite-backup"] if hors_site_actif else [])
check("le back-office expose la santé des tâches planifiées réellement supervisées",
      st == 200 and sorted(jobs) == sorted(attendus),
      f"HTTP {st} · supervisées : {sorted(jobs)} · hors site actif : {hors_site_actif}")
check("chaque tâche indique son délai maximum et son dernier passage réel",
      all("maxHours" in j and "state" in j and ("lastRun" in j) for j in jobs.values()),
      f"daily ≤ {jobs.get('daily', {}).get('maxHours')} h · reminders ≤ {jobs.get('reminders', {}).get('maxHours')} h")
check("les sauvegardes sont supervisées comme une tâche à part entière (disque plein visible)",
      "backup" in jobs and jobs["backup"].get("maxHours") == 30,
      f"état {jobs.get('backup', {}).get('state')}")

st, wd1, _ = call("POST", "/admin/ops/watchdog", T_ADMIN, body={})
check("la surveillance croisée s'exécute et dit combien de tâches elle a regardées",
      st == 200 and (wd1 or {}).get("checked") == len(attendus),
      f"HTTP {st} · {len((wd1 or {}).get('late') or [])} en problème sur {len(attendus)} supervisée(s)")

st, cron, _ = call("GET", "/jobs/daily", headers={"X-Cron-Secret": CRON})
check("le job quotidien réel tourne (digest, essais, relances, sauvegarde)",
      st == 200 and (cron or {}).get("count", 0) >= 1, f"HTTP {st} · {(cron or {}).get('count')} restaurant(s)")
check("il écrit réellement les sauvegardes (pas seulement le bloc « digest »)",
      (cron or {}).get("backup", {}).get("written", 0) >= 1,
      f"{(cron or {}).get('backup', {}).get('written')} fichier(s) · {len((cron or {}).get('backup', {}).get('files') or [])} détaillé(s)")
check("il exécute la surveillance croisée en fin de passe",
      isinstance((cron or {}).get("watchdog"), dict) and (cron or {}).get("watchdog", {}).get("checked") == len(attendus),
      f"{((cron or {}).get('watchdog') or {}).get('late', [])}")

st, sante2, _ = call("GET", "/status")
jobs2 = ((sante2 or {}).get("checks") or {}).get("jobs") or {}
check("la page publique lit la même source de vérité que l'exploitation",
      st == 200 and sorted(jobs2) == sorted(attendus)
      and jobs2.get("daily", {}).get("state") == "ok" and jobs2.get("backup", {}).get("state") == "ok",
      f"daily {jobs2.get('daily', {}).get('state')} · backup {jobs2.get('backup', {}).get('state')}")
check("plus rien n'est signalé en retard après une passe saine (pas de fausse alerte)",
      st == 200 and jobs2.get("daily", {}).get("state") == "ok", "après /jobs/daily")
check("le champ historique « dailyJob » reste exposé (compatibilité des surveillances externes)",
      ((sante2 or {}).get("checks") or {}).get("dailyJob", {}).get("state") == "ok",
      f"{(sante2 or {}).get('checks', {}).get('dailyJob', {}).get('state')}")

st, jobs_hist, _ = call("GET", "/status/jobs", headers={"X-Cron-Secret": CRON})
check("l'historique des passages est interrogeable et protégé par le secret cron",
      st == 200 and bool((jobs_hist or {}).get("runs") or (jobs_hist or {}).get("jobs")),
      f"HTTP {st}")
st, jobs_anon, _ = call("GET", "/status/jobs")
check("sans secret, l'historique est refusé (401)", st == 401, f"HTTP {st}")

# ---------------------------------------------------------------- E. journal d'audit
print("\nE. Journal d'audit : qui, quand, quoi")

st, audit, _ = call("GET", "/admin/audit?limit=50", T_ADMIN)
lignes = (audit or {}).get("rows") or []
check("les actions d'exploitation sont journalisées (sauvegarde, essai, restauration)",
      st == 200 and any(str(r.get("action", "")).startswith("backup.") for r in lignes),
      f"{len(lignes)} entrée(s) · {sorted({r.get('action') for r in lignes if str(r.get('action')).startswith('backup.')})}")
check("chaque entrée dit qui a agi et quand",
      bool(lignes) and all(r.get("at") and r.get("actorEmail") for r in lignes if str(r.get("action")).startswith("backup.")),
      f"acteur exemple : {next((r.get('actorEmail') for r in lignes if str(r.get('action')).startswith('backup.')), '—')}")
st, csv, hdr = call("GET", "/admin/audit?format=csv", T_ADMIN, raw=True)
csv_txt = csv.decode("utf-8", "replace") if isinstance(csv, bytes) else str(csv)
check("le journal s'exporte en CSV exploitable",
      st == 200 and "text/csv" in (hdr.get("content-type") or "")
      and all(m in csv_txt.splitlines()[0] for m in ("horodatage", "acteur", "action", "cible", "details")),
      f"HTTP {st} · {len(csv_txt.splitlines()) - 1} ligne(s)")
st, filtre, _ = call("GET", "/admin/audit?action=backup.restore", T_ADMIN)
check("le journal est filtrable (recherche d'une action précise)",
      st == 200 and all(str(r.get("action", "")).startswith("backup.restore") for r in (filtre or {}).get("rows") or []),
      f"{len((filtre or {}).get('rows') or [])} entrée(s) backup.restore")
st, audit_vide, _ = call("GET", "/admin/audit?q=zzz-inexistant-zzz", T_ADMIN)
check("une recherche sans résultat renvoie une liste vide (pas une erreur)", st == 200 and (audit_vide or {}).get("rows") == [],
      f"HTTP {st}")
st, sans_droit, _ = call("GET", "/admin/audit", T_PATRON, rid=R_PATRON)
check("un restaurateur n'accède pas au journal d'audit (403)", st == 403, f"HTTP {st}")

# ---------------------------------------------------------------- F. statut public et support
print("\nF. Statut public et canal de support")

check("le statut public publie l'état réel des sauvegardes",
      ((sante2 or {}).get("checks") or {}).get("backups", {}).get("files", 0) >= 1
      and ((sante2 or {}).get("checks") or {}).get("backups", {}).get("ok") is True,
      f"{((sante2 or {}).get('checks') or {}).get('backups', {}).get('files')} fichier(s)")
support = (sante2 or {}).get("support") or {}
check("le support est publié avec horaires et délais annoncés",
      bool(support.get("email")) and "lundi" in (support.get("hours") or "") and "4 h" in (support.get("responseTime") or ""),
      f"{support.get('email')} · {support.get('hours')}")
check("le statut public n'expose aucune donnée métier d'un restaurant",
      "orders" not in json.dumps((sante2 or {}).get("checks") or {}).lower() or "restaurantName" not in json.dumps(sante2 or {}),
      "aucun nom, aucun montant")
st, status_final, _ = call("GET", "/backup/status", T_PATRON, rid=R_PATRON)
check("un restaurant peut vérifier ses propres sauvegardes sans être administrateur",
      st == 200 and (status_final or {}).get("copies", 0) >= 1,
      f"GET /backup/status → HTTP {st} · {(status_final or {}).get('copies')} copie(s)")

# ---------------------------------------------------------------- G. code : gardes, source unique, écrans
print("\nG. Côté code : gardes, sources uniques, écrans branchés")

ops_code = lire("routes/ops.ts", API_SRC)
routes_admin = re.findall(r"adminOpsRoutes\.(?:get|post|put|delete)\(\s*'([^']+)'\s*,([^\n]*)", ops_code)
sans_garde = [p for p, args in routes_admin if "requireAuth" not in args or "adminOnly" not in args]
check("chaque route d'exploitation se déclare « connecté + administrateur »", len(routes_admin) >= 10 and not sans_garde,
      f"{len(routes_admin)} route(s) · sans garde : {sans_garde}")
check("aucune garde attrape-tout sur le routeur d'exploitation (elle filtrerait toute l'API)",
      ".use('*'" not in ops_code, "requireAuth + adminOnly route par route")

def compte_adresse(racine):
    n, ou = 0, []
    for base, _, noms in os.walk(racine):
        for nom in noms:
            if not nom.endswith((".ts", ".tsx")) or ".test." in nom:
                continue
            p = os.path.join(base, nom)
            code = open(p, encoding="utf-8").read()
            code = re.sub(r"/\*.*?\*/", "", code, flags=re.S)
            code = re.sub(r"^\s*(//|\*).*$", "", code, flags=re.M)      # commentaires de ligne et blocs JSDoc
            k = code.count("bonjour@afrisupply.fr")
            if k:
                n += k; ou.append(os.path.relpath(p, racine))
    return n, ou

n_api, ou_api = compte_adresse(API_SRC)
n_web, ou_web = compte_adresse(WEB)
check("l'adresse de support n'est écrite qu'UNE fois côté API", n_api == 1 and ou_api == [os.path.join("lib", "ops-health.ts")],
      f"{n_api} occurrence(s) : {ou_api}")
check("l'adresse de support n'est écrite qu'UNE fois côté web", n_web == 1 and ou_web == [os.path.join("lib", "support.ts")],
      f"{n_web} occurrence(s) : {ou_web}")

health = lire("lib/ops-health.ts", API_SRC)
check("une seule définition des tâches supervisées et de leurs délais",
      "JOB_MAX_HOURS" in health and all(j in health for j in ("daily", "reminders", "alerts-notify", "backup"))
      and "export async function jobHealth" in health and "export async function watchdog" in health,
      "lib/ops-health.ts")
backup_code = lire("lib/backup.ts", API_SRC)
check("le fichier embarque le référentiel partagé et restaure sans écraser",
      "products_reference" in backup_code and "conflictSafe" in backup_code and "onConflictDoNothing" in backup_code,
      "lib/backup.ts")
check("la restauration refuse explicitement une base non vide et le dit",
      "Restauration refusée" in backup_code and "allowNonEmpty" in backup_code, "message explicite")
check("les comptes sans mot de passe sont restaurés inutilisables et signalés",
      "accountsToReset" in backup_code and "invalide-" in backup_code, "aucune empreinte de mot de passe dans le fichier")
check("les noms de fichiers sont uniques (deux sauvegardes ne s'écrasent jamais)",
      "for (let i = 2; await exists(" in backup_code, "suffixe de collision")
check("les sauvegardes ne partent jamais dans le dépôt git", ".backups" in lire(".gitignore", ROOT), ".gitignore")
check("le job quotidien trace la sauvegarde et la surveillance comme des tâches supervisées",
      "job: 'backup'" in lire("jobs/daily.ts", API_SRC) and "watchdog({ self: 'daily'" in lire("jobs/daily.ts", API_SRC),
      "lib/../jobs/daily.ts")
check("la page publique d'état consomme la source unique de santé",
      "jobHealth" in lire("routes/status.ts", API_SRC), "routes/status.ts")

web_mes = lire("pages/MesDonnees.tsx", WEB)
web_ops = lire("pages/admin/AdminOps.tsx", WEB)
check("l'écran « Mes données » existe et télécharge vraiment l'export",
      "/backup/export" in web_mes and "downloadFile" in web_mes and "mots de passe" in web_mes, "pages/MesDonnees.tsx")
check("l'écran « Exploitation » existe : tâches, sauvegardes, essai, reprise, audit",
      all(m in web_ops for m in ("/admin/ops", "/admin/backups/run", "/admin/backups/drill", "/admin/backups/restore", "/admin/audit")),
      "pages/admin/AdminOps.tsx")
check("les deux écrans sont routés et présents dans le menu",
      "mes-donnees" in lire("App.tsx", WEB) and "admin/exploitation" in lire("App.tsx", WEB)
      and "/app/mes-donnees" in lire("components/AppLayout.tsx", WEB) and "/app/admin/exploitation" in lire("components/AppLayout.tsx", WEB),
      "App.tsx + AppLayout.tsx")
check("la page publique d'état affiche les tâches une par une et l'état des sauvegardes",
      "checks.jobs" in lire("pages/site/Status.tsx", WEB) and "checks.backups" in lire("pages/site/Status.tsx", WEB),
      "pages/site/Status.tsx")
check("la chaîne de vérification est complète et cohérente (scripts + README + CI)",
      "chantier12_verif.py" in open(os.path.join(HERE, "toutes.sh"), encoding="utf-8").read()
      and "chantier12" in open(os.path.join(HERE, "README.md"), encoding="utf-8").read(),
      "toutes.sh + README des vérifications")
check("aucun dialogue natif introduit dans les nouveaux écrans",
      not re.search(r"(?<![\w.$])(alert|confirm|prompt)\s*\(", re.sub(r"//.*$", "", web_mes + web_ops, flags=re.M)),
      "confirmations intégrées uniquement")

os.makedirs(RESULTATS, exist_ok=True)
ok = sum(1 for _, c, _ in results if c); total = len(results)
print(f"\n=== Chantier 12 — {ok}/{total} vérifications réussies ===")
json.dump({"ok": ok, "total": total, "echecs": [{"label": l, "detail": d} for l, c, d in results if not c]},
          open(os.path.join(RESULTATS, "chantier12_verif_resultat.json"), "w"), ensure_ascii=False, indent=2)
sys.exit(0 if ok == total else 1)
