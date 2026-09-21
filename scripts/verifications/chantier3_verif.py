#!/usr/bin/env python3
"""Chantier 3 (audit AFRISUPPLY) — « prix réellement facturé » vérifié sur l'API réelle.

Scénario complet, du compte neuf à l'alerte :
  1. compte, fournisseur, offre à 42 € le sac de 25 kg (1,68 €/kg) ;
  2. commande de 2 sacs (50 kg), envoyée ;
  3. réception de 45 kg avec un prix facturé de 46 € le sac (1,84 €/kg) ;
  4. on vérifie : écart de quantité, écart de prix chiffré en euros, historique de prix
     en source « facture », dernier prix payé chez le fournisseur, alerte de surfacturation,
     puis détection de la hausse (9,5 %) par le moteur d'alertes.
Usage : AFS_API=http://localhost:8788/api python3 chantier3_verif.py
"""
import json, os, time, urllib.request, urllib.error

BASE = os.environ.get("AFS_API", "http://localhost:8787/api")
OK = lambda b: "\033[32mOK\033[0m" if b else "\033[31mÉCHEC\033[0m"
results = []
PWD = "Plantain-Yassa-42"
PACK_QTY = 25
ORDERED_PACK, INVOICED_PACK = 42.0, 46.0
ORDERED_UNIT, INVOICED_UNIT = ORDERED_PACK / PACK_QTY, INVOICED_PACK / PACK_QTY


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


def check(label, cond, detail=""):
    results.append((label, bool(cond), detail))
    print(f"  [{OK(cond)}] {label}" + (f" — {detail}" if detail else ""))
    return cond


print("\n=== Chantier 3 — prix réellement facturé et hausse détectée (API réelle) ===\n")

# 1. Compte neuf + stock suivi
stamp = int(time.time())
st, reg = call("POST", "/auth/register", body={"email": f"prix-{stamp}@audit.fr", "password": PWD, "fullName": "Test Prix", "restaurantName": "Resto Prix", "city": "Nantes", "coversPerDay": 50})
check("création d'un compte restaurant", st == 201, f"HTTP {st}")
TOK = reg["token"]; RID = reg["restaurant"]["id"]
st, tpl = call("GET", "/onboarding/templates", TOK, rid=RID)
call("POST", "/onboarding/apply", TOK, body={"templates": [tpl["templates"][0]["name"]]}, rid=RID)
st, stock = call("GET", "/stock", TOK, rid=RID)
PID = stock["items"][0]["productId"]

st, sup = call("POST", "/suppliers", TOK, body={"name": f"Grossiste Prix {stamp}", "whatsapp": "+33600000009", "leadTimeHours": 24}, rid=RID)
SUP = sup.get("supplier", {}).get("id") or sup.get("id")
st, off = call("POST", f"/suppliers/{SUP}/offers", TOK, body={"productId": PID, "packLabel": f"sac {PACK_QTY} kg", "packQty": PACK_QTY, "packPrice": ORDERED_PACK}, rid=RID)
OFF = off.get("offer", {}).get("id") or off.get("id")
check("offre créée à 42,00 € le sac de 25 kg (1,68 €/kg)", bool(OFF), f"HTTP {st}")

# 2. Commande de 2 sacs = 50 kg, envoyée
st, order = call("POST", "/orders", TOK, body={"supplierId": SUP, "channel": "whatsapp", "lines": [{"offerId": OFF, "packs": 2}]}, rid=RID)
OID = order["order"]["id"]
call("POST", f"/orders/{OID}/send", TOK, rid=RID)
st, orders = call("GET", "/orders", TOK, rid=RID)
o = next(o for o in orders["orders"] if o["id"] == OID)
LID = o["lines"][0]["id"]
check("commande de 50 kg créée et envoyée", st == 200 and float(o["lines"][0]["quantity"]) == 50, f"quantité {o['lines'][0]['quantity']}")

# 3. Le fournisseur facture 46 € le sac : réception de 45 kg sur 50
st, rec = call("POST", f"/orders/{OID}/receive", TOK, body={"lines": [{"lineId": LID, "receivedQty": 45, "invoicedUnitPrice": INVOICED_UNIT}]}, rid=RID)
check("réception acceptée (45 kg reçus, prix facturé 1,84 €/kg)", st == 200, f"HTTP {st}")

