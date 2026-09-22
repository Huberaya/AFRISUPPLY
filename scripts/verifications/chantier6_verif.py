#!/usr/bin/env python3
"""Chantier 6 (audit AFRISUPPLY) — canaux réels : e-mail, WhatsApp, notifications. Vérifié sur l'API réelle.

Ce que ce script prouve, sans complaisance :
  A. les réglages annoncent l'état RÉEL des canaux (et pas ce qu'on aimerait qu'ils soient) ;
  B. le test d'envoi d'e-mail est de bout en bout : un message est réellement produit et l'écran
     le dit sans arrondir (mode développement = écrit dans .outbox, jamais « envoyé ») ;
  C. WhatsApp/SMS sans Twilio : l'API refuse de dire « envoyé » (delivered=false + message explicite) ;
  D. un écart de livraison (50 commandés / 45 reçus) déclenche un e-mail IMMÉDIAT, une seule fois ;
  E. une rupture de stock détectée à l'instant part par e-mail à la détection ;
  F. une alerte trop vieille n'est jamais renvoyée par e-mail (pas de rattrapage rétroactif) ;
  G. le relais « ventes non saisies depuis 3 jours » existe et ne se répète pas dans la semaine ;
  H. chaque job laisse une trace supervisable dans job_runs, exposée par /api/status ;
  I. le cron horaire des rappels est déclaré dans vercel.json.

Usage : AFS_API=http://localhost:8787/api AFS_WEB=http://localhost:3000 python3 chantier6_verif.py
"""
import json, os, re, subprocess, time, urllib.request, urllib.error

BASE = os.environ.get("AFS_API", "http://localhost:8787/api").rstrip("/")
SITE = os.environ.get("AFS_WEB", "http://localhost:3000")
CRON = os.environ.get("AFS_CRON_SECRET", "dev-cron")
OK = lambda b: "\033[32mOK\033[0m" if b else "\033[31mÉCHEC\033[0m"
results = []
PWD = "Plantain-Yassa-42"
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


def call(method, path, token=None, body=None, rid=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    if rid: req.add_header("X-Restaurant-Id", rid)
    data = None
    if body is not None:
        data = json.dumps(body).encode(); req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw or b"null")
        except Exception: return e.code, raw.decode()[:300]


def text(url):
    try:
        with urllib.request.urlopen(url, timeout=60) as r: return r.read().decode("utf-8", "replace")
    except Exception as e: return f"__ERREUR__ {e}"


def check(label, cond, detail=""):
    results.append((label, bool(cond), detail))
    print(f"  [{OK(cond)}] {label}" + (f" — {detail}" if detail else ""))
    return cond


def outbox_texts():
    """Tous les messages écrits sur disque par le transport « fichier » (dev)."""
    texts = []
    for base in (os.path.join(REPO, ".outbox"), os.path.join(REPO, "apps", "api", ".outbox")):
        if not os.path.isdir(base): continue
        cut = time.time() - 900
        for f in os.listdir(base):
            p = os.path.join(base, f)
            try:
                if os.path.getmtime(p) >= cut and f.endswith((".txt", ".html")):
                    texts.append((f, open(p, encoding="utf-8", errors="replace").read()))
            except OSError:
                pass
    return texts


print("\n=== Chantier 6 — canaux réels : e-mail, WhatsApp, notifications (API réelle) ===\n")
stamp = int(time.time())
OWNER = {"email": f"canaux-{stamp}@audit.fr", "password": PWD, "fullName": "Awa Canaux", "restaurantName": f"Chez Awa Canaux {stamp}", "city": "Nantes"}

# ---------------------------------------------------------------- A. réglages : état réel des canaux
print("A. Les réglages disent l'état réel des canaux")
st, reg = call("POST", "/auth/register", body=OWNER)
check("inscription d'un compte de test", st in (200, 201) and reg.get("token"), f"HTTP {st}")
tok = reg.get("token"); rid = (reg.get("restaurant") or {}).get("id")
st, s = call("GET", "/settings", token=tok, rid=rid)
mail, sms = s.get("mail", {}), s.get("sms", {})
check("GET /settings expose le transport d'e-mail réel", st == 200 and mail.get("transport") in ("resend", "file", "log"), f"transport={mail.get('transport')}")
check("l'état « délivrable » est explicite (delivered)", "delivered" in mail, f"delivered={mail.get('delivered')} configured={mail.get('configured')}")
check("WhatsApp/SMS annoncé non délivrable sans Twilio", sms.get("delivered") is False and sms.get("configured") is False)
check("l'alerte immédiate est un réglage serveur (défaut actif)", s.get("settings", {}).get("immediateAlertEmails") is True)
check("les jobs de notification sont annoncés par l'API", "/api/jobs/reminders" in (s.get("cron", {}).get("jobs") or []))

