#!/usr/bin/env python3
"""Chantier 5 (audit AFRISUPPLY) — accès et récupération de compte, vérifiés sur l'API réelle.

Ce que ce script prouve, sans complaisance :
  1. une adresse e-mail se confirme réellement (jeton d'un seul usage, 48 h, réponse honnête sur l'envoi) ;
  2. un mot de passe oublié se récupère (jeton unique, ancien mot de passe mort, sessions révoquées) ;
  3. les rôles sont appliqués CÔTÉ SERVEUR (propriétaire / responsable / employé), et un changement
     de rôle prend effet immédiatement, même sur un jeton déjà émis ;
  4. le dernier propriétaire ne peut être ni rétrogradé ni retiré ;
  5. l'interface servie par le web contient bien le bandeau et la page de confirmation.

Usage : AFS_API=http://localhost:8787/api AFS_WEB=http://localhost:3000 python3 chantier5_verif.py
"""
import json, os, time, urllib.request, urllib.error
from urllib.parse import urlparse, parse_qs

BASE = os.environ.get("AFS_API", "http://localhost:8787/api").rstrip("/")
SITE = os.environ.get("AFS_WEB", "http://localhost:3000")
OK = lambda b: "\033[32mOK\033[0m" if b else "\033[31mÉCHEC\033[0m"
results = []
PWD = "Plantain-Yassa-42"


def _call_once(method, path, token=None, body=None, rid=None):
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


def call(method, path, token=None, body=None, rid=None, tries=3, max_wait=900):
    """Comme _call_once(), mais patiente si l'API limite le débit (429).

    Vérifier les parcours de compte consomme les quotas anti-abus (5 mots de passe oubliés
    par 15 min, 10 réinitialisations par 15 min). Une suite complète peut épuiser la fenêtre :
    sans patience, ce simple quota était rapporté comme un échec du produit. On attend la
    fenêtre annoncée (Retry-After) puis on réessaie ; si le refus persiste, il est réel.
    """
    st, data = _call_once(method, path, token, body, rid)
    waited = 0
    for _ in range(max(0, tries - 1)):
        if st != 429:
            break
        delay = min(65, max_wait - waited)
        if delay <= 0:
            break
        print(f"      · quota anti-abus atteint (429) sur {method} {path} — attente {delay} s avant nouvelle tentative")
        time.sleep(delay); waited += delay
        st, data = _call_once(method, path, token, body, rid)
    return st, data


def text(url):
    try:
        with urllib.request.urlopen(url, timeout=60) as r: return r.read().decode("utf-8", "replace")
    except Exception as e: return f"__ERREUR__ {e}"


def token_from(link):
    return parse_qs(urlparse(link).query).get("token", [""])[0]


def check(label, cond, detail=""):
    results.append((label, bool(cond), detail))
    print(f"  [{OK(cond)}] {label}" + (f" — {detail}" if detail else ""))
    return cond


print("\n=== Chantier 5 — accès et récupération de compte (API réelle) ===\n")
stamp = int(time.time())

# ---------------------------------------------------------------- A. confirmation d'adresse
print("A. Confirmation de l'adresse e-mail")
st, reg = call("POST", "/auth/register", body={
    "email": f"patron-{stamp}@audit5.fr", "password": PWD, "fullName": "Awa Patron",
    "restaurantName": "Chez Awa Cinq", "city": "Nantes", "coversPerDay": 70})
check("inscription acceptée", st == 201, f"HTTP {st}")
TOK, RID = reg["token"], reg["restaurant"]["id"]
check("l'inscription dit la vérité : adresse non confirmée + statut d'envoi réel",
      reg.get("emailVerified") is False and reg["emailVerification"]["delivered"] is True and reg["emailVerification"]["transport"] in ("file", "resend"),
      json.dumps(reg.get("emailVerification", {}), ensure_ascii=False)[:160])
devlink = reg["emailVerification"].get("devLink", "")
check("en développement, le lien réel est fourni (sinon impossible de tester le parcours)", "/verifier-email?token=" in devlink, devlink[:80])
st, me = call("GET", "/auth/me", token=TOK)
check("/auth/me expose l'état de l'adresse", me["user"]["emailVerified"] is False and me["user"]["emailVerifiedAt"] is None)

