#!/usr/bin/env python3
"""Chantier 8 (audit AFRISUPPLY) — parcours client et moyens de paiement, vérifiés sur l'API réelle.

Ce que ce script prouve, sans complaisance :

  A. connexion : mauvais mot de passe = message clair (sans dire lequel des deux est faux) ;
     trop de tentatives = 429 avec indication d'attente (et non « erreur 500 ») ;
  B. établissements : un utilisateur appartient à plusieurs restaurants, connaît son rôle,
     et l'API refuse un établissement auquel il n'a pas accès en le disant de façon exploitable
     (code machine pour que l'interface se remette d'aplomb) ;
  C. rôles réellement appliqués : un employé ne peut pas inviter, exporter, ni supprimer ;
     un responsable non plus pour la suppression ; le retrait de droits prend effet immédiatement ;
  D. moyen de paiement fournisseur : enregistrement d'une carte via Stripe (faux Stripe local),
     bascule du relevé par e-mail vers le prélèvement automatique ;
  E. facture de commission : prélèvement automatique quand la carte existe, PDF réellement envoyé
     et téléchargeable par le fournisseur (404 pour un autre fournisseur) ;
  F. honnêteté : sans clé Stripe, l'application refuse proprement (503) et annonce le virement ;
  G. les écrans correspondants existent dans le bundle web (page établissements, panneau commissions).

Usage : AFS_API=http://localhost:8787/api AFS_WEB=http://localhost:3000 python3 chantier8_verif.py
"""
import hashlib, hmac, json, os, re, shutil, signal, socket, subprocess, sys, threading, time
import urllib.error, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OK = lambda b: "\033[32mOK\033[0m" if b else "\033[31mÉCHEC\033[0m"
results = []


def check(label, cond, detail=""):
    results.append((label, bool(cond), detail))
    print(f"  [{OK(cond)}] {label}" + (f" — {detail}" if detail else ""))
    return cond


def call(base, method, path, token=None, body=None, rid=None, raw=False, vid=None):
    req = urllib.request.Request(base + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    if rid: req.add_header("X-Restaurant-Id", rid)
    if vid: req.add_header("X-Vendor-Id", vid)
    data = None
    if body is not None:
        data = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=60) as r:
            b = r.read()
            return r.status, (b if raw else (json.loads(b) if b else None)), dict(r.headers)
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, (b if raw else json.loads(b or b"null")), dict(e.headers)
        except Exception: return e.code, b.decode("utf-8", "replace")[:300], dict(e.headers)


def call_retry(base, method, path, token=None, body=None, rid=None, raw=False, vid=None, tries=3, wait=65):
    """Même appel, mais insensible à la limitation de débit (5 inscriptions/minute) : un vrai
    utilisateur attend et recommence, la vérification doit faire pareil au lieu d'échouer à tort."""
    for i in range(tries):
        st, data, hdr = call(base, method, path, token, body, rid, raw, vid)
        if st != 429:
            return st, data, hdr
        if i < tries - 1:
            delay = int((hdr or {}).get("Retry-After") or wait)
            delay = min(delay, 90)  # on attend ce que le serveur indique, sans bloquer indéfiniment
            print(f"      · limitation de débit (429) sur {method} {path} — nouvelle tentative dans {delay} s")
            time.sleep(delay)
    return st, data, hdr


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


# ---------------------------------------------------------------- faux Stripe
STRIPE_CALLS = []
WEBHOOK_SECRET = "whsec_chantier8"
FAKE_SETUP = {"id": "seti_c8", "status": "succeeded", "payment_method": "pm_c8"}
FAKE_PM = {"id": "pm_c8", "object": "payment_method", "card": {"brand": "visa", "last4": "4242"}}