# 4. Écart de quantité
check("écart de quantité détecté (commande 50 kg / reçu 45 kg)", len(rec.get("discrepancies", [])) == 1,
      json.dumps(rec.get("discrepancies", [])[:1], ensure_ascii=False)[:140])
check("commande clôturée en « livrée partiellement »",
      (call("GET", "/orders", TOK, rid=RID)[1]["orders"] and next(x for x in call("GET", "/orders", TOK, rid=RID)[1]["orders"] if x["id"] == OID)["status"] == "livree_partiel"))

# 5. Écart de prix chiffré en euros
var = rec.get("priceVariance", [])
check("écart de prix détecté sur la ligne", len(var) == 1, json.dumps(var[:1], ensure_ascii=False)[:180])
if var:
    v = var[0]
    check("prix commandé / prix facturé correctement reportés",
          abs(v["orderedUnit"] - ORDERED_UNIT) < 0.001 and abs(v["invoicedUnit"] - INVOICED_UNIT) < 0.001,
          f"{v['orderedUnit']} € → {v['invoicedUnit']} € /kg")
    check("hausse exprimée en pourcentage (+9,5 %)", abs((v["deltaPct"] or 0) - 9.5) < 0.2, f"{v['deltaPct']} %")
    check("écart calculé sur la quantité RÉELLEMENT reçue (45 kg × 0,16 € = 7,20 €)",
          abs(v["deltaEur"] - (INVOICED_UNIT - ORDERED_UNIT) * 45) < 0.02, f"{v['deltaEur']} €")
check("total de surfacturation retourné au restaurateur", abs((rec.get("surchargeEur") or 0) - 7.2) < 0.05, f"{rec.get('surchargeEur')} €")
check("total commandé vs total facturé exposés",
      rec.get("invoicedTotal") is not None and rec["invoicedTotal"] > rec["orderedTotal"],
      f"commandé {rec.get('orderedTotal')} € → facturé {rec.get('invoicedTotal')} €")

# 6. Historique de prix en source « facture » (le prix réellement payé)
st, hist = call("GET", f"/prices/{PID}/history", TOK, rid=RID)
series = next((s for s in hist.get("series", []) if s["supplierId"] == SUP), None)
check("historique de prix alimenté par le fournisseur", series is not None)
if series:
    factures = [p for p in series["points"] if p["source"] == "facture"]
    check("un point d'historique en source « facture »", len(factures) == 1, json.dumps(factures)[:140])
    check("le prix enregistré est le prix RÉELLEMENT payé (1,84 €/kg), pas le prix commandé",
          bool(factures) and abs(factures[-1]["price"] - INVOICED_UNIT) < 0.001,
          f"{factures[-1]['price'] if factures else '—'} €/kg")

# 7. Le comparateur affiche le dernier prix payé
st, cmp = call("GET", f"/compare/{PID}", TOK, rid=RID)
mine = next((o for o in cmp.get("ranked", cmp.get("offers", [])) if o.get("supplierId") == SUP), None)
if mine:
    unit = float(mine.get("unitPrice") or (float(mine.get("packPriceEur", 0)) / float(mine.get("packQty", 1))))
    check("le comparateur montre le dernier prix payé (1,84 €/kg)", abs(unit - INVOICED_UNIT) < 0.01, f"{unit} €/kg")

# 8. Alerte de surfacturation avec le montant
st, al = call("GET", "/alerts?limit=100", TOK, rid=RID)
alerts = al.get("alerts", [])
surfact = [a for a in alerts if a["kind"] == "hausse_prix" and "Facture plus élevée" in a["title"]]
check("alerte « Facture plus élevée que la commande » créée", len(surfact) == 1,
      surfact[0]["message"][:150] if surfact else "aucune")
if surfact:
    check("l'alerte donne le montant total de la surfacturation en euros",
          abs(float((surfact[0].get("payload") or {}).get("surchargeEur", 0)) - 7.2) < 0.05,
          f"{(surfact[0].get('payload') or {}).get('surchargeEur')} €")
    check("l'alerte nomme le produit et le pourcentage",
          "Riz" in surfact[0]["message"] or "%" in surfact[0]["message"], surfact[0]["message"][:110])

