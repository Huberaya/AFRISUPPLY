#!/usr/bin/env python3
"""Chantier 2 (audit AFRISUPPLY) — vérification HTTP en direct sur l'API réelle.
Contrôle : route inconnue 404, en-têtes, CORS, politique de mot de passe,
mot de passe oublié / réinitialisation (jeton à usage unique), révocation des sessions,
rôles réellement appliqués, protection du dernier propriétaire.
Usage : AFS_API=http://localhost:8788/api python3 chantier2_verif.py
"""
import json, os, urllib.request, urllib.error, time

BASE = os.environ.get("AFS_API", "http://localhost:8787/api")
OK = lambda b: "\033[32mOK\033[0m" if b else "\033[31mÉCHEC\033[0m"
results = []

def call(method, path, token=None, body=None, extra=None, tries=3, max_wait=900):
    """Comme _call_once(), mais patiente si l'API limite le débit (429).

    Les points d'entrée d'authentification partagent des quotas anti-abus par IP
    (« 5 mots de passe oubliés par 15 min »). Deux suites lancées dans la même fenêtre de
    15 minutes pouvaient épuiser le quota : sans patience, un simple quota atteint était
    rapporté comme un échec du produit. On attend la fin de la fenêtre annoncée (en-tête
    Retry-After) puis on réessaie ; si le refus persiste, c'est un vrai problème.
    """
    st, j, h = _call_once(method, path, token, body, extra)
    waited = 0
    for _ in range(max(0, tries - 1)):
        if st != 429:
            break
        delay = min(int((h or {}).get("Retry-After") or 65), max_wait - waited)
        if delay <= 0:
            break
        print(f"      · quota anti-abus atteint (429) sur {method} {path} — attente {delay} s avant nouvelle tentative")
        time.sleep(delay); waited += delay
        st, j, h = _call_once(method, path, token, body, extra)
    return st, j, h

PWD = "Plantain-Yassa-42"
NEW = "Riz-Brise-2026-x"

def _call_once(method, path, token=None, body=None, extra=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    for k, v in (extra or {}).items(): req.add_header(k, v)
    data = None
    if body is not None:
        data = json.dumps(body).encode(); req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=60) as r:
            raw = r.read().decode()
            try: j = json.loads(raw)
            except Exception: j = {"raw": raw[:200]}
            return r.status, j, dict(r.headers)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: j = json.loads(raw)
        except Exception: j = {"raw": raw[:200]}
        return e.code, j, dict(e.headers)

def check(label, cond, detail=""):
    results.append((label, bool(cond), detail))
    print(f"  [{OK(cond)}] {label}" + (f" — {detail}" if detail else ""))
    return cond

print("\n=== Chantier 2 — sécurisation : vérification en direct ===\n")

# 1. Santé et accès public
st, j, h = call("GET", "/health")
check("santé publique /health", st == 200)
st, j, _ = call("GET", "/dashboard")
check("données protégées sans jeton → 401", st == 401, f"HTTP {st}")

# 2. BUG-5 : route inconnue → 404 (et non 401)
st, j, _ = call("GET", "/inconnu")
check("route inconnue → 404", st == 404 and "inconnue" in str(j.get("error", "")).lower(), f"HTTP {st} {j.get('error','')}")
st, j, _ = call("GET", "/status")
check("route publique /status toujours accessible", st == 200)

# 3. En-têtes de sécurité
st, j, h = call("GET", "/health")
hl = {k.lower(): v for k, v in h.items()}
check("API non mise en cache (no-store)", hl.get("cache-control") == "no-store", str(hl.get("cache-control")))
check("pas de reniflage de type (nosniff)", hl.get("x-content-type-options") == "nosniff")
check("pas de fuite de techno (x-powered-by absent)", "x-powered-by" not in hl)

# 4. CORS
st, j, h = call("GET", "/health", extra={"Origin": "https://attaquant.example"})
hl = {k.lower(): v for k, v in h.items()}
check("origine non autorisée → aucun en-tête CORS", "access-control-allow-origin" not in hl, str(hl.get("access-control-allow-origin")))
st, j, h = call("GET", "/health", extra={"Origin": "http://localhost:3000"})
hl = {k.lower(): v for k, v in h.items()}
check("origine autorisée (localhost:3000) → CORS limité à cette origine", hl.get("access-control-allow-origin") == "http://localhost:3000", str(hl.get("access-control-allow-origin")))
check("CORS jamais « * »", hl.get("access-control-allow-origin") != "*")

