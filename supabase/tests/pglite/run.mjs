// Banc d'essai des migrations de sécurité sur PGlite (Postgres en WebAssembly) : aucune base réelle n'est touchée.
// Usage : node run.mjs <dossier-pglite> <dossier-migrations> <dossier-scripts>
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const [, , pkg, migDir, scrDir] = process.argv
const { PGlite } = await import(pathToFileURL(`${pkg}/node_modules/@electric-sql/pglite/dist/index.js`).href)
const lire = f => readFileSync(f, 'utf8')
const db = new PGlite()
let ok = 0, ko = 0
const verifie = (nom, cond, detail = '') => { if (cond) { ok++; console.log('  ✓', nom) } else { ko++; console.log('  ✗', nom, detail) } }
const maintenant = () => Date.now()
const rows = async (sql, params) => (await db.query(sql, params)).rows
const comme = async (role, entete, sql, params) => {            // exécute `sql` sous un rôle, avec l'en-tête x-esi-token simulé
  await db.exec(`reset role; select set_config('request.headers', '${entete ? JSON.stringify({ 'x-esi-token': entete }) : '{}'}', false); set role ${role};`)
  try { return { rows: (await db.query(sql, params)).rows } }
  catch (e) { return { erreur: e.message } } finally { await db.exec('reset role') }
}

await db.exec(lire(`${scrDir}/schema.sql`))
await db.exec(lire(`${scrDir}/prod-functions.sql`))
const exp = maintenant() + 3600_000
await db.exec(`
  insert into utilisateurs (email, pin, nom, role, actif, token, token_expiry) values
   ('admin@x.invalid', 1000, 'Admin', 'ADMIN', true, 'legacy_admin', ${exp}),
   ('cds1@x.invalid', 4001, 'Cds1', 'CDS', true, 'legacy_cds1', ${exp}),
   ('cds2@x.invalid', 4002, 'Cds2', 'CDS', true, 'legacy_cds2_expire', ${maintenant() - 1000}),
   ('off@x.invalid', 4003, 'Inactif', 'CDS', false, 'legacy_inactif', ${exp});
  insert into comptes (id, nom_compte, pin_cds_assigne) values ('11111111-1111-1111-1111-111111111111', 'Compte A', 4001), ('22222222-2222-2222-2222-222222222222', 'Compte B', 4002);
`)

console.log('\n[0] État initial (production avant correctifs)')
let r = await comme('anon', null, 'select count(*)::int n from comptes')
verifie('anon lit les comptes sans connexion (faille)', r.rows?.[0].n === 2)
r = await comme('anon', null, "update utilisateurs set token='pirate', token_expiry=9999999999999 where pin=1000")
verifie("anon peut poser un jeton sur l'admin (faille)", !r.erreur, r.erreur)

console.log('\n[1] Migration securite_1')
await db.exec(lire(`${migDir}/20261029100000_securite_1_ecriture_anon_utilisateurs.sql`))
r = await comme('anon', null, "update utilisateurs set token='pirate' where pin=1000")
verifie("anon ne peut plus écrire le jeton (refusé)", !!r.erreur, 'update accepté')
r = await comme('anon', null, 'select hash from utilisateurs limit 1')
verifie('anon ne lit pas la colonne hash', !!r.erreur)
r = await comme('anon', null, 'select pin, nom from utilisateurs limit 1')
verifie('anon lit encore les colonnes publiques (comportement inchangé à ce stade)', !r.erreur)

