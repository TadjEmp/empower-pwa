# Banc d'essai des migrations de sécurité (PGlite)

Rejoue `securite_1`, `securite_2` et `securite_3` sur un Postgres local en WebAssembly (aucune base réelle).
`schema.sql` reproduit l'état de production avant correctifs (rôles, politiques anon ouvertes) ;
`prod-functions.sql` contient les définitions réelles des fonctions à jeton relevées en production
(`reattribuer_compte` : en-tête et clause de recherche seulement).

```bash
mkdir /tmp/pglite-pkg && cd /tmp/pglite-pkg && npm init -y && npm install @electric-sql/pglite --ignore-scripts
node supabase/tests/pglite/run.mjs /tmp/pglite-pkg supabase/migrations supabase/tests/pglite
```
Attendu : « 40 réussis, 0 échoués ». À relancer avant toute nouvelle migration touchant aux sessions ou aux règles d'accès.
