#!/usr/bin/env python3
import os
"""Tests de scénarios réels AFRISUPPLY contre l'API en local (PGlite + seed démo)."""
import json, urllib.request, urllib.error, sys, time

BASE = os.environ.get("AFS_API", "http://localhost:8787/api")

def call(method, path, token=None, body=None, rid=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    if rid: req.add_header("X-Restaurant-Id", rid)
    data = None
    if body is not None:
        data = json.dumps(body).encode(); req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=120) as r:
            b = r.read()
            return r.status, (b.decode() if raw else json.loads(b or b"null"))
    except urllib.error.HTTPError as e:
        b = e.read()
        try: j = json.loads(b or b"null")
        except Exception: j = b.decode()[:300]
        return e.code, j

def head(t):
    print("\n" + "=" * 78 + "\n" + t + "\n" + "=" * 78)

results = []

def check(label, ok, detail=""):
    results.append((ok, label, detail))
    print(f"  {'✅' if ok else '❌'} {label}" + (f" — {detail}" if detail else ""))

# ---------------------------------------------------------------- LOGIN
head("SCÉNARIO 0 — Connexion restaurant démo")
st, r = call("POST", "/auth/login", body={"email": "awa@chezawa.fr", "password": "demo1234"})
check("login démo", st == 200, f"HTTP {st}")
TOK = r["token"]
st, me = call("GET", "/auth/me", TOK)
RID = me["restaurants"][0]["id"]
print("   restaurant:", me["restaurants"][0]["name"], RID)

# ---------------------------------------------------------------- S1 nouveau restaurant
head("SCÉNARIO 1 — Nouveau restaurant : inscription → onboarding → produits/fournisseurs/stock")
st, r = call("POST", "/auth/register", body={
    "email": f"test{int(time.time())}@audit.fr", "password": "motdepasse123", "fullName": "Test Audit",
    "restaurantName": "Audit Kitchen", "city": "Nantes", "coversPerDay": 40})
check("inscription", st == 201, f"HTTP {st}")
TOK2 = r["token"]; RID2 = r["restaurant"]["id"]

st, r = call("GET", "/dashboard", TOK2, rid=RID2)
check("dashboard vide accessible", st == 200, json.dumps({k: r[k] for k in ("stock", "spend") if k in r})[:160] if st == 200 else str(r)[:200])

st, r = call("GET", "/stock", TOK2, rid=RID2)
check("stock vide accessible", st == 200, f"{len(r.get('items', []))} articles")

st, r = call("GET", "/onboarding/templates", TOK2, rid=RID2)
check("templates de recettes", st == 200, f"{len(r.get('templates', []))} recettes types")

st, r = call("GET", "/catalog?q=riz", TOK2, rid=RID2)
check("catalogue recherche 'riz'", st == 200, f"{len(r.get('products', []))} résultats")
riz = [p for p in r.get("products", []) if p["name"] == "Riz parfumé"]
print("      Riz parfumé trouvé:", bool(riz))

st, r = call("POST", "/onboarding/apply", TOK2, rid=RID2, body={"templates": ["Thieboudienne (riz au poisson)", "Mafé bœuf", "Poulet braisé", "Yassa poulet"]})
check("onboarding apply (recettes types)", st == 200, json.dumps(r)[:200] if st == 200 else str(r)[:200])

st, r = call("GET", "/stock", TOK2, rid=RID2)
check("stock après onboarding", st == 200, f"{len(r.get('items', []))} produits suivis (qté 0, seuil 0)")

st, r = call("POST", "/suppliers", TOK2, rid=RID2, body={"name": "Mon grossiste test", "leadTimeHours": 24, "minOrderEur": 50})
check("création fournisseur", st in (200, 201), f"HTTP {st} {str(r)[:120]}")
SUP2 = r.get("id") if isinstance(r, dict) else None

