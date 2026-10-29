-- Performance des règles de visibilité (securite_5 à 9).
-- Avant : chaque ligne relançait la recherche de session (hachage du jeton + jointure) : ~1 ms par ligne, soit 300 à 450 ms
-- pour lire 300 comptes, avec un risque de dépassement de délai quand plusieurs tables se chargent ensemble.
-- Après : le rôle et le PIN de la session sont calculés UNE fois par requête (sous-requête scalaire = InitPlan), puis comparés ligne à ligne.
-- Les règles sont strictement les mêmes. Retour arrière : réappliquer securite_5, 6, 7 et 9.

create or replace function public.esi_pin()
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$ select s.pin from public.esi_session_courante() s limit 1 $$;
revoke all on function public.esi_pin() from public;
grant execute on function public.esi_pin() to anon, authenticated, service_role;

-- comptes
drop policy if exists visibilite_lecture on public.comptes;
create policy visibilite_lecture on public.comptes as restrictive for select to anon, authenticated using (
  (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER', 'EXTERNE')
  or ((select public.esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select public.esi_pin())::text)));
drop policy if exists visibilite_ecriture_i on public.comptes;
create policy visibilite_ecriture_i on public.comptes as restrictive for insert to anon, authenticated with check (
  (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER')
  or ((select public.esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select public.esi_pin())::text)));
drop policy if exists visibilite_ecriture_u on public.comptes;
create policy visibilite_ecriture_u on public.comptes as restrictive for update to anon, authenticated using (
  (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER')
  or ((select public.esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select public.esi_pin())::text)))
  with check (
  (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER')
  or ((select public.esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select public.esi_pin())::text)));
drop policy if exists visibilite_ecriture_d on public.comptes;
create policy visibilite_ecriture_d on public.comptes as restrictive for delete to anon, authenticated using (
  (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER')
  or ((select public.esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select public.esi_pin())::text)));

-- leads (le fournisseur voit tout, écrit seulement sur les leads sans CDS)
drop policy if exists visibilite_lecture on public.leads;
create policy visibilite_lecture on public.leads as restrictive for select to anon, authenticated using (
  (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER', 'EXTERNE')
  or ((select public.esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select public.esi_pin())::text)));
drop policy if exists visibilite_ecriture_i on public.leads;
create policy visibilite_ecriture_i on public.leads as restrictive for insert to anon, authenticated with check (
  (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER')
  or ((select public.esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select public.esi_pin())::text))
  or ((select public.esi_role()) = 'EXTERNE' and pin_cds_assigne is null));
drop policy if exists visibilite_ecriture_u on public.leads;
create policy visibilite_ecriture_u on public.leads as restrictive for update to anon, authenticated using (
  (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER')
  or ((select public.esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select public.esi_pin())::text))
  or ((select public.esi_role()) = 'EXTERNE' and pin_cds_assigne is null))
  with check (
  (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER')
  or ((select public.esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select public.esi_pin())::text))
  or ((select public.esi_role()) = 'EXTERNE' and pin_cds_assigne is null));
drop policy if exists visibilite_ecriture_d on public.leads;
create policy visibilite_ecriture_d on public.leads as restrictive for delete to anon, authenticated using (
  (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER')
  or ((select public.esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select public.esi_pin())::text))
  or ((select public.esi_role()) = 'EXTERNE' and pin_cds_assigne is null));

-- activité terrain : visites, phoning, actions, fiches froides (colonne pin_cds)
do $$
declare t text;
begin
  foreach t in array array['visites', 'phoning', 'actions', 'fiches_froides'] loop
    execute format('drop policy if exists visibilite_role on public.%I', t);
    execute format($f$create policy visibilite_role on public.%I as restrictive for all to anon, authenticated using (
      (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER')
      or ((select public.esi_role()) = 'CDS' and (pin_cds is null or pin_cds::text = (select public.esi_pin())::text)))
      with check (
      (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER')
      or ((select public.esi_role()) = 'CDS' and (pin_cds is null or pin_cds::text = (select public.esi_pin())::text)))$f$, t);
  end loop;
end $$;

-- objectifs et primes
drop policy if exists visibilite_lecture on public.objectifs_primes;
create policy visibilite_lecture on public.objectifs_primes as restrictive for select to anon, authenticated using (
  (select public.esi_role()) in ('ADMIN', 'CHANNEL_MANAGER') or pin_cds::text = (select public.esi_pin())::text);
drop policy if exists visibilite_ecriture_i on public.objectifs_primes;
create policy visibilite_ecriture_i on public.objectifs_primes as restrictive for insert to anon, authenticated with check (
  (select public.esi_role()) = 'ADMIN' or pin_cds::text = (select public.esi_pin())::text);
drop policy if exists visibilite_ecriture_u on public.objectifs_primes;
create policy visibilite_ecriture_u on public.objectifs_primes as restrictive for update to anon, authenticated using (
  (select public.esi_role()) = 'ADMIN' or pin_cds::text = (select public.esi_pin())::text)
  with check ((select public.esi_role()) = 'ADMIN' or pin_cds::text = (select public.esi_pin())::text);
drop policy if exists visibilite_ecriture_d on public.objectifs_primes;
create policy visibilite_ecriture_d on public.objectifs_primes as restrictive for delete to anon, authenticated using (
  (select public.esi_role()) = 'ADMIN' or pin_cds::text = (select public.esi_pin())::text);

-- notifications et vues enregistrées
drop policy if exists visibilite_lecture on public.notifs;
create policy visibilite_lecture on public.notifs as restrictive for select to anon, authenticated using (
  (select public.esi_role()) = 'ADMIN' or pin_destinataire::text = (select public.esi_pin())::text);
drop policy if exists visibilite_maj on public.notifs;
create policy visibilite_maj on public.notifs as restrictive for update to anon, authenticated using (
  (select public.esi_role()) = 'ADMIN' or pin_destinataire::text = (select public.esi_pin())::text)
  with check ((select public.esi_role()) = 'ADMIN' or pin_destinataire::text = (select public.esi_pin())::text);
drop policy if exists visibilite_role on public.vues_filtres;
create policy visibilite_role on public.vues_filtres as restrictive for all to anon, authenticated using (
  (select public.esi_role()) = 'ADMIN' or pin_cds::text = (select public.esi_pin())::text)
  with check ((select public.esi_role()) = 'ADMIN' or pin_cds::text = (select public.esi_pin())::text);
