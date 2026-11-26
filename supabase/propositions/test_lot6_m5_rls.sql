-- Lot 6 / M5 : garde-fou de non-régression des politiques RLS.
-- Les tables ci-dessous ont des politiques PERMISSIVES larges pour le rôle anon (select/insert/update) :
-- la sécurité repose sur les politiques RESTRICTIVES (session_requise, visibilite_*). Si l'une disparaît, la table s'ouvre.
-- Ce script ne renvoie AUCUNE ligne quand tout est en ordre ; chaque ligne renvoyée est une anomalie.
with attendu(t, restrictives_min) as (values
  ('actions',2),('phoning',2),('visites',2),('fiches_froides',2),('notifs',3),('vues_filtres',2),
  ('comptes',4),('leads',4),('objectifs_primes',5),('utilisateurs',1))
select a.t as table_en_anomalie,
       coalesce(c.relrowsecurity, false) as rls_active,
       (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=a.t and p.permissive='RESTRICTIVE') as restrictives,
       a.restrictives_min
from attendu a left join pg_class c on c.relname=a.t and c.relnamespace='public'::regnamespace
where not coalesce(c.relrowsecurity, false)
   or (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=a.t and p.permissive='RESTRICTIVE') < a.restrictives_min
   or (a.t not in ('comptes','leads') and not exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=a.t and p.policyname='session_requise' and p.permissive='RESTRICTIVE'));