st, r = call("GET", "/catalog?q=Riz%20parfum%C3%A9", TOK2, rid=RID2)
prods = r.get("products", []) if st == 200 else []
rid_prod = next((p["id"] for p in prods if p["name"] == "Riz parfumé"), None)
if SUP2 and rid_prod:
    st, r = call("POST", f"/suppliers/{SUP2}/offers", TOK2, rid=RID2, body={"productId": rid_prod, "packLabel": "Sac 25 kg", "packQty": 25, "packPrice": 44.0})
    check("création offre/prix fournisseur", st in (200, 201), f"HTTP {st} {str(r)[:120]}")
st, r = call("GET", "/compare/" + str(rid_prod), TOK2, rid=RID2)
check("comparateur avec 1 seule offre", st == 200, str(r.get("headline") if isinstance(r, dict) else r)[:150])

# ---------------------------------------------------------------- S2 première commande (démo)
head("SCÉNARIO 2 — Première commande chez le restaurant démo (Chez Awa)")
st, d = call("GET", "/dashboard", TOK, rid=RID)
print("   dépenses 30j:", d["spend"]["last30"], "| stock:", d["stock"]["ok"], "ok /", d["stock"]["bas"], "bas /", d["stock"]["critique"], "critique")
st, cat = call("GET", "/catalog?q=poulet", TOK, rid=RID)
prods = cat.get("products", [])
poulet = next((p for p in prods if p["name"] == "Poulet entier PAC"), None)
check("recherche produit 'poulet'", bool(poulet), f"{len(prods)} résultats")
st, cmp_ = call("GET", f"/compare/{poulet['id']}", TOK, rid=RID)
check("comparateur multi-fournisseurs", st == 200 and len(cmp_.get("ranked", [])) >= 2,
      f"{len(cmp_.get('ranked', []))} offres · reco: {cmp_.get('recommended', {}).get('supplierName')} · {cmp_.get('headline', '')[:80]}")
print("      justification:", (cmp_.get("justification") or [""])[0][:150])

st, sups = call("GET", "/suppliers", TOK, rid=RID)
s0 = sups["suppliers"][0]
st, supdetail = call("GET", f"/suppliers/{s0['id']}", TOK, rid=RID)
check("fiche fournisseur (offres, historique, fiabilité)", st == 200 and "stats" in supdetail,
      f"{s0['name']} · fiabilité {s0.get('stats', {}).get('reliability')} % · {s0.get('offerCount')} offres")

offers = cmp_.get("ranked", [])
best = offers[0]
st, o = call("POST", "/orders", TOK, rid=RID, body={
    "supplierId": best["supplierId"], "lines": [{"offerId": best["offerId"], "packs": 2}]})
check("création commande", st == 201, f"{o.get('message') if isinstance(o, dict) else str(o)[:200]}")
OID = o["order"]["id"] if isinstance(o, dict) and "order" in o else None

st, m = call("GET", f"/orders/{OID}/message", TOK, rid=RID)
check("message d'envoi (WhatsApp/e-mail) généré", st == 200, str(m)[:180].replace("\n", " "))

st, s = call("POST", f"/orders/{OID}/send", TOK, rid=RID)
check("envoi commande (statut → envoyée)", st == 200, f"status={s.get('order', {}).get('status') if isinstance(s, dict) else s}")

st, l = call("GET", "/orders", TOK, rid=RID)
check("liste des commandes", st == 200 and len(l.get("orders", [])) > 0, f"{len(l.get('orders', []))} commandes")

# ---------------------------------------------------------------- S4 réception
head("SCÉNARIO 4 — Réception : commandé 2 sacs (50 kg), reçu 45 kg")
st, ol = call("GET", "/orders", TOK, rid=RID)
order = next((x for x in ol["orders"] if x["id"] == OID), None)
lines = order["lines"]
print("   ligne commandée:", lines[0]["quantity"], "kg /", lines[0]["packs"], "colis")
st, rec = call("POST", f"/orders/{OID}/receive", TOK, rid=RID, body={
    "lines": [{"lineId": lines[0]["id"], "receivedQty": 45}]})
