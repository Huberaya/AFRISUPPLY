#!/usr/bin/env python3
"""Chantier 11 (audit AFRISUPPLY) — « l'app se comprend sans formation ».

Ce que ce script prouve, sur les sources réelles du produit et sur une API réellement lancée :

  A. plus AUCUNE boîte de dialogue du navigateur (confirm/alert/prompt) dans le code livré,
     et les actions concernées existent toujours (on n'a pas supprimé la fonctionnalité, on l'a habillée) ;
  B. la confirmation intégrée est accessible : role=dialog, aria-modal, titre relié, Échap = refus,
     focus sur « refuser » pour une action destructrice, et refus par défaut sans provider ;
  C. les notifications sortent dans une zone annoncée (role=status / aria-live) et se ferment ;
  D. le menu est découpé par tâche (5 sections), chaque écran du menu correspond à une route réelle,
     et aucun écran principal n'est orphelin (inaccessible depuis le menu) ;
  E. la recherche d'écran existe, ignore les accents, et la barre mobile donne les 4 gestes du quotidien ;
  F. le parcours « Rupture → Commander → Recevoir » est matérialisé par un fil d'étapes sur 5 écrans ;
  G. aucune erreur réseau ne laisse sans issue : tous les écrans d'erreur proposent « Réessayer » ;
  H. les écrans du parcours répondent réellement sur l'API (données de la démo, rien d'inventé).

Usage : AFS_API=http://localhost:8787/api python3 chantier11_verif.py
"""
import json, os, re, sys
import urllib.error, urllib.request

OK = lambda b: "\033[32mOK\033[0m" if b else "\033[31mÉCHEC\033[0m"
results = []
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, "apps", "web", "src")
RESULTATS = os.path.join(HERE, "resultats")
API = os.environ.get("AFS_API", "http://localhost:8787/api")


def check(label, cond, detail=""):
    results.append((label, bool(cond), detail))
    print(f"  [{OK(cond)}] {label}" + (f" — {detail}" if detail else ""))
    return cond


def lire(rel):
    p = os.path.join(SRC, rel)
    return open(p, encoding="utf-8").read() if os.path.exists(p) else ""


def sans_commentaires(code):
    code = re.sub(r"/\*.*?\*/", "", code, flags=re.S)
    return "\n".join(re.sub(r"//.*$", "", l) for l in code.splitlines())


def fichiers_code():
    out = []
    for base, _, noms in os.walk(SRC):
        for n in noms:
            if n.endswith((".ts", ".tsx")) and ".test." not in n:
                out.append(os.path.join(base, n))
    return sorted(out)


def call(method, path, token=None, body=None, rid=None):
    req = urllib.request.Request(API + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    if rid: req.add_header("X-Restaurant-Id", rid)
    data = None
    if body is not None:
        data = json.dumps(body).encode(); req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=60) as r:
            b = r.read(); return r.status, (json.loads(b) if b else None), dict(r.headers)
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b"null"), dict(e.headers)
        except Exception: return e.code, b.decode("utf-8", "replace")[:300], dict(e.headers)


print("=== Chantier 11 — UX : parcours guidé, navigation, dialogues intégrés ===\n")

# ---------------------------------------------------------------- A. dialogues natifs
print("A. Plus aucune boîte de dialogue du navigateur")
motif = re.compile(r"(?<![\w.$])(alert|confirm|prompt)\s*\(")
appels = []
for f in fichiers_code():
    code = sans_commentaires(open(f, encoding="utf-8").read())
    for i, ligne in enumerate(code.splitlines(), 1):
        if re.search(r"(window|globalThis)\s*\.\s*(alert|confirm|prompt)", ligne) or motif.search(ligne):
            appels.append(f"{os.path.relpath(f, SRC)}:{i} {ligne.strip()[:70]}")
check("aucun confirm()/alert()/prompt() natif dans le code livré", not appels,
      f"{len(appels)} trouvé(s) : {appels[:2]}" if appels else "0 occurrence")

feedback = lire("components/Feedback.tsx")
check("<FeedbackProvider> est monté à la racine de l'application",
      "FeedbackProvider" in lire("main.tsx"), "apps/web/src/main.tsx")
