#!/usr/bin/env python3
import os
"""Chantier 1 (audit AFRISUPPLY) — vérification en direct sur l'API réelle.
Reproduit exactement les bugs prouvés lors de l'audit et vérifie qu'ils sont corrigés,
sur la base PGlite de développement (restaurant démo « Chez Awa »).
"""
import json, os, urllib.request, urllib.error, time

BASE = os.environ.get("AFS_API", "http://localhost:8787/api")
OK = lambda b: "\033[32mOK\033[0m" if b else "\033[31mÉCHEC\033[0m"
results = []

def call(method, path, token=None, body=None, rid=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    if rid: req.add_header("X-Restaurant-Id", rid)
    data = None
    if body is not None:
        data = json.dumps(body).encode(); req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=180) as r:
            b = r.read(); return r.status, (json.loads(b) if b else None)
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b"null")
        except Exception: return e.code, b.decode()[:300]

def head(t): print("\n=== " + t + " " + "=" * max(0, 78 - len(t)))
def check(label, cond, detail=""):
    results.append(bool(cond))
    print(f"  {OK(cond)} {label}" + (f" — {detail}" if detail else ""))

st, r = call("POST", "/auth/login", body={"email": "awa@chezawa.fr", "password": "demo1234"})
TOK = r["token"]
st, me = call("GET", "/auth/me", TOK); RID = me["restaurants"][0]["id"]

st, cat = call("GET", "/catalog?q=Riz%20parfum%C3%A9", TOK, rid=RID)
prod = next(p for p in cat["products"] if p["name"] == "Riz parfumé")
st, cmp_ = call("GET", f"/compare/{prod['id']}", TOK, rid=RID)
best = cmp_["ranked"][0]
SUP, OFF = best["supplierId"], best["offerId"]

def stock():
    st, s = call("GET", "/stock", TOK, rid=RID)
    return float(next((i["quantity"] for i in s["items"] if i["productId"] == prod["id"]), 0))

def order(packs, extra=None):
    body = {"supplierId": SUP, "lines": [{"offerId": OFF, "packs": packs}]}
    if extra: body.update(extra)
    st, o = call("POST", "/orders", TOK, rid=RID, body=body)
    return st, o

def order_detail(oid):
    st, ol = call("GET", "/orders", TOK, rid=RID)
    return next(x for x in ol["orders"] if x["id"] == oid)

head("BUG-1 — double réception d'une même commande")
st, o = order(2); OID = o["order"]["id"]
d = order_detail(OID); LID = d["lines"][0]["id"]; qty = float(d["lines"][0]["quantity"])
check("commande créée (2 colis)", st == 201, f"réf. {o['order']['reference']} — {qty} kg")
st, _ = call("POST", f"/orders/{OID}/send", TOK, rid=RID, body={})
check("envoi au fournisseur", st == 200, f"HTTP {st}")
q1 = stock()
st1, rec1 = call("POST", f"/orders/{OID}/receive", TOK, rid=RID, body={"lines": [{"lineId": LID, "receivedQty": qty}]})
q2 = stock()
check("1re réception acceptée", st1 == 200, f"stock {q1} → {q2} (+{round(q2-q1,3)})")
check("la réponse expose la date de réception", bool(rec1.get("receivedAt")), rec1.get("receivedAt"))
st2, rec2 = call("POST", f"/orders/{OID}/receive", TOK, rid=RID, body={"lines": [{"lineId": LID, "receivedQty": qty}]})
q3 = stock()
check("2e réception REFUSÉE (409)", st2 == 409, f"HTTP {st2} · code={rec2.get('code')} · {rec2.get('error','')[:80]}")
check("stock inchangé après le refus", abs(q3 - q2) < 0.001, f"stock {q2} → {q3}")
check("commande horodatée côté lecture", bool(order_detail(OID).get("receivedAt")))

head("BUG-2 — renvoyer / modifier une commande déjà réceptionnée")
st, s = call("POST", f"/orders/{OID}/send", TOK, rid=RID, body={})
check("renvoi refusé (409, avant : 200 + retour en « envoyée »)", st == 409, f"HTTP {st} · code={s.get('code')}")
st, s = call("PUT", f"/orders/{OID}", TOK, rid=RID, body={"status": "envoyee"})
check("changement de statut refusé (409)", st == 409, f"HTTP {st} · code={s.get('code')}")
st, s = call("PUT", f"/orders/{OID}/lines", TOK, rid=RID, body={"lines": [{"lineId": LID, "packs": 99}]})
check("modification des lignes refusée (409)", st == 409, f"HTTP {st} · code={s.get('code')}")

