#!/usr/bin/env bash
# Auto-test de la CI — chantier 10 « Rendre le dépôt fiable et vérifiable ».
#
# Question posée : « la CI refuse-t-elle vraiment une régression ? »
# Réponse vérifiable : ce script introduit volontairement quatre fautes (type, lint, test, bundle non
# régénéré), exige que le contrôle correspondant ÉCHOUE, puis restaure les fichiers (git checkout).
#
# Usage : bash scripts/ci-selftest.sh   (nécessite un arbre git propre pour les fichiers touchés)
set -u
cd "$(dirname "$0")/.."

TOUCHE_TYPE="apps/api/src/lib/ops.ts"
TOUCHE_LINT="apps/web/src/lib/api.ts"
TOUCHE_BUNDLE="apps/api/src/lib/ops.ts"
TEST_FILE="apps/api/src/test/zz-ci-selftest.test.ts"

restore() { git checkout -- "$1" 2>/dev/null || true; }
cleanup() { restore "$TOUCHE_TYPE"; restore "$TOUCHE_LINT"; restore "$TOUCHE_BUNDLE"; rm -f "$TEST_FILE"; }
trap cleanup EXIT

FAIL=0
expect_fail() { # libellé, commande…
  local label="$1"; shift
  if "$@" > /tmp/afs-ci-selftest.log 2>&1; then
    echo "  ✗ $label — le contrôle a RÉUSSI : la CI ne refuserait pas cette erreur"
    FAIL=$((FAIL + 1))
  else
    echo "  ✓ $label — le contrôle a bien refusé"
  fi
}

echo "Auto-test de la CI (chaque faute est introduite puis annulée) :"

echo "1. Une erreur de type"
printf '\nconst _ciSelftest: number = "ceci n’est pas un nombre";\n' >> "$TOUCHE_TYPE"
expect_fail "npm run typecheck" npm run typecheck -w apps/api
restore "$TOUCHE_TYPE"

echo "2. Une erreur de lint (variable inutilisée + any implicite)"
printf '\nconst _ciSelftestInutilise = 42;\nexport const _ciSelftestAny = (x: any) => x;\n' >> "$TOUCHE_LINT"
expect_fail "npm run lint" npm run lint
restore "$TOUCHE_LINT"

echo "3. Un test qui échoue"
cat > "$TEST_FILE" <<'EOF'
import { describe, it, expect } from 'vitest';
describe('auto-test de la CI', () => { it('échoue volontairement', () => { expect(1).toBe(2); }); });
EOF
expect_fail "npm test (API)" npm run test -w apps/api -- src/test/zz-ci-selftest.test.ts
rm -f "$TEST_FILE"

echo "4. Un bundle serverless non régénéré"
python3 - "$TOUCHE_BUNDLE" <<'PY'
# Modifie une valeur RÉELLEMENT présente dans le bundle (l'en-tête de sécurité appliqué à chaque réponse).
# Un simple export inutilisé serait éliminé par esbuild : le bundle ne changerait pas, et le contrôle
# aurait raison de dire « à jour ».
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
assert "'nosniff'" in s, "valeur de référence introuvable dans ops.ts"
io.open(p, 'w', encoding='utf-8').write(s.replace("'nosniff'", "'nosniff-selftest'", 1))
PY
expect_fail "npm run check:bundle" npm run check:bundle
restore "$TOUCHE_BUNDLE"

echo
if [ "$FAIL" -gt 0 ]; then
  echo "❌ $FAIL garde-fou(s) inefficace(s)."
  exit 1
fi
echo "✅ Les 4 garde-fous refusent bien une régression (types, lint, tests, bundle)."