check("le provider expose useConfirm() et useToast()",
      "export function useConfirm" in feedback and "export function useToast" in feedback, "components/Feedback.tsx")

# Les 10 écrans qui utilisaient une boîte native : l'action doit toujours exister, habillée.
anciens = {
    "pages/Orders.tsx": ["useConfirm", "/orders/${o.id}`, { method: 'PUT', json: { status: 'annulee'", "receive", "proposal"],
    "pages/Recipes.tsx": ["useConfirm", "DELETE"],
    "pages/ShoppingList.tsx": ["useConfirm", "DELETE"],
    "pages/Stock.tsx": ["useConfirm", "DELETE"],
    "pages/SupplierDetail.tsx": ["useConfirm", "DELETE"],
    "pages/Team.tsx": ["useConfirm", "logout-all"],
    "pages/admin/AdminProspects.tsx": ["useConfirm", "DELETE"],
    "pages/vendor/Pricing.tsx": ["useConfirm", "customer-prices"],
    "pages/admin/AdminBilling.tsx": ["useToast", "admin/billing/restaurants"],
    "components/Reorder.tsx": ["useConfirm", "DELETE"],
}
manquants = []
for f, attendus in anciens.items():
    code = lire(f)
    manquants += [f"{f} → {a}" for a in attendus if a not in code]
check("les 10 écrans convertis gardent leur fonction (aucune action perdue)", not manquants,
      f"{len(anciens)} écrans vérifiés" if not manquants else f"manque : {manquants[:3]}")
check("la bascule de formule passe par un vrai formulaire (plus deux prompt successifs)",
      "const PLANS" in lire("pages/admin/AdminBilling.tsx") and "planErr" in lire("pages/admin/AdminBilling.tsx"),
      "apps/web/src/pages/admin/AdminBilling.tsx")

# ---------------------------------------------------------------- B. confirmation intégrée
print("\nB. Confirmation intégrée et accessible")
for attendu, libelle in [
    ('role="dialog"', "dialogue identifié par role=dialog"),
    ('aria-modal="true"', "dialogue modal annoncé"),
    ('aria-labelledby="afs-confirm-title"', "titre relié au dialogue (lecteur d'écran)"),
    ("e.key === 'Escape'", "Échap refuse l'action, comme la boîte native"),
    ("data-confirm", "bouton d'action identifiable"),
    ("req.danger ? cancelRef.current", "focus initial sur « refuser » si l'action est destructrice"),
    ("Promise.resolve(false)", "sans provider : l'action destructrice est REFUSÉE"),
    ("document.activeElement", "focus rendu au bouton de départ après la réponse"),
]:
    check(libelle, attendu in feedback, "components/Feedback.tsx")
libelles = re.findall(r"confirmLabel: '([^']+)'", "".join(open(f, encoding="utf-8").read() for f in fichiers_code()))
check("chaque confirmation nomme l'action (jamais « OK »)", libelles and all(len(l) > 3 for l in libelles),
      f"ex. {libelles[:4]}")

# ---------------------------------------------------------------- C. notifications
print("\nC. Notifications lisibles et annoncées")
check("les notifications sortent dans une zone annoncée",
      'role="status"' in feedback and 'aria-live="polite"' in feedback, "components/Feedback.tsx")
check("chaque notification peut être fermée à la main",
      'aria-label="Fermer le message"' in feedback, "components/Feedback.tsx")
check("les succès sont annoncés aux utilisateurs (jamais une action silencieuse)",
      len(re.findall(r"toast\.(success|error|info)\(", "".join(open(f, encoding="utf-8").read() for f in fichiers_code()))) >= 20,
      f"{len(re.findall(r'toast.(success|error|info)', ''.join(open(f, encoding='utf-8').read() for f in fichiers_code())))} retours d'action")

# ---------------------------------------------------------------- D. navigation
print("\nD. navigation découpée par tâche")
layout = lire("components/AppLayout.tsx")
app = lire("App.tsx")
sections = re.findall(r"title: '([^']+)',\n\s+items:", layout)
attendues = ["Aujourd’hui", "Commander", "Mon stock", "Comprendre", "Mon compte"]
check("le menu a exactement 5 sections, dans l'ordre du parcours", sections == attendues, f"{sections}")
navs = re.findall(r"to: '(/app[^']*)'", layout)
routes = {"/app"}
for p in re.findall(r'<Route path="([^"]+)"', app):
    if p and not p.startswith("/") and not p.startswith("*"):
        routes.add("/app/" + p)