# 5. Politique de mot de passe
st, j, _ = call("GET", "/auth/password-policy")
check("politique de mot de passe exposée", st == 200 and int(j.get("minLength", 0)) >= 8, json.dumps(j)[:120])
st, j, _ = call("POST", "/auth/register", body={"email": f"faible-{int(time.time())}@audit.fr", "password": "demo1234", "fullName": "Faible", "restaurantName": "Faible"})
check("inscription refusée avec un mot de passe courant", st == 400 and j.get("code") == "weak_password", f"HTTP {st} {j.get('code','')}")

# 6. Compte de travail
stamp = int(time.time())
EMAIL = f"securite-{stamp}@audit.fr"
st, reg, _ = call("POST", "/auth/register", body={"email": EMAIL, "password": PWD, "fullName": "Test Sécurité", "restaurantName": "Resto Sécurité", "city": "Nantes"})
check("inscription avec mot de passe solide", st == 201, f"HTTP {st}")
tok0 = reg.get("token")

# 7. Mot de passe oublié : pas d'énumération des comptes
st, j, _ = call("POST", "/auth/forgot-password", body={"email": f"personne-{stamp}@nulle-part.fr"})
check("compte inconnu → réponse générique identique", st == 200 and "message" in j and "devLink" not in json.dumps(j))
st, j, _ = call("POST", "/auth/forgot-password", body={"email": EMAIL})
link = j.get("devLink", "")
check("compte existant → même réponse + lien de réinitialisation (dev)", st == 200 and "reinitialiser?token=" in link, link[:70] + "…")
token_reset = link.split("token=")[1] if "token=" in link else ""

# 8. Réinitialisation : mot de passe faible refusé, puis valide
st, j, _ = call("POST", "/auth/reset-password", body={"token": token_reset, "password": "azerty123"})
check("réinitialisation refusée si mot de passe faible", st == 400 and j.get("code") == "weak_password")
st, j, _ = call("POST", "/auth/reset-password", body={"token": token_reset, "password": NEW})
check("réinitialisation acceptée avec un mot de passe solide", st == 200, f"HTTP {st}")

# 9. Révocation : l'ancienne session tombe, le lien ne resert pas
st, j, _ = call("GET", "/dashboard", token=tok0)
check("jeton d'avant la réinitialisation → révoqué (401 session_revoked)", st == 401 and j.get("code") == "session_revoked", f"HTTP {st} {j.get('code','')}")
st, j, _ = call("POST", "/auth/reset-password", body={"token": token_reset, "password": "Autre-Mot-De-Passe-9"})
check("lien de réinitialisation à usage unique", st == 400 and j.get("code") == "reset_invalid")
st, j, _ = call("POST", "/auth/login", body={"email": EMAIL, "password": PWD})
check("ancien mot de passe refusé après réinitialisation", st == 401)
st, j, _ = call("POST", "/auth/login", body={"email": EMAIL, "password": NEW})
tok1 = j.get("token")
check("connexion avec le nouveau mot de passe", st == 200 and bool(tok1))

# 10. Changement de mot de passe : l'appareil courant survit, les autres non
st, j, _ = call("POST", "/auth/login", body={"email": EMAIL, "password": NEW})
tok2 = j.get("token")
st, j, _ = call("POST", "/auth/password", token=tok1, body={"currentPassword": "Faux-Mot-De-Passe-1", "newPassword": "Bissap-Gingembre-8"})
check("changement refusé si mot de passe actuel erroné", st == 401)
st, j, _ = call("POST", "/auth/password", token=tok1, body={"currentPassword": NEW, "newPassword": "Bissap-Gingembre-8"})
tok3 = j.get("token")
check("changement de mot de passe accepté (nouveau jeton renvoyé)", st == 200 and bool(tok3))
st, j, _ = call("GET", "/dashboard", token=tok3)
check("appareil courant toujours connecté après changement", st == 200, f"HTTP {st}")
st, j, _ = call("GET", "/dashboard", token=tok2)
check("autre appareil déconnecté après changement", st == 401 and j.get("code") == "session_revoked", f"HTTP {st} {j.get('code','')}")

