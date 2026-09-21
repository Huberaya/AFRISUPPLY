#!/usr/bin/env python3
"""Chantier 4 (audit AFRISUPPLY) — « Comprendre ses coûts en une page », vérifié sur l'API réelle.

Ce que ce script prouve, sans complaisance :
  1. un compte neuf et sans achat n'affiche AUCUN chiffre inventé ;
  2. une dépense est comptée au PRIX RÉELLEMENT FACTURÉ (chantier 3), pas au prix commandé ;
  3. la hausse de prix est chiffrée en euros sur les quantités réellement achetées ;
  4. volume et prix sont séparés dans l'explication (acheter plus ≠ payer plus cher) ;
  5. la marge d'un plat est calculée au coût réel de ses ingrédients, refusée si un prix manque ;
  6. le coût d'un plat est suivi dans le temps depuis les prix payés ;
  7. la fenêtre demandée est respectée et bornée (3 / 6 / 12 mois, refus hors bornes) ;
  8. les données d'un restaurant ne fuitent pas vers un autre ;
  9. le jeu de démonstration répond (≥ 6 mois par défaut).

Usage : AFS_API=http://localhost:8787/api python3 chantier4_verif.py
"""
import json, os, re, time, urllib.request, urllib.error

RAW = os.environ.get("AFS_API", "http://localhost:8787/api")
BASE = RAW.rstrip("/")
SITE = os.environ.get("AFS_WEB", "http://localhost:3000")
OK = lambda b: "\033[32mOK\033[0m" if b else "\033[31mÉCHEC\033[0m"
results = []
PWD = "Plantain-Yassa-42"
PACK_QTY, ORDERED_PACK, INVOICED_PACK = 25, 20.0, 22.0   # 0,80 €/kg commandé → 0,88 €/kg facturé (+10 %)
INVOICED_UNIT = INVOICED_PACK / PACK_QTY


def call(method, path, token=None, body=None, rid=None, base=None):
    req = urllib.request.Request((base or BASE) + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    if rid: req.add_header("X-Restaurant-Id", rid)
    data = None
    if body is not None:
        data = json.dumps(body).encode(); req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=90) as r:
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


print("\n=== Chantier 4 — comprendre ses coûts en une page (API réelle) ===\n")

# ---------------------------------------------------------------- A. compte neuf
print("A. Un restaurant sans aucun achat")
stamp = int(time.time())
st, reg = call("POST", "/auth/register", body={"email": f"analyse-{stamp}@audit.fr", "password": PWD, "fullName": "Test Analyse", "restaurantName": "Resto Analyse", "city": "Nantes", "coversPerDay": 60})
check("création d'un compte restaurant", st == 201, f"HTTP {st}")
TOK, RID = reg["token"], reg["restaurant"]["id"]
st, tpl = call("GET", "/onboarding/templates", TOK, rid=RID)
call("POST", "/onboarding/apply", TOK, body={"templates": [tpl["templates"][0]["name"]]}, rid=RID)
st, stock = call("GET", "/stock", TOK, rid=RID)
PID = stock["items"][0]["productId"]
st, a0 = call("GET", "/analysis", TOK, rid=RID)
check("l'analyse s'ouvre dès le premier jour", st == 200, f"HTTP {st}")
check("aucune dépense, aucune dérive inventée quand il n'y a pas d'achat",
      st == 200 and a0["spend"]["total"] == 0 and a0["drifts"] == [] and a0["prices"] == [] and a0["bySupplier"] == [],
      f"total {a0 and a0['spend']['total']} €, {len(a0['drifts'])} dérive(s)")
check("un plat hérité du modèle sans prix connu n'affiche AUCUNE marge inventée",
      all(r["costPerPortion"] is None and r["marginPct"] is None and len(r["missingPrices"]) > 0 for r in a0["recipes"]) and len(a0["recipes"]) == 1,
      json.dumps([{k: r[k] for k in ("name", "costPerPortion", "marginPct", "missingPrices")} for r in a0["recipes"]], ensure_ascii=False)[:220])
check("la phrase reste sobre et honnête", "stables" in a0["explanation"]["sentence"], a0["explanation"]["sentence"])
check("6 mois par défaut", len(a0["spend"]["months"]) == 6, str(a0["spend"]["months"]))