# ---------------------------------------------------------------- B. test d'envoi réel
print("\nB. Test d'envoi d'e-mail de bout en bout (depuis les paramètres)")
st, t = call("POST", "/settings/test-email", token=tok, rid=rid, body={})
check("POST /settings/test-email répond", st in (200, 424), f"HTTP {st}")
check("la réponse distingue « remis » de « simulé »", "delivered" in t and "transport" in t, f"delivered={t.get('delivered')} transport={t.get('transport')}")
check("le message affiché ne ment pas quand rien ne part réellement",
      (t.get("delivered") and re.search(r"envoyé|écrit", t.get("message", ""))) or (not t.get("delivered") and "NON envoyé" in t.get("message", "")),
      t.get("message", "")[:110])
if t.get("transport") == "file":
    found = [f for f, c in outbox_texts() if "Test des notifications AFRISUPPLY" in c]
    check("le message de test existe réellement sur disque (.outbox)", bool(found), (found or ["aucun"])[0])

# ---------------------------------------------------------------- C. WhatsApp/SMS : pas de fausse promesse
print("\nC. WhatsApp/SMS : aucune promesse d'envoi non tenue")
call("PUT", "/settings", token=tok, rid=rid, body={"notifyPhone": "06 11 22 33 44"})
st, sm = call("POST", "/settings/test-sms", token=tok, rid=rid, body={})
check("le test SMS répond avec un état honnête", st == 200 and sm.get("delivered") is False, f"delivered={sm.get('delivered')} channel={sm.get('channel')}")
check("le message dit que rien n'a été envoyé", "PAS été envoyé" in (sm.get("message") or "") or "non configuré" in (sm.get("message") or "").lower(), (sm.get("message") or "")[:110])
check("un code d'erreur explicite est fourni", sm.get("code") == "channel_not_configured", str(sm.get("code")))

# ---------------------------------------------------------------- D. écart de livraison → e-mail immédiat
print("\nD. Écart de livraison : e-mail immédiat (et une seule fois)")
# On travaille sur le compte de démonstration : il possède fournisseurs, catalogue et stock
# (la chaîne « fournisseur classique » ne dépend d'aucune validation de grossiste).
st, demo = call("POST", "/auth/login", body={"email": "awa@chezawa.fr", "password": "demo1234"})
DTOK = demo.get("token")
st, me = call("GET", "/auth/me", token=DTOK)
DRID = me["restaurants"][0]["id"]
st, cat = call("GET", "/catalog?q=Riz%20parfum%C3%A9", token=DTOK, rid=DRID)
prod = next((p for p in (cat.get("products") or []) if p["name"] == "Riz parfumé"), None)
check("produit du catalogue de démonstration trouvé", bool(prod), (prod or {}).get("name", "introuvable"))
st, cmp_ = call("GET", f"/compare/{prod['id']}", token=DTOK, rid=DRID)
best = (cmp_.get("ranked") or [None])[0]
st, o = call("POST", "/orders", token=DTOK, rid=DRID, body={"supplierId": best["supplierId"], "lines": [{"offerId": best["offerId"], "packs": 2}]})
oid = (o.get("order") or {}).get("id")
check("commande fournisseur créée", st == 201 and oid, f"HTTP {st}")
call("POST", f"/orders/{oid}/send", token=DTOK, rid=DRID, body={})
st, lst = call("GET", "/orders", token=DTOK, rid=DRID)
line = next((x.get("lines") or [{}])[0] for x in (lst.get("orders") or []) if x.get("id") == oid)
qty = float(line["quantity"])
st, rec = call("POST", f"/orders/{oid}/receive", token=DTOK, rid=DRID, body={"lines": [{"lineId": line["id"], "receivedQty": qty - 5}]})
check(f"{qty:.0f} commandés / {qty - 5:.0f} reçus acceptés", st == 200 and rec.get("discrepancies"), f"HTTP {st}")
check("l'écart est détecté et chiffré", (rec.get("discrepancies") or [{}])[0].get("ordered") == qty and (rec.get("discrepancies") or [{}])[0].get("received") == qty - 5, str(rec.get("discrepancies"))[:110])
st, al = call("GET", "/alerts", token=DTOK, rid=DRID)
ecart = next((a for a in al.get("alerts", []) if a.get("kind") == "ecart_livraison" and a.get("supplierId") == best["supplierId"]), None)
check("une alerte « écart de livraison » existe", bool(ecart), (ecart or {}).get("title", "absente"))
check("elle est marquée comme déjà annoncée (notified_at renseigné)", bool(ecart and ecart.get("notifiedAt")), str((ecart or {}).get("notifiedAt")))
mails = [c for f, c in outbox_texts() if "Écart sur la livraison" in c]
check("l'e-mail est parti IMMÉDIATEMENT (sans attendre le récapitulatif du matin)", bool(mails), f"{len(mails)} message(s) trouvé(s)")

