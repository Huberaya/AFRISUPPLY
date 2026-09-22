#!/usr/bin/env bash
# Vérifications de bout en bout (porte de sortie du dépôt) — chantier 10 « Rendre le dépôt fiable et vérifiable ».
#
# Chaque script interroge une API RÉELLE (aucune valeur inventée) et vérifie ce qui se passe vraiment :
# parcours d'achat, réception, prix facturé, alertes, e-mails réellement déposés, facturation, paiements
# fournisseur, prévision, expérience réelle (navigation, dialogues, parcours guidé — chantier 11),
# exploitation (sauvegardes réellement restaurées, tâches surveillées, journal d'audit — chantier 12),
# puis sauvegarde HORS SITE (copie externe réellement déposée, relue et restaurée — chantier 13).
# Les preuves (messages .outbox, PDF, journaux API) restent sur disque.
#
# Usage :
#   npm run dev:api        # API sur :8787 (PGLITE_DIR + SEED_DEMO=true)
#   npm run dev:web        # web sur :3000 (certains contrôles lisent les sources servies)
#   npm run verifs:e2e     # ce script
#
# Sortie non nulle dès qu'un script échoue : la CI refuse une régression.
set -u
cd "$(dirname "$0")"

export AFS_API="${AFS_API:-http://localhost:8787/api}"
export AFS_WEB="${AFS_WEB:-http://localhost:3000}"
export PYTHONUNBUFFERED=1
PAUSE="${AFS_PAUSE:-65}"     # espacement entre scripts : limites de débit d'inscription (5/min)

mkdir -p resultats
SCRIPTS=(
  chantier1_verif.py chantier2_verif.py scenario_tests.py chantier3_verif.py chantier4_verif.py chantier5_verif.py
  chantier6_verif.py chantier7_verif.py chantier8_verif.py chantier9_verif.py chantier11_verif.py chantier12_verif.py
  chantier13_verif.py
)

echo "API : $AFS_API"
echo "WEB : $AFS_WEB"

failed=0
total_ok=0
total_checks=0
i=0
for s in "${SCRIPTS[@]}"; do
  i=$((i + 1))
  log="resultats/${s%.py}.log"
  echo "=============================================================="
  echo "→ $s"
  if python3 "$s" > "$log" 2>&1; then
    # Résumé extrait du rapport de chaque script (« 40/40 », « 23/23 »…).
    # Base 10 explicite : un compteur comme « 08 » ou « 09 » était lu comme un nombre octal par bash
    # (« value too great for base »), ce qui faussait le TOTAL affiché.
    line=$(grep -Eo '[0-9]+/[0-9]+' "$log" | tail -1)
    echo "   $(grep -E '[0-9]+/[0-9]+' "$log" | tail -1 | sed 's/^[[:space:]]*//')"
    if [ -n "$line" ]; then
      total_ok=$((total_ok + 10#${line%%/*}))
      total_checks=$((total_checks + 10#${line##*/}))
    fi
  else
    echo "   ✗ ÉCHEC — $log"
    failed=$((failed + 1))
    # Un script en échec ne compte pas dans le total : annoncer « 21/0 » mentait sur l'état réel.
    echo "   $(grep -E '[0-9]+/[0-9]+' "$log" | tail -1 | sed 's/^[[:space:]]*//')"
  fi
  if [ "$i" -lt "${#SCRIPTS[@]}" ]; then sleep "$PAUSE"; fi
done

echo "=============================================================="
echo "TOTAL : $total_ok/$total_checks vérifications · $(( ${#SCRIPTS[@]} - failed ))/${#SCRIPTS[@]} scripts OK"
if [ "$failed" -gt 0 ]; then
  echo "❌ $failed script(s) en échec — voir scripts/verifications/resultats/"
  exit 1
fi
echo "✅ Toutes les vérifications sont passées."