# ---------------------------------------------------------------- B. prix facturé
print("\nB. Premier achat : le fournisseur facture plus cher que le prix annoncé")
st, sup = call("POST", "/suppliers", TOK, body={"name": f"Grossiste Analyse {stamp}", "whatsapp": "+33600000077", "leadTimeHours": 24}, rid=RID)
SUP = sup.get("supplier", {}).get("id") or sup.get("id")
st, off = call("POST", f"/suppliers/{SUP}/offers", TOK, body={"productId": PID, "packLabel": f"sac {PACK_QTY} kg", "packQty": PACK_QTY, "packPrice": ORDERED_PACK}, rid=RID)
OFF = off.get("offer", {}).get("id") or off.get("id")
st, order = call("POST", "/orders", TOK, body={"supplierId": SUP, "channel": "whatsapp", "lines": [{"offerId": OFF, "packs": 4}]}, rid=RID)
OID = order["order"]["id"]
call("POST", f"/orders/{OID}/send", TOK, rid=RID)
st, orders = call("GET", "/orders", TOK, rid=RID)
o = next(x for x in orders["orders"] if x["id"] == OID)
LID = o["lines"][0]["id"]
st, rec = call("POST", f"/orders/{OID}/receive", TOK, body={"lines": [{"lineId": LID, "receivedQty": 100, "invoicedUnitPrice": INVOICED_UNIT}]}, rid=RID)
check("réception de 100 kg avec un prix facturé de 0,88 €/kg", st == 200, f"HTTP {st}")
st, a1 = call("GET", "/analysis", TOK, rid=RID)
check("la dépense est comptée au prix FACTURÉ (100 kg × 0,88 = 88 €) et non au prix commandé (80 €)",
      st == 200 and abs(a1["spend"]["total"] - 88) < 0.01, f"total {a1['spend']['total']} €")
check("l'analyse indique que le prix vient d'une facture", a1["spend"]["invoicedSharePct"] == 100, f"{a1['spend']['invoicedSharePct']} %")
d0 = (a1["drifts"] or [{}])[0]
check("la hausse est listée, chiffrée en euros sur la quantité réellement achetée (100 kg × 0,08 = 8 €)",
      d0.get("changePct") == 10.0 and abs(d0.get("impactEur", 0) - 8) < 0.05 and d0.get("invoiced") is True,
      json.dumps({k: d0.get(k) for k in ("productName", "firstPrice", "lastPrice", "changePct", "quantitySince", "impactEur", "invoiced")}, ensure_ascii=False))
p0 = (a1["prices"] or [{}])[0]
check("avec un seul mois de relevés, l'app refuse d'annoncer « 0 % » (ce serait faux) et donne le vrai signal produit",
      p0.get("monthCount") == 1 and p0.get("changePct") is None and p0.get("avgProductChangePct") == 10.0 and p0.get("risingProducts") == 1,
      json.dumps({k: p0.get(k) for k in ("category", "monthCount", "changePct", "avgProductChangePct", "risingProducts", "productsTracked")}, ensure_ascii=False))
c0 = (a1["explanation"]["contributors"] or [{}])[0]
check("restaurant neuf : la dépense du premier mois est attribuée au VOLUME (il n'existe aucun mois précédent) — honnête, pas de part « prix » inventée",
      c0.get("reason") == "volume" and abs(c0.get("pricePart", 0)) < 0.05 and abs(a1["explanation"]["priceEffectEur"]) < 0.05,
      json.dumps({k: c0.get(k) for k in ("productName", "pricePart", "volumePart", "reason")}, ensure_ascii=False))
check("la phrase parle d'une hausse en euros, calculée", "de plus" in a1["explanation"]["sentence"] and "88,00 €" in a1["explanation"]["sentence"],
      a1["explanation"]["sentence"])
check("l'explication renvoie au comparateur pour agir", c0.get("productUrl", "").startswith("/app/achats/comparer/"), c0.get("productUrl", ""))

# ---------------------------------------------------------------- C. volume ≠ prix
print("\nC. On achète deux fois plus au même prix : volume, pas prix")
st, order2 = call("POST", "/orders", TOK, body={"supplierId": SUP, "channel": "whatsapp", "lines": [{"offerId": OFF, "packs": 4}]}, rid=RID)
OID2 = order2["order"]["id"]
call("POST", f"/orders/{OID2}/send", TOK, rid=RID)
st, orders = call("GET", "/orders", TOK, rid=RID)
o2 = next(x for x in orders["orders"] if x["id"] == OID2)
LID2 = o2["lines"][0]["id"]
st, rec2 = call("POST", f"/orders/{OID2}/receive", TOK, body={"lines": [{"lineId": LID2, "receivedQty": 100, "invoicedUnitPrice": INVOICED_UNIT}]}, rid=RID)
check("seconde réception au même prix", st == 200, f"HTTP {st}")
st, a2 = call("GET", "/analysis", TOK, rid=RID)
ex = a2["explanation"]
check("le prix est stable : aucune dérive de prix inventée", a2["drifts"][0]["changePct"] == 10.0 and abs(ex["priceEffectEur"]) < 0.05,
      f"priceEffect {ex['priceEffectEur']} € | volumeEffect {ex['volumeEffectEur']} €")