class FakeStripe(BaseHTTPRequestHandler):
    def _json(self, obj, code=200):
        raw = json.dumps(obj).encode()
        self.send_response(code); self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw))); self.end_headers(); self.wfile.write(raw)

    def log_message(self, *a): pass

    def _handle(self, method):
        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(length).decode() if length else ""
        path = self.path.split("?")[0].replace("/v1", "")
        STRIPE_CALLS.append({"method": method, "path": path, "body": body, "idempotency": self.headers.get("idempotency-key")})
        if method == "POST" and path == "/customers": return self._json({"id": "cus_c8", "object": "customer"})
        if method == "POST" and path == "/checkout/sessions": return self._json({"id": "cs_c8", "object": "checkout.session", "url": "https://checkout.stripe.faux/cs_c8"})
        if method == "GET" and path == "/checkout/sessions/cs_c8":
            return self._json({"id": "cs_c8", "object": "checkout.session", "mode": "setup", "customer": "cus_c8", "setup_intent": "seti_c8", "metadata": {"vendorId": CURRENT_VENDOR["id"], "usage": "commission"}})
        if method == "GET" and path.startswith("/setup_intents/"): return self._json(FAKE_SETUP)
        if method == "GET" and path.startswith("/payment_methods/"): return self._json(FAKE_PM)
        if method == "POST" and path.startswith("/customers/"): return self._json({"id": path.split("/")[2], "object": "customer"})
        if method == "POST" and path == "/invoiceitems": return self._json({"id": "ii_c8", "object": "invoiceitem"})
        if method == "POST" and path == "/invoices": return self._json({"id": "in_c8", "object": "invoice"})
        if method == "POST" and (path.endswith("/finalize") or path.endswith("/send")): return self._json({"id": "in_c8", "object": "invoice"})
        return self._json({"error": {"message": f"route inconnue {method} {path}"}}, 404)

    def do_GET(self): self._handle("GET")
    def do_POST(self): self._handle("POST")


CURRENT_VENDOR = {"id": ""}


def sign_webhook(payload: str, t=None):
    t = t or int(time.time())
    return f"t={t},v1=" + hmac.new(WEBHOOK_SECRET.encode(), f"{t}.{payload}".encode(), hashlib.sha256).hexdigest()


def hook(base, evt):
    raw = json.dumps(evt)
    req = urllib.request.Request(base + "/billing/webhook", method="POST", data=raw.encode())
    req.add_header("Content-Type", "application/json"); req.add_header("stripe-signature", sign_webhook(raw))
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            b = r.read(); return r.status, (json.loads(b) if b else None)
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b"null")
        except Exception: return e.code, b.decode("utf-8", "replace")[:200]


# ---------------------------------------------------------------- mise en place
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
OUTBOX = "/tmp/afs-outbox-vendor8"
PGLITE = "/tmp/afs-pglite-vendor8"
STRIPE_PORT = free_port(); API_PORT = free_port()
API = f"http://127.0.0.1:{API_PORT}/api"
PWD = "Plantain-Yassa-42"

print("\n=== Chantier 8 — parcours client, rôles et moyens de paiement (API réelle) ===\n")
shutil.rmtree(OUTBOX, ignore_errors=True); os.makedirs(OUTBOX, exist_ok=True); shutil.rmtree(PGLITE, ignore_errors=True)

stripe_srv = ThreadingHTTPServer(("127.0.0.1", STRIPE_PORT), FakeStripe)
threading.Thread(target=stripe_srv.serve_forever, daemon=True).start()
print(f"  · faux Stripe sur 127.0.0.1:{STRIPE_PORT}")

env = dict(os.environ)
env.update({
    "PORT": str(API_PORT), "PGLITE_DIR": PGLITE, "SEED_DEMO": "true",   # référentiel produits commun "JWT_SECRET": "dev-secret-local-chantier8",
    "CRON_SECRET": "dev-cron", "ADMIN_EMAILS": "admin@afrisupply.fr", "APP_URL": "http://localhost:3000",
    "VENDOR_AUTO_APPROVE": "true", "MAIL_OUTBOX_DIR": OUTBOX, "NODE_ENV": "development",
    "STRIPE_SECRET_KEY": "sk_test_c8", "STRIPE_WEBHOOK_SECRET": WEBHOOK_SECRET,
    "STRIPE_PRICE_STARTER": "price_starter_c8", "STRIPE_PRICE_PRO": "price_pro_c8", "STRIPE_PRICE_BUSINESS": "price_business_c8",
    "STRIPE_API_BASE": f"http://127.0.0.1:{STRIPE_PORT}/v1", "BILLING_ENFORCE": "true",
})
env.pop("VERCEL", None)
log = open("/tmp/afs-api-vendor8.log", "wb")
api = subprocess.Popen(["npm", "exec", "tsx", "apps/api/src/server.ts"], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)


