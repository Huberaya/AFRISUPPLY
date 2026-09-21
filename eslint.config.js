// Configuration ESLint (flat config) — chantier 10 « Rendre le dépôt fiable et vérifiable ».
//
// Avant : la règle `react-hooks/exhaustive-deps` était utilisée dans le code (commentaires
// `eslint-disable-next-line`) mais le plugin n'était pas installé → `npm run lint` échouait sur
// 60 erreurs « Definition for rule ... was not found », donc personne ne lançait le lint.
// Après : le plugin est installé et configuré, et les vraies erreurs (imports morts, `any` dans
// le code applicatif) ont été corrigées plutôt que masquées.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/node_modules',
      '**/drizzle',          // migrations générées
      '**/.pglite',
      'api/index.js',        // bundle serverless produit par `npm run build:api`
      '**/api/index.mjs',
      'scripts/**',          // scripts Python/shell de vérification
      'coverage',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    // Les règles « recommandées » de react-hooks v7 (set-state-in-effect, static-components, purity,
    // immutability…) sont volontairement laissées en commentaire : elles signalent des motifs React
    // PRÉEXISTANTS (setState dans un effet, composant créé pendant le rendu) qu'il faut corriger un par
    // un, pas désactiver en bloc ni réveiller au milieu d'une fusion. Les deux règles historiques, elles,
    // sont actives et bloquantes : l'ordre d'appel des hooks et les dépendances d'effet.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Les dépendances d'effet sont signalées sans bloquer : un `eslint-disable-next-line` ciblé
      // et commenté reste la trace d'un choix, un `warn` ne casse pas la construction.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Tests : les réponses HTTP sont inspectées partiellement (`json as any`), c'est assumé et
    // vérifié par les tests eux-mêmes. Le reste des règles continue de s'appliquer.
    files: ['**/*.test.ts', '**/*.test.tsx', '**/src/test/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