check("l'augmentation du mois est attribuée au VOLUME (+176 €) et non au prix",
      abs(ex["volumeEffectEur"] - 176) < 0.05 and ex["contributors"] and ex["contributors"][0]["reason"] == "volume",
      ex["sentence"])

# ---------------------------------------------------------------- D. marges par plat
print("\nD. Marge d'un plat au coût réel")
st, rcp = call("POST", "/recipes", TOK, body={"name": "Plat Analyse", "sellingPriceEur": 12, "targetMarginPct": 75, "ingredients": [{"productId": PID, "quantity": 0.5}]}, rid=RID)
RCP = rcp.get("id")
check("recette créée (0,5 kg du produit par portion)", st == 201 and bool(RCP), f"HTTP {st}")
st, a3 = call("GET", "/analysis", TOK, rid=RID)
r = next((x for x in a3["recipes"] if x["id"] == RCP), None)
check("coût matière calculé au prix RÉELLEMENT payé (0,5 kg × 0,88 = 0,44 €)", r and abs(r["costPerPortion"] - 0.44) < 0.01,
      json.dumps(r and {k: r[k] for k in ("costPerPortion", "sellingPriceEur", "marginEur", "marginPct", "missingPrices")}, ensure_ascii=False))
check("marge et pourcentage calculés (12 € − 0,44 € = 11,56 €, 96,3 %)", r and abs(r["marginEur"] - 11.56) < 0.01 and r["marginPct"] == 96.3,
      f"marge {r and r['marginEur']} € · {r and r['marginPct']} %")
check("historique de coût du plat présent (issu des prix payés)", any(h["id"] == RCP and h["lastCost"] is not None for h in a3["recipeHistory"]),
      json.dumps([{k: h[k] for k in ("name", "lastCost", "changePct")} for h in a3["recipeHistory"] if h["id"] == RCP], ensure_ascii=False))
st, sales = call("POST", "/sales", TOK, body={"day": time.strftime("%Y-%m-%d"), "lines": [{"recipeId": RCP, "portions": 30}], "decrementStock": False}, rid=RID)
st, a4 = call("GET", "/analysis", TOK, rid=RID)
r4 = next((x for x in a4["recipes"] if x["id"] == RCP), None)
check("ventes prises en compte : 30 portions et marge totale réelle (30 × 11,56 = 346,80 €)",
      st == 200 and r4 and r4["portions30"] == 30 and abs(r4["marginTotalEur"] - 346.80) < 0.05,
      json.dumps(r4 and {k: r4[k] for k in ("portions30", "marginTotalEur")}, ensure_ascii=False))

# ---------------------------------------------------------------- E. fenêtre
print("\nE. Fenêtre d'analyse")
for m, expected in ((3, 3), (12, 12), (1, 1)):
    st, am = call("GET", f"/analysis?months={m}", TOK, rid=RID)
    check(f"months={m} → {expected} mois renvoyés", st == 200 and len(am["spend"]["months"]) == expected, f"HTTP {st}, {len(am.get('spend', {}).get('months', []))} mois")
for bad in ("0", "25", "abc", "-2", "2.5"):
    st, _ = call("GET", f"/analysis?months={bad}", TOK, rid=RID)
    check(f"months={bad} refusé (400)", st == 400, f"HTTP {st}")

# ---------------------------------------------------------------- F. isolation
print("\nF. Cloisonnement entre restaurants")
st, _ = call("GET", "/analysis")
check("sans jeton : 401", st == 401, f"HTTP {st}")
stamp2 = int(time.time()) + 1
st, reg2 = call("POST", "/auth/register", body={"email": f"analyse-b-{stamp2}@audit.fr", "password": PWD, "fullName": "Autre Resto", "restaurantName": "Resto B", "city": "Lyon", "coversPerDay": 40})
TOK2, RID2 = reg2["token"], reg2["restaurant"]["id"]
st, ab = call("GET", "/analysis", TOK2, rid=RID2)
check("un autre restaurant voit 0 € : aucune fuite de données", st == 200 and ab["spend"]["total"] == 0 and ab["recipes"] == [],
      f"HTTP {st}, total {ab and ab['spend']['total']} €")