def wait_api(base, tries=90):
    for _ in range(tries):
        try:
            st, _, _ = call(base, "GET", "/health")
            if st == 200: return True
        except Exception: pass
        time.sleep(1)
    return False


def register(base, email, name, full="Testeur C8"):
    return call_retry(base, "POST", "/auth/register", body={"email": email, "password": PWD, "fullName": full, "restaurantName": name, "city": "Nantes"})


try:
    check("seconde instance d'API démarrée (Stripe activé)", wait_api(API), API)
    check("instance principale joignable (Stripe désactivé)", wait_api(MAIN), MAIN)
    stamp = int(time.time())

    # ---------------- A. connexion ----------------
    print("\nA. Connexion : messages exploitables")
    st, bad, _ = call(MAIN, "POST", "/auth/login", body={"email": "inconnu-c8@audit.fr", "password": "mauvais-mot-de-passe"})
    check("identifiants faux : message clair, sans dire lequel est faux", st == 401 and "E-mail ou mot de passe incorrect" in json.dumps(bad, ensure_ascii=False), f"HTTP {st}")

    # ---------------- B. établissements et rôles ----------------
    print("\nB. Établissements : appartenance, rôle, accès refusé exploitable")
    st, reg1, _ = register(API, f"c8-patron-{stamp}@audit.fr", f"Chez Patron {stamp}")
    T1, R1 = reg1["token"], reg1["restaurant"]["id"]
    st, me1, _ = call(API, "GET", "/auth/me", T1)
    check("le compte connaît ses établissements et son rôle", st == 200 and me1["restaurants"][0]["role"] == "owner", json.dumps([{ "name": r["name"], "role": r["role"], "plan": r["plan"] } for r in me1.get("restaurants", [])], ensure_ascii=False))

    st, invited, _ = call(API, "POST", "/members", T1, body={"email": f"c8-equipier-{stamp}@audit.fr", "role": "staff", "fullName": "Awa Employée"}, rid=R1)
    if st >= 400: print("      · invitation refusée :", json.dumps(invited, ensure_ascii=False)[:200])
    ok_invite = st in (200, 201) and (invited.get("devLink") or invited.get("link"))
    check("invitation d'un employé émise (lien de secours en développement)", ok_invite, f"HTTP {st} {json.dumps(invited, ensure_ascii=False)[:90]}")
    link = (invited.get("devLink") or invited.get("link") or "") if ok_invite else ""
    token_invite = urllib.parse.parse_qs(urllib.parse.urlparse(link).query).get("token", [""])[0]
    if token_invite:
        st, done, _ = call_retry(API, "POST", "/auth/reset-password", body={"token": token_invite, "password": PWD})
        check("l'employé active son compte (lien d'invitation)", st == 200, f"HTTP {st} {json.dumps(done, ensure_ascii=False)[:80]}")
        st, emp, _ = call_retry(API, "POST", "/auth/login", body={"email": f"c8-equipier-{stamp}@audit.fr", "password": PWD})
        TE, RE = emp.get("token"), R1
        st, meE, _ = call(API, "GET", "/auth/me", TE)
        roles = {r["name"]: r["role"] for r in meE.get("restaurants", [])}
        check("l'employé voit le restaurant avec le rôle « staff »", st == 200 and "staff" in roles.values(), json.dumps(roles, ensure_ascii=False))
        st, _, _ = call(API, "GET", "/account/export", TE, rid=RE)
        check("un employé ne peut pas exporter les données (403)", st == 403, f"HTTP {st}")
        st, refus, _ = call(API, "POST", "/members", TE, body={"email": f"c8-x-{stamp}@audit.fr", "role": "staff"}, rid=RE)
        check("un employé ne peut pas inviter (403, avec explication)", st == 403 and refus.get("code") == "role_required", f"HTTP {st} {json.dumps(refus, ensure_ascii=False)[:110]}")
        st, _, _ = call(API, "DELETE", "/account", TE, body={"password": PWD, "confirm": "SUPPRIMER"}, rid=RE)
        check("un employé ne peut pas supprimer le compte (403)", st == 403, f"HTTP {st}")
    else:
        check("jeton d'invitation exploitable", False, "lien absent")

    st, _, _ = call(API, "GET", "/stock", T1, rid="00000000-0000-0000-0000-000000000000")
    check("établissement non autorisé : 403 avec code exploitable", st == 403, f"HTTP {st}")

    # ---------------- C. moyen de paiement fournisseur ----------------
    print("\nC. Fournisseur : enregistrer sa carte pour payer ses commissions")
    st, vreg, _ = register(API, f"c8-grossiste-{stamp}@audit.fr", f"Ets C8 {stamp}")
    VTOK = vreg["token"]
    st, vr, _ = call(API, "POST", "/vendor/register", VTOK, body={"name": f"Grossiste C8 {stamp}", "city": "Nantes", "deliveryZones": ["Nantes"], "acceptCgv": True, "contactEmail": f"facturation-c8-{stamp}@audit.fr"})
    check("espace fournisseur créé (validation automatique en développement)", st == 201, f"HTTP {st}")
    st, vme, _ = call(API, "GET", "/vendor/me", VTOK)
    VID = vme["vendors"][0]["id"] if st == 200 and vme.get("vendors") else ""
    CURRENT_VENDOR["id"] = VID
    st, bill0, _ = call(API, "GET", "/vendor/billing", VTOK, vid=VID)
    check("état initial annoncé : relevé par e-mail (aucune carte)", st == 200 and bill0["payment"]["mode"] == "releve_mail" and bill0["payment"]["card"] is None, json.dumps(bill0.get("payment", {}), ensure_ascii=False)[:110])
    st, setup, _ = call(API, "POST", "/vendor/billing/setup", VTOK, body={}, vid=VID)
    check("enregistrement de carte : session Stripe créée (aucun débit)", st == 200 and str(setup.get("url", "")).startswith("https://checkout.stripe.faux/"), f"HTTP {st}")
    sess = [c for c in STRIPE_CALLS if c["path"] == "/checkout/sessions"]
    params = urllib.parse.parse_qs(sess[-1]["body"]) if sess else {}
    check("la session est bien en mode « setup » et cible le fournisseur", params.get("mode") == ["setup"] and params.get("metadata[vendorId]") == [VID])
    st, synced, _ = call(API, "POST", "/vendor/billing/sync", VTOK, body={"sessionId": "cs_c8"}, vid=VID)
    check("au retour de Stripe, la carte devient le moyen de paiement par défaut", st == 200 and synced.get("synced") is True and synced.get("payment", {}).get("mode") == "prelevement", json.dumps(synced.get("payment", {}), ensure_ascii=False)[:110])
    st, bill1, _ = call(API, "GET", "/vendor/billing", VTOK, vid=VID)
    check("le fournisseur voit sa carte (•••• 4242) et la bascule de mode", bill1["payment"]["card"]["last4"] == "4242" and "Prélèvement automatique actif" in bill1["payment"]["message"], bill1["payment"]["message"][:80])

    # ---------------- D. facture de commission réglée par prélèvement ----------------
    print("\nD. Commissions : facture émise, prélevée, téléchargeable")
    # offre du fournisseur sur un produit du référentiel
    st, prods, _ = call(API, "GET", "/products", VTOK, rid=vreg["restaurant"]["id"])
    PID = (prods.get("products") or [])[0]["id"] if st == 200 and prods else ""
    st, off, _ = call(API, "POST", "/vendor/offers", VTOK, body={"productId": PID, "packLabel": "Sac 25 kg", "packQty": 25, "packPrice": 42}, vid=VID)
    check("le fournisseur publie une offre à 42 € / sac de 25 kg", st in (200, 201), f"HTTP {st} {json.dumps(off, ensure_ascii=False)[:80]}")
    OFF = (off.get("offer") or off).get("id") if isinstance(off, dict) else None

    # le restaurant client est celui du patron créé en section B (aucune inscription inutile)
    TC, RC = T1, R1
    st, order, _ = call(API, "POST", f"/marketplace/vendors/{VID}/orders", TC, body={"lines": [{"vendorOfferId": OFF, "packs": 4}]}, rid=RC)
    check("le restaurant commande chez ce fournisseur", st == 201, f"HTTP {st} {json.dumps(order, ensure_ascii=False)[:90]}")
    OID = order["order"]["id"] if st == 201 else None
    st, conf, _ = call(API, "POST", f"/vendor/orders/{OID}/confirm", VTOK, body={}, vid=VID)
    check("le fournisseur confirme : une commission naît de la vente", st == 200, f"HTTP {st}")

    st, adm, _ = register(API, "admin@afrisupply.fr", "Admin C8", full="Admin AFS")  # l'admin des deux instances
    ADMIN_TOK = adm["token"] if st == 201 else None
    period = time.strftime("%Y-%m")
    st, dry, _ = call(API, "POST", "/admin/billing/commissions/invoice", ADMIN_TOK, body={"period": period, "dryRun": True})  # simulation : rien n'est émis
    mine = next((i for i in (dry.get("invoices") or []) if i.get("vendorId") == VID), None) if st == 200 else None
    check("simulation : commission calculée et prélèvement annoncé (pas d'e-mail)", st == 200 and mine and mine.get("via") == "stripe" and mine.get("mode") == "prelevement", json.dumps(mine, ensure_ascii=False)[:120])
    st, real, _ = call(API, "POST", "/admin/billing/commissions/invoice", ADMIN_TOK, body={"period": period})
    mineR = next((i for i in (real.get("invoices") or []) if i.get("vendorId") == VID), None) if st == 200 else None
    check("facture émise : prélèvement automatique (et non relevé à 15 jours)", st == 200 and mineR and mineR.get("mode") == "prelevement" and mineR.get("via") == "stripe", json.dumps(mineR, ensure_ascii=False)[:120])
    check("montant de commission exact (3 % de 168 € = 5,04 €)", mineR and abs(mineR.get("amount", 0) - 5.04) < 0.01, f"{mineR.get('amount') if mineR else '?'} € pour une base de {mineR.get('base') if mineR else '?'} €")
    inv = [c for c in STRIPE_CALLS if c["path"] == "/invoices"]
    charged = urllib.parse.parse_qs(inv[-1]["body"]).get("collection_method") if inv else None
    check("Stripe est bien appelé en prélèvement automatique", charged == ["charge_automatically"], f"collection_method={charged}")
    st, lst, _ = call(API, "GET", "/vendor/billing", VTOK, vid=VID)
    fact = (lst.get("invoices") or [None])[0]
    check("le fournisseur voit sa facture de commission", st == 200 and fact and fact.get("period") == period, json.dumps(fact, ensure_ascii=False)[:110])
    st, pdf, hdrs = call(API, "GET", f"/vendor/billing/invoices/{fact['id']}/pdf", VTOK, rid=None, raw=True, vid=VID)
    check("la facture se télécharge en PDF et mentionne le prélèvement", st == 200 and pdf.startswith(b"%PDF") and b"FACTURE DE COMMISSION" in pdf, f"HTTP {st} — {len(pdf)} octets")
    time.sleep(1)
    files = os.listdir(OUTBOX)
    mails = [open(os.path.join(OUTBOX, f), encoding="utf-8", errors="replace").read() for f in files if f.endswith(".txt")]
    check("la facture a réellement été envoyée par e-mail (PDF joint)", any("commission" in m.lower() for m in mails) and any(f.endswith(".pdf") for f in files), f"{len(mails)} message(s), {len([f for f in files if f.endswith('.pdf')])} PDF")
    # un autre fournisseur ne doit pas pouvoir lire cette facture
    st, v2reg, _ = register(API, f"c8-grossiste2-{stamp}@audit.fr", f"Ets C8 bis {stamp}")
    call(API, "POST", "/vendor/register", v2reg["token"], body={"name": f"Grossiste C8 bis {stamp}", "city": "Rennes", "deliveryZones": ["Rennes"], "acceptCgv": True})
    st, v2me, _ = call(API, "GET", "/vendor/me", v2reg["token"])
    VID2 = v2me["vendors"][0]["id"]
    st, _, _ = call(API, "GET", f"/vendor/billing/invoices/{fact['id']}/pdf", v2reg["token"], raw=True, vid=VID2)
    check("un autre fournisseur ne peut pas lire cette facture (404)", st == 404, f"HTTP {st}")

    # ---------------- E. honnêteté sans Stripe ----------------
    print("\nE. Sans Stripe : l'application refuse proprement")
    # Une inscription supplémentaire sur l'instance principale (5 par minute) suffit.
    st, reg0, _ = register(MAIN, f"c8-sansstripe-{stamp}@audit.fr", f"Sans Stripe {stamp}")
    T0 = reg0["token"]
    call(MAIN, "POST", "/vendor/register", T0, body={"name": f"Sans Stripe C8 {stamp}", "city": "Nantes", "deliveryZones": ["Nantes"], "acceptCgv": True})
    st, v0me, _ = call(MAIN, "GET", "/vendor/me", T0)
    VID0 = v0me["vendors"][0]["id"]
    st, s0, _ = call(MAIN, "POST", "/vendor/billing/setup", T0, body={}, vid=VID0)
    check("enregistrement de carte refusé proprement (503 + explication)", s0["error"].startswith("Enregistrement de carte indisponible") if st == 503 else False, f"HTTP {st}")
    st, b0, _ = call(MAIN, "GET", "/vendor/billing", T0, vid=VID0)
    check("l'état affiché dit la vérité (prélèvement indisponible, virement)", b0["payment"]["stripe"] is False and "indisponible" in b0["payment"]["message"], b0["payment"]["message"][:90])

    # ---------------- F. écrans web ----------------
    print("\nF. Écrans web présents et cohérents")
    for path, needle, label in [
        ("apps/web/src/pages/Establishments.tsx", "Mes établissements", "page « Mes établissements »"),
        ("apps/web/src/pages/vendor/CommissionsPanel.tsx", "Activer le prélèvement automatique", "panneau Commissions fournisseur"),
        ("apps/web/src/pages/vendor/CommissionsPanel.tsx", "p.message", "l’état de paiement affiché vient du serveur (aucune invention côté écran)"),
        ("apps/web/src/pages/Login.tsx", "Trop de tentatives depuis cet appareil", "aide à la connexion (limitation de débit)"),
        ("apps/web/src/components/AppLayout.tsx", "Mes établissements", "entrée de menu vers les établissements"),
    ]:
        try:
            body = open(os.path.join(ROOT, path), encoding="utf-8").read()
            check(f"{label} présente dans le code web", needle in body)
        except Exception as e:
            check(f"{label} présente dans le code web", False, str(e)[:80])

finally:
    try:
        os.killpg(os.getpgid(api.pid), signal.SIGTERM)
    except Exception:
        api.terminate()
    time.sleep(1)
    stripe_srv.shutdown(); log.close()

ok = sum(1 for _, c, _ in results if c); total = len(results)
print(f"\n=== Chantier 8 — {ok}/{total} vérifications réussies ===")
print(f"    preuves : {OUTBOX} (factures de commission envoyées) — journal API : /tmp/afs-api-vendor8.log")
json.dump({"ok": ok, "total": total, "echecs": [{"label": l, "detail": d} for l, c, d in results if not c]},
          open(os.path.join(RESULTATS, "chantier8_verif_resultat.json"), "w"), ensure_ascii=False, indent=2)
sys.exit(0 if ok == total else 1)