head("BUG-4 — volumes absurdes à la création")
st, s = order(999999)
check("999 999 colis refusés (400)", st == 400, f"HTTP {st} · {(s or {}).get('error','')[:90]}")
st, s = order(500)
check("500 colis (~12,5 t) refusés avec explication (400)", st == 400 and s.get("code") == "quantity_out_of_range",
      f"HTTP {st} · {(s or {}).get('error','')[:110]}")
st, s = order(500, {"override": True})
check("500 colis acceptés après confirmation explicite", st == 201,
      f"HTTP {st} · réf. {(s or {}).get('order',{}).get('reference','—')}")
if st == 201: call("PUT", f"/orders/{s['order']['id']}", TOK, rid=RID, body={"status": "annulee"})
st, s = order(3)
check("commande normale acceptée", st == 201, f"HTTP {st}")

head("BUG-3 — quantité reçue absurde")
st, o2 = order(2); OID2 = o2["order"]["id"]
LID2 = order_detail(OID2)["lines"][0]["id"]; q2cmd = float(order_detail(OID2)["lines"][0]["quantity"])
st, s = call("POST", f"/orders/{OID2}/receive", TOK, rid=RID, body={"lines": [{"lineId": LID2, "receivedQty": 1e12}]})
check("1e12 refusé (400, avant : 500 base de données)", st == 400, f"HTTP {st} · {(s or {}).get('error','')[:90]}")
st, s = call("POST", f"/orders/{OID2}/receive", TOK, rid=RID, body={"lines": [{"lineId": LID2, "receivedQty": 900000}]})
check("900 000 kg refusés (400 quantity_out_of_range)", st == 400 and s.get("code") == "quantity_out_of_range",
      f"HTTP {st} · {(s or {}).get('error','')[:110]}")
st, s = call("POST", f"/orders/{OID2}/receive", TOK, rid=RID, body={"lines": [{"lineId": LID2, "receivedQty": q2cmd - 1}]})
check("réception légitime toujours possible (écart enregistré)", st == 200 and s.get("discrepancies"),
      f"écarts: {len(s.get('discrepancies', []))}")

head("Scénario métier n°4 — « 50 kg commandés / 45 reçus »")
st, o3 = order(2); OID3 = o3["order"]["id"]
L3 = order_detail(OID3)["lines"][0]["id"]; q3cmd = float(order_detail(OID3)["lines"][0]["quantity"])
st, rec = call("POST", f"/orders/{OID3}/receive", TOK, rid=RID, body={"lines": [{"lineId": L3, "receivedQty": 45}]})
check("réception 45 sur 50 kg acceptée", st == 200, f"HTTP {st}")
check("écart détecté (1 ligne)", len(rec.get("discrepancies", [])) == 1,
      f"{rec.get('discrepancies')}")
check("réclamation pré-rédigée au fournisseur", "commandé 50 kg, reçu 45 kg" in (rec.get("claimMessage") or ""),
      (rec.get("claimMessage") or "").split("\n")[2][:80] if rec.get("claimMessage") else "")
od = order_detail(OID3)
check("commande clôturée en « livrée partiellement »", od["status"] == "livree_partiel", od["status"])
st, disc = call("GET", "/discrepancies", TOK, rid=RID)
check("écart visible dans l'écran Écarts", any(x.get("order", {}).get("reference") == od["reference"] or x.get("reference") == od["reference"] for x in disc.get("items", [])) or json.dumps(disc).find(od["reference"]) >= 0,
      f"{len(disc.get('items', []))} écarts en cours")
st, al = call("GET", "/alerts", TOK, rid=RID)
alerts = al.get("alerts", al.get("items", [])) if isinstance(al, dict) else []
check("alerte « Écart sur la livraison » créée",
      any(a.get("kind") == "ecart_livraison" and od["reference"] in (a.get("title") or "") for a in alerts),
      f"{len(alerts)} alertes, dont {sum(1 for a in alerts if a.get('kind') == 'ecart_livraison')} écarts de livraison")

print(f"\n{'='*80}\nRÉSULTAT CHANTIER 1 : {sum(results)}/{len(results)} vérifications en direct OK")

# Chantier 10 : la CI doit refuser une régression → sortie non nulle si un contrôle échoue.
raise SystemExit(0 if sum(results) == len(results) else 1)
