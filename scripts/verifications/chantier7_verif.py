#!/usr/bin/env python3
"""Chantier 7 (audit AFRISUPPLY) — « encaissement et offre commerciale honnête » vérifié pour de vrai.

Ce script ne se contente pas de lire du code : il monte un **faux Stripe** local et une **seconde
instance de l'API** pointée dessus (STRIPE_API_BASE), puis joue tout le parcours d'argent :

  A. état du guichet : configuré / incomplet / manuel, URL de webhook, sièges par formule ;
  B. souscription : client Stripe créé une seule fois, Checkout Pro avec l'essai restant conservé ;
     portail de facturation (changement de formule, résiliation) ;
  C. webhook signé invoice.paid → abonnement actif + facture AFRISUPPLY (numéro, HT, TVA, période) ;
  D. facture réellement envoyée : PDF joint dans la boîte de sortie, mentions légales signalées ;
  E. idempotence : le même événement rejoué n'émet pas de seconde facture ;
  F. panne Stripe passagère : 500 + trace « echec », puis rejeu du même événement qui aboutit ;
  G. signature absente/falsifiée refusée, aucun événement enregistré ;
  H. honnêteté sans paiement en ligne (instance principale) : 503 explicite, état « manuel », aucun faux bouton ;
  I. bascule manuelle admin (virement) : facture émise, envoyée, marquée payée ; 403 pour un non-admin ;
  J. étanchéité : un autre restaurant ne voit ni ne télécharge la facture ; /billing/health sans secret.

Usage : AFS_API=http://localhost:8787/api python3 chantier7_verif.py
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

def call(base, method, path, token=None, body=None, rid=None, raw=False):
    req = urllib.request.Request(base + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    if rid: req.add_header("X-Restaurant-Id", rid)
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

def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p

# ---------------------------------------------------------------- faux Stripe
STRIPE_CALLS = []
FAKE_SUBS = {}
WEBHOOK_SECRET = "whsec_chantier7"

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
        if method == "POST" and path == "/customers": return self._json({"id": "cus_verif_1", "object": "customer"})
        if method == "POST" and path == "/checkout/sessions": return self._json({"id": "cs_verif_1", "object": "checkout.session", "url": "https://checkout.stripe.faux/cs_verif_1"})
        if method == "POST" and path == "/billing_portal/sessions": return self._json({"id": "bps_verif_1", "object": "billing_portal.session", "url": "https://billing.stripe.faux/bps_verif_1"})
        if method == "GET" and path.startswith("/subscriptions/"):
            sid = path.split("/")[2]
            if sid in FAKE_SUBS: return self._json(FAKE_SUBS[sid])
            return self._json({"error": {"message": f"No such subscription: {sid}"}}, 404)
        return self._json({"error": {"message": f"route inconnue {method} {path}"}}, 404)
    def do_GET(self): self._handle("GET")
    def do_POST(self): self._handle("POST")

def sign_webhook(payload: str, t=None):
    t = t or int(time.time())
    mac = hmac.new(WEBHOOK_SECRET.encode(), f"{t}.{payload}".encode(), hashlib.sha256).hexdigest()
    return f"t={t},v1={mac}"

def hook(base, evt):
    return _hook_raw(base, json.dumps(evt))

def _hook_raw(base, raw, signature=None):
    req = urllib.request.Request(base + "/billing/webhook", method="POST", data=raw.encode())
    req.add_header("Content-Type", "application/json")
    req.add_header("stripe-signature", signature if signature is not None else sign_webhook(raw))
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            b = r.read(); return r.status, (json.loads(b) if b else None)
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b"null")
        except Exception: return e.code, b.decode("utf-8", "replace")[:300]

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
OUTBOX = "/tmp/afs-outbox-billing7"
PGLITE = "/tmp/afs-pglite-billing7"
STRIPE_PORT = free_port()
API_PORT = free_port()
API = f"http://127.0.0.1:{API_PORT}/api"

print("\n=== Chantier 7 — encaissement réel, factures AFRISUPPLY, honnêteté (API réelle + faux Stripe) ===\n")
shutil.rmtree(OUTBOX, ignore_errors=True); os.makedirs(OUTBOX, exist_ok=True)
shutil.rmtree(PGLITE, ignore_errors=True)

stripe_srv = ThreadingHTTPServer(("127.0.0.1", STRIPE_PORT), FakeStripe)
threading.Thread(target=stripe_srv.serve_forever, daemon=True).start()
print(f"  · faux Stripe sur 127.0.0.1:{STRIPE_PORT}")

env = dict(os.environ)
env.update({
    "PORT": str(API_PORT), "PGLITE_DIR": PGLITE, "SEED_DEMO": "false", "JWT_SECRET": "dev-secret-local-chantier7",
    "CRON_SECRET": "dev-cron", "ADMIN_EMAILS": "admin@afrisupply.fr", "APP_URL": "http://localhost:3000",
    "VENDOR_AUTO_APPROVE": "true", "MAIL_OUTBOX_DIR": OUTBOX, "NODE_ENV": "development",
    "STRIPE_SECRET_KEY": "sk_test_verif", "STRIPE_WEBHOOK_SECRET": WEBHOOK_SECRET,
    "STRIPE_PRICE_STARTER": "price_starter_verif", "STRIPE_PRICE_PRO": "price_pro_verif", "STRIPE_PRICE_BUSINESS": "price_business_verif",
    "STRIPE_API_BASE": f"http://127.0.0.1:{STRIPE_PORT}/v1", "BILLING_ENFORCE": "true",
})
env.pop("VERCEL", None)
log = open("/tmp/afs-api-billing7.log", "wb")
api = subprocess.Popen(["npm", "exec", "tsx", "apps/api/src/server.ts"], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)

def wait_api(base, tries=90):
    for _ in range(tries):
        try:
            st, _, _ = call(base, "GET", "/health")
            if st == 200: return True
        except Exception: pass
        time.sleep(1)
    return False

try:
    check("seconde instance d'API démarrée (paiement activé)", wait_api(API), API)
    check("instance principale joignable (paiement désactivé)", wait_api(MAIN), MAIN)

    # ---------------- A. état du guichet ----------------
    print("\nA. État du guichet d'encaissement")
    st, h, _ = call(API, "GET", "/billing/health")
    check("avec clé + prix + webhook : guichet opérationnel", st == 200 and h.get("ok") is True, f"mode={h.get('mode')}")
    check("URL de webhook Stripe indiquée pour la configuration", str(h.get("webhookUrl", "")).endswith("/api/billing/webhook"), h.get("webhookUrl"))
    seats = {k: v for k, v in (h.get("seats") or {}).items() if k in ("starter", "pro", "business")}
    check("sièges annoncés par formule (3/5/illimité)", seats == {"starter": 3, "pro": 5, "business": None}, json.dumps(h.get("seats"), ensure_ascii=False))
    check("mentions légales de l'émetteur signalées comme incomplètes", h.get("publisher", {}).get("complete") is False, "INVOICE_SIRET/TVA absents → la facture le dit")

    # ---------------- comptes ----------------
    stamp = int(time.time())
    st, a, _ = call(API, "POST", "/auth/register", body={"email": f"b7-{stamp}@audit.fr", "password": "Plantain-Yassa-42", "fullName": "Awa B7", "restaurantName": f"Chez Awa {stamp}", "city": "Nantes"})
    check("création du restaurant pilote", st == 201, f"HTTP {st}")
    TOK, RID = a["token"], a["restaurant"]["id"]
    st, b, _ = call(API, "POST", "/auth/register", body={"email": f"b7-voisin-{stamp}@audit.fr", "password": "Plantain-Yassa-42", "fullName": "Kofi B7", "restaurantName": f"Chez Kofi {stamp}", "city": "Nantes"})
    TOK2, RID2 = b["token"], b["restaurant"]["id"]
    st, adm, _ = call(API, "POST", "/auth/register", body={"email": "admin@afrisupply.fr", "password": "Plantain-Yassa-42", "fullName": "Admin", "restaurantName": "Admin AFS", "city": "Nantes"})
    ADMIN_TOK = adm["token"] if st == 201 else None
    check("comptes de test créés (restaurant, voisin, admin)", bool(TOK and TOK2 and ADMIN_TOK), f"admin HTTP {st}")

    st, bl, _ = call(API, "GET", "/billing", TOK, rid=RID)
    check("l'écran d'abonnement expose prix réel, sièges et état du guichet", st == 200 and bl.get("stripe") is True and bl.get("seats") == 5 and bl.get("price", {}).get("list") == 89, json.dumps(bl.get("price"), ensure_ascii=False))

    # ---------------- B. souscription ----------------
    print("\nB. Souscription (faux Stripe : parcours Checkout complet)")
    st, ck, _ = call(API, "POST", "/billing/checkout", TOK, body={"plan": "pro"}, rid=RID)
    check("Checkout créé (URL de paiement renvoyée par Stripe)", st == 200 and ck.get("url") == "https://checkout.stripe.faux/cs_verif_1", json.dumps(ck, ensure_ascii=False)[:120])
    cus_calls = [c for c in STRIPE_CALLS if c["path"] == "/customers"]
    check("client Stripe créé avec clé d'idempotence (cus-<restaurant>)", len(cus_calls) == 1 and cus_calls[0]["idempotency"] == f"cus-{RID}", cus_calls[0]["idempotency"] if cus_calls else "aucun")
    sess = [c for c in STRIPE_CALLS if c["path"] == "/checkout/sessions"]
    params = urllib.parse.parse_qs(sess[-1]["body"]) if sess else {}
    trial = int((params.get("subscription_data[trial_period_days]") or ["0"])[0])
    check("l'essai gratuit restant est conservé (≤ 30 j)", 0 < trial <= 30, f"trial_period_days={trial}")
    check("le restaurant est transmis à Stripe (métadonnée restaurantId)", params.get("subscription_data[metadata][restaurantId]") == [RID])
    st, ck2, _ = call(API, "POST", "/billing/checkout", TOK, body={"plan": "starter"}, rid=RID)
    check("un second achat ne recrée pas de client Stripe", len([c for c in STRIPE_CALLS if c["path"] == "/customers"]) == 1)
    st, port, _ = call(API, "POST", "/billing/portal", TOK, rid=RID)
    check("portail de facturation (changer de formule, résilier, cartes)", st == 200 and str(port.get("url", "")).startswith("https://billing.stripe.faux/"), port.get("url"))

    # ---------------- C. webhook invoice.paid ----------------
    print("\nC. Paiement encaissé : webhook signé → facture AFRISUPPLY")
    start = int(time.time()) - 86400; end = start + 30 * 86400
    EVT = {"id": "evt_b7_inv1", "type": "invoice.paid", "data": {"object": {
        "id": "in_b7_1", "object": "invoice", "customer": "cus_verif_1", "subscription": "sub_verif_1", "number": "STRIPE-0001",
        "total": 10680, "tax": 1780, "paid": True, "hosted_invoice_url": "https://invoice.stripe.faux/in_b7_1",
        "period_start": start, "period_end": end, "lines": {"data": [{"price": {"id": "price_pro_verif"}}]}}}}
    st, res = hook(API, EVT)
    check("événement accepté (signature valide)", st == 200 and res.get("received") is True, f"HTTP {st}")
    st, bl, _ = call(API, "GET", "/billing", TOK, rid=RID)
    check("abonnement actif après paiement", bl.get("state") == "active" and bl.get("plan") == "pro", f"state={bl.get('state')} plan={bl.get('plan')}")
    st, lst, _ = call(API, "GET", "/billing/invoices", TOK, rid=RID)
    invs = lst.get("invoices", []) if isinstance(lst, dict) else []
    check("facture AFRISUPPLY émise et visible par le restaurant", len(invs) == 1, f"{len(invs)} facture(s)")
    inv = invs[0] if invs else {}
    check("numéro de facture au format AFR-AAAA-NNNN", bool(re.match(r"^AFR-\d{4}-\d{4}$", inv.get("number", ""))), inv.get("number"))
    check("montant HT et TVA déduits du paiement Stripe (89 € HT / 20 %)", abs(float(inv.get("amountEur", 0)) - 89) < 0.01 and abs(float(inv.get("vatRate", 0)) - 20) < 0.01, f"{inv.get('amountEur')} € HT / TVA {inv.get('vatRate')} %")
    check("facture marquée payée, source carte, lien de reçu Stripe conservé", inv.get("status") == "payee" and inv.get("source") == "stripe" and "stripe.faux" in str(inv.get("hostedUrl")), f"{inv.get('status')} / {inv.get('source')}")
    check("période de facturation reprise de Stripe", inv.get("periodStart") is not None and inv.get("periodEnd") is not None)

    # ---------------- D. facture PDF réellement envoyée ----------------
    print("\nD. La facture part vraiment (PDF joint, mentions légales)")
    time.sleep(1)
    files = sorted(os.listdir(OUTBOX))
    pdfs = [f for f in files if f.endswith(".pdf")]
    check("PDF de facture déposé (pièce jointe du message)", len(pdfs) >= 1, ", ".join(pdfs[:2]))
    pdf_txt = ""
    if pdfs:
        pdf_txt = open(os.path.join(OUTBOX, pdfs[-1]), "r", encoding="latin-1", errors="replace").read()
    check("le PDF est un vrai PDF et porte le numéro de facture", pdf_txt.startswith("%PDF-1.4") and inv.get("number", "zzz") in pdf_txt, f"{len(pdf_txt)} octets")
    check("le PDF mentionne l'émetteur, la formule et le total TTC", "AFRISUPPLY" in pdf_txt and "FACTURE" in pdf_txt and "TTC" in pdf_txt)
    check("mentions légales manquantes signalées sur la facture elle-même", "Mentions légales incomplètes" in pdf_txt, "INVOICE_SIRET / INVOICE_VAT")
    mails = [open(os.path.join(OUTBOX, f), encoding="utf-8", errors="replace").read() for f in files if f.endswith(".txt")]
    check("e-mail de facture envoyé au restaurant et cohérent", any(inv.get("number", "zzz") in m and "facture" in m.lower() for m in mails), f"{len(mails)} message(s)")
    st, pdf_raw, hdrs = call(API, "GET", f"/billing/invoices/{inv.get('id')}/pdf", TOK, rid=RID, raw=True)
    check("téléchargement du PDF depuis l'espace client (application/pdf)", st == 200 and "application/pdf" in str(hdrs.get("content-type")) and pdf_raw.startswith(b"%PDF"), f"HTTP {st}")

    # ---------------- E. idempotence ----------------
    print("\nE. Rejeu du même événement (Stripe réessaie)")
    st, dup = hook(API, EVT)
    check("rejeu identifié comme doublon (pas de second traitement)", st == 200 and dup.get("duplicate") is True, json.dumps(dup, ensure_ascii=False))
    st, lst, _ = call(API, "GET", "/billing/invoices", TOK, rid=RID)
    check("toujours une seule facture après rejeu", len(lst.get("invoices", [])) == 1, f"{len(lst.get('invoices', []))} facture(s)")

    # ---------------- F. panne puis reprise ----------------
    print("\nF. Panne Stripe passagère puis reprise (sans perte de paiement)")
    EVT2 = {"id": "evt_b7_retry", "type": "checkout.session.completed", "data": {"object": {"id": "cs_verif_2", "mode": "subscription", "subscription": "sub_verif_retry", "customer": "cus_verif_1"}}}
    st, ko = hook(API, EVT2)
    check("panne signalée à Stripe (500 : il réessaiera)", st == 500, f"HTTP {st} — {json.dumps(ko, ensure_ascii=False)[:90]}")
    FAKE_SUBS["sub_verif_retry"] = {"id": "sub_verif_retry", "object": "subscription", "customer": "cus_verif_1", "status": "active",
                                    "current_period_end": int(time.time()) + 30 * 86400, "items": {"data": [{"price": {"id": "price_starter_verif"}}]},
                                    "metadata": {"restaurantId": RID, "plan": "starter"}}
    st, ok2 = hook(API, EVT2)
    check("le même événement rejoué aboutit (pas classé « doublon »)", st == 200 and ok2.get("duplicate") is None, f"HTTP {st}")
    st, bl, _ = call(API, "GET", "/billing", TOK, rid=RID)
    check("changement de formule appliqué (Starter)", bl.get("plan") == "starter" and bl.get("state") == "active", f"plan={bl.get('plan')}")

    # ---------------- G. signatures ----------------
    print("\nG. Webhook non signé ou falsifié")
    st1, _ = _hook_raw(API, json.dumps({"id": "evt_b7_nosig", "type": "invoice.paid", "data": {"object": {"id": "in_x"}}}), signature="")
    st2, _ = _hook_raw(API, json.dumps({"id": "evt_b7_badsig", "type": "invoice.paid", "data": {"object": {"id": "in_x"}}}), signature="t=1,v1=mort")
    check("signature absente refusée", st1 == 400, f"HTTP {st1}")
    check("signature falsifiée refusée", st2 == 400, f"HTTP {st2}")

    # ---------------- H. honnêteté sans paiement en ligne ----------------
    print("\nH. Instance sans Stripe : l'application le dit au lieu de faire semblant")
    st, h0, _ = call(MAIN, "GET", "/billing/health")
    check("état « manuel » et manques listés", st == 200 and h0.get("mode") == "manuel" and "STRIPE_SECRET_KEY" in h0.get("missing", []), f"mode={h0.get('mode')}")
    st, r0, _ = call(MAIN, "POST", "/auth/register", body={"email": f"b7-nostripe-{stamp}@audit.fr", "password": "Plantain-Yassa-42", "fullName": "Sans Stripe", "restaurantName": f"Sans Stripe {stamp}", "city": "Nantes"})
    if st == 201:
        t0, i0 = r0["token"], r0["restaurant"]["id"]
        st, ck, _ = call(MAIN, "POST", "/billing/checkout", t0, body={"plan": "pro"}, rid=i0)
        check("souscription par carte refusée proprement (503 + contact humain)", st == 503 and "bonjour@afrisupply.fr" in json.dumps(ck, ensure_ascii=False), f"HTTP {st}")
        st, b0, _ = call(MAIN, "GET", "/billing", t0, rid=i0)
        check("écran d'abonnement : stripe=false, mode manuel, prix de référence non nul", b0.get("stripe") is False and b0.get("health", {}).get("mode") == "manuel" and b0.get("price", {}).get("list", 0) > 0, json.dumps(b0.get("price"), ensure_ascii=False))
    else:
        check("compte témoin créé pour l'instance sans Stripe", False, f"HTTP {st} (limitation de débit ?)")

    # ---------------- I. bascule manuelle admin ----------------
    print("\nI. Encaissement manuel (virement) côté AFRISUPPLY")
    st, other, _ = call(API, "GET", "/billing", TOK2, rid=RID2)
    st, man, _ = call(API, "POST", f"/admin/billing/restaurants/{RID2}/invoice", ADMIN_TOK, body={"months": 1, "note": "virement reçu"}, rid=RID2)
    check("facture manuelle émise (source « manuel », statut à payer)", st == 201 and man.get("invoice", {}).get("source") == "manuel" and man.get("invoice", {}).get("status") == "ouverte", f"HTTP {st} — {man.get('invoice', {}).get('number')}")
    check("facture manuelle également envoyée au restaurant", man.get("mail", {}).get("sent") is True, json.dumps(man.get("mail"), ensure_ascii=False)[:100])
    st, pay, _ = call(API, "PUT", f"/admin/billing/invoices/{man.get('invoice', {}).get('id')}", ADMIN_TOK, body={"status": "payee"}, rid=RID2)
    check("marquage « payée » après réception du virement", st == 200 and pay.get("invoice", {}).get("paidAt"), f"HTTP {st}")
    st, noauth, _ = call(API, "POST", f"/admin/billing/restaurants/{RID}/invoice", TOK, body={"months": 1}, rid=RID)
    check("un restaurant ne peut pas s'auto-facturer (403)", st == 403, f"HTTP {st}")
    st, dash, _ = call(API, "GET", "/admin/billing", ADMIN_TOK)
    check("synthèse admin : MRR, factures d'abonnement, état du guichet", st == 200 and dash.get("mrr", {}).get("total", 0) > 0 and len(dash.get("subscriptions", [])) >= 2 and dash.get("health", {}).get("ok") is True, f"MRR={dash.get('mrr', {}).get('total')} €")

    # ---------------- J. étanchéité ----------------
    print("\nJ. Étanchéité entre restaurants et fuite d'information")
    st, voisin, _ = call(API, "GET", "/billing/invoices", TOK2, rid=RID2)
    check("le voisin ne voit que ses propres factures", st == 200 and all(i["number"] != inv.get("number") for i in voisin.get("invoices", [])), f"{len(voisin.get('invoices', []))} facture(s) côté voisin")
    st, _, _ = call(API, "GET", f"/billing/invoices/{inv.get('id')}/pdf", TOK2, rid=RID2)
    check("téléchargement de la facture d'un autre restaurant refusé (404)", st == 404, f"HTTP {st}")
    st, h, _ = call(API, "GET", "/billing/health", TOK)
    leak = re.search(r"cus_verif|sk_test|in_b7", json.dumps(h))
    check("l'état public du guichet ne divulgue aucun identifiant client", leak is None and st == 200)

finally:
    try:
        os.killpg(os.getpgid(api.pid), signal.SIGTERM)
    except Exception:
        api.terminate()
    time.sleep(1)
    stripe_srv.shutdown(); log.close()

ok = sum(1 for _, c, _ in results if c); total = len(results)
print(f"\n=== Chantier 7 — {ok}/{total} vérifications réussies ===")
print(f"    preuves : {OUTBOX} (messages et PDF réellement envoyés) — journal API : /tmp/afs-api-billing7.log")
json.dump({"ok": ok, "total": total, "echecs": [{"label": l, "detail": d} for l, c, d in results if not c]},
          open(os.path.join(RESULTATS, "chantier7_verif_resultat.json"), "w"), ensure_ascii=False, indent=2)
sys.exit(0 if ok == total else 1)