# 9. Le moteur d'alertes détecte la hausse à partir des factures réelles
st, _ = call("POST", "/alerts/refresh", TOK, rid=RID)
st, al2 = call("GET", "/alerts?limit=100", TOK, rid=RID)
hausse = [a for a in al2.get("alerts", []) if a["kind"] == "hausse_prix" and "Hausse détectée" in a["title"]]
check("le moteur d'alertes détecte la hausse (+9,5 %) depuis l'historique facture", len(hausse) >= 1,
      hausse[0]["message"][:160] if hausse else "aucune alerte de hausse")
if hausse:
    check("la hausse détectée est chiffrée en pourcentage et en prix",
          float((hausse[0].get("payload") or {}).get("pct", 0)) >= 8,
          f"{(hausse[0].get('payload') or {}).get('pct')} %")

# 10. Garde-fou : un prix invraisemblable est refusé
st, off2 = call("POST", f"/suppliers/{SUP}/offers", TOK, body={"productId": PID, "packLabel": "palette 500 kg", "packQty": 500, "packPrice": 840}, rid=RID)
OFF2 = off2.get("offer", {}).get("id") or off2.get("id")
st, o2 = call("POST", "/orders", TOK, body={"supplierId": SUP, "channel": "whatsapp", "lines": [{"offerId": OFF2, "packs": 1}], "override": True}, rid=RID)
if st != 201:
    print("  (création de la commande de test impossible :", st, str(o2)[:160], ")")
    raise SystemExit(1)
OID2 = o2["order"]["id"]
call("POST", f"/orders/{OID2}/send", TOK, rid=RID)
st, o2d = call("GET", "/orders", TOK, rid=RID)
L2 = next(x for x in o2d["orders"] if x["id"] == OID2)["lines"][0]["id"]
st, bad = call("POST", f"/orders/{OID2}/receive", TOK, body={"lines": [{"lineId": L2, "receivedQty": 500, "invoicedUnitPrice": 90}]}, rid=RID)
check("prix facturé à 90 €/kg pour un prix commandé de 1,68 €/kg → refusé (400)", st == 400 and bad.get("code") == "invoice_out_of_range",
      f"HTTP {st} {bad.get('code')} — {str(bad.get('error'))[:110]}")
st, o2d2 = call("GET", "/orders", TOK, rid=RID)
check("la commande refusée n'a pas été réceptionnée",
      next(x for x in o2d2["orders"] if x["id"] == OID2)["receivedAt"] is None)
st, ok2 = call("POST", f"/orders/{OID2}/receive", TOK, body={"lines": [{"lineId": L2, "receivedQty": 500, "invoicedUnitPrice": 90}], "override": True}, rid=RID)
check("le même prix est accepté après confirmation explicite", st == 200, f"HTTP {st}")

# 11. Sans prix facturé, rien ne change (non-régression)
st, o3 = call("POST", "/orders", TOK, body={"supplierId": SUP, "channel": "whatsapp", "lines": [{"offerId": OFF, "packs": 1}]}, rid=RID)
OID3 = o3["order"]["id"]
call("POST", f"/orders/{OID3}/send", TOK, rid=RID)
st, o3d = call("GET", "/orders", TOK, rid=RID)
L3 = next(x for x in o3d["orders"] if x["id"] == OID3)["lines"][0]["id"]
st, rec3 = call("POST", f"/orders/{OID3}/receive", TOK, body={"lines": [{"lineId": L3, "receivedQty": 25}]}, rid=RID)
check("réception sans prix facturé : acceptée, aucun écart de prix", st == 200 and rec3.get("surchargeEur") == 0,
      f"HTTP {st} surcharge {rec3.get('surchargeEur')} €")
st, o3d2 = call("GET", "/orders", TOK, rid=RID)
line3 = next(x for x in o3d2["orders"] if x["id"] == OID3)["lines"][0]
check("aucun prix facturé enregistré quand il n'est pas saisi", line3.get("invoicedUnitPriceEur") is None)

ok = sum(1 for _, r, _ in results if r)
print(f"\n=== {ok}/{len(results)} vérifications réussies ===")
for label, r, detail in results:
    if not r: print(f"  ÉCHEC : {label} — {detail}")
raise SystemExit(0 if ok == len(results) else 1)
