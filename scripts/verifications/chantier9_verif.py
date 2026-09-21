#!/usr/bin/env python3
"""Chantier 9 (audit AFRISUPPLY) — prévision robuste : « elle ne doit jamais être absente ».

Ce que ce script prouve sur des API réelles (aucune valeur inventée) :

  A. la cascade de sources fonctionne de bout en bout, dans l'ordre annoncé :
     aucune donnée → « seuils » ; couverts renseignés → « couverts » ; quelques ventes → « ventes 7 j » ;
     historique suffisant → « ventes 28 j » (+ la source est renvoyée dans chaque ligne de l'API) ;
  B. aucune donnée ⇒ aucun besoin inventé (besoin 0, commande limitée au seuil critique) ;
  C. les jours de fermeture sont réellement exclus du besoin ;
  D. la saisonnalité (mois de pleine activité) majore réellement la prévision, et le coefficient est visible ;
  E. la relance graduée des ventes non saisies existe : rappel doux à J+1/J+2 (sans e-mail) et relance ferme
     à J+3 (avec e-mail), sans doublon dans la journée ;
  F. le cas normal (ventes réelles saisies) n'a pas été dégradé : source « ventes 28 j » sur la démo ;
  G. les écrans web exposent la source et les réglages de saisonnalité ;
  H. un lot de plus de 8 alertes urgentes part ENTIER par e-mail (aucune alerte silencieusement écartée).

Usage : AFS_API=http://localhost:8787/api AFS_WEB=http://localhost:3000 python3 chantier9_verif.py
"""
import json, os, shutil, signal, socket, subprocess, sys, time
import urllib.error, urllib.parse, urllib.request

OK = lambda b: "\033[32mOK\033[0m" if b else "\033[31mÉCHEC\033[0m"
results = []


def check(label, cond, detail=""):
    results.append((label, bool(cond), detail))
    print(f"  [{OK(cond)}] {label}" + (f" — {detail}" if detail else ""))
    return cond


def call(base, method, path, token=None, body=None, rid=None, cron=False):
    req = urllib.request.Request(base + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    if rid: req.add_header("X-Restaurant-Id", rid)
    if cron: req.add_header("X-Cron-Secret", "dev-cron")
    data = None
    if body is not None:
        data = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=60) as r:
            b = r.read(); return r.status, (json.loads(b) if b else None), dict(r.headers)
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b"null"), dict(e.headers)
        except Exception: return e.code, b.decode("utf-8", "replace")[:300], dict(e.headers)


def call_retry(base, method, path, token=None, body=None, rid=None, tries=3, wait=65):
    for i in range(tries):
        st, data, hdr = call(base, method, path, token, body, rid)
        if st != 429: return st, data, hdr
        if i < tries - 1:
            delay = min(int((hdr or {}).get("Retry-After") or wait), 90)
            print(f"      · limitation de débit (429) sur {method} {path} — nouvelle tentative dans {delay} s")
            time.sleep(delay)
    return st, data, hdr


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def register(base, email, name):
    return call_retry(base, "POST", "/auth/register",
                      body={"email": email, "password": "Plantain-Yassa-42", "fullName": "Testeur Prévision", "restaurantName": name, "city": "Nantes"})


def iso(offset_days=0):
    return time.strftime("%Y-%m-%d", time.gmtime(time.time() + offset_days * 86_400))


def dow_of(day: str) -> int:
    return time.strptime(day, "%Y-%m-%d").tm_wday  # 0 = lundi (Python) ; 6 = dimanche


# Racine du dépôt trouvée en remontant depuis ce fichier (les vérifications vivent dans scripts/verifications).
def _repo_root(start):
    p = os.path.abspath(start)
    while p != os.sep and not os.path.isdir(os.path.join(p, "apps")):
        p = os.path.dirname(p)
    return p

RESULTATS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resultats")
os.makedirs(RESULTATS, exist_ok=True)
ROOT = _repo_root(os.path.dirname(os.path.abspath(__file__)))
REPO = ROOT
MAIN = os.environ.get("AFS_API", "http://localhost:8787/api")
WEB = os.environ.get("AFS_WEB", "http://localhost:3000")
PGLITE = "/tmp/afs-pglite-forecast9"
OUTBOX = "/tmp/afs-outbox-forecast9"
API_PORT = free_port(); API = f"http://127.0.0.1:{API_PORT}/api"