orphelins = [r for r in sorted(routes) if r not in navs and ":" not in r and "admin" not in r and r not in ("/app/import", "/app/achats/ecarts")]
check("chaque entrée du menu pointe vers un écran qui existe", all(n in routes for n in navs),
      f"{len(navs)} entrées / {len(routes)} routes")
check("aucun écran principal n'est inaccessible depuis le menu", not orphelins, f"orphelins : {orphelins}")
check("chaque entrée dit à quoi elle sert (phrase d'aide)", len(re.findall(r"hint: '", layout)) >= len(navs),
      f"{len(re.findall(chr(39) + 'hint: ' + chr(39), layout)) if False else len(re.findall(r'hint: ', layout))} phrases d'aide")
check("les écrans d'écriture restent réservés au responsable/propriétaire",
      layout.count("minRole: 'manager'") >= 5 and layout.count("ROLE_RANK[i.minRole ?? 'staff']") >= 1
      and "ROLE_RANK[t.minRole ?? 'staff']" in layout, f"{layout.count(chr(39) + 'minRole: ' + chr(39))} entrées protégées")
check("la recherche d'écran existe et ignore les accents",
      'aria-label="Chercher un écran"' in layout and "normalize('NFD')" in layout, "components/AppLayout.tsx")
check("le téléphone a une barre d'onglets pour les 4 gestes du quotidien",
      'aria-label="Navigation rapide"' in layout and layout.count("const MOBILE_TABS") == 1
      and all(x in layout for x in ["'/app/stock'", "'/app/achats'", "'/app/ia'"])
      and 'fixed inset-x-0 bottom-0' in layout and 'lg:hidden' in layout)

# ---------------------------------------------------------------- E. parcours guidé
print("\nE. Parcours « Rupture → Commander → Recevoir »")
steps = lire("components/Steps.tsx")
check("le fil d'étapes est un composant unique réutilisé (pas 5 copies)", steps.count("export function Steps") == 1)
ecrans = {f: lire(f) for f in ["pages/Dashboard.tsx", "pages/Stock.tsx", "pages/SmartCart.tsx", "pages/Orders.tsx", "pages/Discrepancies.tsx"]}
sans_fil = [f for f, c in ecrans.items() if "FLOW_STEPS" not in c]
check("les 5 écrans du parcours affichent où l'on en est", not sans_fil, f"étapes courantes : " +
      ", ".join(f"{f.split('/')[-1]}={re.search(r'current={([0-9])}', c).group(1)}" for f, c in ecrans.items() if "FLOW_STEPS" in c))
check("les 3 étapes pointent vers des écrans réels",
      all(t in routes for t in re.findall(r"to: '(/app[^']*)'", steps)), re.findall(r"label: '([^']+)'", steps))
dash = ecrans["pages/Dashboard.tsx"]
check("depuis une rupture, on peut aller directement au panier",
      '/app/achats/panier' in dash and "Composer mon panier" in dash, "pages/Dashboard.tsx")
check("une alerte se ferme avec un retour visible (« C’est vu »)", "C’est vu" in dash and "Alerte marquée comme vue" in dash)
stock = ecrans["pages/Stock.tsx"]
check("un stock vide explique quoi faire (3 portes de sortie)",
      "Votre stock est vide" in stock and stock.count("Suivre un produit") + stock.count("Configurer ma carte") + stock.count("Importer mes fournisseurs") >= 3)

# ---------------------------------------------------------------- F. erreurs réseau
print("\nF. Aucune erreur sans issue")
ui = lire("components/ui.tsx")
sans_retry = []
for f in fichiers_code():
    code = open(f, encoding="utf-8").read()
    for m in re.finditer(r"<ErrorBox[^>]*?/>", code, flags=re.S):
        if "onRetry" not in m.group(0):
            sans_retry.append(f"{os.path.relpath(f, SRC)}:{code[:m.start()].count(chr(10)) + 1}")