console.log('\n[2] Migration securite_2 (session requise)')
await db.exec(lire(`${migDir}/20261029110000_securite_2_session_requise.sql`))
r = await comme('anon', null, 'select count(*)::int n from comptes');                     verifie('sans en-tête : 0 compte', r.rows?.[0].n === 0)
r = await comme('anon', 'mauvais', 'select count(*)::int n from comptes');               verifie('jeton inconnu : 0 compte', r.rows?.[0].n === 0)
r = await comme('anon', 'legacy_cds2_expire', 'select count(*)::int n from comptes');    verifie('jeton expiré : 0 compte', r.rows?.[0].n === 0)
r = await comme('anon', 'legacy_inactif', 'select count(*)::int n from comptes');        verifie('compte inactif : 0 compte', r.rows?.[0].n === 0)
r = await comme('anon', 'legacy_cds1', 'select count(*)::int n from comptes');           verifie('ancien jeton valide : 2 comptes', r.rows?.[0].n === 2)
r = await comme('anon', null, "insert into vues_filtres (module, nom) values ('a','b')"); verifie('écriture sans session refusée', !!r.erreur)
r = await comme('anon', 'legacy_cds1', "insert into vues_filtres (module, nom) values ('a','b') returning id"); verifie('écriture avec session acceptée', !r.erreur, r.erreur)
r = await comme('anon', 'legacy_cds1', 'select public.esi_session_valide() v');           verifie('esi_session_valide() vrai', r.rows?.[0].v === true)
r = await comme('anon', null, 'select public.esi_session_valide() v');                   verifie('esi_session_valide() faux sans jeton', r.rows?.[0].v === false)

console.log('\n[3] Migration securite_3 (sessions multiples)')
await db.exec(lire(`${migDir}/20261029120000_securite_3_sessions_multiples.sql`))
const defs = await rows(`select proname, pg_get_functiondef(oid) d from pg_proc where proname in ('enregistrer_push','supprimer_push','reporter_a_contacter','reattribuer_compte') order by 1`)
verifie('les 4 fonctions métier sont migrées', defs.length === 4 && defs.every(x => /esi_session_info\(p_token\)/.test(x.d) && !/from\s+utilisateurs\s+where\s+token/i.test(x.d)), defs.map(x => x.proname).join())
await db.exec(lire(`${migDir}/20261029120000_securite_3_sessions_multiples.sql`))
verifie('migration rejouable sans erreur (idempotente)', true)

console.log('  -- sessions multiples')
const tA = 'jeton_appareil_A', tB = 'jeton_appareil_B'
await db.exec(`reset role; select esi_creer_session(4001, '${tA}', ${exp}, 'Safari iPhone'); select esi_creer_session(4001, '${tB}', ${exp}, 'Chrome PC');`)
r = await comme('anon', tA, 'select count(*)::int n from comptes');   verifie('appareil A connecté', r.rows?.[0].n === 2)
r = await comme('anon', tB, 'select count(*)::int n from comptes');   verifie('appareil B connecté EN MÊME TEMPS', r.rows?.[0].n === 2)
r = await comme('anon', 'legacy_cds1', 'select count(*)::int n from comptes'); verifie('ancien jeton toujours valable (personne déconnecté)', r.rows?.[0].n === 2)
const pl = await rows(`select count(*)::int n from sessions where token_hash in ('${tA}','${tB}')`)
verifie('jetons NON stockés en clair', pl[0].n === 0)
const hs = await rows(`select count(*)::int n from sessions where token_hash = encode(sha256(convert_to('${tA}','UTF8')),'hex')`)
verifie('jeton stocké haché SHA-256', hs[0].n === 1)
r = await comme('anon', null, 'select * from sessions');                 verifie('anon ne lit pas la table sessions', !!r.erreur)
r = await comme('anon', tA, `select * from esi_session_info('${tA}')`);  verifie('anon ne peut pas appeler esi_session_info', !!r.erreur)
r = await comme('anon', tA, `select esi_creer_session(1000,'x',1,'')`);  verifie('anon ne peut pas créer de session', !!r.erreur)
await db.exec(`reset role; select esi_fermer_session('${tA}');`)
r = await comme('anon', tA, 'select count(*)::int n from comptes');      verifie("déconnexion de A : A n'a plus accès", r.rows?.[0].n === 0)
r = await comme('anon', tB, 'select count(*)::int n from comptes');      verifie('B reste connecté', r.rows?.[0].n === 2)
await db.exec(`reset role; update utilisateurs set actif=false where pin=4001;`)
r = await comme('anon', tB, 'select count(*)::int n from comptes');      verifie('compte désactivé : sessions refusées', r.rows?.[0].n === 0)
await db.exec(`reset role; update utilisateurs set actif=true where pin=4001;`)
await db.exec(`reset role; insert into sessions (pin, token_hash, expire_le) values (4001, esi_hash_jeton('jeton_expire'), ${maintenant() - 5000});`)
r = await comme('anon', 'jeton_expire', 'select count(*)::int n from comptes'); verifie('session expirée refusée', r.rows?.[0].n === 0)
for (let i = 0; i < 12; i++) await db.exec(`reset role; select esi_creer_session(1000, 'masse_${i}', ${exp}, 'ua');`)
const nb = await rows(`select count(*)::int n from sessions where pin = 1000`)
verifie('plafond de 10 appareils par utilisateur', nb[0].n === 10, `n=${nb[0].n}`)
r = await comme('anon', 'masse_11', 'select count(*)::int n from comptes'); verifie('la plus récente est conservée', r.rows?.[0].n === 2)
r = await comme('anon', 'masse_0', 'select count(*)::int n from comptes');  verifie('la plus ancienne est évincée', r.rows?.[0].n === 0)