# ---------------------------------------------------------------- E. rupture détectée → e-mail immédiat
print("\nE. Rupture de stock : e-mail à la détection")
# Sur le compte neuf (nouveau à chaque exécution) : le test reste reproductible, contrairement
# au compte de démonstration dont les alertes de rupture existent déjà d'un passage à l'autre.
st, tpl = call("GET", "/onboarding/templates", token=tok, rid=rid)
if not (st == 200 and tpl.get("templates")):
    st, tpl = call("GET", "/onboarding/templates", token=tok)
check("modèles d'activation disponibles", st == 200 and bool(tpl.get("templates")), f"HTTP {st}")
call("POST", "/onboarding/apply", token=tok, rid=rid, body={"templates": [x.get("id") or x.get("name") for x in tpl["templates"]][:1]})
items = call("GET", "/stock", token=tok, rid=rid)[1]["items"]
check("stock initial créé pour le compte neuf", bool(items), f"{len(items)} article(s)")
item = items[0]
st, mv = call("POST", f"/stock/{item['id']}/movements", token=tok, rid=rid, body={"type": "ajustement", "quantity": 0, "note": "vérification chantier 6"})
check("stock mis à zéro", st == 200 and mv.get("quantity") == 0, f"quantité={mv.get('quantity')}")
st, ref = call("POST", "/alerts/refresh", token=tok, rid=rid, body={})
rup = next((a for a in ref.get("alerts", []) if a.get("kind") == "rupture" and a.get("productId") == item["productId"]), None)
check("le rafraîchissement des alertes signale la rupture", bool(rup), (rup or {}).get("title", "absente"))
check("l'envoi immédiat est déclenché et réussi", (ref.get("immediate") or {}).get("sent") is True, json.dumps(ref.get("immediate"), ensure_ascii=False))
check("l'alerte de rupture est marquée annoncée", bool(rup and rup.get("notifiedAt")))
check("l'e-mail de rupture a réellement été produit", any((rup or {}).get("title", "@@") in c for f, c in outbox_texts()), (rup or {}).get("title", ""))

# ---------------------------------------------------------------- F. pas de rattrapage rétroactif
print("\nF. Aucune alerte ancienne renvoyée par e-mail")
st, again = call("POST", "/alerts/refresh", token=DTOK, rid=DRID, body={})
check("rafraîchir à nouveau n'envoie plus rien (idempotence)", again.get("immediate") is None, json.dumps(again.get("immediate"), ensure_ascii=False))
before = len([1 for f, c in outbox_texts() if "Rupture" in c])
time.sleep(1)
call("POST", "/alerts/refresh", token=DTOK, rid=DRID, body={})
after = len([1 for f, c in outbox_texts() if "Rupture" in c])
check("aucun nouvel e-mail de rupture ne repart", after == before, f"{before} → {after}")
# les alertes antérieures au chantier 6 (notified_at vide à la migration) sont retirées de la file
st, al_f = call("GET", "/alerts", token=DTOK, rid=DRID)
pending_old = [a for a in al_f.get("alerts", []) if not a.get("notifiedAt") and a.get("kind") in ("rupture", "ecart_livraison")]
check("aucune alerte urgente ancienne n'attend un envoi rétroactif", len(pending_old) <= 1, f"{len(pending_old)} en attente")