check("réception avec écart détecté", st == 200 and len(rec.get("discrepancies", [])) > 0, json.dumps(rec.get("discrepancies"))[:160])
check("réclamation pré-rédigée", bool(rec.get("claimMessage")), (rec.get("claimMessage") or "").split("\n")[2][:110] if rec.get("claimMessage") else "")
st, disc = call("GET", "/discrepancies", TOK, rid=RID)
check("page écarts alimentée", st == 200 and len(disc.get("items", [])) > 0, f"{len(disc.get('items', []))} écarts, valeur ouverte {disc.get('openValue')} €")
st, stk = call("GET", "/stock", TOK, rid=RID)
p_after = next((i for i in stk["items"] if i["productId"] == lines[0]["productId"]), None)
check("stock incrémenté du reçu (45 kg)", p_after is not None, f"qté={p_after['quantity'] if p_after else '?'}")
st, hist = call("GET", f"/prices/{lines[0]['productId']}/history?days=365", TOK, rid=RID)
check("historique de prix après réception", st == 200 and len(hist.get("series", [])) > 0, f"{len(hist.get('series', []))} séries")

# ---------------------------------------------------------------- S3 rupture
head("SCÉNARIO 3 — Rupture / stock bas : alerte + quantité recommandée")
st, al = call("POST", "/alerts/refresh", TOK, rid=RID)
alerts = al.get("alerts", []) if isinstance(al, dict) else []
check("alertes calculées", st == 200, f"computed={al.get('computed')} inserted={al.get('inserted')} non lues={len(alerts)}")
for a in alerts[:6]:
    print("      ·", a["title"], "→", a["message"][:110])
rupt = [a for a in alerts if a["kind"] in ("rupture", "stock_bas")]
check("alertes de rupture/stock bas", len(rupt) > 0, f"{len(rupt)} alertes")
st, fc = call("GET", "/forecast?days=7", TOK, rid=RID)
if st == 200:
    items = fc.get("products", [])
    todel = [i for i in items if float(i.get("recommendedOrder", 0) or 0) > 0]
    check("prévision 7 jours avec quantités recommandées", len(items) > 0, f"{len(items)} produits, {len(todel)} à commander")
    if items:
        ex = items[0]
        print("      ex:", ex["productName"], "| besoin", ex.get("predictedNeed"), "| stock", ex.get("currentStock"), "| reco", ex.get("recommendedOrder"))
        print("      explication:", (ex.get("explanation") or "")[:200])
else:
    check("prévision", False, f"HTTP {st} {str(fc)[:200]}")

st, sc = call("GET", "/smart-cart?days=7", TOK, rid=RID)
if st == 200:
    check("panier intelligent", True, f"{len(sc.get('suppliers', []))} fournisseurs · total {sc.get('total')} € · économie {sc.get('saving')} € · {len(sc.get('unavailable', []))} indisponibles")
    for s_ in sc.get("suppliers", [])[:3]:
        print(f"      · {s_['supplierName']}: {len(s_['lines'])} lignes, {s_['subtotal']} € (min {s_['minOrder']} €, sous-min={s_['belowMinimum']})")
else:
    check("panier intelligent", False, f"HTTP {st} {str(sc)[:200]}")

# ---------------------------------------------------------------- S5 hausse de prix
head("SCÉNARIO 5 — Détection d'une hausse de prix")
st, al = call("GET", "/alerts?limit=100", TOK, rid=RID)
hausses = [a for a in al.get("alerts", []) if a["kind"] == "hausse_prix"]
check("alerte de hausse de prix (seed: +12 % huile de palme)", len(hausses) > 0, f"{len(hausses)} alertes")
for h in hausses[:3]: print("      ·", h["title"], "→", h["message"][:140])
opp = [a for a in al.get("alerts", []) if a["kind"] == "opportunite"]
check("alerte d'opportunité (moins cher ailleurs)", len(opp) > 0, f"{len(opp)} alertes")
for o_ in opp[:2]: print("      ·", o_["title"], "→", o_["message"][:140])