console.log('  -- fonctions métier avec jeton de session')
r = await comme('anon', null, `select supprimer_push('${tB}', 'https://push.example/1') j`);         verifie('supprimer_push: session valide acceptée', r.rows?.[0].j.ok === true, JSON.stringify(r))
r = await comme('anon', null, `select supprimer_push('inconnu', 'https://push.example/1') j`);      verifie('supprimer_push: jeton inconnu refusé', r.rows?.[0].j.erreur === 'SESSION_INVALIDE')
r = await comme('anon', null, `select enregistrer_push('${tB}', 'https://push.example/1', 'k', 'a', 'ua') j`); verifie("enregistrer_push: session valide enregistre l'appareil", r.rows?.[0].j.ok === true, JSON.stringify(r))
const sub = await rows(`select pin_cds from push_subscriptions where endpoint = 'https://push.example/1'`)
verifie("l'abonnement est rattaché au bon utilisateur (PIN 4001)", sub[0]?.pin_cds === 4001)
r = await comme('anon', null, `select enregistrer_push('jeton_expire', 'https://push.example/2', 'k', 'a') j`); verifie('enregistrer_push: session expirée refusée', r.rows?.[0].j.erreur === 'SESSION_EXPIREE')
r = await comme('anon', null, `select reporter_a_contacter('11111111-1111-1111-1111-111111111111', 7, '${tB}') j`); verifie('reporter_a_contacter: propriétaire autorisé', r.rows?.[0].j.ok === true, JSON.stringify(r))
r = await comme('anon', null, `select reporter_a_contacter('22222222-2222-2222-2222-222222222222', 7, '${tB}') j`); verifie('reporter_a_contacter: autre commercial refusé', r.rows?.[0].j.erreur === 'NON_AUTORISE')
r = await comme('anon', null, `select reattribuer_compte('11111111-1111-1111-1111-111111111111', 4001, 4002, 'masse_11', 'MANAGER') j`); verifie('reattribuer_compte: acteur déduit du jeton (ADMIN, PIN 1000)', r.rows?.[0].j.acteur === 1000 && r.rows?.[0].j.role === 'ADMIN', JSON.stringify(r))
r = await comme('anon', null, `select reattribuer_compte('11111111-1111-1111-1111-111111111111', 4001, 4002, 'legacy_cds1', 'MANAGER') j`); verifie('reattribuer_compte: ancien jeton encore accepté', r.rows?.[0].j.ok === true, JSON.stringify(r))

console.log(`\nRésultat : ${ok} réussis, ${ko} échoués`)
process.exit(ko ? 1 : 0)