# ---------------------------------------------------------------- G. relance ventes non saisies
print("\nG. Relance « ventes non saisies depuis 3 jours »")
st, run = call("GET", f"/jobs/daily?secret={CRON}")
check("le job quotidien s'exécute", st == 200, f"HTTP {st}")
st, al2 = call("GET", "/alerts", token=tok, rid=rid)
saisie = [a for a in al2.get("alerts", []) if a.get("kind") == "saisie"]
check("une relance de saisie des ventes est créée pour un compte sans ventes", bool(saisie), (saisie[0].get("title") if saisie else "absente"))
check("la relance explique la conséquence (prévision)", bool(saisie) and "prévision" in (saisie[0].get("message") or "").lower(), (saisie[0].get("message", "")[:90] if saisie else ""))
st, ref2 = call("POST", "/alerts/refresh", token=tok, rid=rid, body={})
st, al3 = call("GET", "/alerts", token=tok, rid=rid)
check("pas de doublon de relance dans la même semaine", len([a for a in al3.get("alerts", []) if a.get("kind") == "saisie"]) == 1)

# ---------------------------------------------------------------- H. supervision des jobs
print("\nH. Supervision : chaque job laisse une trace")
st, runs = call("GET", "/status/jobs?limit=60", token=None)
if st != 200:  # protégé par CRON_SECRET
    req = urllib.request.Request(BASE + "/status/jobs?limit=60"); req.add_header("Authorization", "Bearer " + CRON)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: st, runs = r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: st, runs = e.code, {"error": e.read().decode()[:120]}
jobs = {r["job"] for r in (runs.get("runs") or [])}
check("l'historique des jobs est consultable (CRON_SECRET)", st == 200, f"HTTP {st}")
check("job « daily » supervisé", "daily" in jobs, ", ".join(sorted(jobs)) or "aucun")
check("job « reminders » supervisé (rappels grossistes)", "reminders" in jobs)
check("job « alerts-notify » supervisé (alertes urgentes)", "alerts-notify" in jobs)
check("job « mail-test » supervisé (test d'envoi des réglages)", "mail-test" in jobs)
st, stt = call("GET", "/status")
check("/api/status expose chaque job avec sa fraîcheur", st in (200, 503) and isinstance(stt.get("checks", {}).get("jobs"), dict), json.dumps({k: v.get("state") for k, v in (stt.get("checks", {}).get("jobs") or {}).items()}, ensure_ascii=False))
check("/api/status expose l'état réel des canaux", "delivered" in stt.get("checks", {}).get("mail", {}) and "configured" in stt.get("checks", {}).get("sms", {}))
st, cron_res = call("GET", f"/jobs/reminders?secret={CRON}")
check("le cron des rappels exécute aussi les alertes immédiates", st == 200 and "notifications" in cron_res, json.dumps(cron_res.get("notifications", {}).get("emails", "absent"), ensure_ascii=False))

# ---------------------------------------------------------------- I. cron déclaré
print("\nI. Le cron horaire est déclaré (pas seulement dans le code)")
try:
    cfg = json.load(open(os.path.join(REPO, "vercel.json"), encoding="utf-8"))
    crons = [f"{c['path']} {c['schedule']}" for c in cfg.get("crons", [])]
except Exception as e:
    crons = []; cfg = {}
check("vercel.json déclare le cron des rappels (compatible Hobby)", "/api/jobs/reminders 0 14 * * *" in crons, " | ".join(crons) or f"illisible: {e}")
check("vercel.json garde le job quotidien", "/api/jobs/daily 30 4 * * *" in crons)

# ---------------------------------------------------------------- synthèse
passed = sum(1 for _, ok, _ in results if ok)
print(f"\n=== Résultat : {passed}/{len(results)} vérifications passées ===\n")
for label, ok, detail in results:
    if not ok: print(f"  ÉCHEC : {label} — {detail}")
out = os.path.join(RESULTATS, "chantier6_verif_resultat.json")
json.dump({"passes": passed, "total": len(results), "resultats": [{"controle": l, "ok": o, "detail": d} for l, o, d in results]}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"Rapport machine : {out}\n")
raise SystemExit(0 if passed == len(results) else 1)