print("\n=== Chantier 9 — prévision robuste (cascade, fermetures, saisonnalité, relance) ===\n")
shutil.rmtree(PGLITE, ignore_errors=True); shutil.rmtree(OUTBOX, ignore_errors=True); os.makedirs(OUTBOX, exist_ok=True)

env = dict(os.environ)
env.update({
    "PORT": str(API_PORT), "PGLITE_DIR": PGLITE, "SEED_DEMO": "true", "JWT_SECRET": "dev-secret-local-c9",
    "CRON_SECRET": "dev-cron", "ADMIN_EMAILS": "admin@afrisupply.fr", "APP_URL": "http://localhost:3000",
    "MAIL_OUTBOX_DIR": OUTBOX, "NODE_ENV": "development", "VENDOR_AUTO_APPROVE": "true",
})
env.pop("VERCEL", None)
log = open("/tmp/afs-api-forecast9.log", "wb")
api = subprocess.Popen(["npm", "exec", "tsx", "apps/api/src/server.ts"], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)


def wait_api(base, tries=90):
    for _ in range(tries):
        try:
            if call(base, "GET", "/health")[0] == 200: return True
        except Exception: pass
        time.sleep(1)
    return False


try:
    check("instance de vérification démarrée (base vierge + démo)", wait_api(API), API)
    check("instance principale joignable (démo)", wait_api(MAIN), MAIN)
    stamp = int(time.time())

    # ------------------------------------------------------------------ A/B. cascade
    print("\nA. Cascade : aucune donnée → couverts → ventes récentes → ventes 28 j")
    st, acc, _ = register(API, f"c9-patron-{stamp}@audit.fr", f"Chez Prévision {stamp}")
    TOK, RID = acc["token"], acc["restaurant"]["id"]
    st, tpl, _ = call(API, "GET", "/onboarding/templates", TOK, rid=RID)
    names = [t["name"] for t in (tpl.get("templates") if isinstance(tpl, dict) else tpl)][:3]
    st, applied, _ = call(API, "POST", "/onboarding/apply", TOK, body={"templates": names}, rid=RID)
    check("carte et stock installés (modèles de recettes)", st == 200, f"{len(names)} modèle(s) : {', '.join(names)}")
    st, f0, _ = call(API, "GET", "/forecast", TOK, rid=RID)
    dq0 = f0.get("dataQuality", {}) if st == 200 else {}
    check("la réponse expose la qualité des données (dernière saisie, couverts, sources)",
          st == 200 and {"salesDays", "lastSaleDay", "daysSinceLastSale", "sources"} <= set(dq0), json.dumps(dq0.get("sources", {}), ensure_ascii=False))
    check("sans aucune donnée : source annoncée « seuils » (aucune invention)",
          dq0.get("sources", {}).get("seuils", 0) > 0 and dq0.get("sources", {}).get("ventes_28j", 0) == 0)
    produits_recette = [p for p in f0.get("products", []) if "aucune recette" not in p["explanation"]]
    check("sans aucune donnée : besoin prédit nul pour les produits qui composent des recettes",
          produits_recette and all(p["predictedNeed"] == 0 for p in produits_recette), f"{len(produits_recette)} produit(s) en recette")
    check("la commande recommandée ne dépasse jamais le seuil critique quand il n’y a aucune donnée",
          all(p["recommendedOrder"] <= max(0, p["safetyStock"] - p["currentStock"]) + 0.01 for p in f0.get("products", [])))

    call(API, "PUT", "/settings", TOK, body={"coversPerDay": 120}, rid=RID)
    st, f1, _ = call(API, "GET", "/forecast", TOK, rid=RID)
    couverts = [p for p in f1["products"] if p["basis"] == "couverts"]
    check("couverts renseignés → source « couverts » et besoin non nul", st == 200 and couverts and couverts[0]["predictedNeed"] > 0,
          f"{len(couverts)} produit(s), besoin {couverts[0]['predictedNeed'] if couverts else '?'}")
    check("l’explication dit qu’il s’agit d’une estimation de repli",
          couverts and "Estimation de repli" in couverts[0]["explanation"] and "couverts" in couverts[0]["explanation"])
    besoin_couverts = couverts[0]["predictedNeed"] if couverts else 0

    recette = (f0.get("recipes") or [{}])[0].get("recipeId")
    call(API, "POST", "/sales", TOK, body={"day": iso(-2), "lines": [{"recipeId": recette, "portions": 30}], "decrementStock": False}, rid=RID)
    st, f2, _ = call(API, "GET", "/forecast", TOK, rid=RID)
    sept = [p for p in f2["products"] if p["basis"] == "ventes_7j"]
    check("quelques ventes récentes → source « ventes 7 j », confiance 45 %",
          sept and sept[0]["confidence"] == 0.45 and sept[0]["predictedNeed"] > 0, f"{len(sept)} produit(s)")

    for d in (-9, -16, -23):
        call(API, "POST", "/sales", TOK, body={"day": iso(d), "lines": [{"recipeId": recette, "portions": 25 + d % 5}], "decrementStock": False}, rid=RID)
    st, f3, _ = call(API, "GET", "/forecast", TOK, rid=RID)
    vingt_huit = [p for p in f3["products"] if p["basis"] == "ventes_28j"]
    check("historique suffisant → source « ventes 28 j » (retour au cas nominal)",
          vingt_huit and vingt_huit[0]["confidence"] >= 0.55, f"{len(vingt_huit)} produit(s), confiance {vingt_huit[0]['confidence'] if vingt_huit else '?'}")
    check("le nombre de jours de ventes est désormais annoncé par l’API", f3["dataQuality"]["salesDays"] == 4 and f3["dataQuality"]["daysSinceLastSale"] == 2,
          f"salesDays={f3['dataQuality']['salesDays']}, jours depuis la dernière saisie={f3['dataQuality']['daysSinceLastSale']}")

    # ------------------------------------------------------------------ C. jours de fermeture
    print("\nC. Jours de fermeture exclus de la prévision")
    demain = iso(1); dow_demain = (dow_of(demain) + 1) % 7  # 0 = dimanche, comme côté API
    avant = next((p for p in f3["products"] if p["basis"] == "ventes_28j"), f3["products"][0])
    call(API, "PUT", "/settings", TOK, body={"closedWeekdays": [dow_demain]}, rid=RID)
    st, f4, _ = call(API, "GET", "/forecast", TOK, rid=RID)
    apres = next(p for p in f4["products"] if p["productId"] == avant["productId"])
    check("le jour de fermeture est annoncé par l’API", f4["dataQuality"]["closedWeekdays"] == [dow_demain], f"weekday={dow_demain}")
    check("besoin du jour de fermeture ramené à zéro", apres["perDay"][0] == 0 and avant["perDay"][0] > 0,
          f"avant {avant['perDay'][0]} → après {apres['perDay'][0]}")
    check("le besoin total baisse (le jour fermé n’est plus compté)", apres["predictedNeed"] < avant["predictedNeed"],
          f"{avant['predictedNeed']} → {apres['predictedNeed']}")
    call(API, "PUT", "/settings", TOK, body={"closedWeekdays": []}, rid=RID)

    # ------------------------------------------------------------------ D. saisonnalité
    print("\nD. Saisonnalité : mois de pleine activité réellement appliqués")
    st, s_avant, _ = call(API, "GET", "/forecast", TOK, rid=RID)
    ref = next(p for p in s_avant["products"] if p["predictedNeed"] > 0)
    mois = int(iso().split("-")[1])
    st, saved, _ = call(API, "PUT", "/settings", TOK, body={"peakMonths": [mois], "peakCoef": 1.5}, rid=RID)
    check("réglage de saisonnalité accepté et enregistré", st == 200 and saved.get("settings", {}).get("peakMonths") == [mois],
          json.dumps(saved.get("settings", {}).get("peakMonths", []), ensure_ascii=False))
    st, s_apres, _ = call(API, "GET", "/forecast", TOK, rid=RID)
    apres_ref = next(p for p in s_apres["products"] if p["productId"] == ref["productId"])
    ratio = apres_ref["predictedNeed"] / ref["predictedNeed"] if ref["predictedNeed"] else 0
    check("le besoin du mois de pleine activité est majoré (×1,5)", 1.4 <= ratio <= 1.6, f"{ref['predictedNeed']} → {apres_ref['predictedNeed']} (×{round(ratio, 3)})")
    check("l’API annonce le mois et le coefficient appliqués", s_apres["dataQuality"]["peakMonths"] == [mois] and s_apres["dataQuality"]["peakCoef"] == 1.5)
    call(API, "PUT", "/settings", TOK, body={"peakMonths": [], "peakCoef": 1.2}, rid=RID)

    # ------------------------------------------------------------------ E. relance graduée
    print("\nE. Relance graduée des ventes non saisies")
    st, acc2, _ = register(API, f"c9-vierge-{stamp}@audit.fr", f"Chez Vierge {stamp}")
    TOK2, RID2 = acc2["token"], acc2["restaurant"]["id"]
    st, run1, _ = call(API, "POST", f"/jobs/daily?secret=dev-cron", None)
    check("le job quotidien tourne (relance + alertes + mail du matin)", st == 200 and run1.get("count", 0) >= 2, f"HTTP {st}, {run1.get('count')} restaurant(s)")
    st, al1, _ = call(API, "GET", "/alerts", TOK2, rid=RID2)
    saisie1 = [a for a in (al1.get("alerts") or []) if a["kind"] == "saisie"]
    fermes = [a for a in saisie1 if a["severity"] == "orange"]
    check("compte sans aucune vente : relance ferme (orange) créée", bool(fermes) and "vente" in fermes[0]["title"].lower(),
          fermes[0]["title"] if fermes else "aucune")
    st, al2, _ = call(API, "GET", "/alerts", TOK, rid=RID)
    douces = [a for a in (al2.get("alerts") or []) if a["kind"] == "saisie" and a["severity"] == "blue"]
    check("dernière saisie il y a 2 jours : rappel doux créé (bleu, dans l’application seulement)",
          douces and "saisir vos ventes" in douces[0]["title"].lower(), douces[0]["title"] if douces else "aucun")
    check("le rappel doux renvoie bien à l’écran de saisie des ventes", douces and douces[0]["actionUrl"] == "/app/ventes")
    # L'alerte créée par le job du matin part par e-mail au passage suivant (cron horaire / balayage opportuniste) :
    # on déclenche cette passe, c'est exactement ce qui se passe en production dans l'heure.
    st, rem, _ = call(API, "POST", "/jobs/reminders?secret=dev-cron", None)
    check("la passe de relances/notifications tourne", st == 200 and "notifications" in rem, f"HTTP {st}")
    textes = [open(os.path.join(OUTBOX, f), encoding="utf-8", errors="replace").read() for f in os.listdir(OUTBOX) if f.endswith(".txt")]
    check("la relance ferme part par e-mail", any("Ventes non saisies" in t or "Aucune vente saisie" in t for t in textes),
          f"{len(textes)} e-mail(s) écrit(s)")
    urgent = [t for t in textes if "alertes urgentes" in t]
    check("le rappel doux ne déclenche aucun e-mail urgent (pas de spam quotidien)",
          not any("Pensez à saisir vos ventes" in t for t in urgent), f"{len(urgent)} e-mail(s) d’alerte urgente")
    check("le mail du matin rappelle aussi la saisie des ventes quand elle manque",
          any("Ventes d’hier non saisies" in t for t in textes))
    st, run2, _ = call(API, "POST", f"/jobs/daily?secret=dev-cron", None)
    st, al3, _ = call(API, "GET", "/alerts", TOK, rid=RID)
    douces2 = [a for a in (al3.get("alerts") or []) if a["kind"] == "saisie" and a["severity"] == "blue"]
    check("deuxième passage le même jour : aucun doublon de rappel", len(douces2) == len(douces), f"{len(douces)} → {len(douces2)}")
    st, jobs, _ = call(API, "GET", "/status/jobs?limit=50", None, cron=True)
    runs = (jobs.get("runs") if isinstance(jobs, dict) else jobs) or []
    daily = [j for j in runs if j.get("job") in ("daily", "digest")] if st == 200 else []
    check("chaque passage de job est supervisable dans /status/jobs (secret cron)", bool(daily), f"{len(daily)} passage(s) enregistré(s)")

    # ------------------------------------------------------------------ F. cas nominal sur la démo
    print("\nF. Le cas nominal (ventes réellement saisies) reste intact sur la démo")
    st, demo, _ = call(MAIN, "POST", "/auth/login", body={"email": "awa@chezawa.fr", "password": "demo1234"})
    TOKD = demo.get("token")
    st, me, _ = call(MAIN, "GET", "/auth/me", TOKD)
    RIDD = me["restaurants"][0]["id"]
    st, fd, _ = call(MAIN, "GET", "/forecast", TOKD, rid=RIDD)
    src = fd.get("dataQuality", {}).get("sources", {}) if st == 200 else {}
    check("la démo garde une prévision calculée sur les ventes réelles",
          st == 200 and src.get("ventes_28j", 0) > 0, json.dumps(src, ensure_ascii=False))
    check("la qualité des données est publiée (jours de ventes, dernière saisie)",
          fd.get("dataQuality", {}).get("salesDays", 0) > 0 and fd["dataQuality"].get("lastSaleDay") is not None,
          f"{fd['dataQuality'].get('salesDays')} jour(s), dernière saisie {fd['dataQuality'].get('lastSaleDay')}")
    check("chaque ligne porte une source reconnue",
          all(p.get("basis") in ("ventes_28j", "ventes_7j", "couverts", "seuils") for p in fd.get("products", [])),
          ", ".join(sorted({str(p.get('basis')) for p in fd.get('products', [])})))

    # ------------------------------------------------------------------ G. écrans
    print("\nG. Écrans web")
    for path, needle, label in [
        ("apps/web/src/pages/Forecast.tsx", "Seuils seulement", "l’écran Prévision nomme la source la plus faible"),
        ("apps/web/src/pages/Forecast.tsx", "D’où viennent ces chiffres ?", "l’écran Prévision explique la cascade"),
        ("apps/web/src/pages/Forecast.tsx", "saison ×", "le coefficient de saisonnalité est visible"),
        ("apps/web/src/pages/Settings.tsx", "Mois de pleine activité", "les mois de pleine activité sont réglables"),
        ("apps/web/src/pages/Settings.tsx", "Jours de fermeture", "les jours de fermeture sont réglables"),
    ]:
        try:
            body = open(os.path.join(ROOT, path), encoding="utf-8").read()
            check(f"{label}", needle in body)
        except Exception as e:
            check(f"{label}", False, str(e)[:80])

    # ------------------------------------------------------------------ H. lot d'alertes urgentes
    print("\nH. Envoi immédiat d'un lot : aucune alerte urgente écartée")
    st, acc3, _ = register(API, f"c9-lot-{stamp}@audit.fr", f"Chez Lot {stamp}")
    TOK3, RID3 = acc3["token"], acc3["restaurant"]["id"]
    st, tpl3, _ = call(API, "GET", "/onboarding/templates", token=TOK3, rid=RID3)
    call(API, "POST", "/onboarding/apply", token=TOK3, rid=RID3,
         body={"templates": [x.get("id") or x.get("name") for x in tpl3["templates"]][:1]})
    st, stk, _ = call(API, "GET", "/stock", token=TOK3, rid=RID3)
    items = (stk.get("items") or [])[:10]
    check("10 produits disponibles pour l'essai", len(items) == 10, f"{len(items)} article(s)")
    for it in items:
        call(API, "POST", f"/stock/{it['id']}/movements", token=TOK3, rid=RID3,
             body={"type": "ajustement", "quantity": 0, "note": "vérification lot d'alertes"})
    st, ref3, _ = call(API, "POST", "/alerts/refresh", token=TOK3, rid=RID3, body={})
    rups = [a for a in (ref3.get("alerts") or []) if a.get("kind") == "rupture"]
    check("plus de 8 ruptures en attente d'annonce (le cas qui en écartait une)",
          len(rups) > 8, f"{len(rups)} ruptures")
    annoncees = [a for a in rups if a.get("notifiedAt")]
    check("aucune rupture du lot n'est laissée de côté",
          bool(rups) and len(annoncees) == len(rups), f"{len(annoncees)}/{len(rups)} annoncées")
    mails3 = [open(os.path.join(OUTBOX, f), encoding="utf-8", errors="replace").read()
              for f in os.listdir(OUTBOX) if f.endswith(".txt")]
    lot = [t for t in mails3 if "Rupture imminente" in t]
    complet = next((t for t in lot if all(a["title"] in t for a in rups)), "")
    manquantes = [a["title"] for a in rups if a["title"] not in complet]
    check("toutes les ruptures du lot figurent dans l'e-mail envoyé",
          bool(rups) and not manquantes,
          f"{len(rups) - len(manquantes)}/{len(rups)} titres présents" + (f" — absents : {manquantes[:3]}" if manquantes else ""))

finally:
    try:
        os.killpg(os.getpgid(api.pid), signal.SIGTERM)
    except Exception:
        api.terminate()
    time.sleep(1); log.close()

ok = sum(1 for _, c, _ in results if c); total = len(results)
print(f"\n=== Chantier 9 — {ok}/{total} vérifications réussies ===")
print(f"    preuves : {OUTBOX} (relances réellement écrites) — journal API : /tmp/afs-api-forecast9.log")
json.dump({"ok": ok, "total": total, "echecs": [{"label": l, "detail": d} for l, c, d in results if not c]},
          open(os.path.join(RESULTATS, "chantier9_verif_resultat.json"), "w"), ensure_ascii=False, indent=2)
sys.exit(0 if ok == total else 1)