bad = call("POST", "/auth/verify-email", body={"token": "jeton-invente-0123456789abcdef"})
check("un jeton inconnu est refusé (400)", bad[0] == 400 and bad[1].get("code") == "verify_invalid", f"HTTP {bad[0]}")
st, ver = call("POST", "/auth/verify-email", body={"token": token_from(devlink)})
check("le lien de confirmation fonctionne", st == 200 and ver.get("alreadyVerified") is False, json.dumps(ver, ensure_ascii=False)[:130])
st, me = call("GET", "/auth/me", token=TOK)
check("l'adresse est confirmée pour de bon", st == 200 and me["user"]["emailVerified"] is True and bool(me["user"]["emailVerifiedAt"]))
st, again = call("POST", "/auth/verify-email", body={"token": token_from(devlink)})
check("le même lien recliqué n'est pas une erreur (déjà confirmée)", st == 200 and again.get("alreadyVerified") is True, json.dumps(again, ensure_ascii=False)[:110])
st, resend = call("POST", "/auth/resend-verification", token=TOK)
check("un renvoi sur une adresse déjà confirmée ne renvoie rien d'inutile", st == 200 and resend.get("alreadyVerified") is True)

# ---------------------------------------------------------------- B. mot de passe oublié
print("\nB. Mot de passe oublié : un seul usage, anciennes sessions mortes")
st, forgot = call("POST", "/auth/forgot-password", body={"email": f"patron-{stamp}@audit5.fr"})
check("demande acceptée et envoi réel annoncé", st == 200 and forgot.get("delivered") is True, f"HTTP {st}")
check("lien de réinitialisation fourni en développement", "/reinitialiser?token=" in forgot.get("devLink", ""), forgot.get("devLink", "")[:80])
reset_tok = token_from(forgot.get("devLink", ""))
st, reset = call("POST", "/auth/reset-password", body={"token": reset_tok, "password": "Nouveau-Mot-De-Passe-9"})
check("réinitialisation acceptée", st == 200, f"HTTP {st}")
st, reuse = call("POST", "/auth/reset-password", body={"token": reset_tok, "password": "Encore-Un-Autre-42"})
check("le même lien ne sert qu'une fois (400 reset_invalid)", st == 400 and reuse.get("code") == "reset_invalid", f"HTTP {st}")
st, old = call("GET", "/auth/me", token=TOK)
check("les sessions ouvertes avant la réinitialisation sont révoquées (401)", st == 401, f"HTTP {st} {old.get('code') if isinstance(old, dict) else ''}")
st, bad_login = call("POST", "/auth/login", body={"email": f"patron-{stamp}@audit5.fr", "password": PWD})
check("l'ancien mot de passe ne fonctionne plus (401)", st == 401, f"HTTP {st}")
st, login = call("POST", "/auth/login", body={"email": f"patron-{stamp}@audit5.fr", "password": "Nouveau-Mot-De-Passe-9"})
check("le nouveau mot de passe fonctionne", st == 200 and bool(login.get("token")), f"HTTP {st}")
OWNER = login["token"]

# ---------------------------------------------------------------- C. rôles appliqués
print("\nC. Rôles appliqués côté serveur")


def invite(email, role, name):
    st, inv = call("POST", "/members", OWNER, body={"email": email, "fullName": name, "role": role}, rid=RID)
    assert st == 201, (st, inv)
    link = inv.get("devLink", "")
    st, _ = call("POST", "/auth/reset-password", body={"token": token_from(link), "password": "Mot-De-Passe-Equipe-3"})
    assert st == 200, st
    st, log = call("POST", "/auth/login", body={"email": email, "password": "Mot-De-Passe-Equipe-3"})
    assert st == 200, (st, log)
    return log["token"], log["user"]["id"]


MANAGER, MID = invite(f"responsable-{stamp}@audit5.fr", "manager", "Awa Responsable")
STAFF, SID = invite(f"employe-{stamp}@audit5.fr", "staff", "Awa Employée")
check("un responsable et un employé ont rejoint l'équipe (invitation par lien reçu)", bool(MANAGER and STAFF))
st, members = call("GET", "/members", OWNER, rid=RID)
check("les trois rôles coexistent", st == 200 and sorted(m["role"] for m in members["members"]) == ["manager", "owner", "staff"],
      json.dumps([(m["fullName"], m["role"]) for m in members["members"]], ensure_ascii=False))

st, me_staff = call("GET", "/auth/me", STAFF)
check("l'employé voit son rôle réel dans l'application", st == 200 and any(r["role"] == "staff" for r in me_staff["restaurants"]),
      json.dumps([(r["name"], r["role"]) for r in me_staff["restaurants"]], ensure_ascii=False))
check("l'application sait si un e-mail peut réellement partir", st == 200 and me_staff.get("mailTransport") in ("file", "resend", "log"), str(me_staff.get("mailTransport")))

bloque = [
    ("POST", "/members", {"email": f"intrus-{stamp}@audit5.fr", "role": "staff"}, "inviter un membre"),
    ("PATCH", f"/members/{MID}", {"role": "staff"}, "changer un rôle"),
    ("DELETE", f"/members/{MID}", None, "retirer un membre"),
    ("PUT", "/settings", {"digestHour": 6}, "modifier les réglages"),
    ("POST", "/billing/checkout", {}, "payer un abonnement"),
    ("GET", "/account/export", None, "exporter les données"),
]
for method, path, body, label in bloque:
    st, r = call(method, path, STAFF, body=body, rid=RID)
    check(f"employé → {label} : refusé 403 role_required", st == 403 and r.get("code") == "role_required", f"HTTP {st}")