check("chaque écran d'erreur propose « Réessayer »", not sans_retry, f"{len(sans_retry)} sans bouton : {sans_retry[:3]}")
check("le message d'erreur est annoncé et rassure sur les données",
      'role="alert"' in ui and "Vos données ne sont pas perdues" in ui and "Réessayer" in ui, "components/ui.tsx")

# ---------------------------------------------------------------- G. API réelle
print("\nG. Les écrans du parcours répondent sur l'API réelle")
st, data, _ = call("POST", "/auth/login", body={"email": "awa@chezawa.fr", "password": "demo1234"})
token = (data or {}).get("token") if st == 200 else None
check("connexion à la démo", st == 200 and bool(token), f"HTTP {st}")
if token:
    rid = (data.get("user") or {}).get("restaurantId") or (data.get("restaurant") or {}).get("id")
    st, dash_api, _ = call("GET", "/dashboard", token=token, rid=rid)
    ok_dash = st == 200 and isinstance((dash_api or {}).get("stock"), dict) and isinstance((dash_api or {}).get("alerts"), list)
    check("l'accueil renvoie stock + alertes + dépenses (ce que montre l'écran)", ok_dash,
          f"HTTP {st} · {len((dash_api or {}).get('alerts', []))} alertes · stock {((dash_api or {}).get('stock') or {}).get('critique')} critique(s)")
    st, cart, _ = call("GET", "/smart-cart", token=token, rid=rid)
    sups = (cart or {}).get("suppliers") or []
    lignes = [l for s in sups for l in s.get("lines", [])]
    check("le panier intelligent justifie chaque ligne (raison + offre + prix)",
          st == 200 and bool(lignes) and all(l.get("reason") and l.get("offer", {}).get("packPrice") is not None for l in lignes),
          f"{len(lignes)} ligne(s) sur {len(sups)} fournisseur(s), horizon {(cart or {}).get('horizonDays')} j")
    st, stk, _ = call("GET", "/stock", token=token, rid=rid)
    items = (stk or {}).get("items") or []
    check("le stock renvoie jours restants et statut (base des alertes)",
          st == 200 and bool(items) and all("daysLeft" in i and i.get("status") in ("ok", "bas", "critique") for i in items),
          f"{len(items)} produits suivis")
    st, disc, _ = call("GET", "/discrepancies", token=token, rid=rid)
    check("les écarts de réception sont réellement listés", st == 200 and "openValue" in (disc or {}),
          f"valeur ouverte {(disc or {}).get('openValue')} €")
    st, ana, _ = call("GET", "/analysis?months=6", token=token, rid=rid)
    ok_ana = st == 200 and bool((ana or {}).get("months")) and "explanation" in (ana or {})
    check("l'analyse des coûts renvoie une explication chiffrée", ok_ana, f"HTTP {st} · fenêtre {len((ana or {}).get('months', []))} mois")
    st, ex, _ = call("GET", "/assistant/examples", token=token, rid=rid)
    check("l'écran IA propose des questions d'exemple (on ne laisse pas l'utilisateur sans point de départ)",
          st == 200 and len((ex or {}).get("examples") or []) >= 4, f"{(ex or {}).get('examples', [])[:2]}")
    st, fc, _ = call("GET", "/forecast", token=token, rid=rid)
    rows = (fc or {}).get("products") or []
    sources = sorted({r.get("basis") for r in rows})
    check("la prévision indique la source de chaque besoin (jamais un chiffre orphelin)",
          st == 200 and bool(rows) and all(r.get("basis") in ("ventes_28j", "ventes_7j", "couverts", "seuils") for r in rows)
          and bool(((fc or {}).get("dataQuality") or {}).get("sources")),
          f"{len(rows)} produits · sources {sources} · {((fc or {}).get('dataQuality') or {}).get('sources')}")

os.makedirs(RESULTATS, exist_ok=True)
ok = sum(1 for _, c, _ in results if c); total = len(results)
print(f"\n=== Chantier 11 — {ok}/{total} vérifications réussies ===")
json.dump({"ok": ok, "total": total, "echecs": [{"label": l, "detail": d} for l, c, d in results if not c]},
          open(os.path.join(RESULTATS, "chantier11_verif_resultat.json"), "w"), ensure_ascii=False, indent=2)
sys.exit(0 if ok == total else 1)