st, ab2 = call("GET", "/analysis", TOK2, rid=RID)   # tentative d'accès par en-tête sur l'autre restaurant
check("impossible de lire l'analyse d'un autre restaurant via X-Restaurant-Id",
      st in (200, 403) and (st != 200 or ab2["spend"]["total"] == 0), f"HTTP {st}, total {ab2.get('spend', {}).get('total') if isinstance(ab2, dict) else ab2}")

# ---------------------------------------------------------------- G. jeu de démonstration
print("\nG. Sur le jeu de démonstration « Chez Awa »")
st, log = call("POST", "/auth/login", body={"email": "awa@chezawa.fr", "password": "demo1234"})
if st == 200:
    TOKD = log["token"]
    st, ad = call("GET", "/analysis", TOKD)
    check("analyse disponible sur la démo", st == 200, f"HTTP {st}")
    check("dépenses réelles sur 6 mois", ad["spend"]["total"] > 0 and len(ad["spend"]["months"]) == 6, f"{ad['spend']['total']} €")
    check("dérives chiffrées présentes", len(ad["drifts"]) >= 1, json.dumps([(d["productName"], d["changePct"], d["impactEur"]) for d in ad["drifts"]], ensure_ascii=False))
    check("10 plats avec marge calculée", len(ad["recipes"]) == 10 and all(r["costPerPortion"] is not None for r in ad["recipes"]), f"{len(ad['recipes'])} plats")
    check("dépenses réparties par fournisseur", len(ad["bySupplier"]) >= 2, f"{len(ad['bySupplier'])} fournisseurs")
    check("phrase d'explication calculée sur les données", len(ad["explanation"]["sentence"]) > 60 and "€" in ad["explanation"]["sentence"], ad["explanation"]["sentence"][:150])
    e = ad["explanation"]
    check("cohérence du calcul : part prix + part volume = écart total affiché",
          abs((e["priceEffectEur"] + e["volumeEffectEur"]) - e["deltaTotal"]) < 0.05,
          f"{e['priceEffectEur']} € (prix) + {e['volumeEffectEur']} € (volume) = {e['deltaTotal']} € (écart affiché)")
    check("l'indice de catégorie bouge réellement sur la démo (≥ 2 mois de relevés)",
          any(p["monthCount"] >= 2 and p["changePct"] is not None for p in ad["prices"]),
          json.dumps([(p["category"], p["monthCount"], p["changePct"], p["risingProducts"]) for p in ad["prices"]], ensure_ascii=False))
    check("les hausses sans achat sur la période ne sont pas chiffrées à « +0 € » dans le classement",
          all(d["quantitySince"] > 0 for d in ad["drifts"]) and all(d["quantitySince"] == 0 for d in ad["watchlist"]),
          f"{len(ad['drifts'])} chiffrées, {len(ad['watchlist'])} à surveiller")
    check("l'action proposée mène au comparateur pour ce produit",
          all(d["productUrl"].startswith("/app/achats/comparer/") for d in ad["explanation"]["contributors"]))
else:
    check("connexion au compte de démonstration", False, f"HTTP {st} (base démo absente ?)")


# ---------------------------------------------------------------- H. page web
print("\nH. La page servie par l'application")
src = text(f"{SITE}/src/pages/Analysis.tsx")
check("la page Analyse est bien servie par le serveur web", "__ERREUR__" not in src, src[:120] if "__ERREUR__" in src else "module récupéré")
check("elle lit le nouvel endpoint /analysis", "useApi(`/analysis?months=" in src or "useApi<Analysis>(`/analysis?months=" in src,
      next((ln.strip() for ln in src.splitlines() if "/analysis?months=" in ln), "introuvable")[:120])
check("elle affiche « pourquoi mes coûts augmentent »", "Pourquoi mes coûts" in src)
check("elle sépare prix et volume", "Volume (ce que vous achetez)" in src)
check("elle affiche la marge de chaque plat au coût réel", "Coût matière calculé avec le" in src)
check("le reliquat de backlog a disparu du sous-titre visible", "indice de prix par catégorie, marges par plat dans le temps" not in src and "pourquoi ça bouge" in src)
check("la page ne prétend pas « 0 % » quand il n'y a qu'un mois de relevés", "1 mois de relevés" in src)
check("elle distingue les hausses à surveiller de celles qui coûtent de l'argent", "À surveiller" in src)

print("\n" + "=" * 74)
passed = sum(1 for _, ok, _ in results if ok)
print(f"RÉSULTAT : {passed}/{len(results)} vérifications OK")
for label, ok, _ in results:
    if not ok: print(f"  ✗ {label}")
print("=" * 74 + "\n")

# Chantier 10 : sortie non nulle en cas d'échec (la CI doit refuser une régression).
raise SystemExit(0 if passed == len(results) else 1)