st, r = call("DELETE", "/account", STAFF, body={"password": "Mot-De-Passe-Equipe-3", "confirm": "SUPPRIMER"})
check("employé → supprimer le compte du restaurant : refusé 403 (exigé : owner)", st == 403 and r.get("requiredRole") == "owner", f"HTTP {st}")
st, still = call("GET", "/auth/me", OWNER)
check("…et le restaurant existe toujours", st == 200, f"HTTP {st}")

st, exp = call("GET", "/account/export", MANAGER)
check("responsable → export des données : autorisé", st == 200, f"HTTP {st}")
for method, path, body, label in [("POST", "/members", {"email": f"x-{stamp}@audit5.fr", "role": "staff"}, "inviter"),
                                  ("POST", "/billing/checkout", {}, "payer")]:
    st, r = call(method, path, MANAGER, body=body, rid=RID)
    check(f"responsable → {label} : refusé 403", st == 403, f"HTTP {st}")
st, _ = call("DELETE", f"/suppliers/00000000-0000-0000-0000-000000000000", MANAGER, rid=RID)
check("responsable → supprimer un fournisseur : refusé (réservé au propriétaire, 403)", st == 403, f"HTTP {st}")

# changement de rôle immédiat, sur le jeton déjà émis
st, _ = call("PATCH", f"/members/{MID}", OWNER, body={"role": "staff"}, rid=RID)
st, after = call("GET", "/account/export", MANAGER)
check("rétrogradé, l'ancien responsable perd l'accès IMMÉDIATEMENT (même jeton)", st == 403, f"HTTP {st}")
st, _ = call("PATCH", f"/members/{MID}", OWNER, body={"role": "manager"}, rid=RID)
st, back = call("GET", "/account/export", MANAGER)
check("promu de nouveau, il retrouve l'accès sans se reconnecter", st == 200, f"HTTP {st}")

st, demote = call("PATCH", f"/members/{login['user']['id']}", OWNER, body={"role": "staff"}, rid=RID)
check("le dernier propriétaire ne peut pas se rétrograder (409)", st == 409, f"HTTP {st}")
st, remove = call("DELETE", f"/members/{login['user']['id']}", OWNER, rid=RID)
check("le dernier propriétaire ne peut pas se retirer (409)", st == 409, f"HTTP {st}")

# cloisonnement : un autre restaurant ne voit rien
st, reg2 = call("POST", "/auth/register", body={"email": f"autre-{stamp}@audit5.fr", "password": PWD, "fullName": "Autre Patron", "restaurantName": "Resto Six", "city": "Rennes", "coversPerDay": 20})
OTHER, RID2 = reg2["token"], reg2["restaurant"]["id"]
st, cross = call("GET", "/members", OTHER, rid=RID)
check("un autre restaurant ne peut pas lire l'équipe d'autrui (403/404)", st in (403, 404), f"HTTP {st}")
st, mine = call("GET", "/members", OTHER, rid=RID2)
check("…et il ne voit que la sienne", st == 200 and len(mine["members"]) == 1, f"{len(mine.get('members', []))} membre(s)")

# ---------------------------------------------------------------- D. ce que le web sert vraiment
print("\nD. Interface réellement servie par l'application")
layout = text(f"{SITE}/src/components/AppLayout.tsx")
verify = text(f"{SITE}/src/pages/VerifyEmail.tsx")
settings = text(f"{SITE}/src/pages/Settings.tsx")
check("le bandeau de confirmation est dans la page principale", "Confirmez votre adresse e-mail" in layout and "Renvoyer le lien" in layout, layout[:0] or "module AppLayout récupéré")
check("la page /verifier-email existe", "__ERREUR__" not in verify and "verify-email" in verify)
check("les réglages montrent l'état réel de l'adresse", "Adresse non confirmée" in settings and "MailWarning" in settings)
check("la route /verifier-email est déclarée", "verifier-email" in text(f"{SITE}/src/App.tsx"))

print("\n" + "=" * 74)
passed = sum(1 for _, ok, _ in results if ok)
print(f"RÉSULTAT CHANTIER 5 : {passed}/{len(results)} vérifications OK")
for label, ok, _ in results:
    if not ok: print(f"  ✗ {label}")
print("=" * 74 + "\n")

# Chantier 10 : sortie non nulle en cas d'échec (la CI doit refuser une régression).
raise SystemExit(0 if passed == len(results) else 1)