# ---------------------------------------------------------------- S6 analyse + IA
head("SCÉNARIO 6 — Analyse des coûts & assistant IA")
st, an = call("GET", "/sales?days=60", TOK, rid=RID)
check("ventes (source de la prévision)", st == 200, str(an)[:150])
st, rec_ = call("GET", "/recipes", TOK, rid=RID)
if st == 200:
    rr = rec_.get("recipes", [])
    check("coût matière par recette", len(rr) > 0, f"{len(rr)} recettes")
    mafe = next((x for x in rr if "mafé" in x["name"].lower()), None)
    if mafe:
        print(f"      Mafé bœuf: coût={mafe.get('cost')} € · prix vente={mafe.get('sellingPriceEur')} · marge={mafe.get('marginPct')} % · conseillé={mafe.get('suggestedPrice')} · ingrédients non chiffrés={mafe.get('unpriced')}")

questions = [
    "Que dois-je commander cette semaine ?",
    "Quels produits risquent d'être en rupture ?",
    "Pourquoi mes coûts augmentent ?",
    "Quel fournisseur est le plus fiable ?",
    "Combien me coûte réellement mon mafé ?",
    "Dois-je commander maintenant ?",
    "Trouve-moi moins cher pour le riz.",
    "Combien il me reste de plantain ?",
]
for q in questions:
    st, a = call("POST", "/assistant/ask", TOK, rid=RID, body={"question": q})
    ans = (a.get("answer") or "") if isinstance(a, dict) else ""
    check(f"IA « {q} »", st == 200 and len(ans) > 30, f"intent={a.get('intent') if isinstance(a,dict) else '?'} engine={a.get('engine') if isinstance(a,dict) else '?'} conf={a.get('confidence') if isinstance(a,dict) else '?'}")
    print("      →", ans[:260].replace("\n", " "))

# ---------------------------------------------------------------- Sécurité multi-tenant
head("SÉCURITÉ — isolation entre restaurants (cross-tenant)")
st, other = call("GET", "/dashboard", TOK2, rid=RID)
check("compte A ne peut pas lire le dashboard du compte B via X-Restaurant-Id", st == 403, f"HTTP {st} {str(other)[:100]}")
st, other2 = call("GET", "/orders", TOK2, rid=RID)
check("compte A ne peut pas lire les commandes du compte B", st == 403, f"HTTP {st}")
st, v = call("POST", "/alerts/refresh", TOK2, rid=RID)
check("compte A ne peut pas écrire chez B", st == 403, f"HTTP {st}")
st, e = call("GET", f"/orders/{OID}/message", TOK2, rid=RID2)
check("compte A ne peut pas lire le message de commande de B", st in (403, 404), f"HTTP {st}")
st, e2 = call("GET", "/catalog?q=riz")
check("catalogue sans token refusé", st == 401, f"HTTP {st}")
st, e3 = call("GET", "/admin/dashboard", TOK)
check("admin dashboard refusé à un non-admin", st == 403, f"HTTP {st}")
st, e4 = call("GET", "/admin/leads", TOK)
check("leads refusés à un non-admin", st == 403, f"HTTP {st}")
st, e5 = call("POST", "/jobs/daily", body={})
check("job cron protégé par secret", st in (401, 403), f"HTTP {st} {str(e5)[:80]}")
st, e6 = call("GET", "/status")
check("page statut publique", st == 200, str(e6)[:110])

# produit d'un autre restaurant (produit privé)
st, priv = call("POST", "/catalog/products", TOK2, rid=RID2, body={"name": "Produit prive audit", "category": "epicerie", "baseUnit": "kg"})
if st == 201:
    st, cmp_other = call("GET", f"/compare/{priv['id']}", TOK, rid=RID)
    check("un autre restaurant ne peut PAS lire un produit privé tiers (cloisonnement — BUG-6 corrigé)", st == 404,
          f"HTTP {st} → produit '{priv['name']}' visible par Chez Awa" if st == 200 else f"HTTP {st}")

print("\n" + "=" * 78)
ko = [r for r in results if not r[0]]
print(f"BILAN : {len(results) - len(ko)}/{len(results)} OK, {len(ko)} KO")
for ok, label, detail in ko:
    print("  ❌", label, "—", detail)
print("=" * 78)

# Chantier 10 : sortie non nulle en cas d'échec (la CI doit refuser une régression).
raise SystemExit(0 if not ko else 1)