# 11. Rôles : le propriétaire invite un employé
st, demo, _ = call("POST", "/auth/login", body={"email": "awa@chezawa.fr", "password": "demo1234"})
own = demo.get("token"); rid = demo.get("restaurant", {}).get("id")
check("connexion propriétaire (démo)", st == 200 and bool(own), f"HTTP {st}")
ins = f"employe-{stamp}@audit.fr"
st, j, _ = call("POST", "/members", token=own, body={"email": ins, "fullName": "Kofi Employé", "role": "staff"})
check("invitation d'un employé par le propriétaire", st == 201, f"HTTP {st} {json.dumps(j)[:100]}")
st = 0
if st == 0 and j.get("devLink"):
    t_inv = j["devLink"].split("token=")[1]
    st, j2, _ = call("POST", "/auth/reset-password", body={"token": t_inv, "password": PWD})
    check("l'employé choisit son mot de passe via le lien d'invitation", st == 200, f"HTTP {st}")
st, j, _ = call("POST", "/members", token=own, body={"email": ins, "role": "staff"})
check("double invitation refusée (409)", st == 409, f"HTTP {st}")
st, j, _ = call("POST", "/auth/login", body={"email": ins, "password": PWD})
staff = j.get("token")
check("connexion de l'employé", st == 200)
H = {"X-Restaurant-Id": rid} if rid else {}
st, j, _ = call("GET", "/members", token=staff, extra=H)
check("l'employé voit l'équipe et son propre rôle", st == 200 and j.get("me", {}).get("role") == "staff", json.dumps(j.get("me", {})))
st, j, _ = call("GET", "/stock", token=staff, extra=H)
check("l'employé accède au stock", st == 200, f"HTTP {st}")
st, j, _ = call("POST", "/suppliers", token=staff, extra=H, body={"name": "Fournisseur interdit"})
check("l'employé ne peut pas créer de fournisseur → 403", st == 403 and j.get("code") == "role_required", f"HTTP {st} {j.get('code','')}")
st, j, _ = call("PUT", "/settings", token=staff, extra=H, body={"name": "Piraté"})
check("l'employé ne peut pas modifier les réglages → 403", st == 403 and j.get("code") == "role_required", f"HTTP {st}")
st, j, _ = call("POST", "/billing/checkout", token=staff, extra=H, body={})
check("l'employé ne peut pas payer → 403", st == 403, f"HTTP {st}")

# 12. Dernier propriétaire protégé
st, me, _ = call("GET", "/auth/me", token=own)
uid = me.get("user", {}).get("id")
st, j, _ = call("PATCH", f"/members/{uid}", token=own, body={"role": "staff"})
check("le dernier propriétaire ne peut pas être rétrogradé (409)", st == 409, f"HTTP {st} {j.get('error','')}")
st, j, _ = call("DELETE", f"/members/{uid}", token=own)
check("le dernier propriétaire ne peut pas être retiré (409)", st == 409, f"HTTP {st}")

# 13. Déconnexion de tous les appareils
st, j, _ = call("POST", "/auth/logout-all", token=tok3)
check("déconnexion globale acceptée", st == 200, f"HTTP {st}")
st, j, _ = call("GET", "/dashboard", token=tok3)
check("jeton invalidé immédiatement après déconnexion globale", st == 401 and j.get("code") == "session_revoked", f"HTTP {st} {j.get('code','')}")

# 14. Isolation : un membre retiré perd l'accès
st, lst, _ = call("GET", "/members", token=own)
emp = next((m for m in lst.get("members", []) if m["email"] == ins), None)
if emp:
    st, j, _ = call("DELETE", f"/members/{emp['userId']}", token=own)
    check("retrait d'un membre par le propriétaire", st == 200, f"HTTP {st}")
    st, j, _ = call("GET", "/stock", token=staff, extra=H)
    check("le membre retiré perd l'accès aux données du restaurant", st in (401, 403), f"HTTP {st}")
else:
    check("retrait d'un membre", False, "membre introuvable")

# Récapitulatif
ok = sum(1 for _, r, _ in results if r)
print(f"\n=== {ok}/{len(results)} vérifications réussies ===")
for label, r, detail in results:
    if not r: print(f"  ÉCHEC : {label} — {detail}")
raise SystemExit(0 if ok == len(results) else 1)
